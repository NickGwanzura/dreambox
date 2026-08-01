import type { HttpRequest, HttpResponse } from '../lib/http';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireFeatureRead, requireDeletePermission, requireFeatureWrite, cors } from '../lib/auth';
import { log } from '../lib/serverLogger.js';
import { pickExpenseData } from '../lib/whitelist';

const expenseSchema = z.object({
  category: z.enum(['Maintenance', 'Printing', 'Electricity', 'Labor', 'Other']),
  description: z.string().trim().min(1, 'Description is required').max(1000, 'Description too long'),
  amount: z.number().positive('Amount must be positive').max(1_000_000_000, 'Amount is too large'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD'),
  reference: z.string().trim().max(200, 'Reference too long').optional(),
});

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
      const data = pickExpenseData(parsed.data);
      const row = await prisma.$transaction(async tx => {
        const created = await tx.expense.create({ data });
        await tx.auditLog.create({ data: { action: 'Finance: Expense Created', details: `${created.category}: ${created.description} ($${created.amount})`, userId: payload.userId, userEmail: payload.email, tableName: 'expenses', recordId: created.id } });
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
      const data = pickExpenseData(parsed.data);
      const existing = await prisma.expense.findUnique({ where: { id: id as string } });
      if (!existing) return res.status(404).json({ error: 'Expense not found' });
      const row = await prisma.$transaction(async tx => {
        const updated = await tx.expense.update({ where: { id: id as string }, data });
        await tx.auditLog.create({ data: { action: 'Finance: Expense Updated', details: `${updated.category}: ${updated.description} ($${updated.amount})`, userId: payload.userId, userEmail: payload.email, tableName: 'expenses', recordId: updated.id } });
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
      await prisma.$transaction(async tx => {
        await tx.expense.delete({ where: { id: id as string } });
        await tx.auditLog.create({ data: { action: 'Finance: Expense Deleted', details: `${target.category}: ${target.description} ($${target.amount})`, userId: payload.userId, userEmail: payload.email, tableName: 'expenses', recordId: target.id } });
      });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e: any) {
    log.error('[expenses]', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
