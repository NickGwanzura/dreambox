import { randomUUID } from 'node:crypto';
import { prisma } from './prisma.js';
import { getClientIp } from './clientIp.js';
import { log } from './serverLogger.js';

export async function recordMutationAudit(
  req: any,
  payload: { userId: string; email: string },
  action: string,
  tableName: string,
  recordId: string,
  details: string,
): Promise<void> {
  const audit = (prisma as any).auditLog;
  if (!audit?.create) return;
  await audit.create({
    data: {
      action,
      details,
      userId: payload.userId,
      userEmail: payload.email,
      tableName,
      recordId,
      requestId: String(req.headers?.['x-request-id'] || randomUUID()),
      ipAddress: getClientIp(req) || null,
      userAgent: String(req.headers?.['user-agent'] || '').slice(0, 500) || null,
      source: 'SERVER',
    },
  }).catch((error: any) => log.warn(`[audit] ${action} failed: ${error?.message}`));
}
