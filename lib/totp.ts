/**
 * Dependency-free TOTP (RFC 6238) helper — HMAC-SHA1, 30s time step, 6 digits.
 * No external libs: Google Authenticator / Authy compatible via base32 secrets.
 */
import crypto from 'crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return out;
}

function base32Decode(secret: string): Buffer {
  const cleaned = secret.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Generate a fresh random base32 secret (160 bits, 32 chars — standard for TOTP). */
export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

/** Compute the 6-digit TOTP code for a secret at a given time (ms, defaults to now). */
export function generateTotp(secret: string, timeMs: number = Date.now(), timeStepMs = 30_000, digits = 6): string {
  const counter = Math.floor(timeMs / timeStepMs);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binary % 10 ** digits).padStart(digits, '0');
}

/** Constant-time-ish check; window=1 tolerates one step of clock drift each way. */
export function verifyTotp(secret: string, token: string, window = 1): boolean {
  const cleaned = String(token ?? '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(cleaned)) return false;
  const now = Date.now();
  for (let i = -window; i <= window; i++) {
    const candidate = generateTotp(secret, now + i * 30_000);
    if (candidate === cleaned) return true;
  }
  return false;
}

/** Build a standard otpauth:// URI for QR-code / manual entry into authenticator apps. */
export function buildOtpAuthUrl(secret: string, accountEmail: string, issuer = 'Dreambox CRM'): string {
  const label = `${issuer}:${accountEmail}`;
  return `otpauth://totp/${encodeURIComponent(label)}?secret=${encodeURIComponent(secret)}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
