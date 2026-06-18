import { describe, it, expect } from 'vitest';
import {
  sanitizeString,
  formatPhoneNumber,
  formatCurrency,
  truncateText,
  slugify,
} from '../utils/sanitizers';

// ============================================================
// sanitizers.ts — string / formatting utilities
// ============================================================

describe('sanitizeString', () => {
  it('trims whitespace', () => {
    expect(sanitizeString('  hello  ')).toBe('hello');
  });

  it('collapses multiple spaces to single space', () => {
    expect(sanitizeString('hello   world')).toBe('hello world');
  });

  it('returns empty string for undefined', () => {
    expect(sanitizeString(undefined)).toBe('');
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeString('')).toBe('');
  });
});

describe('formatCurrency', () => {
  it('formats a number as USD by default', () => {
    const result = formatCurrency(1500);
    expect(result).toContain('1,500');
  });

  it('handles zero', () => {
    const result = formatCurrency(0);
    expect(result).toContain('0');
  });

  it('returns a string for undefined/falsy', () => {
    const result = formatCurrency(undefined);
    expect(typeof result).toBe('string');
  });
});

describe('truncateText', () => {
  it('returns text unchanged when under limit', () => {
    expect(truncateText('hello', 10)).toBe('hello');
  });

  it('truncates and appends ellipsis when over limit', () => {
    const result = truncateText('hello world', 5);
    expect(result.length).toBeLessThanOrEqual(8); // 5 + '...'
    expect(result).toContain('...');
  });

  it('returns empty string for undefined', () => {
    expect(truncateText(undefined, 10)).toBe('');
  });
});

describe('slugify', () => {
  it('converts spaces to hyphens and lowercases', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('removes special characters', () => {
    expect(slugify('CBD! Harare #1')).toMatch(/^[a-z0-9-]+$/);
  });

  it('returns empty string for undefined', () => {
    expect(slugify(undefined)).toBe('');
  });
});

describe('formatPhoneNumber', () => {
  it('returns a non-empty string for a valid phone', () => {
    const result = formatPhoneNumber('+263771234567');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns empty string for undefined', () => {
    expect(formatPhoneNumber(undefined)).toBe('');
  });
});
