import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpRequest, HttpResponse } from '../lib/http';

// Regression tests for POST /api/payment-links — the retro-link path for
// legacy unlinked receipts: evidence backfill, allocation, audit, and the
// guards (bank-proof requirement, client match, over-allocation).
const state = vi.hoisted(() => {
  const invoice = { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), aggregate: vi.fn() };
  const paymentAllocation = { aggregate: vi.fn(), create: vi.fn() };
  const auditLog = { create: vi.fn() };
  const prisma: any = { invoice, paymentAllocation, auditLog, $transaction: vi.fn(async (cb: any) => cb(prisma)) };
  return {
    prisma, invoice, paymentAllocation, auditLog,
    auth: { requireFeatureWrite: vi.fn(), cors: vi.fn() },
    period: { assertPeriodOpen: vi.fn(), assertPeriodsOpen: vi.fn() },
    logger: { log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } },
  };
});

vi.mock('../lib/prisma', () => ({ prisma: state.prisma }));
vi.mock('../lib/auth', () => state.auth);
vi.mock('../lib/accountingPeriod', () => state.period);
vi.mock('../lib/serverLogger.js', () => state.logger);

import handler from '../api/payment-links';

const manager = { userId: 'manager-1', email: 'manager@example.com', role: 'Manager' };

const receipt = (overrides: Record<string, unknown> = {}) => ({
  id: 'RCT-TEST-1',
  type: 'Receipt',
  clientId: 'client-9',
  total: 575,
  date: '2026-04-19',
  paymentMethod: 'Cash',
  paymentReference: '',
  receivedBy: null,
  receivedByUserId: null,
  recordedAt: null,
  postedAt: null,
  createdAt: new Date('2026-04-21T06:03:49.392Z'),
  isVoided: false,
  linkedInvoiceId: null,
  proofPaymentUrl: null,
  ...overrides,
});

const invoice = (overrides: Record<string, unknown> = {}) => ({
  id: 'INV-TEST-1',
  type: 'Invoice',
  clientId: 'client-9',
  total: 575,
  date: '2026-04-19',
  status: 'Pending',
  isVoided: false,
  ...overrides,
});

function request(overrides: Partial<HttpRequest> = {}) {
  return {
    method: 'POST',
    headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1', 'user-agent': 'vitest' },
    query: {},
    body: { receiptId: 'RCT-TEST-1', invoiceId: 'INV-TEST-1' },
    ...overrides,
  } as unknown as HttpRequest;
}

function response() {
  let statusCode = 0;
  let payload: any;
  const res: any = {
    status: vi.fn((s: number) => { statusCode = s; return res; }),
    json: vi.fn((b: any) => { payload = b; return res; }),
    end: vi.fn(),
    setHeader: vi.fn(),
  };
  Object.defineProperties(res, {
    statusCode: { get: () => statusCode },
    payload: { get: () => payload },
  });
  return res as HttpResponse & { statusCode: number; payload: any };
}

