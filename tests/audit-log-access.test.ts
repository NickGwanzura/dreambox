import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpRequest, HttpResponse } from '../lib/http';

const state = vi.hoisted(() => {
  const auditLog = { findMany: vi.fn(), create: vi.fn() };
  return {
    prisma: { auditLog },
    auth: {
      requireAuth: vi.fn(),
      requireManagerOrAdmin: vi.fn(),
      cors: vi.fn(),
    },
    auditLog,
  };
});

vi.mock('../lib/prisma', () => ({ prisma: state.prisma }));
vi.mock('../lib/auth', () => state.auth);
vi.mock('../lib/serverLogger.js', () => ({ log: { error: vi.fn() } }));

import handler, { redactProofUrls } from '../api/audit-logs';

const manager = { userId: 'manager-1', email: 'manager@example.com', role: 'Manager' };

function request(overrides: Partial<HttpRequest> = {}) {
  return { method: 'GET', headers: {}, query: {}, ...overrides } as HttpRequest;
}

function response() {
  let statusCode = 0;
  let payload: unknown;
  const res: any = {
    status: vi.fn((status: number) => { statusCode = status; return res; }),
    json: vi.fn((body: unknown) => { payload = body; return res; }),
    end: vi.fn(),
    setHeader: vi.fn(),
  };
  Object.defineProperties(res, {
    statusCode: { get: () => statusCode },
    payload: { get: () => payload },
  });
  return res as HttpResponse & { statusCode: number; payload: unknown };
}

describe('audit-log access controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.auth.requireManagerOrAdmin.mockResolvedValue(manager);
    state.auth.requireAuth.mockResolvedValue(manager);
  });

  it('redacts proof URLs recursively without changing other evidence fields', () => {
    expect(redactProofUrls({
      proofPaymentUrl: 'https://private.example/proof',
      proofOriginalName: 'bank-slip.pdf',
      nested: [{ proof_payment_url: 'https://private.example/nested' }],
    })).toEqual({
      proofPaymentUrl: '[REDACTED]',
      proofOriginalName: 'bank-slip.pdf',
      nested: [{ proof_payment_url: '[REDACTED]' }],
    });
  });

  it('allows only managers/admins to read the audit trail and redacts snapshots', async () => {
    state.auditLog.findMany.mockResolvedValue([{
      id: 'audit-1',
      beforeData: { proofPaymentUrl: 'https://private.example/before', amount: 10 },
      afterData: { evidence: { proofPaymentUrl: 'https://private.example/after' }, amount: 20 },
    }]);
    const res = response();

    await handler(request(), res);

    expect(state.auth.requireManagerOrAdmin).toHaveBeenCalledOnce();
    expect(state.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 100 }));
    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual([{
      id: 'audit-1',
      beforeData: { proofPaymentUrl: '[REDACTED]', amount: 10 },
      afterData: { evidence: { proofPaymentUrl: '[REDACTED]' }, amount: 20 },
    }]);
  });

  it('does not query logs when manager/admin authorization fails', async () => {
    state.auth.requireManagerOrAdmin.mockResolvedValue(null);
    const res = response();

    await handler(request(), res);

    expect(state.auditLog.findMany).not.toHaveBeenCalled();
  });
});
