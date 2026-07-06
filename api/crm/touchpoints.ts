import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from '../../lib/prisma';
import { requireAuth, requireDeletePermission, cors } from '../../lib/auth';
import { log } from '../../lib/serverLogger.js';
import { pickCRMTouchpointData } from '../../lib/whitelist';
import { z } from 'zod';

const touchpointSchema = z.object({
  opportunityId: z.string().min(1, 'Opportunity ID is required'),
  type: z.string().min(1, 'Type is required'),
  direction: z.enum(['Inbound', 'Outbound']).optional(),
  subject: z.string().optional().nullable(),
  content: z.string().optional().nullable(),
  clientResponse: z.string().optional().nullable(),
  outcome: z.string().optional().nullable(),
  sentiment: z.string().optional().nullable(),
  durationSeconds: z.number().int().optional().nullable(),
  createdBy: z.string().min(1, 'Created by is required'),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const payload = await requireAuth(req, res);
  if (!payload) return;

  try {
    if (req.method === 'GET') {
      const { id, opportunityId } = req.query;
      if (id) {
        const row = await prisma.cRMTouchpoint.findUnique({ where: { id: id as string } });
        if (!row) return res.status(404).json({ error: 'Not found' });
        return res.status(200).json(row);
      }
      const rows = await prisma.cRMTouchpoint.findMany({
        where: opportunityId ? { opportunityId: opportunityId as string } : undefined,
        orderBy: { createdAt: 'asc' },
      });
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      const parsed = touchpointSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues.map(e => e.message) });
      }
      const data = pickCRMTouchpointData(req.body ?? {});
      const row = await prisma.cRMTouchpoint.create({ data });
      return res.status(201).json(row);
    }

    if (req.method === 'PUT') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      const parsed = touchpointSchema.partial().safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues.map(e => e.message) });
      }
      const data = pickCRMTouchpointData(req.body ?? {});
      const existing = await prisma.cRMTouchpoint.findUnique({ where: { id: id as string } });
      const row = existing
        ? await prisma.cRMTouchpoint.update({ where: { id: id as string }, data })
        : await prisma.cRMTouchpoint.create({ data: { ...data, id: id as string } });
      return res.status(200).json(row);
    }

    if (req.method === 'DELETE') {
      if (!await requireDeletePermission(req, res)) return;
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      await prisma.cRMTouchpoint.delete({ where: { id: id as string } });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e: any) {
    log.error('[crm/touchpoints]', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
