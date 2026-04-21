import jwt from 'jsonwebtoken';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { log } from './serverLogger.js';

const JWT_SECRET = process.env.JWT_SECRET!;

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  status: string;
}

export function signToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch {
    return null;
  }
}

export function getTokenFromRequest(req: VercelRequest): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

/**
 * Middleware: extract and verify JWT. Returns the payload or sends 401.
 */
export function requireAuth(
  req: VercelRequest,
  res: VercelResponse
): JWTPayload | null {
  const token = getTokenFromRequest(req);
  if (!token) {
    log.warn(`Auth rejected — no token  ${req.method} ${(req as any).originalUrl ?? req.url}`);
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  const payload = verifyToken(token);
  if (!payload) {
    log.warn(`Auth rejected — invalid/expired token  ${req.method} ${(req as any).originalUrl ?? req.url}`);
    res.status(401).json({ error: 'Invalid or expired token' });
    return null;
  }
  if (payload.status === 'Pending') {
    log.warn(`Auth rejected — account pending  user=${payload.email}`);
    res.status(403).json({ error: 'Account awaiting administrator approval' });
    return null;
  }
  if (payload.status === 'Rejected') {
    log.warn(`Auth rejected — account rejected  user=${payload.email}`);
    res.status(403).json({ error: 'Account access has been restricted' });
    return null;
  }
  log.debug(`Auth OK  user=${payload.email}  role=${payload.role}`);
  return payload;
}

export function requireAdmin(
  req: VercelRequest,
  res: VercelResponse
): JWTPayload | null {
  const payload = requireAuth(req, res);
  if (!payload) return null;
  if (payload.role !== 'Admin') {
    res.status(403).json({ error: 'Admin access required' });
    return null;
  }
  return payload;
}

const ALLOWED_ORIGINS = [
  process.env.APP_URL || 'https://crm.dreamboxadvertising.co.zw',
  'http://localhost:3000',
  'http://localhost:3003',
  'http://localhost:5173',
];

export function cors(res: VercelResponse, req?: VercelRequest): void {
  const origin = req?.headers?.origin;
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  res.setHeader('Access-Control-Allow-Origin', allowed);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Vary', 'Origin');
}

export function requireManagerOrAdmin(
  req: VercelRequest,
  res: VercelResponse
): JWTPayload | null {
  const payload = requireAuth(req, res);
  if (!payload) return null;
  if (payload.role !== 'Admin' && payload.role !== 'Manager') {
    res.status(403).json({ error: 'Admin or Manager access required' });
    return null;
  }
  return payload;
}

const DELETE_ALLOWED_EMAILS: readonly string[] = [
  'rufarod@gmail.com',
  'chiduroobc@gmail.com',
  'nicholas.gwanzura@outlook.com',
];

export function requireDeletePermission(
  req: VercelRequest,
  res: VercelResponse
): JWTPayload | null {
  const payload = requireAuth(req, res);
  if (!payload) return null;
  const email = payload.email?.trim().toLowerCase();
  if (!email || !DELETE_ALLOWED_EMAILS.includes(email)) {
    log.warn(`Delete rejected — not on allowlist  user=${payload.email}  ${req.method} ${(req as any).originalUrl ?? req.url}`);
    res.status(403).json({ error: 'Delete permission is limited to Rufaro, Brian, or Nick.' });
    return null;
  }
  return payload;
}
