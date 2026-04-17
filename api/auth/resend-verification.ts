import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Resend } from 'resend';
import { prisma } from '../../lib/prisma';
import { cors } from '../../lib/auth';

const resend = new Resend(process.env.RESEND_API_KEY);
const APP_URL = process.env.APP_URL || 'https://crm.dreamboxadvertising.co.zw';
const FROM = 'Dreambox CRM <noreply@crm.dreamboxadvertising.co.zw>';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email } = req.body ?? {};
  if (!email) return res.status(400).json({ error: 'Email required' });

  try {
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });

    // Always return success to prevent email enumeration
    if (!user || user.status !== 'Pending') {
      return res.status(200).json({ message: 'If your account is pending approval, a reminder has been sent' });
    }

    await resend.emails.send({
      from: FROM,
      to: user.email,
      subject: 'Your Dreambox CRM account is still under review',
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
                  Your account is still <strong style="color:#1e293b;">awaiting administrator approval</strong>.
                  Once an admin reviews your request, you'll be able to log in.
                  If you need urgent access, please contact
                  <a href="mailto:admin@dreamboxadvertising.co.zw" style="color:#6366f1;">admin@dreamboxadvertising.co.zw</a>.
                </td></tr>
                <tr><td align="center" style="padding-bottom:32px;">
                  <a href="${APP_URL}"
                    style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;">
                    Visit Dreambox CRM
                  </a>
                </td></tr>
                <tr><td style="color:#94a3b8;font-size:12px;line-height:1.6;border-top:1px solid #e2e8f0;padding-top:24px;">
                  If you didn't create this account, you can safely ignore this email.
                </td></tr>
              </table>
            </td></tr>
          </table>
        </body>
        </html>
      `,
    });

    return res.status(200).json({ message: 'If your account is pending approval, a reminder has been sent' });
  } catch (e: any) {
    console.error('[auth/resend-verification]', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
