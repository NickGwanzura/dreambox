import jwt from 'jsonwebtoken';
import type { HttpRequest, HttpResponse } from './http';
import { log } from './serverLogger.js';
import { prisma } from './prisma.js';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is not set. Cannot start the application.');
}

const SESSION_COOKIE = 'db_session';

function cookieOptions(maxAgeSeconds: number): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=; Max-Age=${maxAgeSeconds}; Path=/; HttpOnly; SameSite=Lax${secure}`;
}

/** Issue a server-managed session cookie while retaining the Authorization
 * header for existing clients and offline-first compatibility. */
export function setSessionCookie(res: HttpResponse, token: string): void {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(token)}; Max-Age=86400; Path=/; HttpOnly; SameSite=Lax${secure}`);
}

export function clearSessionCookie(res: HttpResponse): void {
  res.setHeader('Set-Cookie', cookieOptions(0));
}

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  status: string;
  sessionVersion: number;
}

export function signToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET as string, { expiresIn: '24h' });
}

/**
 * Strip secrets from a user object before it is serialized to the client.
 * Only setup.ts is allowed to reveal the TOTP secret — every other endpoint
 * (me, signin, verify, …) must go through this so it never leaks.
 */
export function toSafeUser<T extends { passwordHash?: string; twoFactorSecret?: string | null }>(user: T): Omit<T, 'passwordHash' | 'twoFactorSecret'> {
  const { passwordHash: _, twoFactorSecret: __, ...safe } = user;
  return safe;
}

/**
 * Short-lived single-purpose token that proves the password half of a
 * two-factor signin. Exchanged for a real session token in
 * api/auth/two-factor/verify.ts — never usable as a session itself.
 */
export function signTwoFactorToken(userId: string, email: string): string {
  return jwt.sign({ userId, email, purpose: 'twofactor' }, JWT_SECRET as string, {
    expiresIn: '10m',
  });
}

export function verifyTwoFactorToken(token: string): { userId: string; email: string } | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET as string) as {
      userId?: string;
      email?: string;
      purpose?: string;
    };
    if (!payload.userId || payload.purpose !== 'twofactor') return null;
    return { userId: payload.userId, email: payload.email ?? '' };
  } catch {
    return null;
  }
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET as string) as JWTPayload;
  } catch {
    return null;
  }
}

export function getTokenFromRequest(req: HttpRequest): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  const cookieHeader = req.headers.cookie;
  const match = cookieHeader?.split(';')?.map(part => part.trim()).find(part => part.startsWith(`${SESSION_COOKIE}=`));
  if (match) {
    const value = match.slice(SESSION_COOKIE.length + 1);
    try { return decodeURIComponent(value); } catch { return null; }
  }
  return null;
}

async function getFreshUserState(userId: string): Promise<{ role: string; status: string; sessionVersion: number } | null> {
  // Password resets must revoke sessions immediately across all instances, so
  // this state cannot be served from a process-local cache.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, status: true, sessionVersion: true },
  });
  if (!user) {
    return null;
  }
  return { role: user.role, status: user.status, sessionVersion: user.sessionVersion };
}

/** Drop a user's cached role/status so permission changes apply immediately. */
export function invalidateUserCache(_userId: string): void {
  // Retained as a no-op for callers. Authentication state is read directly
  // from the database so changes apply immediately across all instances.
}

/**
 * Middleware: extract and verify JWT, then re-check the user's current
 * role/status in the DB. Returns the payload or sends 401/403.
 */
export async function requireAuth(
  req: HttpRequest,
  res: HttpResponse
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
  let fresh: Awaited<ReturnType<typeof getFreshUserState>>;
  try {
    fresh = await getFreshUserState(payload.userId);
  } catch (e: any) {
    // Role, account status, and session version are security-critical state.
    // Never authorize privileged work from stale JWT claims when that lookup
    // cannot be completed.
    log.warn(`Auth DB check failed; rejecting request: ${e?.message}`);
    res.status(503).json({ error: 'Authentication service unavailable' });
    return null;
  }
  if (!fresh) {
    log.warn(`Auth rejected — user no longer exists  user=${payload.email}`);
    res.status(401).json({ error: 'Account not found' });
    return null;
  }
  payload.role = fresh.role;
  payload.status = fresh.status;
  if (payload.sessionVersion !== fresh.sessionVersion) {
    log.warn(`Auth rejected — session revoked  user=${payload.email}`);
    res.status(401).json({ error: 'Session expired. Please sign in again.' });
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
  if (payload.status === 'Inactive') {
    log.warn(`Auth rejected — account inactive  user=${payload.email}`);
    res.status(403).json({ error: 'Account has been deactivated. Contact your administrator.' });
    return null;
  }
  log.debug(`Auth OK  user=${payload.email}  role=${payload.role}`);
  return payload;
}

export async function requireAdmin(
  req: HttpRequest,
  res: HttpResponse
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

export function cors(res: HttpResponse, req?: HttpRequest): void {
  const origin = req?.headers?.origin;
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  res.setHeader('Access-Control-Allow-Origin', allowed);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Vary', 'Origin');
}

export async function requireManagerOrAdmin(
  req: HttpRequest,
  res: HttpResponse
): Promise<JWTPayload | null> {
  const payload = await requireAuth(req, res);
  if (!payload) return null;
  if (payload.role !== 'Admin' && payload.role !== 'Manager') {
    res.status(403).json({ error: 'Admin or Manager access required' });
    return null;
  }
  return payload;
}

export async function requireFeatureWrite(
  req: HttpRequest,
  res: HttpResponse,
  feature: 'invoices' | 'expenses',
): Promise<JWTPayload | null> {
  const payload = await requireAuth(req, res);
  if (!payload) return null;
  if (payload.role === 'Admin' || payload.role === 'Manager') return payload;

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { permissions: true },
  });
  const permissions = user?.permissions as Record<string, unknown> | null;
  if (permissions?.[feature] === 'write') return payload;

  log.warn(`Finance write rejected — user=${payload.email} role=${payload.role} feature=${feature}`);
  res.status(403).json({ error: `${feature === 'invoices' ? 'Invoice' : 'Expense'} write permission required.` });
  return null;
}

export async function requireFeatureRead(
  req: HttpRequest,
  res: HttpResponse,
  feature: 'invoices' | 'expenses',
): Promise<JWTPayload | null> {
  const payload = await requireAuth(req, res);
  if (!payload) return null;
  if (payload.role === 'Admin' || payload.role === 'Manager') return payload;
  const user = await prisma.user.findUnique({ where: { id: payload.userId }, select: { permissions: true } });
  const permissions = user?.permissions as Record<string, unknown> | null;
  if (permissions?.[feature] !== 'none') return payload;
  res.status(403).json({ error: `${feature === 'invoices' ? 'Invoice' : 'Expense'} read permission required.` });
  return null;
}

export const SYSTEM_ADMIN_EMAIL = (process.env.SYSTEM_ADMIN_EMAIL || '').toLowerCase();

export function isSystemAdmin(email: string | null | undefined): boolean {
  return !!SYSTEM_ADMIN_EMAIL && email?.trim()?.toLowerCase() === SYSTEM_ADMIN_EMAIL;
}

export async function requireDeletePermission(
  req: HttpRequest,
  res: HttpResponse
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
  req: HttpRequest,
  res: HttpResponse
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
  req: HttpRequest,
  res: HttpResponse
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
