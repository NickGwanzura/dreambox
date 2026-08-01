/**
 * Database-backed rate limiter (Postgres via Prisma).
 * Works across deployment platform serverless invocations.
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
  const newResetAt = new Date(now.getTime() + opts.windowMs);

  // Atomic increment-then-check: a read-then-write here would let N
  // concurrent requests all pass the limit together.
  // 1. Reset expired windows (no-op while the window is still active).
  await prisma.rateLimit.updateMany({
    where: { key, resetAt: { lt: now } },
    data: { attempts: 0, resetAt: newResetAt },
  });

  // 2. Increment atomically; create on first-ever attempt. A concurrent
  // create can lose the unique-key race — retry once to take the update path.
  let row;
  try {
    row = await prisma.rateLimit.upsert({
      where: { key },
      create: { key, attempts: 1, resetAt: newResetAt },
      update: { attempts: { increment: 1 } },
    });
  } catch (e: any) {
    if (e?.code !== 'P2002') throw e;
    row = await prisma.rateLimit.update({
      where: { key },
      data: { attempts: { increment: 1 } },
    });
  }

  if (row.attempts > opts.maxAttempts) {
    return {
      allowed: false,
      attemptsLeft: 0,
      retryAfterMs: Math.max(0, row.resetAt.getTime() - now.getTime()),
    };
  }

  return {
    allowed: true,
    attemptsLeft: Math.max(0, opts.maxAttempts - row.attempts),
  };
}
