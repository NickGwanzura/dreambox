const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Check if a string is a valid YYYY-MM-DD date.
 */
function isValidDateStr(dateValue: string): boolean {
  if (typeof dateValue !== 'string') return false;
  const match = dateValue.match(/^\d{4}-\d{2}-\d{2}$/);
  if (!match) return false;
  const [y, m, d] = dateValue.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/**
 * Add months to a date string (YYYY-MM-DD), clamping to end-of-month.
 * Adding 1 month to Jan 31 gives Feb 28/29, not Mar 3.
 *
 * FIX: Instead of always clamping to the original day, we first try the original
 * day-of-month, and only clamp if it overflows. This way addMonths preserves the
 * original day-of-month whenever possible (e.g., Jan 31 + 1mo = Feb 28, but
 * Jan 28 + 1mo = Feb 28, Jan 15 + 1mo = Feb 15).
 *
 * The key improvement: we compute month addition independently of what the
 * previous clamped result was, so adding "12 months" always brings you back
 * to the correct month and day (e.g., Jan 31 + 12mo = Jan 31 next year).
 */
export const addMonths = (dateValue: string, months: number): string => {
  if (!isValidDateStr(dateValue)) return dateValue;

  const [year, month, day] = dateValue.split('-').map(Number);
  // Compute target year/month first, independently of clamping
  const totalMonths = (year * 12) + (month - 1) + months;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = totalMonths % 12; // 0-indexed

  // Try the original day first; clamp to last day of target month if needed
  const lastDayOfTarget = new Date(targetYear, targetMonth + 1, 0).getDate();
  const clampedDay = Math.min(day, lastDayOfTarget);

  // Format using local time methods — toISOString() is UTC-based and can
  // shift the date by one day for timezones ahead of UTC (e.g. Africa/Harare UTC+2).
  const result = new Date(targetYear, targetMonth, clampedDay);
  const y = result.getFullYear();
  const m = String(result.getMonth() + 1).padStart(2, '0');
  const d = String(result.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/**
 * Calculate full calendar months between two dates (inclusive padding).
 * Uses actual days / 30.4375 for consistency with contract templates.
 *
 * FIX: Now throws an error for invalid/empty dates instead of silently returning 1.
 * This ensures calling code must handle bad data rather than propagating wrong values.
 */
export function calculateContractMonths(startDate: string, endDate: string): number {
  if (!startDate || !endDate) {
    throw new Error(`Invalid dates: start="${startDate}", end="${endDate}"`);
  }

  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();

  if (Number.isNaN(start) || Number.isNaN(end)) {
    throw new Error(`Invalid date format: start="${startDate}", end="${endDate}"`);
  }

  const days = (end - start) / MS_PER_DAY;
  if (days <= 0) {
    throw new Error(`End date (${endDate}) must be after start date (${startDate})`);
  }

  return Math.max(1, Math.round(days / 30.4375));
}

/**
 * Safe version of calculateContractMonths that returns a fallback instead of throwing.
 * Use this in UI display contexts where you want graceful degradation.
 */
export function calculateContractMonthsSafe(startDate: string, endDate: string, fallback = 1): number {
  try {
    return calculateContractMonths(startDate, endDate);
  } catch {
    return fallback;
  }
}
