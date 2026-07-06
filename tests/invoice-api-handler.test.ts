/**
 * Invoice API Handler Tests
 *
 * Tests the pure business logic in api/invoices.ts without hitting a real database:
 *   - pickInvoiceData() whitelist — guards against hasVat / unknown field leaks
 *   - validateTotals() — floating-point-tolerant subtotal/total matching
 *   - handlePrismaError() — Prisma error code → HTTP status mapping
 *   - Invoice creation payload validation
 *   - Full handler dispatch with mocked Prisma + auth
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// ─── Prisma + Auth mocks (must be set BEFORE any imports) ─────────────────────

const mockPrisma = {
  invoice: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
};

const mockAuth = {
  requireAuth: vi.fn(() => ({
    userId: 'user-test-001',
    email: 'test@dreambox.co.zw',
    role: 'Admin',
    status: 'Active',
  })),
  requireDeletePermission: vi.fn(() => true),
  requireQuotationWritePermission: vi.fn(() => true),
  requireQuotationApprovePermission: vi.fn(() => true),
  cors: vi.fn(),
};

vi.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('../lib/auth', () => mockAuth);
vi.mock('../lib/serverLogger.js', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), boot: vi.fn() },
}));

process.env.JWT_SECRET = 'test-jwt-secret-for-unit-tests';

// ─── Helpers to create mock req/res objects ─────────────────────────────────

function mockReq(overrides: Partial<VercelRequest> = {}): VercelRequest {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: {},
    query: {},
    cookies: {},
    ...overrides,
  } as unknown as VercelRequest;
}

function mockRes(): VercelResponse & { _status: number; _json: any; _called: boolean } {
  let _status = 0;
  let _json: any = null;
  let _called = false;

  const statusFn = vi.fn((code: number) => { _status = code; _called = true; return res; });
  const jsonFn = vi.fn((data: any) => { _json = data; _called = true; return res; });

  const res: any = {
    get _status() { return _status; },
    get _json() { return _json; },
    get _called() { return _called; },
    status: statusFn,
    json: jsonFn,
    end: vi.fn(() => res),
    setHeader: vi.fn(() => res),
    getHeader: vi.fn(),
    getHeaders: vi.fn(() => ({})),
    redirect: vi.fn(),
    send: vi.fn(),
    append: vi.fn(),
    attachment: vi.fn(),
    cookie: vi.fn(),
    clearCookie: vi.fn(),
    download: vi.fn(),
    format: vi.fn(),
    links: vi.fn(),
    location: vi.fn(),
    type: vi.fn(),
    vary: vi.fn(),
    render: vi.fn(),
    sendFile: vi.fn(),
    sendStatus: vi.fn(),
  };
  return res;
}

// ─── Import the module under test ────────────────────────────────────────────

let handler: (req: VercelRequest, res: VercelResponse) => Promise<VercelResponse | void>;

beforeEach(async () => {
  vi.clearAllMocks();
  // Re-import to get fresh handler for each test
  const mod = await import('../api/invoices');
  handler = mod.default;
});

// ============================================================
// 1. Zod Validation — rejects invalid inputs with 400
// ============================================================

describe('POST validation', () => {
  it('rejects missing clientId', async () => {
    const res = mockRes();
    await handler(
      mockReq({ body: { date: '2026-06-19', items: [{ description: 'Rental', quantity: 1, unitPrice: 500, amount: 500 }], subtotal: 500, total: 500 } }),
      res,
    );
    expect(res._status).toBe(400);
  });

  it('rejects missing date', async () => {
    const res = mockRes();
    await handler(
      mockReq({ body: { clientId: 'CLI-001', items: [{ description: 'Rental', quantity: 1, unitPrice: 500, amount: 500 }], subtotal: 500, total: 500 } }),
      res,
    );
    expect(res._status).toBe(400);
  });

  it('rejects empty items array', async () => {
    const res = mockRes();
    await handler(
      mockReq({ body: { clientId: 'CLI-001', date: '2026-06-19', items: [], subtotal: 500, total: 500 } }),
      res,
    );
    expect(res._status).toBe(400);
  });

  it('rejects missing subtotal', async () => {
    const res = mockRes();
    await handler(
      mockReq({ body: { clientId: 'CLI-001', date: '2026-06-19', items: [{ description: 'Rental', quantity: 1, unitPrice: 500, amount: 500 }], total: 500 } }),
      res,
    );
    expect(res._status).toBe(400);
  });

  it('rejects missing total', async () => {
    const res = mockRes();
    await handler(
      mockReq({ body: { clientId: 'CLI-001', date: '2026-06-19', items: [{ description: 'Rental', quantity: 1, unitPrice: 500, amount: 500 }], subtotal: 500 } }),
      res,
    );
    expect(res._status).toBe(400);
  });

  it('rejects invalid type enum', async () => {
    const res = mockRes();
    await handler(
      mockReq({ body: { clientId: 'CLI-001', date: '2026-06-19', items: [{ description: 'Rental', quantity: 1, unitPrice: 500, amount: 500 }], subtotal: 500, total: 500, type: 'BogusType' } }),
      res,
    );
    expect(res._status).toBe(400);
  });

  it('rejects empty item description', async () => {
    const res = mockRes();
    await handler(
      mockReq({ body: { clientId: 'CLI-001', date: '2026-06-19', items: [{ description: '', quantity: 1, unitPrice: 500, amount: 500 }], subtotal: 500, total: 500 } }),
      res,
    );
    expect(res._status).toBe(400);
  });
});

// ============================================================
// 2. validateTotals — subtotal/total matching via handler
// ============================================================

describe('validateTotals', () => {
  beforeEach(() => {
    mockPrisma.invoice.create.mockResolvedValue({ id: 'test', type: 'Invoice', clientId: 'CLI-001' });
  });

  it('passes for matching subtotal/total', async () => {
    const res = mockRes();
    await handler(
      mockReq({ body: { clientId: 'CLI-001', date: '2026-06-19', items: [{ description: 'Rental', quantity: 1, unitPrice: 500, amount: 500 }], subtotal: 500, total: 500 } }),
      res,
    );
    expect(res._status).toBe(201);
  });

  it('passes for values within floating-point tolerance (1 cent)', async () => {
    const res = mockRes();
    // Items sum to 999.95, subtotal is 1000 — within tolerance of 1
    await handler(
      mockReq({ body: { clientId: 'CLI-001', date: '2026-06-19', items: [{ description: 'A', quantity: 1, unitPrice: 333.32, amount: 333.32 }, { description: 'B', quantity: 1, unitPrice: 333.32, amount: 333.32 }, { description: 'C', quantity: 1, unitPrice: 333.31, amount: 333.31 }], subtotal: 1000, total: 1000 } }),
      res,
    );
    expect(res._status).toBe(201);
  });

  it('rejects subtotal beyond tolerance', async () => {
    const res = mockRes();
    await handler(
      mockReq({ body: { clientId: 'CLI-001', date: '2026-06-19', items: [{ description: 'Rental', quantity: 1, unitPrice: 500, amount: 500 }], subtotal: 999, total: 500 } }),
      res,
    );
    expect(res._status).toBe(400);
  });

  it('rejects total beyond tolerance', async () => {
    const res = mockRes();
    await handler(
      mockReq({ body: { clientId: 'CLI-001', date: '2026-06-19', items: [{ description: 'Rental', quantity: 1, unitPrice: 500, amount: 500 }], subtotal: 500, vatAmount: 0, total: 999 } }),
      res,
    );
    expect(res._status).toBe(400);
  });

  it('handles discount correctly', async () => {
    const res = mockRes();
    // Items sum to 2000, discount 300 → afterDiscount = 1700, total = 1700
    await handler(
      mockReq({ body: { clientId: 'CLI-001', date: '2026-06-19', items: [{ description: 'A', quantity: 1, unitPrice: 1000, amount: 1000 }, { description: 'B', quantity: 1, unitPrice: 1000, amount: 1000 }], subtotal: 1700, discountAmount: 300, vatAmount: 0, total: 1700 } }),
      res,
    );
    expect(res._status).toBe(201);
  });

  it('handles VAT on top of after-discount', async () => {
    const res = mockRes();
    // Items sum to 1000 → afterDiscount = 1000, vat = 140, total = 1140
    await handler(
      mockReq({ body: { clientId: 'CLI-001', date: '2026-06-19', items: [{ description: 'Rental', quantity: 1, unitPrice: 1000, amount: 1000 }], subtotal: 1000, vatAmount: 140, total: 1140 } }),
      res,
    );
    expect(res._status).toBe(201);
  });
});

// ============================================================
// 3. pickInvoiceData — whitelist field filtering
// ============================================================

describe('pickInvoiceData whitelist', () => {
  beforeEach(() => {
    mockPrisma.invoice.create.mockResolvedValue({ id: 'test', type: 'Invoice', clientId: 'CLI-001' });
  });

  it('strips hasVat from payload', async () => {
    const res = mockRes();
    await handler(
      mockReq({ body: { clientId: 'CLI-001', date: '2026-06-19', items: [{ description: 'Rental', quantity: 1, unitPrice: 500, amount: 500 }], subtotal: 500, total: 500, hasVat: true } }),
      res,
    );
    expect(res._status).toBe(201);
    const data = mockPrisma.invoice.create.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('hasVat');
  });

  it('strips arbitrary unknown fields', async () => {
    const res = mockRes();
    await handler(
      mockReq({ body: { clientId: 'CLI-001', date: '2026-06-19', items: [{ description: 'Rental', quantity: 1, unitPrice: 500, amount: 500 }], subtotal: 500, total: 500, unknownField: 'inject' } }),
      res,
    );
    const data = mockPrisma.invoice.create.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('unknownField');
  });

  it('preserves all known Prisma fields', async () => {
    const res = mockRes();
    await handler(
      mockReq({ body: {
        clientId: 'CLI-001', date: '2026-06-19',
        items: [{ description: 'Rental', quantity: 1, unitPrice: 500, amount: 500 }],
        // items sum = 500, discount = 50 → afterDiscount = 450, vat = 63 → total = 513
        subtotal: 450, discountAmount: 50, discountDescription: 'Loyalty discount',
        vatAmount: 63, total: 513, status: 'Paid', type: 'Invoice',
        terms: 'Net 30', notes: 'Test note', paymentMethod: 'Bank Transfer',
        paymentReference: 'REF-001',
      } }),
      res,
    );
    const data = mockPrisma.invoice.create.mock.calls[0][0].data;
    expect(data.clientId).toBe('CLI-001');
    expect(data.subtotal).toBe(450);
    expect(data.discountAmount).toBe(50);
    expect(data.discountDescription).toBe('Loyalty discount');
    expect(data.vatAmount).toBe(63);
    expect(data.total).toBe(513);
    expect(data.status).toBe('Paid');
    expect(data.type).toBe('Invoice');
    expect(data.terms).toBe('Net 30');
    expect(data.notes).toBe('Test note');
    expect(data.paymentMethod).toBe('Bank Transfer');
    expect(data.paymentReference).toBe('REF-001');
  });

  it('leaves omitted status/type undefined so partial PUTs cannot reset them (DB schema supplies create defaults)', async () => {
    const res = mockRes();
    await handler(
      mockReq({ body: { clientId: 'CLI-001', date: '2026-06-19', items: [{ description: 'Rental', quantity: 1, unitPrice: 500, amount: 500 }], subtotal: 500, total: 500 } }),
      res,
    );
    const data = mockPrisma.invoice.create.mock.calls[0][0].data;
    // Prisma applies @default(Pending)/@default(Invoice) on create; sending
    // undefined here is what keeps partial updates from clobbering rows.
    expect(data.status).toBeUndefined();
    expect(data.type).toBeUndefined();
    expect(data.vatAmount).toBe(0); // POST-level creation default
  });

  it('omits quoteStatus for non-quotation invoices', async () => {
    const res = mockRes();
    await handler(
      mockReq({ body: { clientId: 'CLI-001', date: '2026-06-19', items: [{ description: 'Rental', quantity: 1, unitPrice: 500, amount: 500 }], subtotal: 500, total: 500, type: 'Invoice' } }),
      res,
    );
    const data = mockPrisma.invoice.create.mock.calls[0][0].data;
    expect(data.quoteStatus).toBeUndefined();
  });
});

// ============================================================
// 4. handlePrismaError — error code → HTTP status mapping
// ============================================================

describe('handlePrismaError', () => {
  it('maps P2002 (unique constraint) → 409', async () => {
    mockPrisma.invoice.create.mockRejectedValue({ code: 'P2002', meta: { target: ['quoteNumber'] }, message: 'Unique constraint failed on quoteNumber' });
    const res = mockRes();
    await handler(
      mockReq({ body: { clientId: 'CLI-001', date: '2026-06-19', items: [{ description: 'Rental', quantity: 1, unitPrice: 500, amount: 500 }], subtotal: 500, total: 500 } }),
      res,
    );
    expect(res._status).toBe(409);
  });

  it('maps P2025 (not found) → 404 on update', async () => {
    mockPrisma.invoice.findUnique.mockRejectedValue({ code: 'P2025', message: 'Record to update not found' });
    const res = mockRes();
    await handler(
      mockReq({ method: 'PUT', query: { id: 'nonexistent' }, body: { clientId: 'CLI-001', date: '2026-06-19', items: [], subtotal: 0, total: 0 } }),
      res,
    );
    expect(res._status).toBe(404);
  });

  it('maps P1001 (connection refused) → 503', async () => {
    mockPrisma.invoice.create.mockRejectedValue({ code: 'P1001', message: 'Can\'t reach database server: ECONNREFUSED' });
    const res = mockRes();
    await handler(
      mockReq({ body: { clientId: 'CLI-001', date: '2026-06-19', items: [{ description: 'Rental', quantity: 1, unitPrice: 500, amount: 500 }], subtotal: 500, total: 500 } }),
      res,
    );
    expect(res._status).toBe(503);
  });

  it('maps unknown errors → 500 with code', async () => {
    mockPrisma.invoice.create.mockRejectedValue({ code: 'P2023', message: 'Inconsistent column data: type "public.QuoteStatus" does not exist' });
    const res = mockRes();
    await handler(
      mockReq({ body: { clientId: 'CLI-001', date: '2026-06-19', items: [{ description: 'Rental', quantity: 1, unitPrice: 500, amount: 500 }], subtotal: 500, total: 500 } }),
      res,
    );
    expect(res._status).toBe(500);
    expect(res._json.code).toBe('P2023');
  });
});

// ============================================================
// 5. Full POST scenarios
// ============================================================

describe('POST success', () => {
  beforeEach(() => {
    mockPrisma.invoice.create.mockResolvedValue({
      id: 'abc-123', clientId: 'CLI-001', date: '2026-06-19',
      items: [{ description: 'Rental', quantity: 1, unitPrice: 500, amount: 500 }],
      subtotal: 500, discountAmount: null, discountDescription: null,
      vatAmount: 0, total: 500, status: 'Pending', type: 'Invoice',
      contractId: null, quoteNumber: null, quoteStatus: null,
    });
  });

  it('creates an invoice and returns 201', async () => {
    const res = mockRes();
    await handler(
      mockReq({ body: { clientId: 'CLI-001', date: '2026-06-19', items: [{ description: 'Rental', quantity: 1, unitPrice: 500, amount: 500 }], subtotal: 500, total: 500 } }),
      res,
    );
    expect(res._status).toBe(201);
    expect(res._json.id).toBe('abc-123');
  });

  it('works with hasVat: true in payload', async () => {
    const res = mockRes();
    await handler(
      mockReq({ body: { clientId: 'CLI-001', date: '2026-06-19', items: [{ description: 'Rental', quantity: 1, unitPrice: 500, amount: 500 }], subtotal: 500, total: 500, hasVat: true } }),
      res,
    );
    expect(res._status).toBe(201);
  });

  it('works with hasVat: false in payload', async () => {
    const res = mockRes();
    await handler(
      mockReq({ body: { clientId: 'CLI-001', date: '2026-06-19', items: [{ description: 'Rental', quantity: 1, unitPrice: 500, amount: 500 }], subtotal: 500, total: 500, hasVat: false } }),
      res,
    );
    expect(res._status).toBe(201);
  });

  it('accepts all valid document types', async () => {
    for (const type of ['Invoice', 'Quotation', 'Proforma', 'Receipt']) {
      mockPrisma.invoice.count.mockResolvedValue(0);
      mockPrisma.invoice.findUnique.mockResolvedValue(null);
      mockPrisma.invoice.create.mockResolvedValue({ id: `test-${type}`, type, clientId: 'CLI-001', quoteNumber: type === 'Quotation' ? 'QT-20260619-001' : null });
      const res = mockRes();
      await handler(
        mockReq({ body: { clientId: 'CLI-001', date: '2026-06-19', items: [{ description: 'Rental', quantity: 1, unitPrice: 500, amount: 500 }], subtotal: 500, total: 500, type } }),
        res,
      );
      expect(res._status).toBe(201);
    }
  });

  it('generates quoteNumber for quotations', async () => {
    mockPrisma.invoice.count.mockResolvedValue(5);
    mockPrisma.invoice.findUnique.mockResolvedValue(null);
    mockPrisma.invoice.create.mockImplementation(({ data }: any) => ({ id: 'qt-001', ...data }));
    const res = mockRes();
    await handler(
      mockReq({ body: { clientId: 'CLI-001', date: '2026-06-19', items: [{ description: 'Consulting', quantity: 1, unitPrice: 1000, amount: 1000 }], subtotal: 1000, total: 1000, type: 'Quotation' } }),
      res,
    );
    expect(res._status).toBe(201);
    expect(res._json.quoteNumber).toMatch(/^QT-\d{8}-\d{3}$/);
  });

  it('detects quoteNumber conflict → 409', async () => {
    mockPrisma.invoice.count.mockResolvedValue(0);
    mockPrisma.invoice.findUnique.mockResolvedValue({ id: 'existing', quoteNumber: 'QT-20260619-001' });
    const res = mockRes();
    await handler(
      mockReq({ body: { clientId: 'CLI-001', date: '2026-06-19', items: [{ description: 'Consulting', quantity: 1, unitPrice: 1000, amount: 1000 }], subtotal: 1000, total: 1000, type: 'Quotation', quoteNumber: 'QT-20260619-001' } }),
      res,
    );
    expect(res._status).toBe(409);
  });
});

// ============================================================
// 6. GET /api/invoices
// ============================================================

describe('GET /api/invoices', () => {
  it('returns a list', async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([{ id: 'i1' }, { id: 'i2' }]);
    const res = mockRes();
    await handler(mockReq({ method: 'GET' }), res);
    expect(res._status).toBe(200);
    expect(res._json).toHaveLength(2);
  });

  it('returns a single invoice by id', async () => {
    mockPrisma.invoice.findUnique.mockResolvedValue({ id: 'inv-1', clientId: 'CLI-001' });
    const res = mockRes();
    await handler(mockReq({ method: 'GET', query: { id: 'inv-1' } }), res);
    expect(res._status).toBe(200);
    expect(res._json.id).toBe('inv-1');
  });

  it('returns 404 for non-existent id', async () => {
    mockPrisma.invoice.findUnique.mockResolvedValue(null);
    const res = mockRes();
    await handler(mockReq({ method: 'GET', query: { id: 'nope' } }), res);
    expect(res._status).toBe(404);
  });
});

// ============================================================
// 7. DELETE /api/invoices
// ============================================================

describe('DELETE /api/invoices', () => {
  it('deletes and returns success', async () => {
    mockPrisma.invoice.findUnique.mockResolvedValue({ id: 'inv-1', type: 'Invoice', status: 'Pending', total: 500 });
    mockPrisma.invoice.delete.mockResolvedValue({ id: 'inv-1' });
    const res = mockRes();
    await handler(mockReq({ method: 'DELETE', query: { id: 'inv-1' } }), res);
    expect(res._status).toBe(200);
    expect(res._json.success).toBe(true);
  });

  it('returns 404 for non-existent invoice', async () => {
    mockPrisma.invoice.findUnique.mockResolvedValue(null);
    const res = mockRes();
    await handler(mockReq({ method: 'DELETE', query: { id: 'nope' } }), res);
    expect(res._status).toBe(404);
  });

  it('returns 400 when id is missing', async () => {
    const res = mockRes();
    await handler(mockReq({ method: 'DELETE' }), res);
    expect(res._status).toBe(400);
  });
});

// ============================================================
// 8. Method Not Allowed
// ============================================================

describe('Method Not Allowed', () => {
  it('returns 405 for PATCH', async () => {
    const res = mockRes();
    await handler(mockReq({ method: 'PATCH' }), res);
    expect(res._status).toBe(405);
  });
});
