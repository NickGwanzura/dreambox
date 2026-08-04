import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpRequest, HttpResponse } from '../lib/http';
import type {
  CRMCompany,
  CRMContact,
  CRMOpportunity,
  CRMTask,
  CRMTouchpoint,
  Task,
} from '../types';
import {
  CONTRACT_ATTENTION_DAYS,
  buildTodayOperations,
  type TodayOperationsRecords,
} from '../services/todayOperations';
import type { QuietLeadScorer } from '../services/crmAutomation';

const apiState = vi.hoisted(() => ({
  prisma: {
    paymentReview: { findMany: vi.fn() },
    invoice: { findMany: vi.fn() },
  },
  auth: { cors: vi.fn(), requireManagerOrAdmin: vi.fn() },
}));

vi.mock('../lib/prisma', () => ({ prisma: apiState.prisma }));
vi.mock('../lib/auth', () => apiState.auth);

import todayHandler from '../api/today';

const NOW = new Date('2026-08-03T12:00:00.000Z');

const generalTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'general-task',
  title: 'General task',
  description: 'Complete the work',
  assignedTo: 'user-1',
  priority: 'High',
  status: 'Todo',
  dueDate: '2026-08-03',
  createdAt: '2026-07-01T12:00:00.000Z',
  ...overrides,
});

const crmTask = (overrides: Partial<CRMTask> = {}): CRMTask => ({
  id: 'crm-task',
  opportunityId: 'opportunity-1',
  type: 'follow_up',
  title: 'CRM follow-up',
  dueDate: '2026-08-03T09:00:00.000Z',
  status: 'pending',
  priority: 'high',
  assignedTo: 'user-1',
  createdAt: '2026-07-01T12:00:00.000Z',
  createdBy: 'user-1',
  ...overrides,
});

const opportunity = (overrides: Partial<CRMOpportunity> = {}): CRMOpportunity => ({
  id: 'opportunity-1',
  companyId: 'company-1',
  primaryContactId: 'contact-1',
  status: 'qualified',
  stage: 'discovery_call',
  estimatedValue: 20_000,
  numberOfAttempts: 0,
  createdBy: 'user-1',
  createdAt: '2026-07-20T12:00:00.000Z',
  updatedAt: '2026-07-20T12:00:00.000Z',
  daysInCurrentStage: 0,
  stageHistory: [],
  ...overrides,
});

