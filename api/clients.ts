import type { HttpRequest, HttpResponse } from '../lib/http';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireDeletePermission, cors } from '../lib/auth';
import { log } from '../lib/serverLogger.js';
import { pickClientData } from '../lib/whitelist';

const clientSchema = z.object({
  companyName: z.string().min(1, 'Company name is required'),
  contactPerson: z.string().min(1, 'Contact person is required'),
  email: z.string().email('Invalid email format').optional().or(z.literal('')),
  phone: z.string().min(1, 'Phone is required'),
  streetAddress: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
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
        const row = await prisma.client.findUnique({ where: { id: id as string } });
        if (!row) return res.status(404).json({ error: 'Not found' });
        return res.status(200).json(row);
      }
      const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 500));
      const skip = Math.max(0, Number(req.query.skip) || 0);
      // Stable tie-breaker is required for limit/skip pagination: timestamps
      // are not unique, and ordering by them alone can duplicate or omit rows
      // between pages when records share the same createdAt value.
      const rows = await prisma.client.findMany({
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: limit,
        skip,
      });
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      const parsed = clientSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues.map(e => e.message) });
      }
      const data = pickClientData(req.body ?? {});
      const row = await prisma.client.create({ data });
      return res.status(201).json(row);
    }

    if (req.method === 'PUT') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      const parsed = clientSchema.partial().safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues.map(e => e.message) });
      }
      const data = pickClientData(req.body ?? {});
      // Upsert: update if exists, create if not (handles client-side generated IDs)
      const existing = await prisma.client.findUnique({ where: { id: id as string } });
      const row = existing
        ? await prisma.client.update({ where: { id: id as string }, data })
        : await prisma.client.create({ data: { ...data, id: id as string } });
      return res.status(200).json(row);
    }

    if (req.method === 'DELETE') {
      if (!await requireDeletePermission(req, res)) return;
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      await prisma.client.delete({ where: { id: id as string } });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e: any) {
    log.error('[clients]', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
