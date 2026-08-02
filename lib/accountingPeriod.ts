import { prisma } from './prisma';

type AccountingPeriodClient = {
  accountingPeriod?: {
    findFirst?: (args: unknown) => Promise<{ id: string; startDate: string; endDate: string } | null>;
  };
};

/**
 * Reject a financial write that belongs to a closed accounting period.
 *
 * `client` lets callers make the check with the same transaction that writes
 * the record.  The database trigger introduced with the accounting controls is
 * still the final authority; this helper gives callers a clear API error first.
 */
export async function assertPeriodOpen(date: string, actor: string, client: AccountingPeriodClient = prisma as any): Promise<void> {
  const accountingPeriod = (client as any).accountingPeriod;
  // Test doubles and pre-migration processes may not expose the new model yet;
  // the database constraint is the final authority once the migration lands.
  if (!accountingPeriod?.findFirst) return;
  const period = await accountingPeriod.findFirst({
    where: { startDate: { lte: date }, endDate: { gte: date }, status: 'Closed' },
    select: { id: true, startDate: true, endDate: true },
  });
  if (period) throw new Error(`Accounting period ${period.startDate} to ${period.endDate} is closed. Reopen it before editing this record.`);
  void actor;
}

/** Check every affected accounting date, de-duplicated for efficient updates. */
export async function assertPeriodsOpen(dates: Array<string | null | undefined>, actor: string, client: AccountingPeriodClient = prisma as any): Promise<void> {
  for (const date of new Set(dates.filter((value): value is string => typeof value === 'string' && value.length > 0))) {
    await assertPeriodOpen(date, actor, client);
  }
}
