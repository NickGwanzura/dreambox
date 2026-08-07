import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpRequest, HttpResponse } from '../lib/http';
import { generateTotp } from '../lib/totp';

// Regression tests for the two-factor signin flow: signin issues a challenge
// token instead of a session when 2FA is enabled, and the verify endpoint
// exchanges it for a real session only with a valid TOTP code — feeding the
// account lockout on failures and re-checking status.
const state = vi.hoisted(() => {
  process.env.JWT_SECRET = 'test-secret-2fa';
  const user = { findUnique: vi.fn(), update: vi.fn() };
  const loginHistory = { create: vi.fn() };
  const prisma: any = { user, loginHistory };
  return {
    prisma,
    user,
    loginHistory,
    bcrypt: { compare: vi.fn() },
    rateLimiter: { checkRateLimit: vi.fn() },
    notifyAdmin: { notifyWatchedLogin: vi.fn(), notifyAdminOpsAlert: vi.fn() },
    logger: { log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), db: vi.fn() } },
  };
});

vi.mock('../lib/prisma', () => ({ prisma: state.prisma }));
vi.mock('../lib/rateLimiter.js', () => state.rateLimiter);
vi.mock('../lib/notifyAdmin', () => state.notifyAdmin);
vi.mock('../lib/serverLogger.js', () => state.logger);
vi.mock('bcryptjs', () => ({ default: state.bcrypt }));

import signinHandler from '../api/auth/signin';
import verifyHandler from '../api/auth/two-factor/verify';
import enableHandler from '../api/auth/two-factor/enable';
import { signToken } from '../lib/auth';

// RFC 6238 secret — generateTotp derives real codes from it.
const SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-2fa',
    firstName: 'Ada',
    lastName: 'Admin',
    email: 'admin@dreambox.co.zw',
    username: null,
    role: 'Admin',
    status: 'Active',
    sessionVersion: 1,
    passwordHash: 'hash',
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    lastLoginIp: null,
    permissions: null,
    mustResetPassword: false,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    twoFactorEnabled: true,
    twoFactorSecret: SECRET,
    ...overrides,
  };
}

function request(overrides: Partial<HttpRequest> = {}) {
  return {
    method: 'POST',
    headers: {
      'x-forwarded-for': '1.2.3.4, 10.0.0.1',
      'user-agent': 'vitest/2fa',
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

describe('signin — two-factor challenge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.rateLimiter.checkRateLimit.mockResolvedValue({ allowed: true, retryAfterMs: null });
    state.bcrypt.compare.mockResolvedValue(true);
    state.prisma.loginHistory.create.mockResolvedValue({ id: 'history-1' });
    state.prisma.user.update.mockImplementation(async ({ data }: any) => ({ ...data }));
  });

  it('issues a challenge token — no session, no login history — when 2FA is enabled', async () => {
    state.prisma.user.findUnique.mockResolvedValue(makeUser());
    const res = response();

    await signinHandler(request({ body: { email: 'admin@dreambox.co.zw', password: 'pass123' } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.payload.twoFactorRequired).toBe(true);
    expect(typeof res.payload.twoFactorToken).toBe('string');
    expect(res.payload.token).toBeUndefined();
    expect(res.payload.user).toBeUndefined();
    // No successful login recorded and no lastLoginAt write — the session only
    // completes after a valid TOTP code.
    expect(state.prisma.loginHistory.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ success: true }) }),
    );
    expect(state.prisma.user.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ lastLoginAt: expect.any(Date) }) }),
    );
  });

  it('signs straight in — without 2FA — and never leaks the secret', async () => {
    state.prisma.user.findUnique.mockResolvedValue(makeUser({ twoFactorEnabled: false, twoFactorSecret: null }));
    const res = response();

    await signinHandler(request({ body: { email: 'admin@dreambox.co.zw', password: 'pass123' } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.payload.token).toBeTruthy();
    expect(res.payload.user.email).toBe('admin@dreambox.co.zw');
    expect(res.payload.user.twoFactorSecret).toBeUndefined();
    expect(res.payload.user.passwordHash).toBeUndefined();
    expect(state.prisma.loginHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ success: true }) }),
    );
  });
});

