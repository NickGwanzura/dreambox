import type { VercelRequest, VercelResponse } from '@vercel/node';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { signToken, cors } from '../../lib/auth';
import { checkRateLimit } from '../../lib/rateLimiter.js';
import { log } from '../../lib/serverLogger.js';

const LOCKOUT_THRESHOLD = 5;       // failed attempts before lock
const LOCKOUT_DURATION_MS = 30 * 60 * 1000;  // 30 minutes
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15-minute window
const RATE_LIMIT_MAX = 20;         // max signin attempts per IP per window

const signinSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

function getIp(req: VercelRequest): string {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    (req as any).socket?.remoteAddress ||
    'unknown'
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = getIp(req);

  // Per-IP rate limit
  const rateCheck = await checkRateLimit(`signin:ip:${ip}`, {
    maxAttempts: RATE_LIMIT_MAX,
    windowMs: RATE_LIMIT_WINDOW_MS,
  });
  if (!rateCheck.allowed) {
    const secs = Math.ceil((rateCheck.retryAfterMs ?? RATE_LIMIT_WINDOW_MS) / 1000);
    log.warn(`Signin rate-limited  ip=${ip}`);
    return res.status(429).json({ error: `Too many attempts. Try again in ${secs} seconds.` });
  }

  const parsed = signinSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues.map(e => e.message) });
  }
  const { email, password } = parsed.data;
  const ua = req.headers['user-agent'] ?? null;

  async function recordHistory(userId: string, success: boolean, reason?: string) {
    await prisma.loginHistory.create({
      data: { userId, ip, userAgent: ua, success, reason: reason ?? null },
    }).catch(() => {});
  }

  try {
    log.db('users', `findUnique  email=${email}`);
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });

    if (!user) {
      log.warn(`Signin failed — unknown email=${email}`);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check account lock
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const remainingSecs = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000);
      log.warn(`Signin blocked — account locked  email=${email}`);
      await recordHistory(user.id, false, 'account_locked');
      return res.status(423).json({
        error: `Account temporarily locked due to too many failed attempts. Try again in ${remainingSecs} seconds.`,
      });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);

    if (!valid) {
      const newAttempts = user.failedLoginAttempts + 1;
      const shouldLock = newAttempts >= LOCKOUT_THRESHOLD;

      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: newAttempts,
          lockedUntil: shouldLock ? new Date(Date.now() + LOCKOUT_DURATION_MS) : null,
        },
      });

      await recordHistory(user.id, false, 'wrong_password');
      log.warn(`Signin failed — wrong password  email=${email}  attempts=${newAttempts}`);

      if (shouldLock) {
        return res.status(423).json({
          error: `Too many failed attempts. Account locked for 30 minutes.`,
        });
      }

      const attemptsLeft = LOCKOUT_THRESHOLD - newAttempts;
      return res.status(401).json({
        error: `Invalid email or password. ${attemptsLeft} attempt${attemptsLeft !== 1 ? 's' : ''} remaining before lockout.`,
      });
    }

    // Password correct — check status
    if (user.status === 'Pending') {
      log.warn(`Signin blocked — account pending  email=${email}`);
      await recordHistory(user.id, false, 'account_pending');
      return res.status(403).json({ error: 'Account awaiting administrator approval' });
    }
    if (user.status === 'Rejected') {
      log.warn(`Signin blocked — account rejected  email=${email}`);
      await recordHistory(user.id, false, 'account_rejected');
      return res.status(403).json({ error: 'Account access has been restricted' });
    }
    if (user.status === 'Inactive') {
      log.warn(`Signin blocked — account inactive  email=${email}`);
      await recordHistory(user.id, false, 'account_inactive');
      return res.status(403).json({ error: 'Account has been deactivated. Contact an administrator.' });
    }

    // Success — reset lockout, record login
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        lastLoginIp: ip,
      },
    });
    await recordHistory(user.id, true);

    const token = signToken({ userId: user.id, email: user.email, role: user.role, status: user.status });
    log.info(`Signin success  email=${email}  role=${user.role}`);

    const { passwordHash: _, failedLoginAttempts: __, lockedUntil: ___, ...safeUser } = user;
    return res.status(200).json({ token, user: safeUser });
  } catch (e: any) {
    log.error(`[auth/signin] ${e?.message}`, { stack: e?.stack });
    return res.status(500).json({ error: 'Internal server error' });
  }
}
