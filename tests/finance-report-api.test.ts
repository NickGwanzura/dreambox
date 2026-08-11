import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpRequest, HttpResponse } from '../lib/http';

const state = vi.hoisted(() => {
  const prisma: any = {
    invoice: { findMany: vi.fn() },
    client: { findMany: vi.fn() },
    expense: { findMany: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return {
    prisma,
    auth: { requireManagerOrAdmin: vi.fn(), cors: vi.fn() },
  };
});

vi.mock('../lib/prisma', () => ({ prisma: state.prisma }));
vi.mock('../lib/auth', () => state.auth);

import handler from '../api/finance-report';

const manager = { userId: 'manager-1', email: 'manager@example.com', role: 'Manager' };
const invoice = (id: string, date: string, subtotal: number, vatAmount: number) => ({
  id,
  clientId: 'client-1',
  date,
  dueDate: date,
  items: [{ description: 'Campaign', amount: subtotal + vatAmount }],
  subtotal,
  vatAmount,
  total: subtotal + vatAmount,
  status: 'Pending',
  type: 'Invoice',
  isVoided: false,
});

function request() {
  return { method: 'GET', headers: {}, query: { startDate: '2026-07-01', endDate: '2026-07-31' } } as unknown as HttpRequest;
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

describe('finance-report period controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.auth.requireManagerOrAdmin.mockResolvedValue(manager);
    state.prisma.client.findMany.mockResolvedValue([{ id: 'client-1', companyName: 'Acme' }]);
    state.prisma.invoice.findMany.mockResolvedValue([
      invoice('prior', '2026-06-15', 100, 15.5),
      invoice('period', '2026-07-15', 200, 31),
    ]);
    state.prisma.expense.findMany.mockResolvedValue([
      { id: 'prior-expense', category: 'Other', description: 'Prior', amount: 25, date: '2026-06-20' },
      { id: 'period-expense', category: 'Other', description: 'Period', amount: 40, date: '2026-07-20' },
    ]);
    state.prisma.auditLog.create.mockResolvedValue({});
  });

  it('keeps as-of ledger history while returning a period-consistent P&L', async () => {
    const res = response();

    await handler(request(), res);

    expect(res.statusCode).toBe(200);
    expect(state.prisma.invoice.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { date: { lte: '2026-07-31' } } }));
    expect(state.prisma.expense.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { date: { lte: '2026-07-31' } }, take: expect.any(Number) }));
    expect(res.payload.period).toMatchObject({
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      invoiceGross: 231,
      invoiceNet: 200,
      vat: 31,
      expenses: 40,
      operatingResult: 160,
    });
    expect(res.payload.totals).toMatchObject({ netRevenue: 300, expenses: 65 });
    expect(state.prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ afterData: expect.objectContaining({ period: expect.objectContaining({ operatingResult: 160 }) }) }),
    });
  });
});
