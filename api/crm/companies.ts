import type { HttpRequest, HttpResponse } from '../../lib/http';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requireAuth, requireDeletePermission, cors } from '../../lib/auth';
import { log } from '../../lib/serverLogger.js';
import { pickCRMCompanyData } from '../../lib/whitelist';
import { parsePagination } from '../../lib/pagination.js';
import { recordMutationAudit } from '../../lib/mutationAudit.js';

const companySchema = z.object({
  name: z.string().min(1, 'Company name is required'),
  industry: z.string().optional(),
  website: z.string().optional(),
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
        const row = await prisma.cRMCompany.findUnique({ where: { id: id as string } });
        if (!row) return res.status(404).json({ error: 'Not found' });
        return res.status(200).json(row);
      }
      const { take, skip } = parsePagination(req.query as any, 500);
      const rows = await prisma.cRMCompany.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take, skip });
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      const parsed = companySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues.map(e => e.message) });
      }
      const data = pickCRMCompanyData(req.body ?? {});
      const row = await prisma.cRMCompany.create({ data });
      await recordMutationAudit(req, payload, 'CRM_COMPANY_CREATED', 'crm_companies', row.id, `CRM company ${row.id} created`);
      return res.status(201).json(row);
    }

    if (req.method === 'PUT') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      const parsed = companySchema.partial().safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues.map(e => e.message) });
      }
      const data = pickCRMCompanyData(req.body ?? {});
      const existing = await prisma.cRMCompany.findUnique({ where: { id: id as string } });
      const row = existing
        ? await prisma.cRMCompany.update({ where: { id: id as string }, data })
        : await prisma.cRMCompany.create({ data: { ...data, id: id as string } });
      await recordMutationAudit(req, payload, existing ? 'CRM_COMPANY_UPDATED' : 'CRM_COMPANY_CREATED', 'crm_companies', id as string, `CRM company ${id} ${existing ? 'updated' : 'created'}`);
      return res.status(200).json(row);
    }

    if (req.method === 'DELETE') {
      if (!await requireDeletePermission(req, res)) return;
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      const [contacts, opportunities] = await Promise.all([
        prisma.cRMContact.count({ where: { companyId: id as string } }),
        prisma.cRMOpportunity.count({ where: { companyId: id as string } }),
      ]);
      if (contacts || opportunities) {
        return res.status(409).json({ error: 'Company has contacts or opportunities and cannot be deleted.' });
      }
      await prisma.cRMCompany.delete({ where: { id: id as string } });
      await recordMutationAudit(req, payload, 'CRM_COMPANY_DELETED', 'crm_companies', id as string, `CRM company ${id} deleted`);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e: any) {
    log.error('[crm/companies]', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
