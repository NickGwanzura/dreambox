import type { HttpRequest, HttpResponse } from '../../lib/http';
import crypto from 'crypto';
import { Resend } from 'resend';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { cors } from '../../lib/auth';
import { getClientIp } from '../../lib/clientIp';
import { checkRateLimit } from '../../lib/rateLimiter.js';
import { escapeHtml } from '../../lib/htmlEscape.js';
import { log } from '../../lib/serverLogger.js';

const resend = new Resend(process.env.RESEND_API_KEY);
const APP_URL = process.env.APP_URL || 'https://dreamboxadvertising.co.zw';
const FROM = 'Dreambox CRM <noreply@dreamboxadvertising.co.zw>';
const GENERIC_MESSAGE = 'If that email exists, a reset link has been sent';
const resetSchema = z.object({ email: z.string().trim().email() });

function hashResetToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export default async function handler(req: HttpRequest, res: HttpResponse) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const parsed = resetSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: 'A valid email is required' });
  const email = parsed.data.email.toLowerCase();

  const [ipCheck, emailCheck] = await Promise.all([
    checkRateLimit(`password-reset:ip:${getClientIp(req)}`, { maxAttempts: 10, windowMs: 15 * 60 * 1000 }),
    checkRateLimit(`password-reset:email:${email}`, { maxAttempts: 3, windowMs: 60 * 60 * 1000 }),
  ]);
  if (!ipCheck.allowed || !emailCheck.allowed) {
    const retryAfterMs = Math.max(ipCheck.retryAfterMs ?? 0, emailCheck.retryAfterMs ?? 0);
    res.setHeader('Retry-After', String(Math.ceil(retryAfterMs / 1000)));
    return res.status(429).json({ error: 'Too many reset requests. Please try again later.' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });

    // Always return success to prevent email enumeration.
    if (!user) return res.status(200).json({ message: GENERIC_MESSAGE });

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    // A transaction prevents a concurrent request from leaving multiple active
    // reset tokens for the same account.
    await prisma.$transaction([
      prisma.passwordResetToken.updateMany({
        where: { userId: user.id, used: false },
        data: { used: true },
      }),
      prisma.passwordResetToken.create({
        data: { userId: user.id, token: hashResetToken(token), expiresAt },
      }),
    ]);

    const resetUrl = `${APP_URL}/auth/callback?type=reset&token=${token}`;
    const sent = await resend.emails.send({
      from: FROM,
      to: user.email,
      subject: 'Reset your Dreambox CRM password',
      html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#ffffff;font-family:sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:40px 0;"><tr><td align="center"><table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;padding:40px;"><tr><td style="color:#1e293b;font-size:16px;line-height:1.6;padding-bottom:16px;">Hi ${escapeHtml(user.firstName)},</td></tr><tr><td style="color:#64748b;font-size:14px;line-height:1.6;padding-bottom:32px;">We received a request to reset your password. This link expires in <strong style="color:#1e293b;">1 hour</strong>.</td></tr><tr><td align="center" style="padding-bottom:32px;"><a href="${resetUrl}" style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;">Reset Password</a></td></tr><tr><td style="color:#94a3b8;font-size:12px;line-height:1.6;border-top:1px solid #e2e8f0;padding-top:24px;">If you didn't request this, you can safely ignore this email.</td></tr></table></td></tr></table></body></html>`,
    });
    if (sent.error) {
      log.error(`[auth/reset-password] email delivery failed: ${sent.error.message}`);
      return res.status(502).json({ error: 'Unable to send reset email. Please try again later.' });
    }

    await prisma.auditLog.create({
      data: { action: 'Auth: Password Reset Requested', details: 'Password reset email requested', userId: user.id, userEmail: user.email, tableName: 'users', recordId: user.id },
    }).catch((auditError: any) => log.warn(`[auth/reset-password] audit log write failed: ${auditError?.message}`));

    return res.status(200).json({ message: GENERIC_MESSAGE });
  } catch (e: any) {
    log.error('[auth/reset-password]', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
