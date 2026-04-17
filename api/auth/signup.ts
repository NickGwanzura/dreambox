import type { VercelRequest, VercelResponse } from '@vercel/node';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Resend } from 'resend';
import { prisma } from '../../lib/prisma';
import { cors } from '../../lib/auth';
import { validatePassword } from '../../lib/passwordPolicy.js';
import { checkRateLimit } from '../../lib/rateLimiter.js';

const resend = new Resend(process.env.RESEND_API_KEY);
const APP_URL = process.env.APP_URL || 'https://crm.dreamboxadvertising.co.zw';
const FROM = 'Dreambox CRM <noreply@crm.dreamboxadvertising.co.zw>';

const signupSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

function getIp(req: any): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Per-IP rate limit for signup (10 per hour)
  const ip = getIp(req);
  const rateCheck = await checkRateLimit(`signup:ip:${ip}`, { maxAttempts: 10, windowMs: 60 * 60 * 1000 });
  if (!rateCheck.allowed) {
    return res.status(429).json({ error: 'Too many signup attempts. Please try again later.' });
  }

  const parsed = signupSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues.map(e => e.message) });
  }
  const { firstName, lastName, email, password } = parsed.data;

  // Password complexity check
  const pwCheck = validatePassword(password);
  if (!pwCheck.valid) {
    return res.status(400).json({ error: 'Password does not meet requirements', details: pwCheck.errors });
  }

  try {
    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        firstName,
        lastName,
        email: email.toLowerCase().trim(),
        username: email.split('@')[0],
        passwordHash,
        role: 'Staff',
        status: 'Pending',
      },
    });

    // Send pending-approval notification (fire-and-forget — don't block signup)
    resend.emails.send({
      from: FROM,
      to: user.email,
      subject: 'Your Dreambox CRM account is under review',
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
                  Thanks for registering! Your account has been created and is currently
                  <strong style="color:#1e293b;">awaiting administrator approval</strong>.
                  You'll receive another email once your account is activated.
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
    }).catch(err => console.error('[auth/signup] email send failed:', err));

    const { passwordHash: _, ...safeUser } = user;
    return res.status(201).json({ user: safeUser });
  } catch (e: any) {
    console.error('[auth/signup]', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
