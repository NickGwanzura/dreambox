import { describe, it, expect } from 'vitest';
import {
  canAccessSettings,
  isSystemAdmin,
  canDelete,
  canCreateQuotations,
  canApproveQuotations,
  canSendQuotations,
  SYSTEM_ADMIN_EMAIL,
  PRIVILEGED_EMAILS,
} from '../utils/settingsAccess';

// ============================================================
// settingsAccess.ts — permission guards
// ============================================================

describe('null / undefined safety (regression: toLowerCase on undefined)', () => {
  it('canAccessSettings(null) returns false without throwing', () => {
    expect(() => canAccessSettings(null)).not.toThrow();
    expect(canAccessSettings(null)).toBe(false);
  });

  it('canAccessSettings(undefined) returns false without throwing', () => {
    expect(() => canAccessSettings(undefined)).not.toThrow();
    expect(canAccessSettings(undefined)).toBe(false);
  });

  it('canAccessSettings({}) returns false without throwing', () => {
    expect(() => canAccessSettings({})).not.toThrow();
    expect(canAccessSettings({})).toBe(false);
  });

  it('canAccessSettings({ email: undefined }) returns false without throwing', () => {
    expect(() => canAccessSettings({ email: undefined })).not.toThrow();
    expect(canAccessSettings({ email: undefined })).toBe(false);
  });

  it('canAccessSettings({ email: null }) returns false without throwing', () => {
    expect(() => canAccessSettings({ email: null })).not.toThrow();
    expect(canAccessSettings({ email: null })).toBe(false);
  });

  it('canAccessSettings({ email: "" }) returns false', () => {
    expect(() => canAccessSettings({ email: '' })).not.toThrow();
    expect(canAccessSettings({ email: '' })).toBe(false);
  });

  it('isSystemAdmin(null) returns false without throwing', () => {
    expect(() => isSystemAdmin(null)).not.toThrow();
    expect(isSystemAdmin(null)).toBe(false);
  });

  it('isSystemAdmin(undefined) returns false without throwing', () => {
    expect(() => isSystemAdmin(undefined)).not.toThrow();
    expect(isSystemAdmin(undefined)).toBe(false);
  });

  it('isSystemAdmin({}) returns false without throwing', () => {
    expect(() => isSystemAdmin({})).not.toThrow();
    expect(isSystemAdmin({})).toBe(false);
  });

  it('isSystemAdmin({ email: undefined }) returns false without throwing', () => {
    expect(() => isSystemAdmin({ email: undefined })).not.toThrow();
    expect(isSystemAdmin({ email: undefined })).toBe(false);
  });

  it('isSystemAdmin({ email: null }) returns false without throwing', () => {
    expect(() => isSystemAdmin({ email: null })).not.toThrow();
    expect(isSystemAdmin({ email: null })).toBe(false);
  });

  it('canDelete(null) returns false without throwing', () => {
    expect(() => canDelete(null)).not.toThrow();
    expect(canDelete(null)).toBe(false);
  });

  it('canCreateQuotations(null) returns false without throwing', () => {
    expect(() => canCreateQuotations(null)).not.toThrow();
    expect(canCreateQuotations(null)).toBe(false);
  });

  it('canApproveQuotations(null) returns false without throwing', () => {
    expect(() => canApproveQuotations(null)).not.toThrow();
    expect(canApproveQuotations(null)).toBe(false);
  });

  it('canSendQuotations(null) returns false without throwing', () => {
    expect(() => canSendQuotations(null)).not.toThrow();
    expect(canSendQuotations(null)).toBe(false);
  });
});

describe('happy path — privileged user', () => {
  const privilegedUser = { email: PRIVILEGED_EMAILS[0], role: 'Staff' };

  it('canAccessSettings returns true for allowed email', () => {
    expect(canAccessSettings(privilegedUser)).toBe(true);
  });

  it('isSystemAdmin returns true for system admin email', () => {
    expect(isSystemAdmin({ email: SYSTEM_ADMIN_EMAIL })).toBe(true);
  });

  it('isSystemAdmin returns false for other privileged emails', () => {
    expect(isSystemAdmin({ email: PRIVILEGED_EMAILS[1] })).toBe(false);
  });

  it('canDelete returns true for Admin role', () => {
    expect(canDelete({ email: 'staff@test.com', role: 'Admin' })).toBe(true);
  });

  it('canDelete returns true for Manager role', () => {
    expect(canDelete({ email: 'staff@test.com', role: 'Manager' })).toBe(true);
  });

  it('canDelete returns true for Staff with privileged email', () => {
    expect(canDelete({ email: PRIVILEGED_EMAILS[0], role: 'Staff' })).toBe(true);
  });

  it('canDelete returns false for non-privileged Staff', () => {
    expect(canDelete({ email: 'nobody@test.com', role: 'Staff' })).toBe(false);
  });
});

describe('happy path — unprivileged user', () => {
  const unprivileged = { email: 'someone@other.com', role: 'Staff' };

  it('canAccessSettings returns false', () => {
    expect(canAccessSettings(unprivileged)).toBe(false);
  });

  it('isSystemAdmin returns false', () => {
    expect(isSystemAdmin(unprivileged)).toBe(false);
  });

  it('canCreateQuotations returns false for non-privileged Staff', () => {
    expect(canCreateQuotations(unprivileged)).toBe(false);
  });

  it('canApproveQuotations returns false for non-privileged Staff', () => {
    expect(canApproveQuotations(unprivileged)).toBe(false);
  });

  it('canSendQuotations returns false for non-privileged Staff', () => {
    expect(canSendQuotations(unprivileged)).toBe(false);
  });
});

describe('trim and case normalization', () => {
  it('canAccessSettings trims whitespace around email', () => {
    const user = { email: `  ${PRIVILEGED_EMAILS[0]}  ` };
    expect(canAccessSettings(user)).toBe(true);
  });

  it('isSystemAdmin is case-insensitive', () => {
    const email = SYSTEM_ADMIN_EMAIL.toUpperCase();
    expect(isSystemAdmin({ email })).toBe(true);
  });

  it('canAccessSettings is case-insensitive', () => {
    const email = PRIVILEGED_EMAILS[0].toUpperCase();
    expect(canAccessSettings({ email })).toBe(true);
  });
});
