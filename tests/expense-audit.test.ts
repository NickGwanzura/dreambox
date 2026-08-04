import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpRequest, HttpResponse } from '../lib/http';

const state = vi.hoisted(() => {
  const expense = { findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), delete: vi.fn(), findMany: vi.fn() };
  const contract = { findUnique: vi.fn() };
  const auditLog = { create: vi.fn() };
  const prisma: any = {
    expense,
    contract,
    auditLog,
    accountingPeriod: { findFirst: vi.fn().mockResolvedValue(null) },
    $transaction: vi.fn(async (callback: (tx: any) => unknown) => callback(prisma)),
  };
  return {
    prisma,
    expense,
    contract,
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
const linkedPrior = { ...prior, clientId: 'client-9', contractId: 'contract-1' };

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
    state.contract.findUnique.mockResolvedValue(null);
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

  it('stores a client link and clears a stale contract link when only a client is given', async () => {
    const res = response();
    await handler(
      request({
        method: 'POST',
        query: {},
        body: { category: 'Other', description: 'Fuel', amount: 40, date: '2026-08-01', clientId: 'client-1' },
      }),
      res,
    );
    expect(res.statusCode).toBe(201);
    expect(state.expense.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ clientId: 'client-1', contractId: null }),
    });
    expect(state.contract.findUnique).not.toHaveBeenCalled();
  });

  it('auto-sets the client from a linked contract', async () => {
    state.contract.findUnique.mockResolvedValue({ id: 'contract-1', clientId: 'client-9' });
    const res = response();
    await handler(
      request({
        method: 'POST',
        query: {},
        body: { category: 'Printing', description: 'Vinyl for campaign', amount: 120, date: '2026-08-02', contractId: 'contract-1' },
      }),
      res,
    );
    expect(res.statusCode).toBe(201);
    expect(state.contract.findUnique).toHaveBeenCalledWith({ where: { id: 'contract-1' }, select: { id: true, clientId: true } });
    expect(state.expense.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ clientId: 'client-9', contractId: 'contract-1' }),
    });
  });

  it('rejects a contract that belongs to a different client', async () => {
    state.contract.findUnique.mockResolvedValue({ id: 'contract-1', clientId: 'client-9' });
    const res = response();
    await handler(
      request({
        method: 'POST',
        query: {},
        body: { category: 'Other', description: 'Mixed up', amount: 10, date: '2026-08-01', clientId: 'client-1', contractId: 'contract-1' },
      }),
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(state.expense.create).not.toHaveBeenCalled();
  });

  it('rejects a nonexistent linked contract', async () => {
    const res = response();
    await handler(
      request({
        method: 'POST',
        query: {},
        body: { category: 'Other', description: 'Ghost', amount: 10, date: '2026-08-01', contractId: 'contract-ghost' },
      }),
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(state.expense.create).not.toHaveBeenCalled();
  });

  it('lists expenses for a read request', async () => {
    state.expense.findMany.mockResolvedValue([{ id: 'expense-1', category: 'Other', description: 'Old cost', amount: 75, date: '2026-07-01' }]);
    const res = response();
    await handler(request({ method: 'GET', query: {} }), res);
    expect(res.statusCode).toBe(200);
    expect(state.expense.findMany).toHaveBeenCalled();
  });
});

describe('expense linkage updates (PUT)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.auth.requireFeatureWrite.mockResolvedValue(manager);
    state.prisma.accountingPeriod.findFirst.mockResolvedValue(null);
    state.expense.findUnique.mockResolvedValue(linkedPrior);
    state.expense.update.mockImplementation(async ({ where, data }: any) => ({ ...linkedPrior, id: where.id, ...data }));
  });

  it('preserves an existing contract link on an unrelated edit', async () => {
    state.contract.findUnique.mockResolvedValue({ id: 'contract-1', clientId: 'client-9' });
    const res = response();
    await handler(
      request({ method: 'PUT', query: { id: 'expense-1' }, body: { category: 'Other', description: 'Rework', amount: 120, date: '2026-08-01' } }),
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(state.contract.findUnique).toHaveBeenCalled();
    expect(state.expense.update).toHaveBeenCalledWith({
      where: { id: 'expense-1' },
      data: expect.objectContaining({ clientId: 'client-9', contractId: 'contract-1' }),
    });
  });

  it('rejects a client change that contradicts the linked contract', async () => {
    state.contract.findUnique.mockResolvedValue({ id: 'contract-1', clientId: 'client-9' });
    const res = response();
    await handler(
      request({ method: 'PUT', query: { id: 'expense-1' }, body: { category: 'Other', description: 'Rework', amount: 120, date: '2026-08-01', clientId: 'client-1' } }),
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(state.expense.update).not.toHaveBeenCalled();
  });

  it('clears the contract link when the caller sends contractId: null', async () => {
    const res = response();
    await handler(
      request({ method: 'PUT', query: { id: 'expense-1' }, body: { category: 'Other', description: 'Rework', amount: 120, date: '2026-08-01', contractId: null } }),
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(state.expense.update).toHaveBeenCalledWith({
      where: { id: 'expense-1' },
      data: expect.objectContaining({ contractId: null, clientId: 'client-9' }),
    });
  });
});
