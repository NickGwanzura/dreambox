import type { HttpRequest } from './http';

/**
 * Derive a rate-limit/audit address without accepting a spoofable forwarded
 * header from a direct connection.  Deployments behind a known reverse proxy
 * opt in with TRUST_PROXY=true; local and direct deployments use the socket.
 */
export function getClientIp(req: HttpRequest): string {
  const socketIp = String((req as any).socket?.remoteAddress || '').trim();
  // Unit/test adapters may not provide a socket at all; accepting the
  // forwarded value in that synthetic case preserves audit coverage without
  // weakening production direct-connection handling.
  if (process.env.TRUST_PROXY === 'true' || (!socketIp && process.env.NODE_ENV !== 'production')) {
    const forwarded = req.headers['x-forwarded-for'];
    const first = String(Array.isArray(forwarded) ? forwarded[0] : forwarded || '')
      .split(',')[0]
      .trim();
    if (first) return first.slice(0, 128);
  }
  return socketIp.slice(0, 128) || 'unknown';
}
