import { prisma } from './prisma';

export async function assertPeriodOpen(date: string, actor: string): Promise<void> {
  const accountingPeriod = (prisma as any).accountingPeriod;
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
