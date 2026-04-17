import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { Resend } from 'resend';
import { prisma } from '../../lib/prisma';
import { cors } from '../../lib/auth';

const resend = new Resend(process.env.RESEND_API_KEY);
const APP_URL = process.env.APP_URL || 'https://crm.dreamboxadvertising.co.zw';
const FROM = 'Dreambox CRM <noreply@crm.dreamboxadvertising.co.zw>';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email } = req.body ?? {};
  if (!email) return res.status(400).json({ error: 'Email required' });

  try {
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });

    // Always return success to prevent email enumeration
    if (!user) return res.status(200).json({ message: 'If that email exists, a reset link has been sent' });

    // Invalidate old tokens
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, used: false },
      data: { used: true },
    });

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

    await prisma.passwordResetToken.create({
      data: { userId: user.id, token, expiresAt },
    });

    const resetUrl = `${APP_URL}/auth/callback?type=reset&token=${token}`;

    await resend.emails.send({
      from: FROM,
      to: user.email,
      subject: 'Reset your Dreambox CRM password',
      html: `
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
                <tr><td style="color:#1e293b;font-size:16px;line-height:1.6;padding-bottom:16px;">
                  Hi ${user.firstName},
                </td></tr>
                <tr><td style="color:#64748b;font-size:14px;line-height:1.6;padding-bottom:32px;">
                  We received a request to reset your password. Click the button below to create a new one.
                  This link expires in <strong style="color:#1e293b;">1 hour</strong>.
                </td></tr>
                <tr><td align="center" style="padding-bottom:32px;">
                  <a href="${resetUrl}"
                    style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;">
                    Reset Password
                  </a>
                </td></tr>
                <tr><td style="color:#94a3b8;font-size:12px;line-height:1.6;border-top:1px solid #e2e8f0;padding-top:24px;">
                  If you didn't request this, you can safely ignore this email.<br>
                  Or copy this link: <a href="${resetUrl}" style="color:#6366f1;">${resetUrl}</a>
                </td></tr>
              </table>
            </td></tr>
          </table>
        </body>
        </html>
      `,
    });

    return res.status(200).json({ message: 'If that email exists, a reset link has been sent' });
  } catch (e: any) {
    console.error('[auth/reset-password]', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
