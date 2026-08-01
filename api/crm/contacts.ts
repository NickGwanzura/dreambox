import type { HttpRequest, HttpResponse } from '../../lib/http';
import { prisma } from '../../lib/prisma';
import { requireAuth, requireDeletePermission, cors } from '../../lib/auth';
import { log } from '../../lib/serverLogger.js';
import { pickCRMContactData } from '../../lib/whitelist';
import { z } from 'zod';

const contactSchema = z.object({
  companyId: z.string().min(1, 'Company ID is required'),
  fullName: z.string().min(1, 'Full name is required'),
  jobTitle: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  linkedinUrl: z.string().optional(),
  isPrimary: z.boolean().optional(),
});

export default async function handler(req: HttpRequest, res: HttpResponse) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const payload = await requireAuth(req, res);
  if (!payload) return;

  try {
    if (req.method === 'GET') {
      const { id, companyId } = req.query;
      if (id) {
        const row = await prisma.cRMContact.findUnique({ where: { id: id as string } });
        if (!row) return res.status(404).json({ error: 'Not found' });
        return res.status(200).json(row);
      }
      const rows = await prisma.cRMContact.findMany({
        where: companyId ? { companyId: companyId as string } : undefined,
        orderBy: { createdAt: 'asc' },
      });
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      const parsed = contactSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues.map(e => e.message) });
      }
      const data = pickCRMContactData(req.body ?? {});
      const row = await prisma.cRMContact.create({ data });
      return res.status(201).json(row);
    }

    if (req.method === 'PUT') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      const parsed = contactSchema.partial().safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues.map(e => e.message) });
      }
      const data = pickCRMContactData(req.body ?? {});
      const existing = await prisma.cRMContact.findUnique({ where: { id: id as string } });
      const row = existing
        ? await prisma.cRMContact.update({ where: { id: id as string }, data })
        : await prisma.cRMContact.create({ data: { ...data, id: id as string } });
      return res.status(200).json(row);
    }

    if (req.method === 'DELETE') {
      if (!await requireDeletePermission(req, res)) return;
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      await prisma.cRMContact.delete({ where: { id: id as string } });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e: any) {
    log.error('[crm/contacts]', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
