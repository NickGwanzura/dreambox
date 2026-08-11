import { prisma } from './prisma.js';

const LEASE_MS = 30 * 60 * 1000;

/**
 * Claim a durable job key exactly once at a time. Failed or abandoned claims
 * can be retried after a lease expires; completed claims are permanently
 * idempotent unless an operator removes the row deliberately.
 */
export async function claimCronJob(jobKey: string): Promise<boolean> {
  const store = (prisma as any).cronJobRun;
  if (!store) return true; // legacy test/DB clients before the migration
  const now = new Date();
  try {
    await store.create({ data: { jobKey, status: 'Running', startedAt: now } });
    return true;
  } catch (error: any) {
    if (error?.code !== 'P2002') throw error;
  }

  const cutoff = new Date(now.getTime() - LEASE_MS);
  const claimed = await store.updateMany({
    where: {
      jobKey,
      OR: [
        { status: 'Failed' },
        { status: 'Running', startedAt: { lt: cutoff } },
      ],
    },
    data: { status: 'Running', startedAt: now, completedAt: null, error: null, result: null },
  });
  return claimed.count === 1;
}

export async function completeCronJob(jobKey: string, result?: unknown): Promise<void> {
  const store = (prisma as any).cronJobRun;
  if (!store) return;
  await store.updateMany({
    where: { jobKey, status: 'Running' },
    data: { status: 'Completed', completedAt: new Date(), result: result ?? null, error: null },
  });
}

export async function failCronJob(jobKey: string, error: unknown): Promise<void> {
  const store = (prisma as any).cronJobRun;
  if (!store) return;
  await store.updateMany({
    where: { jobKey, status: 'Running' },
    data: { status: 'Failed', error: String(error instanceof Error ? error.message : error).slice(0, 2000) },
  });
}
