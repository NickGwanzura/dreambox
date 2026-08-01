import type { HttpRequest, HttpResponse } from '../../lib/http';
import { prisma } from '../../lib/prisma';
import { requireAuth, requireDeletePermission, cors } from '../../lib/auth';
import { log } from '../../lib/serverLogger.js';
import { pickCRMEmailThreadData } from '../../lib/whitelist';
import { z } from 'zod';

const emailThreadSchema = z.object({
  opportunityId: z.string().min(1, 'Opportunity ID is required'),
  contactId: z.string().min(1, 'Contact ID is required'),
  subject: z.string().min(1, 'Subject is required'),
  messages: z.any().optional(),
  status: z.string().min(1, 'Status is required'),
  lastActivityAt: z.string().min(1, 'Last activity is required'),
  sentCount: z.number().int().optional(),
  openCount: z.number().int().optional(),
  clickCount: z.number().int().optional(),
  replyCount: z.number().int().optional(),
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
        const row = await prisma.cRMEmailThread.findUnique({ where: { id: id as string } });
        if (!row) return res.status(404).json({ error: 'Not found' });
        return res.status(200).json(row);
      }
      const rows = await prisma.cRMEmailThread.findMany({
        where: opportunityId ? { opportunityId: opportunityId as string } : undefined,
        orderBy: { createdAt: 'asc' },
      });
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      const parsed = emailThreadSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues.map(e => e.message) });
      }
      const data = pickCRMEmailThreadData(req.body ?? {});
      const row = await prisma.cRMEmailThread.create({ data });
      return res.status(201).json(row);
    }

    if (req.method === 'PUT') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      const parsed = emailThreadSchema.partial().safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues.map(e => e.message) });
      }
      const data = pickCRMEmailThreadData(req.body ?? {});
      const existing = await prisma.cRMEmailThread.findUnique({ where: { id: id as string } });
      const row = existing
        ? await prisma.cRMEmailThread.update({ where: { id: id as string }, data })
        : await prisma.cRMEmailThread.create({ data: { ...data, id: id as string } });
      return res.status(200).json(row);
    }

    if (req.method === 'DELETE') {
      if (!await requireDeletePermission(req, res)) return;
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      await prisma.cRMEmailThread.delete({ where: { id: id as string } });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e: any) {
    log.error('[crm/email-threads]', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
