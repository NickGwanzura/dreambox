import type { HttpRequest, HttpResponse } from '../../lib/http';
import { prisma } from '../../lib/prisma';
import { requireAuth, requireDeletePermission, cors } from '../../lib/auth';
import { log } from '../../lib/serverLogger.js';
import { pickCRMTouchpointData } from '../../lib/whitelist';
import { z } from 'zod';
import { assertCRMActivityParents, isIntegrityError } from '../../lib/crmIntegrity.js';
import { PaginationError, paginated, parsePagePagination } from '../../lib/pagination.js';
import { recordMutationAudit } from '../../lib/mutationAudit.js';

const touchpointSchema = z.object({
  opportunityId: z.string().min(1, 'Opportunity ID is required'),
  type: z.string().min(1, 'Type is required'),
  direction: z.enum(['Inbound', 'Outbound']).optional(),
  subject: z.string().optional().nullable(),
  content: z.string().optional().nullable(),
  clientResponse: z.string().optional().nullable(),
  outcome: z.string().optional().nullable(),
  sentiment: z.string().optional().nullable(),
  durationSeconds: z.number().int().optional().nullable(),
  createdBy: z.string().optional(),
});

export default async function handler(req: HttpRequest, res: HttpResponse) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const payload = await requireAuth(req, res);
  if (!payload) return;

  try {
    if (req.method === 'GET') {
      const { id, opportunityId } = req.query;
      if (id) {
        const row = await prisma.cRMTouchpoint.findUnique({ where: { id: id as string } });
        if (!row) return res.status(404).json({ error: 'Not found' });
        return res.status(200).json(row);
      }
      const where = opportunityId ? { opportunityId: opportunityId as string } : undefined;
      const { take, skip, page, limit } = parsePagePagination(req.query as any);
      const [rows, total] = await Promise.all([prisma.cRMTouchpoint.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take, skip,
      }), typeof prisma.cRMTouchpoint.count === 'function' ? prisma.cRMTouchpoint.count({ where }) : Promise.resolve(0)]);
      return res.status(200).json(paginated(rows, page, limit, total));
    }

    if (req.method === 'POST') {
      const parsed = touchpointSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues.map(e => e.message) });
      }
      const data = pickCRMTouchpointData(req.body ?? {});
      await assertCRMActivityParents(data.opportunityId);
      data.createdBy = payload.email;
      const row = await prisma.cRMTouchpoint.create({ data });
      await recordMutationAudit(req, payload, 'CRM_TOUCHPOINT_CREATED', 'crm_touchpoints', row.id, `CRM touchpoint ${row.id} created`);
      return res.status(201).json(row);
    }

    if (req.method === 'PUT') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      const parsed = touchpointSchema.partial().safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues.map(e => e.message) });
      }
      const data = pickCRMTouchpointData(req.body ?? {});
      const existing = await prisma.cRMTouchpoint.findUnique({ where: { id: id as string } });
      const merged = existing ? { ...existing, ...data } : data;
      if (!existing && !parsed.data.opportunityId) return res.status(400).json({ error: 'Opportunity ID is required' });
      await assertCRMActivityParents(merged.opportunityId);
      delete data.createdBy;
      const row = existing
        ? await prisma.cRMTouchpoint.update({ where: { id: id as string }, data })
        : await prisma.cRMTouchpoint.create({ data: { ...data, id: id as string, createdBy: payload.email } });
      await recordMutationAudit(req, payload, existing ? 'CRM_TOUCHPOINT_UPDATED' : 'CRM_TOUCHPOINT_CREATED', 'crm_touchpoints', id as string, `CRM touchpoint ${id} ${existing ? 'updated' : 'created'}`);
      return res.status(200).json(row);
    }

    if (req.method === 'DELETE') {
      if (!await requireDeletePermission(req, res)) return;
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      await prisma.cRMTouchpoint.delete({ where: { id: id as string } });
      await recordMutationAudit(req, payload, 'CRM_TOUCHPOINT_DELETED', 'crm_touchpoints', id as string, `CRM touchpoint ${id} deleted`);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e: any) {
    if (e instanceof PaginationError) return res.status(400).json({ error: e.message });
    log.error('[crm/touchpoints]', e);
    if (isIntegrityError(e)) return res.status(409).json({ error: e.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
}
