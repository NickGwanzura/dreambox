import type { HttpRequest, HttpResponse } from '../lib/http';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireManagerOrAdmin, cors } from '../lib/auth';
import { log } from '../lib/serverLogger.js';
import { parsePagination } from '../lib/pagination.js';

const amendmentSchema = z.object({
  contractId: z.string().min(1, 'Contract ID is required'),
  type: z.enum(['extension', 'reduction', 'rate_change', 'other']),
  oldStartDate: z.string().min(1),
  oldEndDate: z.string().min(1),
  newStartDate: z.string().min(1),
  newEndDate: z.string().min(1),
  oldMonthlyRate: z.number(),
  newMonthlyRate: z.number(),
  oldTotalValue: z.number(),
  newTotalValue: z.number(),
  monthsChanged: z.number(),
  financialImpact: z.number(),
  reason: z.string().optional(),
  requestedBy: z.string().optional(),
  approvedBy: z.string().optional(),
  status: z.enum(['pending', 'approved', 'rejected', 'applied']).default('applied'),
  invoiceImpactNote: z.string().optional(),
});

function amendmentAuditSnapshot(amendment: any) {
  return {
    ...amendment,
    createdAt: amendment.createdAt?.toISOString?.() ?? amendment.createdAt,
    appliedAt: amendment.appliedAt?.toISOString?.() ?? amendment.appliedAt,
  };
}

export default async function handler(req: HttpRequest, res: HttpResponse) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  // Amendments change contract financial history. Reads remain available to
  // authenticated users, but every mutation requires a manager or admin.
  const payload = req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE'
    ? await requireManagerOrAdmin(req, res)
    : await requireAuth(req, res);
  if (!payload) return;

  try {
    if (req.method === 'GET') {
      const { contractId } = req.query;
      const where = contractId ? { contractId: contractId as string } : {};
      const rows = await prisma.contractAmendment.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...parsePagination(req.query as any, 500),
      });
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      const parsed = amendmentSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues.map(e => e.message) });
      }
      const data = parsed.data;
      const row = await prisma.$transaction(async tx => {
        const created = await tx.contractAmendment.create({ data });
        await tx.auditLog.create({
          data: {
            action: 'Contract Amendment Created',
            details: `Created ${created.type} amendment for contract ${created.contractId}`,
            userId: payload.userId,
            userEmail: payload.email,
            tableName: 'contract_amendments',
            recordId: created.id,
            afterData: amendmentAuditSnapshot(created),
          },
        });
        return created;
      });
      return res.status(201).json(row);
    }

    if (req.method === 'PUT') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      const { id: _id, ...data } = req.body ?? {};
      const row = await prisma.$transaction(async tx => {
        const existing = await tx.contractAmendment.findUnique({ where: { id: id as string } });
        if (!existing) return null;
        const updated = await tx.contractAmendment.update({ where: { id: id as string }, data });
        await tx.auditLog.create({
          data: {
            action: 'Contract Amendment Updated',
            details: `Updated amendment ${updated.id} for contract ${updated.contractId}`,
            userId: payload.userId,
            userEmail: payload.email,
            tableName: 'contract_amendments',
            recordId: updated.id,
            beforeData: amendmentAuditSnapshot(existing),
            afterData: amendmentAuditSnapshot(updated),
          },
        });
        return updated;
      });
      if (!row) return res.status(404).json({ error: 'Not found' });
      return res.status(200).json(row);
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      await prisma.$transaction(async tx => {
        const deleted = await tx.contractAmendment.delete({ where: { id: id as string } });
        await tx.auditLog.create({
          data: {
            action: 'Contract Amendment Deleted',
            details: `Deleted ${deleted.type} amendment ${deleted.id} for contract ${deleted.contractId}`,
            userId: payload.userId,
            userEmail: payload.email,
            tableName: 'contract_amendments',
            recordId: deleted.id,
            beforeData: amendmentAuditSnapshot(deleted),
          },
        });
      });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e: any) {
    log.error('[contract-amendments]', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
