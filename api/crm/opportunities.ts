import type { HttpRequest, HttpResponse } from '../../lib/http';
import { prisma } from '../../lib/prisma';
import { requireAuth, requireDeletePermission, cors } from '../../lib/auth';
import { log } from '../../lib/serverLogger.js';
import { pickCRMOpportunityData } from '../../lib/whitelist';
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
  createdBy: z.string().min(1, 'Created by is required'),
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
      const rows = await prisma.cRMOpportunity.findMany({
        where: companyId ? { companyId: companyId as string } : undefined,
        orderBy: { createdAt: 'asc' },
      });
      return res.status(200).json(rows);
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
      }
      const row = existing
        ? await prisma.cRMOpportunity.update({ where: { id: id as string }, data })
        : await prisma.cRMOpportunity.create({ data: { ...data, id: id as string } });
      return res.status(200).json(row);
    }

    if (req.method === 'DELETE') {
      if (!await requireDeletePermission(req, res)) return;
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      await prisma.cRMOpportunity.delete({ where: { id: id as string } });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e: any) {
    log.error('[crm/opportunities]', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
