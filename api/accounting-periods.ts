import type { HttpRequest, HttpResponse } from '../lib/http';
import { z } from 'zod';
import { cors, requireManagerOrAdmin } from '../lib/auth';
import { prisma } from '../lib/prisma';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates must use YYYY-MM-DD');
const createSchema = z.object({ startDate: date, endDate: date, reason: z.string().trim().max(1000).optional() });
const actionSchema = z.object({ action: z.enum(['close', 'reopen']), reason: z.string().trim().min(10).max(1000) });

export default async function handler(req: HttpRequest, res: HttpResponse) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const actor = await requireManagerOrAdmin(req, res);
  if (!actor) return;

  if (req.method === 'GET') {
    const rows = await prisma.accountingPeriod.findMany({ orderBy: { startDate: 'desc' } });
    return res.status(200).json(rows);
  }
  if (req.method === 'POST') {
    const parsed = createSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: 'Valid startDate and endDate are required.' });
    const { startDate, endDate, reason } = parsed.data;
    if (startDate > endDate) return res.status(400).json({ error: 'startDate must be on or before endDate.' });
    try {
      const row = await prisma.$transaction(async tx => {
        const created = await tx.accountingPeriod.create({ data: { startDate, endDate, reason } });
        await tx.auditLog.create({ data: { action: 'ACCOUNTING_PERIOD_CREATED', details: `${startDate} to ${endDate}`, userId: actor.userId, userEmail: actor.email, tableName: 'accounting_periods', recordId: created.id, afterData: created as any } });
        return created;
      });
      return res.status(201).json(row);
    } catch (e: any) {
      if (e?.code === 'P2002') return res.status(409).json({ error: 'That accounting period already exists.' });
      throw e;
    }
  }
  if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });
  const id = String(req.query.id || '');
  if (!id) return res.status(400).json({ error: 'id required' });
  const parsed = actionSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: 'A close/reopen action and a meaningful reason are required.' });
  const current = await prisma.accountingPeriod.findUnique({ where: { id } });
  if (!current) return res.status(404).json({ error: 'Accounting period not found' });
  const { action, reason } = parsed.data;
  const now = new Date();
  const updated = await prisma.$transaction(async tx => {
    const row = await tx.accountingPeriod.update({ where: { id }, data: action === 'close' ? { status: 'Closed', closedAt: now, closedBy: actor.userId, reason } : { status: 'Open', reopenedAt: now, reopenedBy: actor.userId, reason } });
    await tx.auditLog.create({ data: { action: action === 'close' ? 'ACCOUNTING_PERIOD_CLOSED' : 'ACCOUNTING_PERIOD_REOPENED', details: `${current.startDate} to ${current.endDate}: ${reason}`, userId: actor.userId, userEmail: actor.email, tableName: 'accounting_periods', recordId: id, beforeData: current as any, afterData: row as any } });
    return row;
  });
  return res.status(200).json(updated);
}
