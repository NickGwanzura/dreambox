import type { HttpRequest, HttpResponse } from '../lib/http';
import { prisma } from '../lib/prisma';
import { requireAuth, requireDeletePermission, cors } from '../lib/auth';
import { log } from '../lib/serverLogger.js';
import { parsePagination } from '../lib/pagination.js';
import { z } from 'zod';
import { recordMutationAudit } from '../lib/mutationAudit.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const maintenanceSchema = z.object({
  billboardId: z.string().trim().min(1),
  date: z.string().regex(DATE_RE),
  type: z.enum(['Routine', 'Repair', 'Emergency', 'Inspection']),
  description: z.string().trim().min(1).max(2000),
  cost: z.number().finite().nonnegative().max(1_000_000_000),
  performedBy: z.string().trim().max(200).optional(),
  nextDueDate: z.string().regex(DATE_RE),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export default async function handler(req: HttpRequest, res: HttpResponse) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const payload = await requireAuth(req, res);
  if (!payload) return;

  try {
    if (req.method === 'GET') {
      const { id } = req.query;
      if (id) {
        const row = await prisma.maintenanceLog.findUnique({ where: { id: id as string } });
        if (!row) return res.status(404).json({ error: 'Not found' });
        return res.status(200).json(row);
      }
      const rows = await prisma.maintenanceLog.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], ...parsePagination(req.query as any, 500) });
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      const parsed = maintenanceSchema.safeParse(req.body ?? {});
      if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues.map(i => i.message) });
      const billboard = await prisma.billboard.findUnique({ where: { id: parsed.data.billboardId }, select: { id: true } });
      if (!billboard) return res.status(409).json({ error: 'Billboard not found' });
      const data = { ...parsed.data, performedBy: parsed.data.performedBy || payload.email };
      const row = await prisma.maintenanceLog.create({ data });
      await recordMutationAudit(req, payload, 'MAINTENANCE_CREATED', 'maintenance_logs', row.id, `Maintenance log ${row.id} created`);
      return res.status(201).json(row);
    }

    if (req.method === 'PUT') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      const existing = await prisma.maintenanceLog.findUnique({ where: { id: id as string } });
      if (!existing) {
        const parsed = maintenanceSchema.safeParse(req.body ?? {});
        if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues.map(i => i.message) });
        const billboard = await prisma.billboard.findUnique({ where: { id: parsed.data.billboardId }, select: { id: true } });
        if (!billboard) return res.status(409).json({ error: 'Billboard not found' });
        const row = await prisma.maintenanceLog.create({ data: { ...parsed.data, id: id as string, performedBy: parsed.data.performedBy || payload.email } });
        await recordMutationAudit(req, payload, 'MAINTENANCE_CREATED', 'maintenance_logs', id as string, `Maintenance log ${id} created`);
        return res.status(200).json(row);
      }
      const parsed = maintenanceSchema.partial().safeParse(req.body ?? {});
      if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues.map(i => i.message) });
      const merged = { ...existing, ...parsed.data };
      const full = maintenanceSchema.safeParse(merged);
      if (!full.success) return res.status(400).json({ error: 'Validation failed', details: full.error.issues.map(i => i.message) });
      const billboard = await prisma.billboard.findUnique({ where: { id: full.data.billboardId }, select: { id: true } });
      if (!billboard) return res.status(409).json({ error: 'Billboard not found' });
      const data = { ...parsed.data, ...(parsed.data.performedBy === undefined ? {} : { performedBy: parsed.data.performedBy || payload.email }) };
      // Upsert: update if exists, create if not (handles client-side generated IDs)
      const row = await prisma.maintenanceLog.update({ where: { id: id as string }, data });
      await recordMutationAudit(req, payload, 'MAINTENANCE_UPDATED', 'maintenance_logs', id as string, `Maintenance log ${id} updated`);
      return res.status(200).json(row);
    }

    if (req.method === 'DELETE') {
      if (!await requireDeletePermission(req, res)) return;
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      await prisma.maintenanceLog.delete({ where: { id: id as string } });
      await recordMutationAudit(req, payload, 'MAINTENANCE_DELETED', 'maintenance_logs', id as string, `Maintenance log ${id} deleted`);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e: any) {
    log.error('[maintenance]', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
