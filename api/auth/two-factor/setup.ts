import type { HttpRequest, HttpResponse } from '../../../lib/http';
import { prisma } from '../../../lib/prisma';
import { requireAuth, cors } from '../../../lib/auth';
import { generateTotpSecret, buildOtpAuthUrl } from '../../../lib/totp.js';
import { log } from '../../../lib/serverLogger.js';

/**
 * POST /api/auth/two-factor/setup
 * Generates (or reuses) a TOTP secret and stores it on the account.
 * Two-factor is NOT enabled until the user confirms with enable.
 * Pass { regenerate: true } to replace an existing un-enabled secret.
 */
export default async function handler(req: HttpRequest, res: HttpResponse) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const payload = await requireAuth(req, res);
  if (!payload) return;

  try {
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.twoFactorEnabled) {
      return res.status(400).json({ error: 'Two-factor authentication is already enabled.' });
    }

    const regenerate = (req.body ?? {}).regenerate === true;
    const secret = !user.twoFactorSecret || regenerate
      ? generateTotpSecret()
      : user.twoFactorSecret;

    // Persist the secret now so a lost setup page doesn't orphan the scan.
    if (secret !== user.twoFactorSecret) {
      await prisma.user.update({
        where: { id: user.id },
        data: { twoFactorSecret: secret },
      });
    }

    log.info(`2FA setup secret generated  user=${user.email}`);
    return res.status(200).json({
      secret,
      otpauthUrl: buildOtpAuthUrl(secret, user.email),
    });
  } catch (e: any) {
    log.error('[auth/two-factor/setup]', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
