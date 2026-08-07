import { describe, it, expect } from 'vitest';
import {
  generateTotpSecret,
  generateTotp,
  verifyTotp,
  buildOtpAuthUrl,
} from '../lib/totp';

// RFC 6238 Appendix B test vectors (SHA1, 8 digits truncated to 6 here).
// Secret: ASCII "12345678901234567890" → base32 GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('generateTotp (RFC 6238 vectors)', () => {
  const cases: Array<[number, string]> = [
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
    [20000000000, '353130'],
  ];

  for (const [t, expected] of cases) {
    it(`T=${t} → ${expected}`, () => {
      expect(generateTotp(RFC_SECRET, t * 1000)).toBe(expected);
    });
  }
});

describe('generateTotpSecret', () => {
  it('produces a 32-char base32 secret (160 bits)', () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(secret).not.toBe(generateTotpSecret());
  });
});

describe('verifyTotp', () => {
  it('accepts the current code', () => {
    const secret = generateTotpSecret();
    const code = generateTotp(secret);
    expect(verifyTotp(secret, code)).toBe(true);
  });

  it('tolerates one step of clock drift (±30s)', () => {
    const secret = generateTotpSecret();
    const future = generateTotp(secret, Date.now() + 30_000);
    const past = generateTotp(secret, Date.now() - 30_000);
    expect(verifyTotp(secret, future)).toBe(true);
    expect(verifyTotp(secret, past)).toBe(true);
  });

  it('rejects wrong-length, non-numeric, and wrong codes', () => {
    const secret = generateTotpSecret();
    expect(verifyTotp(secret, '12345')).toBe(false);
    expect(verifyTotp(secret, '1234567')).toBe(false);
    expect(verifyTotp(secret, 'abcdef')).toBe(false);
    expect(verifyTotp(secret, '')).toBe(false);
    const wrong = String(Number(generateTotp(secret)) + 1).padStart(6, '0');
    expect(verifyTotp(secret, wrong)).toBe(false);
  });

  it('ignores whitespace and accepts base32 case-insensitivity', () => {
    const secret = generateTotpSecret();
    const code = generateTotp(secret.toLowerCase());
    expect(verifyTotp(secret, ` ${code} `)).toBe(true);
  });
});

describe('buildOtpAuthUrl', () => {
  it('builds a standard otpauth URI', () => {
    const url = buildOtpAuthUrl('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 'admin@dreambox.co.zw');
    expect(url).toContain('otpauth://totp/');
    expect(url).toContain('secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(url).toContain('issuer=Dreambox');
    expect(url).toContain('period=30');
  });
});
