import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpRequest, HttpResponse } from '../lib/http';

const authPayload = { userId: 'user-1', email: 'finance@dreambox.co.zw', role: 'Manager', status: 'Active', sessionVersion: 0 };
const mockPrisma: any = {
  invoice: { create: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), delete: vi.fn(), deleteMany: vi.fn(), count: vi.fn() },
  companyProfile: { findUnique: vi.fn() },
  paymentAllocation: { create: vi.fn(), updateMany: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn(async (callback: any) => callback(mockPrisma)),
};
const mockAuth = {
  requireAuth: vi.fn(async () => authPayload),
  requireFeatureWrite: vi.fn(async () => authPayload),
  requireFeatureRead: vi.fn(async () => authPayload),
  requireDeletePermission: vi.fn(async () => authPayload),
  requireQuotationWritePermission: vi.fn(async () => authPayload),
  cors: vi.fn(),
};

vi.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('../lib/auth', () => mockAuth);
vi.mock('../lib/serverLogger.js', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), boot: vi.fn() } }));

function req(overrides: Partial<HttpRequest> = {}) {
  return { method: 'POST', headers: {}, body: {}, query: {}, ...overrides } as unknown as HttpRequest;
}
function res() {
  let status = 0; let json: any;
  const response: any = { status: vi.fn((code: number) => { status = code; return response; }), json: vi.fn((body: any) => { json = body; return response; }), end: vi.fn(), setHeader: vi.fn() };
  Object.defineProperties(response, { _status: { get: () => status }, _json: { get: () => json } });
  return response;
}
const invoiceBody = (extra: any = {}) => ({ clientId: 'client-1', date: '2026-08-01', items: [{ description: 'Campaign', amount: 115.5 }], subtotal: 100, vatAmount: 15.5, total: 115.5, type: 'Invoice', ...extra });
const bankReceipt = (extra: any = {}) => ({ clientId: 'client-1', date: '2026-08-01', items: [{ description: 'Payment', amount: 115.5 }], subtotal: 115.5, vatAmount: 0, total: 115.5, type: 'Receipt', linkedInvoiceId: 'invoice-1', paymentMethod: 'Bank Transfer', paymentReference: 'BANK-001', receivedBy: 'Jane Doe', receivingAccount: 'CBZ USD 1234', proofPaymentUrl: 'https://files.example.com/proof.pdf', proofOriginalName: 'proof.pdf', proofMimeType: 'application/pdf', proofUploadedAt: '2026-08-01T10:00:00.000Z', ...extra });

let handler: any;
beforeEach(async () => {
  vi.clearAllMocks();
  mockPrisma.companyProfile.findUnique.mockResolvedValue({ vatRate: 0.155 });
  mockPrisma.invoice.findFirst.mockResolvedValue(null);
  mockPrisma.invoice.findMany.mockResolvedValue([]);
  mockPrisma.invoice.count.mockResolvedValue(0);
  mockPrisma.invoice.create.mockImplementation(async ({ data }: any) => ({ id: data.type === 'Receipt' ? 'receipt-1' : 'invoice-1', createdAt: new Date(), ...data }));
  mockPrisma.invoice.update.mockImplementation(async ({ where, data }: any) => ({ id: where.id, ...data }));
  handler = (await import('../api/invoices')).default;
});

describe('invoice ledger validation', () => {
  it('rejects incomplete documents', async () => {
    const response = res(); await handler(req({ body: { date: '2026-08-01', items: [] } }), response); expect(response._status).toBe(400);
  });

  it('calculates VAT-inclusive totals on the server and ignores client arithmetic', async () => {
    const response = res(); await handler(req({ body: invoiceBody({ subtotal: 1, vatAmount: 999, total: 2 }) }), response);
    expect(response._status).toBe(201);
    const data = mockPrisma.invoice.create.mock.calls[0][0].data;
    expect(data.total).toBe(115.5); expect(data.subtotal).toBe(100); expect(data.vatAmount).toBe(15.5); expect(data.dueDate).toBe('2026-08-31');
  });

  it('rejects directly marking an invoice paid', async () => {
    mockPrisma.invoice.findUnique.mockResolvedValue({ id: 'invoice-1', ...invoiceBody(), status: 'Pending' });
    const response = res(); await handler(req({ method: 'PUT', query: { id: 'invoice-1' }, body: { status: 'Paid' } }), response); expect(response._status).toBe(409);
  });
});

