import { describe, it, expect } from 'vitest';
import {
  canAccessSettings,
  canDelete,
  canCreateQuotations,
  canApproveQuotations,
  canSendQuotations,
  isSystemAdmin,
} from '../utils/settingsAccess';

// ============================================================
// settingsAccess — role & email gating
// ============================================================

const makeUser = (role: string, email = 'staff@test.com') => ({ role, email });

describe('canAccessSettings', () => {
  it('grants access to privileged email regardless of role', () => {
    expect(canAccessSettings({ email: 'rufarod@gmail.com' })).toBe(true);
  });

  it('denies access to a non-privileged email', () => {
    expect(canAccessSettings({ email: 'random@user.com' })).toBe(false);
  });

  it('denies access when user is null', () => {
    expect(canAccessSettings(null)).toBe(false);
  });

  it('denies access when email is empty', () => {
    expect(canAccessSettings({ email: '' })).toBe(false);
  });
});

describe('canDelete', () => {
  it('allows Admin role to delete', () => {
    expect(canDelete(makeUser('Admin'))).toBe(true);
  });

  it('allows Manager role to delete', () => {
    expect(canDelete(makeUser('Manager'))).toBe(true);
  });

  it('denies Staff role from deleting', () => {
    expect(canDelete(makeUser('Staff'))).toBe(false);
  });

  it('allows privileged email to delete regardless of role', () => {
    expect(canDelete({ role: 'Staff', email: 'rufarod@gmail.com' })).toBe(true);
  });

  it('denies when user is null', () => {
    expect(canDelete(null)).toBe(false);
  });
});

describe('isSystemAdmin', () => {
  it('returns true for the system admin email', () => {
    expect(isSystemAdmin({ email: 'rufarod@gmail.com' })).toBe(true);
  });

  it('returns false for any other email', () => {
    expect(isSystemAdmin({ email: 'other@user.com' })).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isSystemAdmin({ email: 'RUFAROD@GMAIL.COM' })).toBe(true);
  });
});

describe('canCreateQuotations', () => {
  it('allows Admin', () => {
    expect(canCreateQuotations(makeUser('Admin'))).toBe(true);
  });

  it('allows Manager', () => {
    expect(canCreateQuotations(makeUser('Manager'))).toBe(true);
  });

  it('allows SalesAgent', () => {
    expect(canCreateQuotations(makeUser('SalesAgent'))).toBe(true);
  });

  it('denies Staff', () => {
    expect(canCreateQuotations(makeUser('Staff'))).toBe(false);
  });

  it('returns false when user is null', () => {
    expect(canCreateQuotations(null)).toBe(false);
  });
});

describe('canApproveQuotations', () => {
  it('allows Admin', () => {
    expect(canApproveQuotations(makeUser('Admin'))).toBe(true);
  });

  it('allows Manager', () => {
    expect(canApproveQuotations(makeUser('Manager'))).toBe(true);
  });

  it('denies SalesAgent', () => {
    expect(canApproveQuotations(makeUser('SalesAgent'))).toBe(false);
  });

  it('denies Staff', () => {
    expect(canApproveQuotations(makeUser('Staff'))).toBe(false);
  });
});

describe('canSendQuotations', () => {
  it('allows Admin', () => {
    expect(canSendQuotations(makeUser('Admin'))).toBe(true);
  });

  it('allows SalesAgent', () => {
    expect(canSendQuotations(makeUser('SalesAgent'))).toBe(true);
  });

  it('denies Staff', () => {
    expect(canSendQuotations(makeUser('Staff'))).toBe(false);
  });
});
