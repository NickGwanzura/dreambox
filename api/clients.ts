import type { HttpRequest, HttpResponse } from '../lib/http';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireDeletePermission, cors } from '../lib/auth';
import { log } from '../lib/serverLogger.js';
import { pickClientData } from '../lib/whitelist';
import { PaginationError, paginated, parsePagePagination } from '../lib/pagination.js';

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
      const { take, skip, page, limit } = parsePagePagination(req.query as any);
      // Stable tie-breaker is required for limit/skip pagination: timestamps
      // are not unique, and ordering by them alone can duplicate or omit rows
      // between pages when records share the same createdAt value.
      const [rows, total] = await Promise.all([prisma.client.findMany({
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take,
        skip,
      }), typeof prisma.client.count === 'function' ? prisma.client.count() : Promise.resolve(0)]);
      return res.status(200).json(paginated(rows, page, limit, total));
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
      const client = await prisma.client.findUnique({ where: { id: id as string } });
      if (!client) return res.status(404).json({ error: 'Client not found' });
      // These tables intentionally retain financial/contract history.  Do not
      // turn a client delete into a silent orphaning operation.
      const [contracts, invoices, expenses] = await Promise.all([
        prisma.contract.count({ where: { clientId: id as string } }),
        prisma.invoice.count({ where: { clientId: id as string } }),
        prisma.expense.count({ where: { clientId: id as string } }),
      ]);
      if (contracts || invoices || expenses) {
        return res.status(409).json({ error: 'Client is referenced by contracts, financial records, or expenses and cannot be deleted.' });
      }
      await prisma.client.delete({ where: { id: id as string } });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e: any) {
    if (e instanceof PaginationError) return res.status(400).json({ error: e.message });
    log.error('[clients]', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
