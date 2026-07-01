import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  setCompanyLogo,
  getCompanyLogo,
  updateCompanyProfile,
  getCompanyProfile,
  updateLocalCompanyProfile,
} from '../services/mockData';
import { CompanyProfile } from '../types';

/**
 * Logo upload / company profile persistence tests.
 *
 * These test the in-memory paths. The module wraps localStorage in try/catch,
 * so tests run cleanly in Node (where localStorage is undefined).
 */

// Minimal valid PNG data URL (1x1 red pixel)
const MOCK_LOGO_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

describe('setCompanyLogo — in-memory', () => {
  it('stores logo in memory via setCompanyLogo', async () => {
    await setCompanyLogo(MOCK_LOGO_URL);
    expect(getCompanyLogo()).toBe(MOCK_LOGO_URL);
  });

  it('getCompanyLogo does not throw when called initially (null safe)', () => {
    expect(() => getCompanyLogo()).not.toThrow();
  });

  it('setCompanyLogo handles empty string gracefully', async () => {
    await expect(setCompanyLogo('')).resolves.not.toThrow();
  });

  it('setCompanyLogo handles non-data-url gracefully', async () => {
    await expect(setCompanyLogo('not-a-data-url')).resolves.not.toThrow();
  });

  it('handles consecutive logo uploads — last one wins', async () => {
    const url2 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    await setCompanyLogo(MOCK_LOGO_URL);
    expect(getCompanyLogo()).toBe(MOCK_LOGO_URL);
    await setCompanyLogo(url2);
    expect(getCompanyLogo()).toBe(url2);
  });
});

describe('updateLocalCompanyProfile — in-memory sync', () => {
  it('syncs logo to companyLogo when partial includes logo', () => {
    updateLocalCompanyProfile({ logo: MOCK_LOGO_URL } as any);
    expect(getCompanyLogo()).toBe(MOCK_LOGO_URL);
  });

  it('clears companyLogo when logo is set to null', () => {
    updateLocalCompanyProfile({ logo: null } as any);
    expect(getCompanyLogo()).toBeNull();
  });

  it('retains existing fields after partial update', () => {
    const before = getCompanyProfile();
    updateLocalCompanyProfile({ name: 'New Name' } as any);
    const after = getCompanyProfile();
    expect(after?.name).toBe('New Name');
    // Other fields should still be there (defaults populated by the module)
    expect(after?.email).toBe(before?.email);
  });
});

describe('updateCompanyProfile — preserves logo', () => {
  it('does not throw when called without logo set', async () => {
    const profile = getCompanyProfile();
    if (profile) {
      await expect(
        updateCompanyProfile({ ...profile, name: 'Test Co' } as CompanyProfile)
      ).resolves.not.toThrow();
    }
  });

  it('keeps logo intact after profile update when companyLogo was set', async () => {
    await setCompanyLogo(MOCK_LOGO_URL);
    const profile = getCompanyProfile();
    if (profile) {
      await updateCompanyProfile({ ...profile, name: 'Updated Co' } as CompanyProfile);
    }
    expect(getCompanyLogo()).toBe(MOCK_LOGO_URL);
  });
});
