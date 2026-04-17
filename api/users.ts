import type { VercelRequest, VercelResponse } from '@vercel/node';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { Resend } from 'resend';
import { prisma } from '../lib/prisma';
import { requireAuth, requireAdmin, cors } from '../lib/auth';
import { validatePassword } from '../lib/passwordPolicy.js';

const APP_URL = process.env.APP_URL || 'https://crm.dreamboxadvertising.co.zw';
const FROM = 'Dreambox CRM <noreply@crm.dreamboxadvertising.co.zw>';
const resend = new Resend(process.env.RESEND_API_KEY);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const USER_SELECT = {
  id: true, firstName: true, lastName: true, email: true,
  username: true, role: true, status: true, mustResetPassword: true,
  lastLoginAt: true, lastLoginIp: true, permissions: true, createdAt: true,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const payload = requireAuth(req, res);
  if (!payload) return;

  // ----------------------------------------------------------------
  // GET /api/users — list all users (Admin only)
  // GET /api/users?loginHistory=userId — login history for a user
  // ----------------------------------------------------------------
  if (req.method === 'GET') {
    const admin = requireAdmin(req, res);
    if (!admin) return;

    const { loginHistory } = req.query;

    // Return login history for a specific user
    if (loginHistory) {
      try {
        const history = await prisma.loginHistory.findMany({
          where: { userId: loginHistory as string },
          orderBy: { createdAt: 'desc' },
          take: 100,
          select: { id: true, ip: true, userAgent: true, success: true, reason: true, createdAt: true },
        });
        return res.status(200).json(history);
      } catch (e: any) {
        console.error('[users GET loginHistory]', e);
        return res.status(500).json({ error: 'Internal server error' });
      }
    }

    try {
      const users = await prisma.user.findMany({
        orderBy: { createdAt: 'asc' },
        select: USER_SELECT,
      });
      return res.status(200).json(users);
    } catch (e: any) {
      console.error('[users GET]', e);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // ----------------------------------------------------------------
  // POST /api/users — create user (Admin only)
  // POST /api/users?action=bulkInvite — bulk invite (Admin only)
  // ----------------------------------------------------------------
  if (req.method === 'POST') {
    const admin = requireAdmin(req, res);
    if (!admin) return;

    // Bulk invite
    if (req.query.action === 'bulkInvite') {
      const { invites } = req.body ?? {};
      if (!Array.isArray(invites) || invites.length === 0) {
        return res.status(400).json({ error: 'invites array required' });
      }

      const bulkSchema = z.object({
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        email: z.string().email(),
        role: z.enum(['Admin', 'Manager', 'Staff', 'Sales Agent']),
      });

      const results: { email: string; status: 'created' | 'exists' | 'error'; tempPassword?: string }[] = [];

      for (const invite of invites) {
        const parsed = bulkSchema.safeParse(invite);
        if (!parsed.success) {
          results.push({ email: invite.email ?? 'unknown', status: 'error' });
          continue;
        }
        const { firstName, lastName, email, role } = parsed.data;

        try {
          const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
          if (existing) {
            results.push({ email, status: 'exists' });
            continue;
          }

          const tempPassword = generateTempPassword();
          const passwordHash = await bcrypt.hash(tempPassword, 12);

          await prisma.user.create({
            data: {
              firstName, lastName,
              email: email.toLowerCase().trim(),
              username: email.split('@')[0],
              passwordHash,
              role: role as any,
              status: 'Active',
              mustResetPassword: true,
            },
          });

          // Send invite email (fire-and-forget)
          resend.emails.send({
            from: FROM,
            to: email,
            subject: `You've been invited to Dreambox CRM`,
            html: buildInviteEmail(firstName, tempPassword),
          }).catch(err => console.error('[users bulkInvite] email failed:', err));

          results.push({ email, status: 'created', tempPassword });
        } catch {
          results.push({ email, status: 'error' });
        }
      }

      return res.status(200).json({ results });
    }

    // Admin-triggered password reset for a specific user
    if (req.query.action === 'adminReset') {
      const { userId } = req.body ?? {};
      if (!userId || !UUID_RE.test(userId)) {
        return res.status(400).json({ error: 'Valid userId required' });
      }

      try {
        const targetUser = await prisma.user.findUnique({ where: { id: userId } });
        if (!targetUser) return res.status(404).json({ error: 'User not found' });

        // Invalidate old tokens
        await prisma.passwordResetToken.updateMany({
          where: { userId: targetUser.id, used: false },
          data: { used: true },
        });

        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

        await prisma.passwordResetToken.create({
          data: { userId: targetUser.id, token, expiresAt },
        });

        await prisma.user.update({
          where: { id: targetUser.id },
          data: { mustResetPassword: true },
        });

        const resetUrl = `${APP_URL}/auth/callback?type=reset&token=${token}`;

        await resend.emails.send({
          from: FROM,
          to: targetUser.email,
          subject: 'Reset your Dreambox CRM password',
          html: buildResetEmail(targetUser.firstName, resetUrl),
        });

        return res.status(200).json({ message: `Password reset email sent to ${targetUser.email}` });
      } catch (e: any) {
        console.error('[users POST adminReset]', e);
        return res.status(500).json({ error: 'Failed to send reset email' });
      }
    }

    // Single user create
    const { firstName, lastName, email, role, password } = req.body ?? {};
    if (!firstName || !lastName || !email || !role) {
      return res.status(400).json({ error: 'firstName, lastName, email, role required' });
    }

    // Validate provided password if given
    if (password) {
      const pwCheck = validatePassword(password);
      if (!pwCheck.valid) {
        return res.status(400).json({ error: 'Password does not meet requirements', details: pwCheck.errors });
      }
    }

    try {
      const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
      if (existing) return res.status(409).json({ error: 'Email already registered' });

      const tempPassword = password || generateTempPassword();
      const passwordHash = await bcrypt.hash(tempPassword, 12);

      const user = await prisma.user.create({
        data: {
          firstName, lastName,
          email: email.toLowerCase().trim(),
          username: email.split('@')[0],
          passwordHash,
          role,
          status: 'Active',
          mustResetPassword: !password,
        },
        select: USER_SELECT,
      });

      if (!password) {
        resend.emails.send({
          from: FROM,
          to: email,
          subject: `You've been added to Dreambox CRM`,
          html: buildInviteEmail(firstName, tempPassword),
        }).catch(err => console.error('[users POST] email failed:', err));
      }

      return res.status(201).json({ user, tempPassword: !password ? tempPassword : undefined });
    } catch (e: any) {
      console.error('[users POST]', e);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // ----------------------------------------------------------------
  // PUT /api/users?id=... — update user
  // Admins can change role, status (incl. Inactive), permissions
  // ----------------------------------------------------------------
  if (req.method === 'PUT') {
    const { id } = req.query;
    if (!id || !UUID_RE.test(id as string)) return res.status(400).json({ error: 'Valid id required' });

    // Non-admins can only update themselves (name/email only)
    if (payload.role !== 'Admin' && payload.userId !== id) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { firstName, lastName, email, role, status, permissions, unlockAccount } = req.body ?? {};

    try {
      // Check email uniqueness if changing email
      if (email) {
        const normalised = email.toLowerCase().trim();
        const existing = await prisma.user.findUnique({ where: { email: normalised } });
        if (existing && existing.id !== id) {
          return res.status(409).json({ error: 'Email already in use by another account' });
        }
      }

      const updateData: any = {};
      if (firstName) updateData.firstName = firstName;
      if (lastName) updateData.lastName = lastName;
      if (email) updateData.email = email.toLowerCase().trim();

      if (payload.role === 'Admin') {
        // Prevent demoting or deactivating the last admin
        const isRemovingAdmin = (role && role !== 'Admin') || (status && status !== 'Active');
        if (isRemovingAdmin) {
          const target = await prisma.user.findUnique({ where: { id: id as string } });
          if (target?.role === 'Admin') {
            const adminCount = await prisma.user.count({ where: { role: 'Admin', status: 'Active' } });
            if (adminCount <= 1) {
              return res.status(400).json({ error: 'Cannot demote or deactivate the last admin account' });
            }
          }
        }

        if (role) updateData.role = role;
        if (status) updateData.status = status;
        if (permissions !== undefined) updateData.permissions = permissions;
        // Admin can manually unlock a locked account
        if (unlockAccount) {
          updateData.failedLoginAttempts = 0;
          updateData.lockedUntil = null;
        }
      }

      const updated = await prisma.user.update({
        where: { id: id as string },
        data: updateData,
        select: USER_SELECT,
      });
      return res.status(200).json(updated);
    } catch (e: any) {
      console.error('[users PUT]', e);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // ----------------------------------------------------------------
  // DELETE /api/users?id=... — delete user (Admin only)
  // ----------------------------------------------------------------
  if (req.method === 'DELETE') {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const { id } = req.query;
    if (!id || !UUID_RE.test(id as string)) return res.status(400).json({ error: 'Valid id required' });

    // Prevent self-deletion
    if (payload.userId === id) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }

    try {
      // Prevent deleting the last admin
      const target = await prisma.user.findUnique({ where: { id: id as string } });
      if (target?.role === 'Admin') {
        const adminCount = await prisma.user.count({ where: { role: 'Admin', status: 'Active' } });
        if (adminCount <= 1) {
          return res.status(400).json({ error: 'Cannot delete the last admin account' });
        }
      }

      await prisma.user.delete({ where: { id: id as string } });
      return res.status(200).json({ success: true });
    } catch (e: any) {
      console.error('[users DELETE]', e);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  // Ensure it meets complexity requirements
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const special = '!@#$%';
  const all = chars;
  const base = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    special[Math.floor(Math.random() * special.length)],
    ...Array.from({ length: 8 }, () => all[Math.floor(Math.random() * all.length)]),
  ];
  return base.sort(() => Math.random() - 0.5).join('');
}

function buildResetEmail(firstName: string, resetUrl: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <body style="margin:0;padding:0;background:#ffffff;font-family:sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:40px 0;">
        <tr><td align="center">
          <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;padding:40px;">
            <tr><td align="center" style="padding-bottom:24px;">
              <span style="font-size:24px;font-weight:700;color:#1e293b;">Dreambox</span>
              <span style="font-size:24px;font-weight:300;color:#6366f1;"> CRM</span>
            </td></tr>
            <tr><td style="color:#1e293b;font-size:16px;line-height:1.6;padding-bottom:16px;">Hi ${firstName},</td></tr>
            <tr><td style="color:#64748b;font-size:14px;line-height:1.6;padding-bottom:24px;">
              An administrator has requested a password reset for your account.
              Click the button below to create a new password. This link expires in <strong style="color:#1e293b;">1 hour</strong>.
            </td></tr>
            <tr><td align="center" style="padding-bottom:32px;">
              <a href="${resetUrl}"
                style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;">
                Reset Password
              </a>
            </td></tr>
            <tr><td style="color:#94a3b8;font-size:12px;line-height:1.6;border-top:1px solid #e2e8f0;padding-top:24px;">
              If you did not expect this, please contact your administrator.<br>
              Or copy this link: <a href="${resetUrl}" style="color:#6366f1;">${resetUrl}</a>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </body>
    </html>
  `;
}

function buildInviteEmail(firstName: string, tempPassword: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <body style="margin:0;padding:0;background:#ffffff;font-family:sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:40px 0;">
        <tr><td align="center">
          <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;padding:40px;">
            <tr><td align="center" style="padding-bottom:24px;">
              <span style="font-size:24px;font-weight:700;color:#1e293b;">Dreambox</span>
              <span style="font-size:24px;font-weight:300;color:#6366f1;"> CRM</span>
            </td></tr>
            <tr><td style="color:#1e293b;font-size:16px;line-height:1.6;padding-bottom:16px;">Hi ${firstName},</td></tr>
            <tr><td style="color:#64748b;font-size:14px;line-height:1.6;padding-bottom:24px;">
              You have been added to <strong style="color:#1e293b;">Dreambox CRM</strong>.
              Use the temporary password below to sign in. You will be asked to change it on first login.
            </td></tr>
            <tr><td align="center" style="padding-bottom:24px;">
              <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px 32px;font-family:monospace;font-size:18px;color:#4f46e5;letter-spacing:2px;">
                ${tempPassword}
              </div>
            </td></tr>
            <tr><td align="center" style="padding-bottom:32px;">
              <a href="${APP_URL}"
                style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;">
                Sign In to Dreambox CRM
              </a>
            </td></tr>
            <tr><td style="color:#94a3b8;font-size:12px;line-height:1.6;border-top:1px solid #e2e8f0;padding-top:24px;">
              If you did not expect this invitation, please ignore this email.
            </td></tr>
          </table>
        </td></tr>
      </table>
    </body>
    </html>
  `;
}
