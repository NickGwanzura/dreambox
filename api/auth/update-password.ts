import type { HttpRequest, HttpResponse } from '../../lib/http';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '../../lib/prisma';
import { requireAuth, signToken, cors, setSessionCookie } from '../../lib/auth';
import { validatePassword } from '../../lib/passwordPolicy.js';
import { log } from '../../lib/serverLogger.js';

export default async function handler(req: HttpRequest, res: HttpResponse) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { token, newPassword, currentPassword } = req.body ?? {};

  if (typeof newPassword !== 'string') return res.status(400).json({ error: 'newPassword is required' });
  const pwCheck = validatePassword(newPassword);
  if (!pwCheck.valid) {
    return res.status(400).json({ error: 'Password does not meet requirements', details: pwCheck.errors });
  }

  try {
    // Path 1: reset via token (unauthenticated)
    if (token) {
      if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) {
        return res.status(400).json({ error: 'Invalid or expired reset token' });
      }
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const passwordHash = await bcrypt.hash(newPassword, 12);
      const resetToken = await prisma.$transaction(async (tx) => {
        const candidate = await tx.passwordResetToken.findUnique({ where: { token: tokenHash } });
        if (!candidate) return null;
        const consumed = await tx.passwordResetToken.updateMany({
          where: { token: tokenHash, used: false, expiresAt: { gt: new Date() } },
          data: { used: true },
        });
        if (consumed.count !== 1) return null;
        await tx.user.update({
          where: { id: candidate.userId },
          data: { passwordHash, mustResetPassword: false, sessionVersion: { increment: 1 } },
        });
        return candidate;
      });
      if (!resetToken) return res.status(400).json({ error: 'Invalid or expired reset token' });

      await prisma.auditLog.create({
        data: { action: 'Auth: Password Reset Completed', details: 'Password reset completed using email token', userId: resetToken.userId, tableName: 'users', recordId: resetToken.userId },
      }).catch((auditError: any) => log.warn(`[auth/update-password] audit log write failed: ${auditError?.message}`));

      return res.status(200).json({ message: 'Password updated successfully' });
    }

    // Path 2: change password while authenticated
    const payload = await requireAuth(req, res);
    if (!payload) return;

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // If user has mustResetPassword flag, allow reset without currentPassword
    if (!user.mustResetPassword) {
      if (!currentPassword) {
        return res.status(400).json({ error: 'currentPassword and newPassword required' });
      }
      const valid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, mustResetPassword: false, sessionVersion: { increment: 1 } },
    });

    const newToken = signToken({ userId: updated.id, email: updated.email, role: updated.role, status: updated.status, sessionVersion: updated.sessionVersion });
    setSessionCookie(res, newToken);
    return res.status(200).json({ message: 'Password updated successfully', token: newToken });
  } catch (e: any) {
    log.error('[auth/update-password]', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
