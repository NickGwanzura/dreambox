import 'dotenv/config';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Resend } from 'resend';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
const resend = new Resend(process.env.RESEND_API_KEY!);

const APP_URL = process.env.APP_URL || 'https://crm.dreamboxadvertising.co.zw';
const FROM = 'Dreambox CRM <noreply@crm.dreamboxadvertising.co.zw>';

async function main() {
  const email = 'panamuze@gmail.com';
  const firstName = 'Panashe';

  // Check if already exists
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`User already exists: ${existing.firstName} ${existing.lastName} (${existing.status})`);
    await prisma.$disconnect();
    return;
  }

  // Generate temp password
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const special = '!@#$%';
  const all = upper + lower + digits + special;
  const tempPassword = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    special[Math.floor(Math.random() * special.length)],
    ...Array.from({ length: 8 }, () => all[Math.floor(Math.random() * all.length)]),
  ].sort(() => Math.random() - 0.5).join('');

  const passwordHash = await bcrypt.hash(tempPassword, 12);

  const user = await prisma.user.create({
    data: {
      firstName,
      lastName: 'Muze',
      email,
      username: 'panamuze',
      passwordHash,
      role: 'Staff',
      status: 'Active',
      mustResetPassword: true,
    },
  });

  console.log(`Created user: ${user.firstName} ${user.lastName} (${user.email}) — role: ${user.role}`);
  console.log(`Temp password: ${tempPassword}`);

  // Also create a reset token so they can use the reset link
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

  await prisma.passwordResetToken.create({
    data: { userId: user.id, token, expiresAt },
  });

  const resetUrl = `${APP_URL}/auth/callback?type=reset&token=${token}`;

  // Send welcome + reset email
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: 'Welcome to Dreambox CRM — Set Your Password',
    html: `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;padding:40px 0;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#12121a;border-radius:16px;border:1px solid rgba(255,255,255,0.06);padding:40px;">
        <tr><td align="center" style="padding-bottom:24px;">
          <span style="font-size:24px;font-weight:700;color:#fff;">Dreambox</span>
          <span style="font-size:24px;font-weight:300;color:#6366f1;"> CRM</span>
        </td></tr>
        <tr><td style="color:#e2e8f0;font-size:16px;line-height:1.6;padding-bottom:16px;">Hi ${firstName},</td></tr>
        <tr><td style="color:#94a3b8;font-size:14px;line-height:1.6;padding-bottom:24px;">
          Welcome to <strong style="color:#e2e8f0;">Dreambox CRM</strong>! Your account has been created.
          Click the button below to set your password and get started.
        </td></tr>
        <tr><td align="center" style="padding-bottom:32px;">
          <a href="${resetUrl}"
            style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;">
            Set Your Password
          </a>
        </td></tr>
        <tr><td style="color:#475569;font-size:12px;line-height:1.6;border-top:1px solid rgba(255,255,255,0.06);padding-top:24px;">
          This link expires in <strong>1 hour</strong>. If it expires, ask an admin to send a new reset.<br>
          Or copy this link: <a href="${resetUrl}" style="color:#6366f1;">${resetUrl}</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });

  console.log(`Welcome email sent to ${email}`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
