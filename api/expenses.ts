import type { HttpRequest, HttpResponse } from '../lib/http';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma';
import { requireFeatureRead, requireDeletePermission, requireFeatureWrite, cors } from '../lib/auth';
import { log } from '../lib/serverLogger.js';
import { pickExpenseData } from '../lib/whitelist';
import { assertPeriodOpen } from '../lib/accountingPeriod';

const expenseSchema = z.object({
  category: z.enum(['Maintenance', 'Printing', 'Electricity', 'Labor', 'Other']),
  description: z.string().trim().min(1, 'Description is required').max(1000, 'Description too long'),
  amount: z.number().positive('Amount must be positive').max(1_000_000_000, 'Amount is too large'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD'),
  reference: z.string().trim().max(200, 'Reference too long').optional(),
  clientId: z.string().trim().max(200).optional().nullable(),
  contractId: z.string().trim().max(200).optional().nullable(),
});

/**
 * Keep the expense's client consistent with its linked contract. A contract
 * always wins: its client is authoritative. When only a client is given, the
 * contract is cleared. Returns an error string when the linkage is invalid.
 */
async function resolveExpenseLinkage(data: any): Promise<{ data: any; error?: string }> {
  if (data.contractId) {
    const contract = await prisma.contract.findUnique({
      where: { id: data.contractId },
      select: { id: true, clientId: true },
    });
    if (!contract) return { data, error: 'Linked contract not found.' };
    if (data.clientId && data.clientId !== contract.clientId) {
      return { data, error: 'Linked contract belongs to a different client.' };
    }
    return { data: { ...data, clientId: contract.clientId, contractId: contract.id } };
  }
  // No contract: drop any existing contract link. A client link (if any) is
  // preserved unless the caller explicitly cleared it with null.
  return { data: { ...data, contractId: null } };
}

function auditContext(req: HttpRequest) {
  const forwarded = req.headers['x-forwarded-for'];
  return {
    requestId: String(req.headers['x-request-id'] || randomUUID()),
    ipAddress: String(Array.isArray(forwarded) ? forwarded[0] : forwarded || (req as any).socket?.remoteAddress || '').split(',')[0].trim() || null,
    userAgent: String(req.headers['user-agent'] || '').slice(0, 500) || null,
  };
}

export default async function handler(req: HttpRequest, res: HttpResponse) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const payload = req.method === 'GET'
    ? await requireFeatureRead(req, res, 'expenses')
    : await requireFeatureWrite(req, res, 'expenses');
  if (!payload) return;

  try {
    if (req.method === 'GET') {
      const { id } = req.query;
      if (id) {
        const row = await prisma.expense.findUnique({ where: { id: id as string } });
        if (!row) return res.status(404).json({ error: 'Not found' });
        return res.status(200).json(row);
      }
      const rows = await prisma.expense.findMany({ orderBy: { createdAt: 'asc' } });
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      const parsed = expenseSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues.map(e => e.message) });
      }
      const { data: resolvedData, error: linkageError } = await resolveExpenseLinkage(pickExpenseData(parsed.data));
      if (linkageError) return res.status(400).json({ error: linkageError });
      const data = resolvedData;
      await assertPeriodOpen(data.date, payload.email);
      const audit = auditContext(req);
      const row = await prisma.$transaction(async tx => {
        const created = await tx.expense.create({ data });
        await tx.auditLog.create({
          data: {
            action: 'Finance: Expense Created',
            details: `${created.category}: ${created.description} ($${created.amount})`,
            userId: payload.userId,
            userEmail: payload.email,
            tableName: 'expenses',
            recordId: created.id,
            beforeData: undefined,
            afterData: created as any,
            ...audit,
          },
        });
        return created;
      });
      return res.status(201).json(row);
    }

    if (req.method === 'PUT') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      const parsed = expenseSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues.map(e => e.message) });
      }
      const existing = await prisma.expense.findUnique({ where: { id: id as string } });
      if (!existing) return res.status(404).json({ error: 'Expense not found' });
      // Resolve linkage against the merged record so an unrelated edit never
      // silently orphans or contradicts an existing client/contract link.
      const { data: resolvedData, error: linkageError } = await resolveExpenseLinkage(pickExpenseData({ ...existing, ...parsed.data }));
      if (linkageError) return res.status(400).json({ error: linkageError });
      const data = resolvedData;
      await assertPeriodOpen(existing.date, payload.email);
      // A date edit can move a transaction into a closed period; protect both
      // the original posting period and the destination period.
      await assertPeriodOpen(data.date, payload.email);
      const audit = auditContext(req);
      const row = await prisma.$transaction(async tx => {
        const updated = await tx.expense.update({ where: { id: id as string }, data });
        await tx.auditLog.create({
          data: {
            action: 'Finance: Expense Updated',
            details: `${existing.category}: ${existing.description} ($${existing.amount}) → ${updated.category}: ${updated.description} ($${updated.amount})`,
            userId: payload.userId,
            userEmail: payload.email,
            tableName: 'expenses',
            recordId: updated.id,
            beforeData: existing as any,
            afterData: updated as any,
            ...audit,
          },
        });
        return updated;
      });
      return res.status(200).json(row);
    }

    if (req.method === 'DELETE') {
      if (!await requireDeletePermission(req, res)) return;
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      const target = await prisma.expense.findUnique({ where: { id: id as string } });
      if (!target) return res.status(404).json({ error: 'Expense not found' });
      await assertPeriodOpen(target.date, payload.email);
      const audit = auditContext(req);
      await prisma.$transaction(async tx => {
        await tx.expense.delete({ where: { id: id as string } });
        await tx.auditLog.create({
          data: {
            action: 'Finance: Expense Deleted',
            details: `${target.category}: ${target.description} ($${target.amount})`,
            userId: payload.userId,
            userEmail: payload.email,
            tableName: 'expenses',
            recordId: target.id,
            beforeData: target as any,
            afterData: { id: target.id, deleted: true },
            ...audit,
          },
        });
      });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e: any) {
    log.error('[expenses]', e);
    if (/Accounting period/.test(e?.message || '')) return res.status(409).json({ error: e.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
}
