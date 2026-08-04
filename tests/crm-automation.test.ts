import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpRequest, HttpResponse } from '../lib/http';
import {
  assessQuietLead,
  buildQuietLeadAutomationKey,
  QUIET_LEAD_AUTOMATION_ACTION,
  QUIET_LEAD_DAYS,
  type QuietLeadScorer,
} from '../services/crmAutomation';
import type { CRMCompany, CRMContact, CRMOpportunity } from '../types';

const state = vi.hoisted(() => ({
  prisma: {
    cRMOpportunity: { findUnique: vi.fn() },
    cRMCompany: { findUnique: vi.fn() },
    cRMContact: { findUnique: vi.fn() },
    cRMTouchpoint: { findMany: vi.fn() },
    cRMTask: { create: vi.fn(), findUnique: vi.fn() },
  },
  auth: { cors: vi.fn(), requireAuth: vi.fn() },
}));

vi.mock('../lib/prisma', () => ({ prisma: state.prisma }));
vi.mock('../lib/auth', () => state.auth);

import automationHandler from '../api/crm/automation';

const baseOpportunity = (overrides: Partial<CRMOpportunity> = {}): CRMOpportunity => ({
  id: 'opportunity-1',
  companyId: 'company-1',
  primaryContactId: 'contact-1',
  status: 'qualified',
  stage: 'proposal_sent',
  estimatedValue: 60_000,
  numberOfAttempts: 1,
  createdBy: 'sales-1',
  createdAt: '2026-07-20T10:00:00.000Z',
  updatedAt: '2026-07-20T10:00:00.000Z',
  daysInCurrentStage: 1,
  stageHistory: [],
  ...overrides,
});

const company: CRMCompany = {
  id: 'company-1', name: 'Acme Media', industry: 'technology', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};
const contact: CRMContact = {
  id: 'contact-1', companyId: 'company-1', fullName: 'Ada Lovelace', email: 'ada@example.com', phone: '+263700000000', isPrimary: true, createdAt: '2026-01-01T00:00:00.000Z',
};

const highScore: QuietLeadScorer = () => ({ score: 82, recommendations: [] });

function response() {
  let statusCode = 0;
  let payload: any;
  const res: any = {
    status: vi.fn((status: number) => { statusCode = status; return res; }),
    json: vi.fn((body: any) => { payload = body; return res; }),
    end: vi.fn(),
    setHeader: vi.fn(),
  };
  Object.defineProperties(res, {
    statusCode: { get: () => statusCode },
    payload: { get: () => payload },
  });
  return res as HttpResponse & { statusCode: number; payload: any };
}

const request = (body: Record<string, unknown>) => ({ method: 'POST', headers: {}, query: {}, body } as unknown as HttpRequest);

describe('quiet-lead rule', () => {
  it('uses stable, activity-anchored automation keys for each deterministic quiet window', () => {
    const activity = '2026-07-20T10:00:00.000Z';
    const firstWindow = new Date('2026-07-28T10:00:00.000Z');
    const nextWindow = new Date('2026-08-04T10:00:00.000Z');

    const first = buildQuietLeadAutomationKey('opportunity-1', activity, firstWindow);
    expect(first).toBe(buildQuietLeadAutomationKey('opportunity-1', activity, firstWindow));
    expect(first).toContain('quiet-lead-v1:opportunity-1:2026-07-20:window-0');
    expect(buildQuietLeadAutomationKey('opportunity-1', activity, nextWindow)).not.toBe(first);
    expect(buildQuietLeadAutomationKey('opportunity-2', activity, firstWindow)).not.toBe(first);
  });

  it('does not qualify the exact quiet-days boundary, then qualifies the next completed day', () => {
    const input = { opportunity: baseOpportunity(), company, primaryContact: contact, touchpoints: [] };
    const exactBoundary = assessQuietLead(input, new Date('2026-07-27T10:00:00.000Z'), highScore);
    const nextDay = assessQuietLead(input, new Date('2026-07-28T10:00:00.000Z'), highScore);

    expect(exactBoundary.daysQuiet).toBe(QUIET_LEAD_DAYS);
    expect(exactBoundary.eligible).toBe(false);
    expect(nextDay.daysQuiet).toBe(QUIET_LEAD_DAYS + 1);
    expect(nextDay.eligible).toBe(true);
  });
});

