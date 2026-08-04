import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpRequest, HttpResponse } from '../lib/http';

const state = vi.hoisted(() => {
  const expense = { findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), delete: vi.fn(), findMany: vi.fn() };
  const auditLog = { create: vi.fn() };
  const prisma: any = {
    expense,
    auditLog,
    accountingPeriod: { findFirst: vi.fn().mockResolvedValue(null) },
    $transaction: vi.fn(async (callback: (tx: any) => unknown) => callback(prisma)),
  };
  return {
    prisma,
    expense,
    auditLog,
    auth: {
      requireFeatureRead: vi.fn(),
      requireFeatureWrite: vi.fn(),
      requireDeletePermission: vi.fn(),
      cors: vi.fn(),
    },
  };
});

vi.mock('../lib/prisma', () => ({ prisma: state.prisma }));
vi.mock('../lib/auth', () => state.auth);
vi.mock('../lib/serverLogger.js', () => ({ log: { error: vi.fn() } }));

import handler from '../api/expenses';

const manager = { userId: 'manager-1', email: 'manager@example.com', role: 'Manager' };
const prior = { id: 'expense-1', category: 'Other', description: 'Old cost', amount: 75, date: '2026-07-01', reference: null };

function request(overrides: Partial<HttpRequest> = {}) {
  return {
    method: 'PUT',
    headers: { 'x-request-id': 'request-1' },
    query: { id: 'expense-1' },
    body: { category: 'Other', description: 'Corrected cost', amount: 100, date: '2026-07-01' },
    ...overrides,
  } as unknown as HttpRequest;
}

function response() {
  let statusCode = 0;
  const res: any = {
    status: vi.fn((status: number) => { statusCode = status; return res; }),
    json: vi.fn(() => res),
    end: vi.fn(),
    setHeader: vi.fn(),
  };
  Object.defineProperty(res, 'statusCode', { get: () => statusCode });
  return res as HttpResponse & { statusCode: number };
}

describe('expense audit evidence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.auth.requireFeatureWrite.mockResolvedValue(manager);
    state.auth.requireFeatureRead.mockResolvedValue(manager);
    state.auth.requireDeletePermission.mockResolvedValue(manager);
    state.prisma.accountingPeriod.findFirst.mockResolvedValue(null);
    state.expense.findUnique.mockResolvedValue(prior);
    state.expense.update.mockImplementation(async ({ where, data }: any) => ({ ...prior, id: where.id, ...data }));
  });

  it('writes immutable before/after audit snapshots for an expense edit', async () => {
    const res = response();

    await handler(request(), res);

    expect(res.statusCode).toBe(200);
    expect(state.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'Finance: Expense Updated',
        recordId: 'expense-1',
        beforeData: prior,
        afterData: expect.objectContaining({ description: 'Corrected cost', amount: 100 }),
        requestId: 'request-1',
      }),
    });
  });
});

describe('expense submission (POST)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.auth.requireFeatureWrite.mockResolvedValue(manager);
    state.auth.requireFeatureRead.mockResolvedValue(manager);
    state.prisma.accountingPeriod.findFirst.mockResolvedValue(null);
    state.expense.create.mockImplementation(async ({ data }: any) => ({ id: 'expense-new', ...data }));
  });

  it('creates an expense and writes a Finance: Expense Created audit log', async () => {
    const res = response();
    await handler(
      request({
        method: 'POST',
        query: {},
        body: { category: 'Electricity', description: 'Power bill', amount: 250, date: '2026-08-01', reference: 'ZESA-1' },
      }),
      res,
    );

    expect(res.statusCode).toBe(201);
    expect(state.expense.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        category: 'Electricity',
        description: 'Power bill',
        amount: 250,
        date: '2026-08-01',
        reference: 'ZESA-1',
      }),
    });
    expect(state.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'Finance: Expense Created',
        tableName: 'expenses',
        recordId: 'expense-new',
        requestId: 'request-1',
      }),
    });
  });

  it('rejects an expense with an empty description', async () => {
    const res = response();
    await handler(
      request({ method: 'POST', query: {}, body: { category: 'Other', description: '', amount: 10, date: '2026-08-01' } }),
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(state.expense.create).not.toHaveBeenCalled();
  });

  it('rejects an expense with a zero amount', async () => {
    const res = response();
    await handler(
      request({ method: 'POST', query: {}, body: { category: 'Other', description: 'Test', amount: 0, date: '2026-08-01' } }),
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(state.expense.create).not.toHaveBeenCalled();
  });

  it('does not forward client-generated ids or unknown fields to Prisma', async () => {
    const res = response();
    await handler(
      request({
        method: 'POST',
        query: {},
        body: { id: 'EXP-999', category: 'Labor', description: 'Install crew', amount: 75, date: '2026-08-02', injected: 'x' },
      }),
      res,
    );
    expect(res.statusCode).toBe(201);
    expect(state.expense.create).toHaveBeenCalledWith({
      data: expect.not.objectContaining({ id: 'EXP-999', injected: 'x' }),
    });
  });

  it('lists expenses for a read request', async () => {
    state.expense.findMany.mockResolvedValue([{ id: 'expense-1', category: 'Other', description: 'Old cost', amount: 75, date: '2026-07-01' }]);
    const res = response();
    await handler(request({ method: 'GET', query: {} }), res);
    expect(res.statusCode).toBe(200);
    expect(state.expense.findMany).toHaveBeenCalled();
  });
});
