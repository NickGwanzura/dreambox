/**
 * Database-backed rate limiter (Postgres via Prisma).
 * Works across Vercel serverless invocations.
 */

import { prisma } from './prisma.js';

interface RateLimitOptions {
  maxAttempts: number;
  windowMs: number; // milliseconds
}

interface RateLimitResult {
  allowed: boolean;
  attemptsLeft: number;
  retryAfterMs?: number;
}

export async function checkRateLimit(key: string, opts: RateLimitOptions): Promise<RateLimitResult> {
  const now = new Date();

  const existing = await prisma.rateLimit.findUnique({ where: { key } });

  if (!existing || existing.resetAt < now) {
    // First attempt in window — create/reset
    await prisma.rateLimit.upsert({
      where: { key },
      create: {
        key,
        attempts: 1,
        resetAt: new Date(now.getTime() + opts.windowMs),
      },
      update: {
        attempts: 1,
        resetAt: new Date(now.getTime() + opts.windowMs),
      },
    });
    return { allowed: true, attemptsLeft: opts.maxAttempts - 1 };
  }

  if (existing.attempts >= opts.maxAttempts) {
    return {
      allowed: false,
      attemptsLeft: 0,
      retryAfterMs: existing.resetAt.getTime() - now.getTime(),
    };
  }

  await prisma.rateLimit.update({
    where: { key },
    data: { attempts: { increment: 1 } },
  });

  return {
    allowed: true,
    attemptsLeft: opts.maxAttempts - existing.attempts - 1,
  };
}
