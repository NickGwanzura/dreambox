import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpRequest, HttpResponse } from '../lib/http';

const state = vi.hoisted(() => {
  const prisma: any = {
    invoice: { findMany: vi.fn(), update: vi.fn(), create: vi.fn(), delete: vi.fn() },
    client: { findMany: vi.fn() },
    expense: { findMany: vi.fn(), update: vi.fn(), create: vi.fn(), delete: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  return {
    prisma,
    auth: { requireManagerOrAdmin: vi.fn(), cors: vi.fn() },
  };
});

vi.mock('../lib/prisma', () => ({ prisma: state.prisma }));
vi.mock('../lib/auth', () => state.auth);

import handler from '../api/finance-reconciliation';

const manager = { userId: 'manager-1', email: 'manager@example.com', role: 'Manager' };

const invoice = (id: string) => ({
  id,
  clientId: 'client-1',
  contractId: 'contract-1',
  date: '2026-08-01',
  dueDate: '2026-08-31',
  items: [{ description: 'Campaign', amount: 115.5 }],
  subtotal: 100,
  vatAmount: 15.5,
  total: 115.5,
  status: 'Pending',
  type: 'Invoice',
  isVoided: false,
  createdAt: new Date('2026-08-01T00:00:00Z'),
});

const receipt = (id: string, approvalStatus: string) => ({
  id,
  clientId: 'client-1',
  linkedInvoiceId: 'invoice-1',
  date: '2026-08-02',
  items: [{ description: 'Payment', amount: 115.5 }],
  subtotal: 115.5,
  vatAmount: 0,
  total: 115.5,
  status: 'Paid',
  type: 'Receipt',
  isVoided: false,
  approvalStatus,
  paymentMethod: 'Bank Transfer',
  paymentReference: `REF-${id}`,
  receivedBy: 'Jane Doe',
  receivedByUserId: 'user-1',
  receivingAccount: 'Bank account',
  proofPaymentUrl: `https://files.example.com/${id}.pdf`,
  proofOriginalName: `${id}.pdf`,
  proofMimeType: 'application/pdf',
  proofUploadedAt: new Date('2026-08-02T00:00:00Z'),
  createdAt: new Date('2026-08-02T00:00:00Z'),
});

function request(overrides: Partial<HttpRequest> = {}) {
  return { method: 'GET', headers: {}, query: {}, body: {}, ...overrides } as unknown as HttpRequest;
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

describe('finance-reconciliation API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.auth.requireManagerOrAdmin.mockResolvedValue(manager);
    state.prisma.invoice.findMany.mockResolvedValue([
      invoice('invoice-1'),
      invoice('invoice-2'),
      receipt('receipt-approved', 'Approved'),
      receipt('receipt-pending', 'Pending'),
    ]);
    state.prisma.client.findMany.mockResolvedValue([{ id: 'client-1', companyName: 'Acme' }]);
    state.prisma.expense.findMany.mockResolvedValue([{ id: 'expense-1', category: 'Other', description: 'Operations', amount: 20, date: '2026-08-02', createdAt: new Date() }]);
  });

  it('returns manager-only, read-only controls and exact duplicate groups without proof URLs', async () => {
    const res = response();

    await handler(request(), res);

    expect(res.statusCode).toBe(200);
    expect(state.auth.requireManagerOrAdmin).toHaveBeenCalledOnce();
    expect(state.prisma.invoice.findMany).toHaveBeenCalledWith({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
    expect(state.prisma.expense.findMany).toHaveBeenCalledWith({ orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] });
    expect(res.payload.controls).toMatchObject({
      invoiceCount: 2,
      receiptCount: 2,
      recognizedReceiptCount: 1,
      reviewReceiptCount: 1,
      cashCollected: 115.5,
      recordedReceiptGross: 231,
      outstanding: 115.5,
    });
    expect(res.payload.exactDuplicateGroups).toHaveLength(1);
    expect(res.payload.exactDuplicateGroups[0]).toMatchObject({
      confidence: 'exact',
      suggestedSurvivorId: 'invoice-1',
      invoices: [{ id: 'invoice-1' }, { id: 'invoice-2' }],
    });
    expect(res.payload.findings.map((finding: any) => finding.code)).toEqual(expect.arrayContaining(['EXACT_DUPLICATE', 'PENDING_RECEIPT_REVIEW']));
    expect(JSON.stringify(res.payload)).not.toContain('https://files.example.com');
    expect(JSON.stringify(res.payload)).not.toContain('proofPaymentUrl');
    expect(state.prisma.invoice.update).not.toHaveBeenCalled();
    expect(state.prisma.expense.update).not.toHaveBeenCalled();
    expect(state.prisma.auditLog.create).not.toHaveBeenCalled();
    expect(state.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not query ledger data when manager/admin authorization fails', async () => {
    state.auth.requireManagerOrAdmin.mockResolvedValue(null);
    const res = response();

    await handler(request(), res);

    expect(state.prisma.invoice.findMany).not.toHaveBeenCalled();
    expect(state.prisma.client.findMany).not.toHaveBeenCalled();
    expect(state.prisma.expense.findMany).not.toHaveBeenCalled();
  });

  it('is GET-only and does not authenticate or read data for a mutation method', async () => {
    const res = response();

    await handler(request({ method: 'POST' }), res);

    expect(res.statusCode).toBe(405);
    expect(state.auth.requireManagerOrAdmin).not.toHaveBeenCalled();
    expect(state.prisma.invoice.findMany).not.toHaveBeenCalled();
  });
});
