import type { HttpRequest, HttpResponse } from '../../../lib/http';
import { z } from 'zod';
import { prisma } from '../../../lib/prisma';
import { requireAuth, cors } from '../../../lib/auth';
import { verifyTotp } from '../../../lib/totp.js';
import { log } from '../../../lib/serverLogger.js';

const disableSchema = z.object({
  code: z.string().min(1, 'Verification code is required'),
});

/** POST /api/auth/two-factor/disable — a valid TOTP code is required to turn 2FA off. */
export default async function handler(req: HttpRequest, res: HttpResponse) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const payload = await requireAuth(req, res);
  if (!payload) return;

  const parsed = disableSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Validation failed',
      details: parsed.error.issues.map(i => i.message),
    });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      return res.status(400).json({ error: 'Two-factor authentication is not enabled.' });
    }
    if (!verifyTotp(user.twoFactorSecret, parsed.data.code)) {
      log.warn(`2FA disable failed — invalid code  user=${user.email}`);
      return res.status(400).json({ error: 'Invalid verification code.' });
    }

    // Revoke any sessions that were established under 2FA so they can't outlive
    // the downgrade.
    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: false, twoFactorSecret: null, sessionVersion: { increment: 1 } },
    });
    log.info(`2FA disabled  user=${user.email}`);
    return res.status(200).json({ disabled: true });
  } catch (e: any) {
    log.error('[auth/two-factor/disable]', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
