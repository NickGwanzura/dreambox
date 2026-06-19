import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireDeletePermission, cors } from '../lib/auth';
import { log } from '../lib/serverLogger.js';
import { pickOutsourcedData } from '../lib/whitelist';

const outsourcedSchema = z.object({
  billboardId: z.string().min(1, 'Billboard ID is required'),
  billboardName: z.string().optional(),
  mediaOwner: z.string().min(1, 'Media owner is required'),
  ownerContact: z.string().min(1, 'Owner contact is required'),
  monthlyPayout: z.number().nonnegative('Monthly payout must be non-negative'),
  contractStart: z.string().min(1, 'Contract start is required'),
  contractEnd: z.string().min(1, 'Contract end is required'),
  status: z.enum(['Active', 'Inactive', 'Expired']).optional(),
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
        const row = await prisma.outsourcedBillboard.findUnique({ where: { id: id as string } });
        if (!row) return res.status(404).json({ error: 'Not found' });
        return res.status(200).json(row);
      }
      const rows = await prisma.outsourcedBillboard.findMany({ orderBy: { createdAt: 'asc' } });
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      const parsed = outsourcedSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues.map(e => e.message) });
      }
      const data = pickOutsourcedData(req.body ?? {});
      const row = await prisma.outsourcedBillboard.create({ data });
      return res.status(201).json(row);
    }

    if (req.method === 'PUT') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      const parsed = outsourcedSchema.partial().safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues.map(e => e.message) });
      }
      const data = pickOutsourcedData(req.body ?? {});
      // Upsert: update if exists, create if not (handles client-side generated IDs)
      const existing = await prisma.outsourcedBillboard.findUnique({ where: { id: id as string } });
      const row = existing
        ? await prisma.outsourcedBillboard.update({ where: { id: id as string }, data })
        : await prisma.outsourcedBillboard.create({ data: { ...data, id: id as string } });
      return res.status(200).json(row);
    }

    if (req.method === 'DELETE') {
      if (!requireDeletePermission(req, res)) return;
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      await prisma.outsourcedBillboard.delete({ where: { id: id as string } });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e: any) {
    log.error('[outsourced]', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
