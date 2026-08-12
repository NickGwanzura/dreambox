import type { HttpRequest, HttpResponse } from '../../lib/http';
import { prisma } from '../../lib/prisma';
import { requireAuth, requireDeletePermission, cors } from '../../lib/auth';
import { log } from '../../lib/serverLogger.js';
import { pickCRMOpportunityData } from '../../lib/whitelist';
import { isIntegrityError } from '../../lib/crmIntegrity.js';
import { PaginationError, paginated, parsePagePagination } from '../../lib/pagination.js';
import { recordMutationAudit } from '../../lib/mutationAudit.js';
import { z } from 'zod';

const opportunitySchema = z.object({
  companyId: z.string().min(1, 'Company ID is required'),
  primaryContactId: z.string().min(1, 'Primary contact ID is required'),
  secondaryContactId: z.string().optional().nullable(),
  locationInterest: z.string().optional().nullable(),
  billboardType: z.string().optional().nullable(),
  campaignDuration: z.string().optional().nullable(),
  estimatedValue: z.number().optional().nullable(),
  actualValue: z.number().optional().nullable(),
  status: z.string().min(1, 'Status is required'),
  stage: z.string().min(1, 'Stage is required'),
  leadSource: z.string().optional().nullable(),
  lastContactDate: z.string().optional().nullable(),
  nextFollowUpDate: z.string().optional().nullable(),
  callOutcomeNotes: z.string().optional().nullable(),
  numberOfAttempts: z.number().int().optional(),
  assignedTo: z.string().optional().nullable(),
  // Authorship is always derived from the verified JWT on the server.
  createdBy: z.string().optional(),
  closedAt: z.string().optional().nullable(),
  closedReason: z.string().optional().nullable(),
  daysInCurrentStage: z.number().int().optional(),
  stageHistory: z.any().optional(),
});

async function assertOpportunityParents(data: any) {
  const [company, primary, secondary] = await Promise.all([
    prisma.cRMCompany.findUnique({ where: { id: data.companyId }, select: { id: true } }),
    prisma.cRMContact.findUnique({ where: { id: data.primaryContactId }, select: { id: true, companyId: true } }),
    data.secondaryContactId ? prisma.cRMContact.findUnique({ where: { id: data.secondaryContactId }, select: { id: true, companyId: true } }) : null,
  ]);
  if (!company) throw new Error('Company not found');
  if (!primary || primary.companyId !== data.companyId) throw new Error('Primary contact must belong to the company');
  if (secondary && secondary.companyId !== data.companyId) throw new Error('Secondary contact must belong to the company');
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
        const row = await prisma.cRMOpportunity.findUnique({ where: { id: id as string } });
        if (!row) return res.status(404).json({ error: 'Not found' });
        return res.status(200).json(row);
      }
      const where = companyId ? { companyId: companyId as string } : undefined;
      const { take, skip, page, limit } = parsePagePagination(req.query as any);
      const [rows, total] = await Promise.all([prisma.cRMOpportunity.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take, skip,
      }), typeof prisma.cRMOpportunity.count === 'function' ? prisma.cRMOpportunity.count({ where }) : Promise.resolve(0)]);
      return res.status(200).json(paginated(rows, page, limit, total));
    }

    if (req.method === 'POST') {
      const parsed = opportunitySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues.map(e => e.message) });
      }
      const data = pickCRMOpportunityData(req.body ?? {});
      await assertOpportunityParents(data);
      data.createdBy = payload.email;
      const row = await prisma.cRMOpportunity.create({ data });
      await recordMutationAudit(req, payload, 'CRM_OPPORTUNITY_CREATED', 'crm_opportunities', row.id, `CRM opportunity ${row.id} created`);
      return res.status(201).json(row);
    }

    if (req.method === 'PUT') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      const parsed = opportunitySchema.partial().safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues.map(e => e.message) });
      }
      const data = pickCRMOpportunityData(req.body ?? {});
      const existing = await prisma.cRMOpportunity.findUnique({ where: { id: id as string } });
      if (existing) {
        const merged = { ...existing, ...data };
        await assertOpportunityParents(merged);
        delete data.createdBy;
      } else {
        await assertOpportunityParents(data);
      }
      const row = existing
        ? await prisma.cRMOpportunity.update({ where: { id: id as string }, data })
        : await prisma.cRMOpportunity.create({ data: { ...data, id: id as string, createdBy: payload.email } });
      await recordMutationAudit(req, payload, existing ? 'CRM_OPPORTUNITY_UPDATED' : 'CRM_OPPORTUNITY_CREATED', 'crm_opportunities', id as string, `CRM opportunity ${id} ${existing ? 'updated' : 'created'}`);
      return res.status(200).json(row);
    }

    if (req.method === 'DELETE') {
      if (!await requireDeletePermission(req, res)) return;
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      const [touchpoints, tasks, emailThreads, callLogs] = await Promise.all([
        prisma.cRMTouchpoint.count({ where: { opportunityId: id as string } }),
        prisma.cRMTask.count({ where: { opportunityId: id as string } }),
        prisma.cRMEmailThread.count({ where: { opportunityId: id as string } }),
        prisma.cRMCallLog.count({ where: { opportunityId: id as string } }),
      ]);
      if (touchpoints || tasks || emailThreads || callLogs) {
        return res.status(409).json({ error: 'Opportunity has CRM activity and cannot be deleted.' });
      }
      await prisma.cRMOpportunity.delete({ where: { id: id as string } });
      await recordMutationAudit(req, payload, 'CRM_OPPORTUNITY_DELETED', 'crm_opportunities', id as string, `CRM opportunity ${id} deleted`);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e: any) {
    if (e instanceof PaginationError) return res.status(400).json({ error: e.message });
    log.error('[crm/opportunities]', e);
    if (isIntegrityError(e)) return res.status(409).json({ error: e.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
}
