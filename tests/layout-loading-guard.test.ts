import { describe, it, expect, beforeEach, vi, afterAll } from 'vitest';
import { shouldShowLoadingFallback } from '../components/Layout';

// ============================================================
// Layout.tsx — loading guard
// ============================================================

// Provide a fake localStorage since vitest runs in 'node' environment
const store = new Map<string, string>();

const mockStorage: Storage = {
  getItem: vi.fn((key: string): string | null => store.get(key) ?? null),
  setItem: vi.fn((key: string, value: string): void => { store.set(key, value); }),
  removeItem: vi.fn((key: string): void => { store.delete(key); }),
  clear: vi.fn((): void => { store.clear(); }),
  length: 0,
  key: vi.fn((): string | null => null),
};

beforeEach(() => {
  store.clear();
  vi.stubGlobal('localStorage', mockStorage);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('shouldShowLoadingFallback', () => {
  const STORAGE_KEY = 'billboard_user';

  it('returns true when no cached user exists (key absent)', () => {
    expect(shouldShowLoadingFallback()).toBe(true);
  });

  it('returns false when a cached user exists', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ email: 'test@test.com', role: 'Admin' }));
    expect(shouldShowLoadingFallback()).toBe(false);
  });

  it('returns true when the cache value is an empty string', () => {
    localStorage.setItem(STORAGE_KEY, '');
    expect(shouldShowLoadingFallback()).toBe(true);
  });

  it('does not throw when localStorage is inaccessible', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(() => shouldShowLoadingFallback()).not.toThrow();
    expect(shouldShowLoadingFallback()).toBe(true);
  });

  it('ignores other localStorage keys', () => {
    localStorage.setItem('some_other_key', 'value');
    localStorage.setItem('yet_another', 'data');
    expect(shouldShowLoadingFallback()).toBe(true);
  });

  it('returns false for various valid JSON user objects', () => {
    const testCases = [
      { email: 'a@b.com' },
      { firstName: 'John', lastName: 'Doe' },
      { id: '123', role: 'Staff' },
    ];

    for (const user of testCases) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
      expect(shouldShowLoadingFallback()).toBe(false);
    }
  });

  it('handles corrupt JSON gracefully (key exists so loading is skipped)', () => {
    // The function only checks key existence, not JSON validity.
    // If the key exists, it returns false (no loading).
    // JSON.parse failure is handled separately in the user state initializer.
    localStorage.setItem(STORAGE_KEY, '{broken json');
    expect(shouldShowLoadingFallback()).toBe(false);
  });
});
