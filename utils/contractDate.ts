const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Add months to a date string (YYYY-MM-DD), clamping to end-of-month.
 * Adding 1 month to Jan 31 gives Feb 28/29, not Mar 3.
 */
export const addMonths = (dateValue: string, months: number): string => {
  const [year, month, day] = dateValue.split('-').map(Number);
  const d = new Date(year, month - 1 + months, 1); // first of target month
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const clampedDay = Math.min(day, lastDay);
  const result = new Date(d.getFullYear(), d.getMonth(), clampedDay);
  return result.toISOString().split('T')[0];
};

/**
 * Calculate full calendar months between two dates (inclusive padding).
 * Uses actual days / 30.4375 for consistency with contract templates.
 */
export const calculateContractMonths = (startDate: string, endDate: string): number => {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return 1;
  const days = (end - start) / MS_PER_DAY;
  if (days <= 0) return 1;
  return Math.max(1, Math.round(days / 30.4375));
};
