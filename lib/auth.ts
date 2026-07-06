import jwt from 'jsonwebtoken';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { log } from './serverLogger.js';
import { prisma } from './prisma.js';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is not set. Cannot start the application.');
}

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  status: string;
}

export function signToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET as string, { expiresIn: '24h' });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET as string) as JWTPayload;
  } catch {
    return null;
  }
}

export function getTokenFromRequest(req: VercelRequest): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

// Tokens live 24h, but role/status can change at any moment (deactivation,
// demotion). Re-check the DB on each request, with a short cache so we don't
// pay a query per call. This is a long-lived Express process, so a
// module-level cache is safe.
const USER_CACHE_TTL_MS = 60 * 1000;
const userCache = new Map<string, { role: string; status: string; expiresAt: number }>();

async function getFreshUserState(userId: string): Promise<{ role: string; status: string } | null> {
  const cached = userCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return { role: cached.role, status: cached.status };
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, status: true },
  });
  if (!user) {
    userCache.delete(userId);
    return null;
  }
  userCache.set(userId, { role: user.role, status: user.status, expiresAt: Date.now() + USER_CACHE_TTL_MS });
  return { role: user.role, status: user.status };
}

/** Drop a user's cached role/status so permission changes apply immediately. */
export function invalidateUserCache(userId: string): void {
  userCache.delete(userId);
}

/**
 * Middleware: extract and verify JWT, then re-check the user's current
 * role/status in the DB. Returns the payload or sends 401/403.
 */
export async function requireAuth(
  req: VercelRequest,
  res: VercelResponse
): Promise<JWTPayload | null> {
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
  const fresh = await getFreshUserState(payload.userId).catch(e => {
    // DB unavailable — fall back to the token's own claims rather than
    // locking everyone out.
    log.warn(`Auth DB check failed, using token claims: ${e?.message}`);
    return { role: payload.role, status: payload.status };
  });
  if (!fresh) {
    log.warn(`Auth rejected — user no longer exists  user=${payload.email}`);
    res.status(401).json({ error: 'Account not found' });
    return null;
  }
  payload.role = fresh.role;
  payload.status = fresh.status;
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
  if (payload.status === 'Inactive') {
    log.warn(`Auth rejected — account inactive  user=${payload.email}`);
    res.status(403).json({ error: 'Account has been deactivated. Contact your administrator.' });
    return null;
  }
  log.debug(`Auth OK  user=${payload.email}  role=${payload.role}`);
  return payload;
}

export async function requireAdmin(
  req: VercelRequest,
  res: VercelResponse
): Promise<JWTPayload | null> {
  const payload = await requireAuth(req, res);
  if (!payload) return null;
  if (payload.role !== 'Admin') {
    res.status(403).json({ error: 'Admin access required' });
    return null;
  }
  return payload;
}

const ALLOWED_ORIGINS = [
  process.env.APP_URL || 'https://dreamboxadvertising.co.zw',
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

export async function requireManagerOrAdmin(
  req: VercelRequest,
  res: VercelResponse
): Promise<JWTPayload | null> {
  const payload = await requireAuth(req, res);
  if (!payload) return null;
  if (payload.role !== 'Admin' && payload.role !== 'Manager') {
    res.status(403).json({ error: 'Admin or Manager access required' });
    return null;
  }
  return payload;
}

export const SYSTEM_ADMIN_EMAIL = (process.env.SYSTEM_ADMIN_EMAIL || '').toLowerCase();

export function isSystemAdmin(email: string | null | undefined): boolean {
  return !!SYSTEM_ADMIN_EMAIL && email?.trim()?.toLowerCase() === SYSTEM_ADMIN_EMAIL;
}

export async function requireDeletePermission(
  req: VercelRequest,
  res: VercelResponse
): Promise<JWTPayload | null> {
  const payload = await requireAuth(req, res);
  if (!payload) return null;

  if (payload.role === 'Admin' || payload.role === 'Manager') {
    return payload;
  }

  log.warn(`Delete rejected — insufficient permissions  user=${payload.email} role=${payload.role}  ${req.method} ${(req as any).originalUrl ?? req.url}`);
  res.status(403).json({ error: 'Delete permission requires Admin or Manager role.' });
  return null;
}

/**
 * Check if user has write permission for quotations.
 * Admin/Manager always allowed. SalesAgent can create/edit own.
 * Staff can read only.
 */
export async function requireQuotationWritePermission(
  req: VercelRequest,
  res: VercelResponse
): Promise<JWTPayload | null> {
  const payload = await requireAuth(req, res);
  if (!payload) return null;

  if (payload.role === 'Admin' || payload.role === 'Manager' || payload.role === 'SalesAgent') {
    return payload;
  }

  log.warn(`Quotation write rejected — insufficient permissions  user=${payload.email} role=${payload.role}`);
  res.status(403).json({ error: 'Quotation creation requires Admin, Manager, or Sales Agent role.' });
  return null;
}

/**
 * Check if user can approve/convert quotations.
 * Only Admin and Manager can approve/convert.
 */
export async function requireQuotationApprovePermission(
  req: VercelRequest,
  res: VercelResponse
): Promise<JWTPayload | null> {
  const payload = await requireAuth(req, res);
  if (!payload) return null;

  if (payload.role === 'Admin' || payload.role === 'Manager') {
    return payload;
  }

  log.warn(`Quotation approve rejected — insufficient permissions  user=${payload.email} role=${payload.role}`);
  res.status(403).json({ error: 'Quotation approval requires Admin or Manager role.' });
  return null;
}
