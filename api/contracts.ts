import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireDeletePermission, cors } from '../lib/auth';

const contractSchema = z.object({
  clientId: z.string().min(1, 'Client ID is required'),
  billboardId: z.string().min(1, 'Billboard ID is required'),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
  monthlyRate: z.number({ error: 'Monthly rate is required' }),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const payload = requireAuth(req, res);
  if (!payload) return;

  try {
    if (req.method === 'GET') {
      const { id } = req.query;
      if (id) {
        const row = await prisma.contract.findUnique({ where: { id: id as string } });
        if (!row) return res.status(404).json({ error: 'Not found' });
        return res.status(200).json(row);
      }
      const rows = await prisma.contract.findMany({ orderBy: { dbCreatedAt: 'asc' } });
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      const parsed = contractSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues.map(e => e.message) });
      }
      const { id, dbCreatedAt, updatedAt, ...data } = req.body ?? {};
      const row = await prisma.contract.create({ data });
      return res.status(201).json(row);
    }

    if (req.method === 'PUT') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      const { id: _id, dbCreatedAt, updatedAt, ...data } = req.body ?? {};
      // Upsert: update if exists, create if not (handles client-side generated IDs)
      const existing = await prisma.contract.findUnique({ where: { id: id as string } });
      const row = existing
        ? await prisma.contract.update({ where: { id: id as string }, data })
        : await prisma.contract.create({ data: { ...data, id: id as string } });
      return res.status(200).json(row);
    }

    if (req.method === 'DELETE') {
      if (!requireDeletePermission(req, res)) return;
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      // Cascade-delete linked invoices in the same transaction so a deleted contract never
      // leaves behind orphan invoices. Receipts and quotations are preserved.
      const [{ count: invoicesDeleted }] = await prisma.$transaction([
        prisma.invoice.deleteMany({ where: { contractId: id as string, type: 'Invoice' } }),
        prisma.contract.delete({ where: { id: id as string } }),
      ]);
      return res.status(200).json({ success: true, invoicesDeleted });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e: any) {
    console.error('[contracts]', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
