import type { HttpRequest, HttpResponse } from '../../lib/http';
import { prisma } from '../../lib/prisma';
import { requireAuth, requireDeletePermission, cors } from '../../lib/auth';
import { log } from '../../lib/serverLogger.js';
import { pickCRMTaskData } from '../../lib/whitelist';
import { z } from 'zod';
import { assertCRMActivityParents, isIntegrityError } from '../../lib/crmIntegrity.js';
import { PaginationError, paginated, parsePagePagination } from '../../lib/pagination.js';
import { recordMutationAudit } from '../../lib/mutationAudit.js';

const crmTaskSchema = z.object({
  opportunityId: z.string().min(1, 'Opportunity ID is required'),
  type: z.string().min(1, 'Type is required'),
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional().nullable(),
  dueDate: z.string().min(1, 'Due date is required'),
  status: z.string().min(1, 'Status is required'),
  priority: z.string().min(1, 'Priority is required'),
  assignedTo: z.string().min(1, 'Assigned user is required'),
  completedBy: z.string().optional().nullable(),
  completedAt: z.string().optional().nullable(),
  completionNotes: z.string().optional().nullable(),
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
        const row = await prisma.cRMTask.findUnique({ where: { id: id as string } });
        if (!row) return res.status(404).json({ error: 'Not found' });
        return res.status(200).json(row);
      }
      const where = opportunityId ? { opportunityId: opportunityId as string } : undefined;
      const { take, skip, page, limit } = parsePagePagination(req.query as any);
      const [rows, total] = await Promise.all([prisma.cRMTask.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take, skip,
      }), typeof prisma.cRMTask.count === 'function' ? prisma.cRMTask.count({ where }) : Promise.resolve(0)]);
      return res.status(200).json(paginated(rows, page, limit, total));
    }

    if (req.method === 'POST') {
      const parsed = crmTaskSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues.map(e => e.message) });
      }
      const data = pickCRMTaskData(req.body ?? {});
      await assertCRMActivityParents(data.opportunityId);
      data.createdBy = payload.email;
      const row = await prisma.cRMTask.create({ data });
      await recordMutationAudit(req, payload, 'CRM_TASK_CREATED', 'crm_tasks', row.id, `CRM task ${row.id} created`);
      return res.status(201).json(row);
    }

    if (req.method === 'PUT') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      const parsed = crmTaskSchema.partial().safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues.map(e => e.message) });
      }
      const data = pickCRMTaskData(req.body ?? {});
      const existing = await prisma.cRMTask.findUnique({ where: { id: id as string } });
      const merged = existing ? { ...existing, ...data } : data;
      if (!existing && !parsed.data.opportunityId) return res.status(400).json({ error: 'Opportunity ID is required' });
      await assertCRMActivityParents(merged.opportunityId);
      delete data.createdBy;
      const row = existing
        ? await prisma.cRMTask.update({ where: { id: id as string }, data })
        : await prisma.cRMTask.create({ data: { ...data, id: id as string, createdBy: payload.email } });
      await recordMutationAudit(req, payload, existing ? 'CRM_TASK_UPDATED' : 'CRM_TASK_CREATED', 'crm_tasks', id as string, `CRM task ${id} ${existing ? 'updated' : 'created'}`);
      return res.status(200).json(row);
    }

    if (req.method === 'DELETE') {
      if (!await requireDeletePermission(req, res)) return;
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      await prisma.cRMTask.delete({ where: { id: id as string } });
      await recordMutationAudit(req, payload, 'CRM_TASK_DELETED', 'crm_tasks', id as string, `CRM task ${id} deleted`);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e: any) {
    if (e instanceof PaginationError) return res.status(400).json({ error: e.message });
    log.error('[crm/tasks]', e);
    if (isIntegrityError(e)) return res.status(409).json({ error: e.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
}
