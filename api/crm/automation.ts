import type { HttpRequest, HttpResponse } from '../../lib/http';
import { z } from 'zod';
import { cors, requireAuth } from '../../lib/auth';
import { prisma } from '../../lib/prisma';
import type {
  CRMCompany,
  CRMContact,
  CRMOpportunity,
  CRMTouchpoint,
} from '../../types';
import {
  assessQuietLead,
  quietLeadTaskDescription,
  quietLeadTaskTitle,
  QUIET_LEAD_AUTOMATION_ACTION,
} from '../../services/crmAutomation';

const commandSchema = z.object({
  action: z.literal(QUIET_LEAD_AUTOMATION_ACTION),
  opportunityId: z.string().trim().min(1).max(191),
});

type AutomationTaskClient = {
  create: (args: { data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
  findUnique: (args: { where: { automationKey: string } }) => Promise<Record<string, unknown> | null>;
};

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function asOpportunity(row: any): CRMOpportunity {
  return {
    ...row,
    status: String(row.status || 'new'),
    stage: String(row.stage || 'new_lead'),
    numberOfAttempts: Number(row.numberOfAttempts) || 0,
    daysInCurrentStage: Number(row.daysInCurrentStage) || 0,
    stageHistory: Array.isArray(row.stageHistory) ? row.stageHistory : [],
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  } as CRMOpportunity;
}

function asCompany(row: any): CRMCompany | undefined {
  if (!row) return undefined;
  return { ...row, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) } as CRMCompany;
}

function asContact(row: any): CRMContact | undefined {
  if (!row) return undefined;
  return { ...row, createdAt: iso(row.createdAt) } as CRMContact;
}

function asTouchpoints(rows: any[]): CRMTouchpoint[] {
  return rows.map(row => ({ ...row, createdAt: iso(row.createdAt) } as CRMTouchpoint));
}

function isUniqueConflict(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { code?: string }).code === 'P2002');
}

/**
 * Explicit command endpoint for quiet-lead follow-up creation. The request
 * contains only the action and opportunity ID; value, score, activity, and
 * eligibility are recomputed from the database on every attempt.
 */
export default async function handler(req: HttpRequest, res: HttpResponse) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const payload = await requireAuth(req, res);
  if (!payload) return;

  const parsed = commandSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: 'A supported automation action and opportunity ID are required.' });
  }

  try {
    const opportunityRow = await prisma.cRMOpportunity.findUnique({
      where: { id: parsed.data.opportunityId },
    });
    if (!opportunityRow) return res.status(404).json({ error: 'Opportunity not found.' });

    const [companyRow, contactRow, touchpointRows] = await Promise.all([
      prisma.cRMCompany.findUnique({ where: { id: opportunityRow.companyId } }),
      prisma.cRMContact.findUnique({ where: { id: opportunityRow.primaryContactId } }),
      prisma.cRMTouchpoint.findMany({
        where: { opportunityId: opportunityRow.id },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const now = new Date();
    const assessment = assessQuietLead({
      opportunity: asOpportunity(opportunityRow),
      company: asCompany(companyRow),
      primaryContact: asContact(contactRow),
      touchpoints: asTouchpoints(touchpointRows),
    }, now);

    if (!assessment.eligible || !assessment.automationKey) {
      return res.status(409).json({
        error: 'This opportunity is not currently eligible for a quiet-lead follow-up.',
        reason: assessment.reason,
      });
    }

    const taskData: Record<string, unknown> = {
      opportunityId: assessment.opportunity.id,
      type: 'follow_up',
      title: quietLeadTaskTitle(assessment.company?.name),
      description: quietLeadTaskDescription(assessment),
      dueDate: now.toISOString(),
      status: 'pending',
      priority: assessment.score >= 85 ? 'urgent' : 'high',
      assignedTo: assessment.opportunity.assignedTo || payload.userId,
      createdBy: payload.userId,
      automationKey: assessment.automationKey,
    };

    // `automationKey` is nullable+unique in the CRMTask schema. A plain
    // create guarded by that database constraint is atomic and, unlike a
    // read-then-create sequence, cannot create duplicate active tasks.
    const tasks = prisma.cRMTask as unknown as AutomationTaskClient;
    try {
      const task = await tasks.create({ data: taskData });
      return res.status(201).json({ status: 'created', created: true, task });
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
      const existing = await tasks.findUnique({ where: { automationKey: assessment.automationKey } });
      if (!existing) {
        return res.status(409).json({ error: 'The follow-up was created concurrently. Refresh and try again.' });
      }
      return res.status(200).json({ status: 'existing', created: false, task: existing });
    }
  } catch {
    return res.status(500).json({ error: 'Could not run CRM automation.' });
  }
}
