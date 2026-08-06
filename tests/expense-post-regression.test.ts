import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpRequest, HttpResponse } from '../lib/http';

// Regression test for the expense create path that 500s on production when the
// DB is missing the newer columns. It exercises the full POST flow with mocked
// prisma: linkage resolution (contract -> client), the accounting-period guard,
// and the audit write, all inside the same $transaction.
const state = vi.hoisted(() => {
  const expense = { findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), delete: vi.fn(), findMany: vi.fn() };
  const contract = { findUnique: vi.fn() };
  const auditLog = { create: vi.fn() };
  const prisma: any = {
    expense,
    contract,
    auditLog,
    accountingPeriod: { findFirst: vi.fn() },
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
vi.mock('../lib/serverLogger.js', () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

// The real assertPeriodOpen runs against the mocked prisma.accountingPeriod, so
// the closed-period 409 behaviour is tested against the real guard logic.
import handler from '../api/expenses';

const manager = { userId: 'manager-1', email: 'manager@example.com', role: 'Manager' };

function request(overrides: Partial<HttpRequest> = {}) {
  return {
    method: 'POST',
    headers: {
      'x-request-id': 'request-7',
      'x-forwarded-for': '1.2.3.4, 10.0.0.1',
      'user-agent': 'vitest/regression',
    },
    query: {},
    body: {},
    ...overrides,
  } as unknown as HttpRequest;
}

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

const expenseBody = (overrides: Record<string, unknown> = {}) => ({
  category: 'Printing',
  description: 'Vinyl for campaign',
  amount: 120,
  date: '2026-08-02',
  ...overrides,
});

describe('expense create (POST) — end-to-end regression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.auth.requireFeatureWrite.mockResolvedValue(manager);
    state.auth.requireFeatureRead.mockResolvedValue(manager);
    state.auth.requireDeletePermission.mockResolvedValue(manager);
    // Open accounting period by default — the real assertPeriodOpen sees this.
    state.prisma.accountingPeriod.findFirst.mockResolvedValue(null);
    state.expense.create.mockImplementation(async ({ data }: any) => ({ id: 'expense-new', ...data }));
    state.contract.findUnique.mockResolvedValue(null);
  });

  it('runs the whole save inside one transaction: linkage -> period guard -> create + audit write', async () => {
    state.contract.findUnique.mockResolvedValue({ id: 'contract-1', clientId: 'client-9' });
    const res = response();

    await handler(
      request({ body: expenseBody({ contractId: 'contract-1' }) }),
      res,
    );

    expect(res.statusCode).toBe(201);

    // Linkage: client resolved from the contract before the write.
    expect(state.contract.findUnique).toHaveBeenCalledWith({
      where: { id: 'contract-1' },
      select: { id: true, clientId: true },
    });

    // Period guard: the real assertPeriodOpen queried for a closed period.
    expect(state.prisma.accountingPeriod.findFirst).toHaveBeenCalledWith({
      where: { startDate: { lte: '2026-08-02' }, endDate: { gte: '2026-08-02' }, status: 'Closed' },
      select: { id: true, startDate: true, endDate: true },
    });

    // Everything happened inside the transaction.
    expect(state.prisma.$transaction).toHaveBeenCalledTimes(1);

    // Expense row carries the resolved linkage.
    expect(state.expense.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ clientId: 'client-9', contractId: 'contract-1' }),
    });

    // Audit evidence written in the same transaction, with request context.
    expect(state.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'Finance: Expense Created',
        details: 'Printing: Vinyl for campaign ($120)',
        userId: 'manager-1',
        userEmail: 'manager@example.com',
        tableName: 'expenses',
        recordId: 'expense-new',
        beforeData: undefined,
        afterData: expect.objectContaining({ id: 'expense-new', clientId: 'client-9' }),
        requestId: 'request-7',
        ipAddress: '1.2.3.4', // first entry of x-forwarded-for wins
        userAgent: 'vitest/regression',
      }),
    });
  });

  it('rejects a write into a closed accounting period with 409 and writes nothing', async () => {
    state.prisma.accountingPeriod.findFirst.mockResolvedValue({
      id: 'period-2026-07',
      startDate: '2026-07-01',
      endDate: '2026-07-31',
    });
    const res = response();

    await handler(request({ body: expenseBody({ date: '2026-07-15' }) }), res);

    expect(res.statusCode).toBe(409);
    expect(res.payload.error).toContain('Accounting period');
    expect(state.expense.create).not.toHaveBeenCalled();
    expect(state.auditLog.create).not.toHaveBeenCalled();
  });

  it('keeps a client link and clears the contract when only a client is given', async () => {
    const res = response();

    await handler(request({ body: expenseBody({ clientId: 'client-1' }) }), res);

    expect(res.statusCode).toBe(201);
    expect(state.contract.findUnique).not.toHaveBeenCalled();
    expect(state.expense.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ clientId: 'client-1', contractId: null }),
    });
  });

  it('rejects a contract that belongs to a different client', async () => {
    state.contract.findUnique.mockResolvedValue({ id: 'contract-1', clientId: 'client-9' });
    const res = response();

    await handler(
      request({ body: expenseBody({ clientId: 'client-1', contractId: 'contract-1' }) }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(res.payload.error).toBe('Linked contract belongs to a different client.');
    expect(state.expense.create).not.toHaveBeenCalled();
  });

  it('rejects a nonexistent linked contract before touching the ledger', async () => {
    state.contract.findUnique.mockResolvedValue(null);
    const res = response();

    await handler(
      request({ body: expenseBody({ contractId: 'contract-ghost' }) }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(res.payload.error).toBe('Linked contract not found.');
    expect(state.expense.create).not.toHaveBeenCalled();
    expect(state.auditLog.create).not.toHaveBeenCalled();
  });

  it('does not write anything when the user lacks expense write permission', async () => {
    const res = response();
    // The real requireFeatureWrite writes the 401 itself before returning null.
    state.auth.requireFeatureWrite.mockImplementation(async () => {
      res.status(401).json({ error: 'Unauthorized' });
      return null;
    });

    await handler(request({ body: expenseBody() }), res);

    expect(res.statusCode).toBe(401);
    expect(state.contract.findUnique).not.toHaveBeenCalled();
    expect(state.prisma.accountingPeriod.findFirst).not.toHaveBeenCalled();
    expect(state.expense.create).not.toHaveBeenCalled();
    expect(state.auditLog.create).not.toHaveBeenCalled();
    expect(state.prisma.$transaction).not.toHaveBeenCalled();
  });
});
