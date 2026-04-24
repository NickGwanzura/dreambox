import 'dotenv/config';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Resend } from 'resend';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const APP_URL = process.env.APP_URL || 'https://crm.dreamboxadvertising.co.zw';
const FROM = 'Dreambox CRM <noreply@crm.dreamboxadvertising.co.zw>';
const USER_ID = 'c5e91a7d-bee0-423c-989a-deda3c1d7f8b';

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

async function main() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY not set in .env');
  }
  const resend = new Resend(process.env.RESEND_API_KEY);

  const user = await prisma.user.findUnique({ where: { id: USER_ID } });
  if (!user) throw new Error(`User ${USER_ID} not found`);

  console.log(`Resetting password for ${user.firstName} ${user.lastName} <${user.email}>`);

  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, used: false },
    data: { used: true },
  });

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

  await prisma.passwordResetToken.create({
    data: { userId: user.id, token, expiresAt },
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { mustResetPassword: true },
  });

  const resetUrl = `${APP_URL}/auth/callback?type=reset&token=${token}`;

  const { data, error } = await resend.emails.send({
    from: FROM,
    to: user.email,
    subject: 'Reset your Dreambox CRM password',
    html: buildResetEmail(user.firstName, resetUrl),
  });

  if (error) {
    console.error('Resend error:', error);
    throw new Error('Email send failed');
  }

  console.log(`Email sent  id=${data?.id}  to=${user.email}`);
  console.log(`Token expires at ${expiresAt.toISOString()}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