describe('POST /api/payment-links', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.auth.requireFeatureWrite.mockResolvedValue(manager);
    state.period.assertPeriodOpen.mockResolvedValue(undefined);
    // Nothing linked/allocated by default — fully open invoice.
    state.invoice.aggregate.mockResolvedValue({ _sum: { total: null } });
    state.paymentAllocation.aggregate.mockResolvedValue({ _sum: { amount: null } });
    state.invoice.updateMany.mockResolvedValue({ count: 1 });
    state.invoice.update.mockImplementation(async ({ where, data }: any) => ({ id: where.id, ...data }));
    state.invoice.findUnique.mockImplementation(async ({ where: { id } }: any) =>
      id === 'RCT-TEST-1' ? receipt() : invoice(),
    );
    state.paymentAllocation.create.mockResolvedValue({ id: 'alloc-1' });
    state.auditLog.create.mockResolvedValue({ id: 'audit-1' });
    state.prisma.$transaction.mockImplementation(async (cb: any) => cb(state.prisma));
  });

  it('links a legacy cash receipt with evidence backfill, allocation, status and audit', async () => {
    const res = response();

    await handler(request(), res);

    expect(res.statusCode).toBe(200);
    expect(res.payload.success).toBe(true);

    // Evidence backfill via updateMany — empty paymentReference treated as missing -> receipt id.
    expect(state.invoice.updateMany).toHaveBeenCalledWith({
      where: { id: 'RCT-TEST-1', linkedInvoiceId: null },
      data: expect.objectContaining({
        linkedInvoiceId: 'INV-TEST-1',
        paymentReference: 'RCT-TEST-1',
        receivedBy: 'System cleanup (legacy RCT batch)',
        receivedByUserId: 'manager-1',
        recordedAt: expect.any(Date),
        postedAt: expect.any(Date),
      }),
    });

    expect(state.paymentAllocation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ receiptId: 'RCT-TEST-1', invoiceId: 'INV-TEST-1', amount: 575, allocatedBy: 'manager-1' }),
    });
    // Fully covered -> invoice marked Paid.
    expect(state.invoice.update).toHaveBeenCalledWith({
      where: { id: 'INV-TEST-1' },
      data: { status: 'Paid' },
    });
    expect(state.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'Finance: Payment Linked',
        tableName: 'invoices',
        recordId: 'RCT-TEST-1',
        source: 'SERVER',
        userEmail: 'manager@example.com',
      }),
    });
  });

  it('rejects a bank transfer without proof before writing anything', async () => {
    state.invoice.findUnique.mockImplementation(async ({ where: { id } }: any) =>
      id === 'RCT-TEST-1' ? receipt({ paymentMethod: 'Bank Transfer' }) : invoice(),
    );
    const res = response();

    await handler(request(), res);

    expect(res.statusCode).toBe(409);
    expect(res.payload.error).toContain('proof');
    expect(state.invoice.updateMany).not.toHaveBeenCalled();
    expect(state.paymentAllocation.create).not.toHaveBeenCalled();
  });

  it('rejects a bank transfer with proof but no receiving account', async () => {
    state.invoice.findUnique.mockImplementation(async ({ where: { id } }: any) =>
      id === 'RCT-TEST-1'
        ? receipt({ paymentMethod: 'Bank Transfer', proofPaymentUrl: 'https://r2/proof.pdf' })
        : invoice(),
    );
    const res = response();

    await handler(request(), res);

    expect(res.statusCode).toBe(409);
    expect(res.payload.error).toContain('receiving account');
    expect(state.invoice.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a payment and invoice from different clients', async () => {
    state.invoice.findUnique.mockImplementation(async ({ where: { id } }: any) =>
      id === 'RCT-TEST-1' ? receipt() : invoice({ clientId: 'client-OTHER' }),
    );
    const res = response();

    await handler(request(), res);

    expect(res.statusCode).toBe(409);
    expect(res.payload.error).toContain('different clients');
    expect(state.invoice.updateMany).not.toHaveBeenCalled();
  });

  it('rejects linking when the invoice is already fully allocated', async () => {
    state.paymentAllocation.aggregate.mockResolvedValue({ _sum: { amount: 575 } }); // already fully paid
    const res = response();

    await handler(request(), res);

    expect(res.statusCode).toBe(409);
    expect(res.payload.error).toContain('over-allocate');
    expect(state.invoice.updateMany).not.toHaveBeenCalled();
    expect(state.paymentAllocation.create).not.toHaveBeenCalled();
  });

  it('rejects an already-linked receipt', async () => {
    state.invoice.findUnique.mockImplementation(async ({ where: { id } }: any) =>
      id === 'RCT-TEST-1' ? receipt({ linkedInvoiceId: 'INV-OTHER' }) : invoice(),
    );
    const res = response();

    await handler(request(), res);

    expect(res.statusCode).toBe(409);
    expect(res.payload.error).toContain('already linked');
    expect(state.invoice.updateMany).not.toHaveBeenCalled();
  });

  it('returns 404 when the receipt is not a Receipt', async () => {
    state.invoice.findUnique.mockImplementation(async ({ where: { id } }: any) =>
      id === 'RCT-TEST-1' ? { ...invoice(), id: 'RCT-TEST-1', type: 'Invoice' } : invoice(),
    );
    const res = response();

    await handler(request(), res);

    expect(res.statusCode).toBe(404);
    expect(state.invoice.updateMany).not.toHaveBeenCalled();
  });

  it('requires invoice write permission', async () => {
    state.auth.requireFeatureWrite.mockImplementation(async (_req: any, res: any) => {
      res.status(401).json({ error: 'Unauthorized' });
      return null;
    });
    const res = response();

    await handler(request(), res);

    expect(res.statusCode).toBe(401);
    expect(state.invoice.findUnique).not.toHaveBeenCalled();
  });
});
