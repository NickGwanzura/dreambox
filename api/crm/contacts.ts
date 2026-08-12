import type { HttpRequest, HttpResponse } from '../../lib/http';
import { prisma } from '../../lib/prisma';
import { requireAuth, requireDeletePermission, cors } from '../../lib/auth';
import { log } from '../../lib/serverLogger.js';
import { pickCRMContactData } from '../../lib/whitelist';
import { z } from 'zod';
import { PaginationError, paginated, parsePagePagination } from '../../lib/pagination.js';
import { recordMutationAudit } from '../../lib/mutationAudit.js';

const contactSchema = z.object({
  companyId: z.string().min(1, 'Company ID is required'),
  fullName: z.string().min(1, 'Full name is required'),
  jobTitle: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  linkedinUrl: z.string().optional(),
  isPrimary: z.boolean().optional(),
});

async function assertCompany(companyId: string) {
  const company = await prisma.cRMCompany.findUnique({ where: { id: companyId }, select: { id: true } });
  if (!company) throw new Error('Company not found');
}

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
      const where = companyId ? { companyId: companyId as string } : undefined;
      const { take, skip, page, limit } = parsePagePagination(req.query as any);
      const [rows, total] = await Promise.all([prisma.cRMContact.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take, skip,
      }), typeof prisma.cRMContact.count === 'function' ? prisma.cRMContact.count({ where }) : Promise.resolve(0)]);
      return res.status(200).json(paginated(rows, page, limit, total));
    }

    if (req.method === 'POST') {
      const parsed = contactSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues.map(e => e.message) });
      }
      const data = pickCRMContactData(req.body ?? {});
      await assertCompany(data.companyId);
      const row = await prisma.cRMContact.create({ data });
      await recordMutationAudit(req, payload, 'CRM_CONTACT_CREATED', 'crm_contacts', row.id, `CRM contact ${row.id} created`);
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
      if (data.companyId) await assertCompany(data.companyId);
      const row = existing
        ? await prisma.cRMContact.update({ where: { id: id as string }, data })
        : await prisma.cRMContact.create({ data: { ...data, id: id as string } });
      await recordMutationAudit(req, payload, existing ? 'CRM_CONTACT_UPDATED' : 'CRM_CONTACT_CREATED', 'crm_contacts', id as string, `CRM contact ${id} ${existing ? 'updated' : 'created'}`);
      return res.status(200).json(row);
    }

    if (req.method === 'DELETE') {
      if (!await requireDeletePermission(req, res)) return;
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      const [opportunities, emailThreads, callLogs] = await Promise.all([
        prisma.cRMOpportunity.count({ where: { OR: [{ primaryContactId: id as string }, { secondaryContactId: id as string }] } }),
        prisma.cRMEmailThread.count({ where: { contactId: id as string } }),
        prisma.cRMCallLog.count({ where: { contactId: id as string } }),
      ]);
      if (opportunities || emailThreads || callLogs) {
        return res.status(409).json({ error: 'Contact has CRM activity and cannot be deleted.' });
      }
      await prisma.cRMContact.delete({ where: { id: id as string } });
      await recordMutationAudit(req, payload, 'CRM_CONTACT_DELETED', 'crm_contacts', id as string, `CRM contact ${id} deleted`);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e: any) {
    if (e instanceof PaginationError) return res.status(400).json({ error: e.message });
    log.error('[crm/contacts]', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