const records = (overrides: Partial<TodayOperationsRecords> = {}): TodayOperationsRecords => ({
  contracts: [],
  invoices: [],
  tasks: [],
  crmCompanies: [{ id: 'company-1', name: 'Acme', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' } satisfies CRMCompany],
  crmContacts: [{ id: 'contact-1', companyId: 'company-1', fullName: 'Ada Lovelace', isPrimary: true, createdAt: '2026-01-01T00:00:00.000Z' } satisfies CRMContact],
  crmOpportunities: [],
  crmTasks: [],
  crmTouchpoints: [],
  paymentReviews: [],
  ...overrides,
});

const highScoreNoRecommendations: QuietLeadScorer = () => ({ score: 78, recommendations: [] });

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

describe('Today operations aggregation', () => {
  it('uses UTC calendar boundaries for overdue/due tasks and expiring contracts', () => {
    const snapshot = buildTodayOperations(records({
      invoices: [
        { id: 'invoice-due-today', clientId: 'client-1', date: '2026-07-20', dueDate: '2026-08-03', items: [], subtotal: 100, vatAmount: 0, total: 100, status: 'Pending', type: 'Invoice' },
        { id: 'invoice-overdue', clientId: 'client-1', date: '2026-07-20', dueDate: '2026-08-02', items: [], subtotal: 200, vatAmount: 0, total: 200, status: 'Pending', type: 'Invoice' },
      ],
      contracts: [
        { id: 'active-ending-boundary', clientId: 'client-1', billboardId: 'b-1', startDate: '2026-07-01', endDate: '2026-09-02', monthlyRate: 100, installationCost: 0, printingCost: 0, hasVat: false, totalContractValue: 300, status: 'Active', details: 'Boundary campaign' },
        { id: 'outside-attention', clientId: 'client-1', billboardId: 'b-2', startDate: '2026-07-01', endDate: '2026-09-03', monthlyRate: 100, installationCost: 0, printingCost: 0, hasVat: false, totalContractValue: 300, status: 'Active', details: 'Later campaign' },
      ],
      tasks: [
        generalTask({ id: 'today-task', dueDate: '2026-08-03' }),
        generalTask({ id: 'overdue-task', dueDate: '2026-08-02' }),
        generalTask({ id: 'done-task', dueDate: '2026-08-02', status: 'Done' }),
      ],
      crmTasks: [
        crmTask({ id: 'crm-today', dueDate: '2026-08-03T23:59:59.000Z' }),
        crmTask({ id: 'crm-overdue', dueDate: '2026-08-02T23:59:59.000Z' }),
        crmTask({ id: 'crm-completed', dueDate: '2026-08-02T23:59:59.000Z', status: 'completed' }),
      ],
    }), NOW, highScoreNoRecommendations);

    expect(snapshot.overdueInvoices.map(invoice => invoice.id)).toEqual(['invoice-overdue']);
    expect(snapshot.overdueGeneralTasks.map(item => item.task.id)).toEqual(['overdue-task']);
    expect(snapshot.dueGeneralTasks.map(item => item.task.id)).toEqual(['today-task']);
    expect(snapshot.overdueCRMTasks.map(item => item.task.id)).toEqual(['crm-overdue']);
    expect(snapshot.dueCRMTasks.map(item => item.task.id)).toEqual(['crm-today']);
    expect(snapshot.activeContracts.map(contract => contract.id)).toContain('active-ending-boundary');
    expect(snapshot.contractsNeedingAttention.map(item => item.contract.id)).toContain('active-ending-boundary');
    expect(snapshot.contractsNeedingAttention.map(item => item.contract.id)).not.toContain('outside-attention');
    expect(CONTRACT_ATTENTION_DAYS).toBe(30);
  });

  it('excludes closed leads and includes the concrete follow-up fallback among next-best actions', () => {
    const quietOpen = opportunity({ id: 'open-quiet', createdAt: '2026-07-20T12:00:00.000Z', estimatedValue: 5_000 });
    const closedQuiet = opportunity({ id: 'closed-quiet', status: 'closed_won', createdAt: '2026-07-20T12:00:00.000Z', estimatedValue: 100_000 });
    const snapshot = buildTodayOperations(records({ crmOpportunities: [quietOpen, closedQuiet] }), NOW, highScoreNoRecommendations);

    expect(snapshot.quietLeads).toHaveLength(1);
    expect(snapshot.quietLeads[0]).toMatchObject({
      opportunity: expect.objectContaining({ id: 'open-quiet' }),
      score: 78,
      daysQuiet: 14,
      eligible: true,
    });
    expect(snapshot.quietLeads[0].nextBestActions).toHaveLength(1);
    expect(snapshot.quietLeads[0].nextBestActions[0]).toMatch(/Follow up with Ada Lovelace by phone or email/i);
  });
});

describe('GET /api/today payment review summaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiState.auth.requireManagerOrAdmin.mockResolvedValue({ userId: 'manager-1', email: 'manager@example.com', role: 'Manager' });
    apiState.prisma.paymentReview.findMany.mockResolvedValue([
      { id: 'review-1', receiptId: 'receipt-1', status: 'Open', assignedTo: 'manager-1', createdAt: new Date('2026-08-03T08:00:00.000Z') },
    ]);
    apiState.prisma.invoice.findMany.mockResolvedValue([
      {
        id: 'receipt-1', clientId: 'client-1', date: '2026-08-02', total: 1234.5,
        paymentMethod: 'Bank Transfer', paymentReference: 'REF-1', approvalStatus: 'Pending',
        proofPaymentUrl: 's3://must-not-leak/proof.pdf', proofOriginalName: 'proof.pdf',
      },
    ]);
  });

  it('uses manager/admin auth and returns only open, proof-free review summaries', async () => {
    const res = response();
    await todayHandler({ method: 'GET', headers: {}, query: {} } as unknown as HttpRequest, res);

    expect(apiState.auth.requireManagerOrAdmin).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200);
    expect(apiState.prisma.paymentReview.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'Open' } }));
    expect(apiState.prisma.invoice.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.not.objectContaining({ proofPaymentUrl: expect.anything() }),
    }));
    expect(res.payload[0]).toMatchObject({ id: 'review-1', receiptId: 'receipt-1', receipt: { total: 1234.5 } });
    expect(JSON.stringify(res.payload)).not.toContain('must-not-leak');
    expect(JSON.stringify(res.payload)).not.toContain('proof.pdf');
  });
});
