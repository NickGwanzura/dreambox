import type { HttpRequest, HttpResponse } from '../../lib/http';
import { prisma } from '../../lib/prisma';
import { requireAuth, requireDeletePermission, cors } from '../../lib/auth';
import { log } from '../../lib/serverLogger.js';
import { pickCRMCallLogData } from '../../lib/whitelist';
import { z } from 'zod';
import { assertCRMActivityParents, isIntegrityError } from '../../lib/crmIntegrity.js';
import { parsePagination } from '../../lib/pagination.js';
import { recordMutationAudit } from '../../lib/mutationAudit.js';

const callLogSchema = z.object({
  opportunityId: z.string().min(1, 'Opportunity ID is required'),
  contactId: z.string().min(1, 'Contact ID is required'),
  phoneNumber: z.string().min(1, 'Phone number is required'),
  direction: z.enum(['Inbound', 'Outbound']).optional(),
  startedAt: z.string().min(1, 'Started at is required'),
  endedAt: z.string().optional().nullable(),
  durationSeconds: z.number().int().nonnegative(),
  outcome: z.string().min(1, 'Outcome is required'),
  notes: z.string().optional().nullable(),
  recordingUrl: z.string().optional().nullable(),
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
        const row = await prisma.cRMCallLog.findUnique({ where: { id: id as string } });
        if (!row) return res.status(404).json({ error: 'Not found' });
        return res.status(200).json(row);
      }
      const rows = await prisma.cRMCallLog.findMany({
        where: opportunityId ? { opportunityId: opportunityId as string } : undefined,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        ...parsePagination(req.query as any, 500),
      });
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      const parsed = callLogSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues.map(e => e.message) });
      }
      const data = pickCRMCallLogData(req.body ?? {});
      await assertCRMActivityParents(data.opportunityId, data.contactId);
      data.createdBy = payload.email;
      const row = await prisma.cRMCallLog.create({ data });
      await recordMutationAudit(req, payload, 'CRM_CALL_LOG_CREATED', 'crm_call_logs', row.id, `CRM call log ${row.id} created`);
      return res.status(201).json(row);
    }

    if (req.method === 'PUT') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      const parsed = callLogSchema.partial().safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues.map(e => e.message) });
      }
      const data = pickCRMCallLogData(req.body ?? {});
      const existing = await prisma.cRMCallLog.findUnique({ where: { id: id as string } });
      const merged = existing ? { ...existing, ...data } : data;
      if (!existing && (!parsed.data.opportunityId || !parsed.data.contactId)) return res.status(400).json({ error: 'Opportunity and contact IDs are required' });
      await assertCRMActivityParents(merged.opportunityId, merged.contactId);
      delete data.createdBy;
      const row = existing
        ? await prisma.cRMCallLog.update({ where: { id: id as string }, data })
        : await prisma.cRMCallLog.create({ data: { ...data, id: id as string, createdBy: payload.email } });
      await recordMutationAudit(req, payload, existing ? 'CRM_CALL_LOG_UPDATED' : 'CRM_CALL_LOG_CREATED', 'crm_call_logs', id as string, `CRM call log ${id} ${existing ? 'updated' : 'created'}`);
      return res.status(200).json(row);
    }

    if (req.method === 'DELETE') {
      if (!await requireDeletePermission(req, res)) return;
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      await prisma.cRMCallLog.delete({ where: { id: id as string } });
      await recordMutationAudit(req, payload, 'CRM_CALL_LOG_DELETED', 'crm_call_logs', id as string, `CRM call log ${id} deleted`);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e: any) {
    log.error('[crm/call-logs]', e);
    if (isIntegrityError(e)) return res.status(409).json({ error: e.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
}
