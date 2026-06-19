import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireDeletePermission, cors } from '../lib/auth';
import { log } from '../lib/serverLogger.js';
import { pickTaskData } from '../lib/whitelist';

const taskSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  assignedTo: z.string().min(1, 'Assigned user is required'),
  priority: z.enum(['High', 'Medium', 'Low']).optional(),
  status: z.enum(['Todo', 'InProgress', 'Done']).optional(),
  dueDate: z.string().min(1, 'Due date is required'),
  createdAt: z.string().optional(),
  relatedBillboardId: z.string().optional().nullable(),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const payload = requireAuth(req, res);
  if (!payload) return;

  try {
    if (req.method === 'GET') {
      const { id } = req.query;
      if (id) {
        const row = await prisma.task.findUnique({ where: { id: id as string } });
        if (!row) return res.status(404).json({ error: 'Not found' });
        return res.status(200).json(row);
      }
      const rows = await prisma.task.findMany({ orderBy: { dbCreatedAt: 'asc' } });
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      const parsed = taskSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues.map(e => e.message) });
      }
      const data = pickTaskData(req.body ?? {});
      const row = await prisma.task.create({ data });
      return res.status(201).json(row);
    }

    if (req.method === 'PUT') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      const parsed = taskSchema.partial().safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues.map(e => e.message) });
      }
      const data = pickTaskData(req.body ?? {});
      // Upsert: update if exists, create if not (handles client-side generated IDs)
      const existing = await prisma.task.findUnique({ where: { id: id as string } });
      const row = existing
        ? await prisma.task.update({ where: { id: id as string }, data })
        : await prisma.task.create({ data: { ...data, id: id as string } });
      return res.status(200).json(row);
    }

    if (req.method === 'DELETE') {
      if (!requireDeletePermission(req, res)) return;
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      await prisma.task.delete({ where: { id: id as string } });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e: any) {
    log.error('[tasks]', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
