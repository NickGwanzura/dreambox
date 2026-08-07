import type { HttpRequest, HttpResponse } from '../../../lib/http';
import { z } from 'zod';
import { prisma } from '../../../lib/prisma';
import { requireAuth, cors } from '../../../lib/auth';
import { verifyTotp } from '../../../lib/totp.js';
import { log } from '../../../lib/serverLogger.js';

const enableSchema = z.object({
  code: z.string().min(1, 'Verification code is required'),
});

/** POST /api/auth/two-factor/enable — verify the code, then activate 2FA. */
export default async function handler(req: HttpRequest, res: HttpResponse) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const payload = await requireAuth(req, res);
  if (!payload) return;

  const parsed = enableSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Validation failed',
      details: parsed.error.issues.map(i => i.message),
    });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.twoFactorEnabled) {
      return res.status(400).json({ error: 'Two-factor authentication is already enabled.' });
    }
    if (!user.twoFactorSecret) {
      return res.status(400).json({ error: 'Start setup first to generate a secret.' });
    }
    if (!verifyTotp(user.twoFactorSecret, parsed.data.code)) {
      log.warn(`2FA enable failed — invalid code  user=${user.email}`);
      return res.status(400).json({ error: 'Invalid verification code. Check the code in your authenticator app.' });
    }

    // Bump sessionVersion so any session issued before 2FA existed is revoked
    // immediately — the next sign-in must pass the challenge.
    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: true, sessionVersion: { increment: 1 } },
    });
    log.info(`2FA enabled  user=${user.email}`);
    return res.status(200).json({ enabled: true });
  } catch (e: any) {
    log.error('[auth/two-factor/enable]', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
