import type { VercelRequest, VercelResponse } from '@vercel/node';
import bcrypt from 'bcryptjs';
import { prisma } from '../../lib/prisma';
import { requireAuth, signToken, cors } from '../../lib/auth';
import { validatePassword } from '../../lib/passwordPolicy.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { token, newPassword, currentPassword } = req.body ?? {};

  if (!newPassword) return res.status(400).json({ error: 'newPassword is required' });
  const pwCheck = validatePassword(newPassword);
  if (!pwCheck.valid) {
    return res.status(400).json({ error: 'Password does not meet requirements', details: pwCheck.errors });
  }

  try {
    // Path 1: reset via token (unauthenticated)
    if (token) {
      const resetToken = await prisma.passwordResetToken.findUnique({ where: { token } });
      if (!resetToken || resetToken.used || resetToken.expiresAt < new Date()) {
        return res.status(400).json({ error: 'Invalid or expired reset token' });
      }

      const passwordHash = await bcrypt.hash(newPassword, 12);
      await prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash, mustResetPassword: false },
      });
      await prisma.passwordResetToken.update({ where: { token }, data: { used: true } });

      return res.status(200).json({ message: 'Password updated successfully' });
    }

    // Path 2: change password while authenticated
    const payload = requireAuth(req, res);
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
      data: { passwordHash, mustResetPassword: false },
    });

    const newToken = signToken({ userId: updated.id, email: updated.email, role: updated.role, status: updated.status });
    return res.status(200).json({ message: 'Password updated successfully', token: newToken });
  } catch (e: any) {
    console.error('[auth/update-password]', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
