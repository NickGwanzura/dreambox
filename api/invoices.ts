import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireDeletePermission, cors } from '../lib/auth';

const invoiceSchema = z.object({
  clientId: z.string().min(1, 'Client ID is required'),
  date: z.string().min(1, 'Date is required'),
  items: z.array(z.any()).min(1, 'At least one item is required'),
  subtotal: z.number({ error: 'Subtotal is required' }),
  total: z.number({ error: 'Total is required' }),
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
        const row = await prisma.invoice.findUnique({ where: { id: id as string } });
        if (!row) return res.status(404).json({ error: 'Not found' });
        return res.status(200).json(row);
      }
      const rows = await prisma.invoice.findMany({ orderBy: { createdAt: 'asc' } });
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      const parsed = invoiceSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues.map(e => e.message) });
      }
      const { createdAt, updatedAt, id: requestedId, ...data } = req.body ?? {};

      // Duplicate ID protection: if client sends an ID that already exists, reject
      if (requestedId) {
        const conflict = await prisma.invoice.findUnique({ where: { id: requestedId } });
        if (conflict) {
          return res.status(409).json({ error: 'Invoice with this ID already exists', existingId: requestedId });
        }
      }

      const row = await prisma.invoice.create({ data: requestedId ? { ...data, id: requestedId } : data });
      console.log(`[invoices] POST created invoice ${row.id} for client ${row.clientId}`);
      return res.status(201).json(row);
    }

    if (req.method === 'PUT') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      const { id: _id, createdAt, updatedAt, ...data } = req.body ?? {};

      // Only update if the invoice exists — NEVER silently create (prevents deleted invoices from reappearing)
      const existing = await prisma.invoice.findUnique({ where: { id: id as string } });
      if (!existing) {
        return res.status(404).json({ error: 'Invoice not found on server. It may have been deleted.' });
      }

      const row = await prisma.invoice.update({ where: { id: id as string }, data });
      return res.status(200).json(row);
    }

    if (req.method === 'DELETE') {
      if (!requireDeletePermission(req, res)) return;
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });

      // Verify invoice exists before deleting
      const target = await prisma.invoice.findUnique({ where: { id: id as string } });
      if (!target) {
        console.warn(`[invoices] DELETE requested for non-existent invoice ${id}`);
        return res.status(404).json({ error: 'Invoice not found' });
      }

      await prisma.invoice.delete({ where: { id: id as string } });
      console.log(`[invoices] DELETE removed invoice ${id} (type=${target.type}, status=${target.status}, total=${target.total})`);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e: any) {
    console.error('[invoices]', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