describe('POST /api/crm/automation', () => {
  const databaseOpportunity = {
    ...baseOpportunity(),
    createdAt: new Date('2020-01-01T10:00:00.000Z'),
    updatedAt: new Date('2020-01-01T10:00:00.000Z'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    state.auth.requireAuth.mockResolvedValue({ userId: 'manager-1', email: 'manager@example.com', role: 'Manager' });
    state.prisma.cRMOpportunity.findUnique.mockResolvedValue(databaseOpportunity);
    state.prisma.cRMCompany.findUnique.mockResolvedValue({ ...company, createdAt: new Date(company.createdAt), updatedAt: new Date(company.updatedAt) });
    state.prisma.cRMContact.findUnique.mockResolvedValue({ ...contact, createdAt: new Date(contact.createdAt) });
    state.prisma.cRMTouchpoint.findMany.mockResolvedValue([]);
    state.prisma.cRMTask.create.mockResolvedValue({ id: 'created-task', automationKey: 'server-key' });
  });

  it('recomputes server eligibility and atomically creates a keyed task without trusting a client score', async () => {
    const res = response();
    await automationHandler(request({
      action: QUIET_LEAD_AUTOMATION_ACTION,
      opportunityId: 'opportunity-1',
      score: 0,
    }), res);

    expect(state.auth.requireAuth).toHaveBeenCalledOnce();
    expect(state.prisma.cRMOpportunity.findUnique).toHaveBeenCalledWith({ where: { id: 'opportunity-1' } });
    expect(state.prisma.cRMCompany.findUnique).toHaveBeenCalledOnce();
    expect(state.prisma.cRMContact.findUnique).toHaveBeenCalledOnce();
    expect(state.prisma.cRMTouchpoint.findMany).toHaveBeenCalledOnce();
    expect(state.prisma.cRMTask.create).toHaveBeenCalledOnce();
    const taskData = state.prisma.cRMTask.create.mock.calls[0][0].data;
    expect(taskData).toMatchObject({
      opportunityId: 'opportunity-1',
      type: 'follow_up',
      status: 'pending',
      createdBy: 'manager-1',
    });
    expect(taskData).toHaveProperty('automationKey');
    expect(taskData).not.toHaveProperty('score');
    expect(res.statusCode).toBe(201);
    expect(res.payload).toMatchObject({ status: 'created', created: true });
  });

  it('returns the existing task after a unique-key collision instead of creating a duplicate', async () => {
    state.prisma.cRMTask.create.mockRejectedValue({ code: 'P2002' });
    state.prisma.cRMTask.findUnique.mockResolvedValue({ id: 'existing-task', automationKey: 'quiet-lead-v1:opportunity-1:window-0' });
    const res = response();

    await automationHandler(request({ action: QUIET_LEAD_AUTOMATION_ACTION, opportunityId: 'opportunity-1' }), res);

    expect(state.prisma.cRMTask.create).toHaveBeenCalledOnce();
    expect(state.prisma.cRMTask.findUnique).toHaveBeenCalledWith({
      where: { automationKey: expect.any(String) },
    });
    expect(res.statusCode).toBe(200);
    expect(res.payload).toMatchObject({ status: 'existing', created: false, task: { id: 'existing-task' } });
  });

  it('rejects a closed opportunity even when a client sends a high score', async () => {
    state.prisma.cRMOpportunity.findUnique.mockResolvedValue({ ...databaseOpportunity, status: 'closed_lost' });
    const res = response();

    await automationHandler(request({ action: QUIET_LEAD_AUTOMATION_ACTION, opportunityId: 'opportunity-1', score: 100 }), res);

    expect(res.statusCode).toBe(409);
    expect(res.payload.reason).toMatch(/Closed opportunities are excluded/i);
    expect(state.prisma.cRMTask.create).not.toHaveBeenCalled();
  });
});
