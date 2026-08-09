import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpRequest, HttpResponse } from '../lib/http';

const state = vi.hoisted(() => {
  process.env.JWT_SECRET = 'critical-hardening-test-secret';
  return {
    user: { findUnique: vi.fn() },
    log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
    createBackup: vi.fn(),
  };
});

vi.mock('../lib/prisma', () => ({ prisma: { user: state.user } }));
vi.mock('../lib/serverLogger.js', () => ({ log: state.log }));
vi.mock('../lib/backup', () => ({ createBackup: state.createBackup }));
vi.mock('../lib/notifyAdmin', () => ({ notifyAdminOpsAlert: vi.fn() }));
vi.mock('resend', () => ({ Resend: class { emails = { send: vi.fn() }; } }));

import { requireAuth, signToken } from '../lib/auth';
import backupCron from '../api/cron/backup';
import expireQuotationsCron from '../api/cron/expire-quotations';
import contractExpiryCron from '../api/cron/contract-expiry';
import healthCheckCron from '../api/cron/health-check';
import backOnlineCron from '../api/cron/back-online';
import expenseReportCron from '../api/cron/expense-report';

function request(overrides: Partial<HttpRequest> = {}): HttpRequest {
  return {
    method: 'POST',
    headers: {},
    query: {},
    body: {},
    ...overrides,
  } as HttpRequest;
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
  return res as HttpResponse & { statusCode: number; payload: any };
}

describe('critical access hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.user.findUnique.mockReset();
    delete process.env.CRON_SECRET;
  });

  it('fails closed when the authoritative user-state lookup is unavailable', async () => {
    state.user.findUnique.mockRejectedValue(new Error('database unavailable'));
    const token = signToken({
      userId: 'user-1', email: 'admin@example.test', role: 'Admin', status: 'Active', sessionVersion: 1,
    });
    const res = response();

    const payload = await requireAuth(request({ headers: { authorization: `Bearer ${token}` } }), res);

    expect(payload).toBeNull();
    expect(res.statusCode).toBe(503);
    expect(res.payload).toEqual({ error: 'Authentication service unavailable' });
  });

  it.each([
    ['backup', backupCron],
    ['expire quotations', expireQuotationsCron],
    ['contract expiry', contractExpiryCron],
    ['health check', healthCheckCron],
    ['back online', backOnlineCron],
    ['expense report', expenseReportCron],
  ])('%s cron refuses requests when CRON_SECRET is absent', async (_name, handler) => {
    const res = response();

    await handler(request(), res);

    expect(res.statusCode).toBe(503);
    expect(res.payload).toEqual({ error: 'Cron endpoint not configured' });
  });

  it.each([
    ['backup', backupCron],
    ['expire quotations', expireQuotationsCron],
    ['contract expiry', contractExpiryCron],
    ['health check', healthCheckCron],
    ['back online', backOnlineCron],
    ['expense report', expenseReportCron],
  ])('%s cron rejects a mismatched credential', async (_name, handler) => {
    process.env.CRON_SECRET = 'expected-secret';
    const res = response();

    await handler(request({ headers: { 'x-cron-secret': 'wrong-secret' } }), res);

    expect(res.statusCode).toBe(401);
  });
});