describe('payment audit controls', () => {
  it('requires who received every payment', async () => {
    const response = res(); await handler(req({ body: bankReceipt({ receivedBy: undefined }) }), response); expect(response._status).toBe(400); expect(response._json.error).toMatch(/received/i);
  });

  it('requires a reference for every payment', async () => {
    const response = res(); await handler(req({ body: bankReceipt({ paymentReference: undefined }) }), response); expect(response._status).toBe(400); expect(response._json.error).toMatch(/reference/i);
  });

  it('requires receiving account and proof for bank payments', async () => {
    let response = res(); await handler(req({ body: bankReceipt({ receivingAccount: undefined }) }), response); expect(response._status).toBe(400); expect(response._json.error).toMatch(/account/i);
    response = res(); await handler(req({ body: bankReceipt({ proofPaymentUrl: undefined }) }), response); expect(response._status).toBe(400); expect(response._json.error).toMatch(/proof/i);
  });

  it('allows a referenced cash receipt without bank proof', async () => {
    mockPrisma.invoice.findUnique.mockResolvedValue({ id: 'invoice-1', clientId: 'client-1', contractId: null, total: 115.5, type: 'Invoice' });
    const response = res(); await handler(req({ body: bankReceipt({ paymentMethod: 'Cash', receivingAccount: undefined, proofPaymentUrl: undefined, proofOriginalName: undefined, proofMimeType: undefined, proofUploadedAt: undefined }) }), response); expect(response._status).toBe(201);
  });

  it('posts receipt, allocation, status and audit atomically', async () => {
    mockPrisma.invoice.findUnique.mockResolvedValue({ id: 'invoice-1', clientId: 'client-1', contractId: 'contract-1', total: 115.5, type: 'Invoice' });
    const response = res(); await handler(req({ body: bankReceipt() }), response);
    expect(response._status).toBe(201);
    expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
    expect(mockPrisma.paymentAllocation.create).toHaveBeenCalledWith({ data: expect.objectContaining({ receiptId: 'receipt-1', invoiceId: 'invoice-1', amount: 115.5, allocatedBy: 'user-1' }) });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'Finance: Payment Posted', userId: 'user-1' }) });
    expect(mockPrisma.invoice.create.mock.calls[0][0].data).toEqual(expect.objectContaining({ receivedBy: 'Jane Doe', receivedByUserId: 'user-1', createdBy: 'finance@dreambox.co.zw' }));
  });

  it('rejects duplicate payment references', async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue({ id: 'existing-receipt' });
    const response = res(); await handler(req({ body: bankReceipt() }), response); expect(response._status).toBe(409); expect(response._json.existingId).toBe('existing-receipt');
  });

  it('keeps posted receipt evidence immutable', async () => {
    mockPrisma.invoice.findUnique.mockResolvedValue({ id: 'receipt-1', ...bankReceipt(), proofUploadedAt: new Date('2026-08-01T10:00:00Z'), status: 'Paid' });
    const response = res(); await handler(req({ method: 'PUT', query: { id: 'receipt-1' }, body: { receivedBy: 'Someone Else' } }), response); expect(response._status).toBe(409);
  });
});

describe('forensic visibility and reversals', () => {
  it('hides voided documents from ordinary ledger reads', async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([]);
    const response = res(); await handler(req({ method: 'GET', query: {} }), response); expect(response._status).toBe(200); expect(mockPrisma.invoice.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isVoided: false } }));
  });

  it('requires a meaningful void reason', async () => {
    mockPrisma.invoice.findUnique.mockResolvedValue({ id: 'receipt-1', ...bankReceipt(), isVoided: false });
    const response = res(); await handler(req({ method: 'DELETE', query: { id: 'receipt-1', reason: 'bad' } }), response); expect(response._status).toBe(400);
  });

  it('voids and reverses a receipt without deleting its evidence', async () => {
    mockPrisma.invoice.findUnique.mockResolvedValueOnce({ id: 'receipt-1', ...bankReceipt(), isVoided: false }).mockResolvedValueOnce({ id: 'invoice-1', total: 115.5 });
    const response = res(); await handler(req({ method: 'DELETE', query: { id: 'receipt-1', reason: 'Duplicate bank payment captured in error' } }), response);
    expect(response._status).toBe(200); expect(response._json.voided).toBe(true);
    expect(mockPrisma.invoice.delete).not.toHaveBeenCalled();
    expect(mockPrisma.paymentAllocation.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ isReversed: true, reason: 'Duplicate bank payment captured in error' }) }));
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'Finance: Receipt Voided', beforeData: expect.any(Object), afterData: expect.any(Object) }) });
  });
});