describe('two-factor verify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.rateLimiter.checkRateLimit.mockResolvedValue({ allowed: true, retryAfterMs: null });
    state.prisma.loginHistory.create.mockResolvedValue({ id: 'history-1' });
    state.prisma.user.update.mockImplementation(async ({ data }: any) => ({ ...data }));
  });

  it('exchanges a valid code for a real session and records the 2FA login', async () => {
    const user = makeUser();
    state.prisma.user.findUnique.mockResolvedValue(user);
    const challenge = signToken({ userId: user.id, email: user.email, purpose: 'twofactor' } as any);
    const res = response();

    await verifyHandler(
      request({ body: { twoFactorToken: challenge, code: generateTotp(SECRET) } }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.payload.token).toBeTruthy();
    expect(res.payload.user.twoFactorSecret).toBeUndefined();
    expect(state.prisma.loginHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ success: true, reason: 'two_factor' }) }),
    );
    expect(state.prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ failedLoginAttempts: 0 }) }),
    );
  });

  it('rejects a wrong code and increments the account lockout counter', async () => {
    const user = makeUser({ failedLoginAttempts: 2 });
    state.prisma.user.findUnique.mockResolvedValue(user);
    const challenge = signToken({ userId: user.id, email: user.email, purpose: 'twofactor' } as any);
    const res = response();

    await verifyHandler(
      request({ body: { twoFactorToken: challenge, code: '000000' } }),
      res,
    );

    expect(res.statusCode).toBe(401);
    expect(res.payload.error).toContain('Invalid verification code');
    expect(state.prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ failedLoginAttempts: 3 }) }),
    );
    expect(state.prisma.loginHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ success: false, reason: 'wrong_2fa_code' }) }),
    );
  });

  it('locks the account after 5 failed codes', async () => {
    const user = makeUser({ failedLoginAttempts: 4 });
    state.prisma.user.findUnique.mockResolvedValue(user);
    const challenge = signToken({ userId: user.id, email: user.email, purpose: 'twofactor' } as any);
    const res = response();

    await verifyHandler(
      request({ body: { twoFactorToken: challenge, code: '000000' } }),
      res,
    );

    expect(res.statusCode).toBe(401);
    expect(res.payload.error).toContain('locked for 30 minutes');
    expect(state.prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ lockedUntil: expect.any(Date) }) }),
    );
  });

  it('refuses a regular session token as the challenge', async () => {
    const user = makeUser();
    state.prisma.user.findUnique.mockResolvedValue(user);
    const session = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      sessionVersion: user.sessionVersion,
    });
    const res = response();

    await verifyHandler(
      request({ body: { twoFactorToken: session, code: generateTotp(SECRET) } }),
      res,
    );

    expect(res.statusCode).toBe(401);
    expect(res.payload.error).toContain('expired');
  });

  it('re-checks account status inside the challenge window', async () => {
    const user = makeUser({ status: 'Inactive' });
    state.prisma.user.findUnique.mockResolvedValue(user);
    const challenge = signToken({ userId: user.id, email: user.email, purpose: 'twofactor' } as any);
    const res = response();

    await verifyHandler(
      request({ body: { twoFactorToken: challenge, code: generateTotp(SECRET) } }),
      res,
    );

    expect(res.statusCode).toBe(403);
    expect(res.payload.token).toBeUndefined();
  });
});

describe('two-factor enable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.prisma.user.update.mockImplementation(async ({ data }: any) => ({ ...data }));
  });

  it('revokes existing sessions via sessionVersion bump when enabled', async () => {
    // requireAuth reads the fresh state from the same findUnique mock.
    const user = makeUser({ twoFactorEnabled: false });
    state.prisma.user.findUnique.mockResolvedValue(user);
    const session = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      sessionVersion: user.sessionVersion,
    });
    const res = response();

    await enableHandler(
      request({
        headers: { authorization: `Bearer ${session}`, 'x-forwarded-for': '1.2.3.4' },
        body: { code: generateTotp(SECRET) },
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.payload.enabled).toBe(true);
    expect(state.prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ twoFactorEnabled: true, sessionVersion: { increment: 1 } }),
      }),
    );
  });
});
