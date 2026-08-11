import type { HttpRequest, HttpResponse } from '../../../lib/http';
import { z } from 'zod';
import { prisma } from '../../../lib/prisma';
import { signToken, verifyTwoFactorToken, cors, toSafeUser, setSessionCookie } from '../../../lib/auth';
import { notifyWatchedLogin } from '../../../lib/notifyAdmin';
import { checkRateLimit } from '../../../lib/rateLimiter.js';
import { verifyTotp } from '../../../lib/totp.js';
import { log } from '../../../lib/serverLogger.js';
import { getClientIp } from '../../../lib/clientIp';

const verifySchema = z.object({
  twoFactorToken: z.string().min(1, 'Missing two-factor token'),
  code: z.string().min(1, 'Verification code is required'),
});

/**
 * POST /api/auth/two-factor/verify
 * Second half of a two-factor signin: exchange the short-lived challenge token
 * (issued by signin) plus a valid TOTP code for a real session token.
 */
export default async function handler(req: HttpRequest, res: HttpResponse) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = getClientIp(req);
  const rateCheck = await checkRateLimit(`twofactor-verify:ip:${ip}`, {
    maxAttempts: 10,
    windowMs: 15 * 60 * 1000,
  });
  if (!rateCheck.allowed) {
    const secs = Math.ceil((rateCheck.retryAfterMs ?? 15 * 60 * 1000) / 1000);
    return res.status(429).json({ error: `Too many attempts. Try again in ${secs} seconds.` });
  }

  const parsed = verifySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Validation failed',
      details: parsed.error.issues.map(i => i.message),
    });
  }
  const { twoFactorToken, code } = parsed.data;
  const ua = req.headers['user-agent'] ?? null;

  const challenge = verifyTwoFactorToken(twoFactorToken);
  if (!challenge) {
    return res.status(401).json({ error: 'Two-factor session expired. Sign in again.' });
  }

  async function recordHistory(userId: string, success: boolean, reason?: string) {
    await prisma.loginHistory.create({
      data: { userId, ip, userAgent: ua, success, reason: reason ?? null },
    }).catch((err: any) => log.warn(`[2fa] Failed to record login history: ${err?.message}`));
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: challenge.userId } });
    if (!user) return res.status(401).json({ error: 'Account not found. Sign in again.' });

    // A challenge is intentionally valid for ten minutes.  It must not bypass
    // a lock imposed after the password half of the login completed.
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await recordHistory(user.id, false, 'account_locked');
      const remainingSecs = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000);
      return res.status(423).json({
        error: `Account temporarily locked due to too many failed attempts. Try again in ${remainingSecs} seconds.`,
      });
    }

    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      return res.status(400).json({ error: 'Two-factor authentication is not enabled for this account.' });
    }

    // The account can be deactivated inside the 10-minute challenge window —
    // re-check status before issuing a session token.
    if (user.status === 'Pending') {
      return res.status(403).json({ error: 'Account awaiting administrator approval' });
    }
    if (user.status === 'Rejected' || user.status === 'Inactive') {
      return res.status(403).json({ error: 'Account access has been restricted' });
    }

    if (!verifyTotp(user.twoFactorSecret, code)) {
      // Feed the same account lockout as a wrong password, so brute-forcing a
      // stolen challenge token hits the 5-failures / 30-minute lock too.
      const newAttempts = user.failedLoginAttempts + 1;
      const shouldLock = newAttempts >= 5;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: newAttempts,
          lockedUntil: shouldLock ? new Date(Date.now() + 30 * 60 * 1000) : null,
        },
      });
      await recordHistory(user.id, false, 'wrong_2fa_code');
      log.warn(`2FA verify failed — invalid code  user=${user.email}  ip=${ip}  attempts=${newAttempts}`);
      return res.status(401).json({
        error: shouldLock
          ? 'Too many failed attempts. Account locked for 30 minutes.'
          : 'Invalid verification code.',
      });
    }

    // Code verified — complete the login exactly like the plain signin path.
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        lastLoginIp: ip,
      },
    });
    await recordHistory(user.id, true, 'two_factor');
    notifyWatchedLogin({ email: user.email, firstName: user.firstName, lastName: user.lastName }, ip, ua);

    const token = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      sessionVersion: user.sessionVersion,
    });
    setSessionCookie(res, token);
    log.info(`Signin success (2FA)  email=${user.email}  role=${user.role}`);

    return res.status(200).json({ token, user: toSafeUser(user) });
  } catch (e: any) {
    log.error('[auth/two-factor/verify]', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
