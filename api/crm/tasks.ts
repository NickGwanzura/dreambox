import type { HttpRequest, HttpResponse } from '../../lib/http';
import { prisma } from '../../lib/prisma';
import { requireAuth, requireDeletePermission, cors } from '../../lib/auth';
import { log } from '../../lib/serverLogger.js';
import { pickCRMTaskData } from '../../lib/whitelist';
import { z } from 'zod';

const crmTaskSchema = z.object({
  opportunityId: z.string().min(1, 'Opportunity ID is required'),
  type: z.string().min(1, 'Type is required'),
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional().nullable(),
  dueDate: z.string().min(1, 'Due date is required'),
  status: z.string().min(1, 'Status is required'),
  priority: z.string().min(1, 'Priority is required'),
  assignedTo: z.string().min(1, 'Assigned user is required'),
  completedBy: z.string().optional().nullable(),
  completedAt: z.string().optional().nullable(),
  completionNotes: z.string().optional().nullable(),
  createdBy: z.string().min(1, 'Created by is required'),
});

export default async function handler(req: HttpRequest, res: HttpResponse) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const payload = await requireAuth(req, res);
  if (!payload) return;

  try {
    if (req.method === 'GET') {
      const { id, opportunityId } = req.query;
      if (id) {
        const row = await prisma.cRMTask.findUnique({ where: { id: id as string } });
        if (!row) return res.status(404).json({ error: 'Not found' });
        return res.status(200).json(row);
      }
      const rows = await prisma.cRMTask.findMany({
        where: opportunityId ? { opportunityId: opportunityId as string } : undefined,
        orderBy: { createdAt: 'asc' },
      });
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      const parsed = crmTaskSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues.map(e => e.message) });
      }
      const data = pickCRMTaskData(req.body ?? {});
      const row = await prisma.cRMTask.create({ data });
      return res.status(201).json(row);
    }

    if (req.method === 'PUT') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      const parsed = crmTaskSchema.partial().safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues.map(e => e.message) });
      }
      const data = pickCRMTaskData(req.body ?? {});
      const existing = await prisma.cRMTask.findUnique({ where: { id: id as string } });
      const row = existing
        ? await prisma.cRMTask.update({ where: { id: id as string }, data })
        : await prisma.cRMTask.create({ data: { ...data, id: id as string } });
      return res.status(200).json(row);
    }

    if (req.method === 'DELETE') {
      if (!await requireDeletePermission(req, res)) return;
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      await prisma.cRMTask.delete({ where: { id: id as string } });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e: any) {
    log.error('[crm/tasks]', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
