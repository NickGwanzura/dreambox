import { describe, it, expect } from 'vitest';
import { addMonths, calculateContractMonths, calculateContractMonthsSafe } from '../utils/contractDate';

// ============================================================
// Tests for utils/contractDate.ts
// ============================================================

describe('addMonths', () => {
  it('adds months within a year', () => {
    expect(addMonths('2025-01-15', 3)).toBe('2025-04-15');
  });

  it('adds months across year boundary', () => {
    expect(addMonths('2025-10-15', 5)).toBe('2026-03-15');
  });

  it('adds 12 months returning to same month next year', () => {
    expect(addMonths('2025-01-31', 12)).toBe('2026-01-31');
  });

  it('clamps end-of-month overflow (Jan 31 + 1mo = Feb 28)', () => {
    const result = addMonths('2025-01-31', 1);
    // Feb 2025 has 28 days
    expect(result).toBe('2025-02-28');
  });

  it('clamps to Feb 29 in leap year', () => {
    const result = addMonths('2024-01-31', 1);
    // 2024 is a leap year, Feb has 29 days
    expect(result).toBe('2024-02-29');
  });

  it('preserves day-of-month when possible (Jan 15 + 1mo = Feb 15)', () => {
    expect(addMonths('2025-01-15', 1)).toBe('2025-02-15');
  });

  it('returns original string for invalid date', () => {
    expect(addMonths('not-a-date', 3)).toBe('not-a-date');
  });

  it('handles zero months', () => {
    expect(addMonths('2025-06-15', 0)).toBe('2025-06-15');
  });

  it('handles negative months (reduction)', () => {
    expect(addMonths('2025-06-15', -3)).toBe('2025-03-15');
  });

  it('handles negative months across year boundary', () => {
    expect(addMonths('2025-02-15', -3)).toBe('2024-11-15');
  });

  it('handles empty string gracefully', () => {
    expect(addMonths('', 3)).toBe('');
  });
});

describe('calculateContractMonths', () => {
  it('calculates full calendar months for a 6-month contract', () => {
    const months = calculateContractMonths('2025-01-01', '2025-06-30');
    expect(months).toBeGreaterThanOrEqual(5);
    expect(months).toBeLessThanOrEqual(7);
  });

  it('calculates approximately 12 months for a full-year contract', () => {
    const months = calculateContractMonths('2025-01-01', '2025-12-31');
    expect(months).toBeGreaterThanOrEqual(11);
    expect(months).toBeLessThanOrEqual(13);
  });

  it('returns at least 1 month for short contracts', () => {
    const months = calculateContractMonths('2025-06-01', '2025-06-15');
    expect(months).toBeGreaterThanOrEqual(1);
  });

  it('throws for empty start date', () => {
    expect(() => calculateContractMonths('', '2025-06-30')).toThrow('Invalid dates');
  });

  it('throws for empty end date', () => {
    expect(() => calculateContractMonths('2025-01-01', '')).toThrow('Invalid dates');
  });

  it('throws when end date is before start date', () => {
    expect(() => calculateContractMonths('2025-06-30', '2025-01-01')).toThrow('must be after start date');
  });

  it('throws for invalid date formats', () => {
    expect(() => calculateContractMonths('abc', 'def')).toThrow('Invalid date format');
  });

  it('throws for null/undefined (coerced to string)', () => {
    expect(() => calculateContractMonths(null as any, '2025-06-30')).toThrow();
    expect(() => calculateContractMonths('2025-01-01', undefined as any)).toThrow();
  });
});

describe('calculateContractMonthsSafe', () => {
  it('returns calculated months for valid dates', () => {
    const months = calculateContractMonthsSafe('2025-01-01', '2025-12-31');
    expect(months).toBeGreaterThan(0);
  });

  it('returns fallback (default 1) for invalid dates', () => {
    expect(calculateContractMonthsSafe('', '2025-06-30')).toBe(1);
  });

  it('returns custom fallback for invalid dates', () => {
    expect(calculateContractMonthsSafe('', '2025-06-30', 0)).toBe(0);
  });

  it('returns fallback when end is before start', () => {
    expect(calculateContractMonthsSafe('2025-06-30', '2025-01-01', 3)).toBe(3);
  });
});
