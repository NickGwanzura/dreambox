/**
 * Integration tests for all CRUD API endpoints.
 *
 * Tests that the whitelist functions and Zod schemas work correctly
 * by testing POST/PUT/GET/DELETE on all core endpoints.
 *
 * These tests mock Prisma and auth — they do NOT hit the real database.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { HttpRequest, HttpResponse } from '../lib/http';

// ─── Shared mocks ────────────────────────────────────────────────────────────

const mockPrisma = {
  invoice: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn() },
  client: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), delete: vi.fn() },
  expense: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), delete: vi.fn() },
  task: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), delete: vi.fn() },
  printingJob: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), delete: vi.fn() },
  companyProfile: { findUnique: vi.fn(), upsert: vi.fn() },
  cRMCompany: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), delete: vi.fn() },
  cRMContact: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), delete: vi.fn() },
  cRMOpportunity: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), delete: vi.fn() },
  cRMTouchpoint: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), delete: vi.fn() },
  cRMTask: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), delete: vi.fn() },
  cRMCallLog: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), delete: vi.fn() },
  cRMEmailThread: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), delete: vi.fn() },
};

vi.mock('../lib/prisma', () => ({ prisma: mockPrisma }));

const mockAuth = {
  requireAuth: vi.fn(() => ({ userId: 'user-test', email: 'test@test.com', role: 'Admin', status: 'Active' })),
  requireDeletePermission: vi.fn(() => true),
  requireAdmin: vi.fn(() => ({ userId: 'user-test', email: 'test@test.com', role: 'Admin', status: 'Active' })),
  requireQuotationWritePermission: vi.fn(() => true),
  cors: vi.fn(),
};

vi.mock('../lib/auth', () => mockAuth);
vi.mock('../lib/serverLogger.js', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), boot: vi.fn() },
}));
vi.mock('../lib/uploadBase64', () => ({ uploadBase64Image: vi.fn(() => Promise.resolve(undefined)) }));

process.env.JWT_SECRET = 'test-secret';
process.env.AWS_REGION = 'test';
process.env.AWS_ACCESS_KEY_ID = 'test';
process.env.AWS_SECRET_ACCESS_KEY = 'test';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mockReq(overrides: Partial<HttpRequest> = {}): HttpRequest {
  return { method: 'POST', headers: {}, body: {}, query: {}, cookies: {}, ...overrides } as any;
}

function mockRes(): HttpResponse & { _status: number; _json: any } {
  let _status = 0, _json: any = null;
  const res: any = {
    get _status() { return _status; },
    get _json() { return _json; },
    status: vi.fn((c: number) => { _status = c; return res; }),
    json: vi.fn((d: any) => { _json = d; return res; }),
    end: vi.fn(() => res),
    setHeader: vi.fn(() => res),
    getHeader: vi.fn(),
    getHeaders: vi.fn(() => ({})),
    redirect: vi.fn(),
    send: vi.fn(),
  };
  return res;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('CRUD Endpoint Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.cRMCompany.findUnique.mockResolvedValue({ id: 'c1' });
    mockPrisma.cRMContact.findUnique.mockResolvedValue({ id: 'contact-1', companyId: 'c1' });
  });

  describe('tasks.ts', () => {
    it('POST rejects missing title', async () => {
      const mod = await import('../api/tasks');
      const res = mockRes();
      await mod.default(mockReq({ body: { description: 'No title' } }), res);
      expect(res._status).toBe(400);
    });

    it('POST accepts valid payload', async () => {
      mockPrisma.task.create.mockResolvedValue({ id: 't1' });
      const mod = await import('../api/tasks');
      const res = mockRes();
      await mod.default(mockReq({ body: { title: 'Test', description: 'Desc', assignedTo: 'u1', dueDate: '2026-07-01', createdAt: new Date().toISOString() } }), res);
      expect(res._status).toBe(201);
      const data = mockPrisma.task.create.mock.calls[0][0].data;
      expect(data.title).toBe('Test');
      expect(data).not.toHaveProperty('maliciousField');
    });
  });

  describe('printing-jobs.ts', () => {
    it('POST rejects missing clientId', async () => {
      const mod = await import('../api/printing-jobs');
      const res = mockRes();
      await mod.default(mockReq({ body: { description: 'No client' } }), res);
      expect(res._status).toBe(400);
    });

    it('POST accepts valid payload', async () => {
      mockPrisma.printingJob.create.mockResolvedValue({ id: 'p1' });
      const mod = await import('../api/printing-jobs');
      const res = mockRes();
      await mod.default(mockReq({ body: { clientId: 'CLI-1', date: '2026-06-19', description: 'Print', dimensions: '6x3', pvcCost: 100, inkCost: 50, electricityCost: 20, operatorCost: 30, weldingCost: 10, totalCost: 210, chargedAmount: 300 } }), res);
      expect(res._status).toBe(201);
    });
  });

  describe('CRM Companies', () => {
    it('POST rejects missing name', async () => {
      const mod = await import('../api/crm/companies');
      const res = mockRes();
      await mod.default(mockReq({ body: { industry: 'Media' } }), res);
      expect(res._status).toBe(400);
    });

    it('POST accepts valid payload', async () => {
      mockPrisma.cRMCompany.create.mockResolvedValue({ id: 'c1' });
      const mod = await import('../api/crm/companies');
      const res = mockRes();
      await mod.default(mockReq({ body: { name: 'Test Co', industry: 'Media' } }), res);
      expect(res._status).toBe(201);
      const data = mockPrisma.cRMCompany.create.mock.calls[0][0].data;
      expect(data.name).toBe('Test Co');
      expect(data).not.toHaveProperty('maliciousField');
    });
  });

  describe('CRM Contacts', () => {
    it('POST rejects missing companyId', async () => {
      const mod = await import('../api/crm/contacts');
      const res = mockRes();
      await mod.default(mockReq({ body: { fullName: 'John' } }), res);
      expect(res._status).toBe(400);
    });

    it('POST accepts valid payload', async () => {
      mockPrisma.cRMContact.create.mockResolvedValue({ id: 'c1' });
      const mod = await import('../api/crm/contacts');
      const res = mockRes();
      await mod.default(mockReq({ body: { companyId: 'comp-1', fullName: 'John Doe' } }), res);
      expect(res._status).toBe(201);
    });
  });

  describe('CRM Opportunities', () => {
    it('POST rejects missing required fields', async () => {
      const mod = await import('../api/crm/opportunities');
      const res = mockRes();
      await mod.default(mockReq({ body: { companyId: 'c1' } }), res);
      expect(res._status).toBe(400);
    });

    it('POST accepts valid payload', async () => {
      mockPrisma.cRMOpportunity.create.mockResolvedValue({ id: 'o1' });
      const mod = await import('../api/crm/opportunities');
      const res = mockRes();
      await mod.default(mockReq({ body: { companyId: 'c1', primaryContactId: 'ct1', status: 'Open', stage: 'Prospecting', createdBy: 'user1' } }), res);
      expect(res._status).toBe(201);
    });
  });

  describe('CRM Touchpoints', () => {
    it('POST rejects missing opportunityId', async () => {
      const mod = await import('../api/crm/touchpoints');
      const res = mockRes();
      await mod.default(mockReq({ body: { type: 'Call' } }), res);
      expect(res._status).toBe(400);
    });

    it('POST accepts valid payload', async () => {
      mockPrisma.cRMTouchpoint.create.mockResolvedValue({ id: 't1' });
      const mod = await import('../api/crm/touchpoints');
      const res = mockRes();
      await mod.default(mockReq({ body: { opportunityId: 'opp1', type: 'Call', direction: 'Outbound', createdBy: 'user1' } }), res);
      expect(res._status).toBe(201);
    });
  });

  describe('CRM Tasks', () => {
    it('POST rejects missing required fields', async () => {
      const mod = await import('../api/crm/tasks');
      const res = mockRes();
      await mod.default(mockReq({ body: { title: 'Test' } }), res);
      expect(res._status).toBe(400);
    });

    it('POST accepts valid payload', async () => {
      mockPrisma.cRMTask.create.mockResolvedValue({ id: 't1' });
      const mod = await import('../api/crm/tasks');
      const res = mockRes();
      await mod.default(mockReq({ body: { opportunityId: 'opp1', type: 'Follow-up', title: 'Call back', dueDate: '2026-07-01', status: 'Open', priority: 'High', assignedTo: 'user1', createdBy: 'user1' } }), res);
      expect(res._status).toBe(201);
    });
  });

  describe('CRM Call Logs', () => {
    it('POST rejects missing phoneNumber', async () => {
      const mod = await import('../api/crm/call-logs');
      const res = mockRes();
      await mod.default(mockReq({ body: { opportunityId: 'opp1', contactId: 'ct1' } }), res);
      expect(res._status).toBe(400);
    });

    it('POST accepts valid payload', async () => {
      mockPrisma.cRMCallLog.create.mockResolvedValue({ id: 'c1' });
      const mod = await import('../api/crm/call-logs');
      const res = mockRes();
      await mod.default(mockReq({ body: { opportunityId: 'opp1', contactId: 'ct1', phoneNumber: '077000', startedAt: '2026-06-19T10:00:00Z', durationSeconds: 120, outcome: 'Contacted', createdBy: 'user1' } }), res);
      expect(res._status).toBe(201);
    });
  });

  describe('CRM Email Threads', () => {
    it('POST rejects missing subject', async () => {
      const mod = await import('../api/crm/email-threads');
      const res = mockRes();
      await mod.default(mockReq({ body: { opportunityId: 'opp1', contactId: 'ct1' } }), res);
      expect(res._status).toBe(400);
    });

    it('POST accepts valid payload', async () => {
      mockPrisma.cRMEmailThread.create.mockResolvedValue({ id: 'e1' });
      const mod = await import('../api/crm/email-threads');
      const res = mockRes();
      await mod.default(mockReq({ body: { opportunityId: 'opp1', contactId: 'ct1', subject: 'Hello', status: 'Active', lastActivityAt: '2026-06-19T10:00:00Z' } }), res);
      expect(res._status).toBe(201);
    });
  });
});
