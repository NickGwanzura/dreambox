/**
 * One-time script: send password reset emails to all registered users
 * after the improved password policy changes.
 *
 * Usage:  npx tsx scripts/send-reset-all.ts
 *         npx tsx scripts/send-reset-all.ts --dry-run   (preview without sending)
 */
import 'dotenv/config';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Resend } from 'resend';

const DRY_RUN = process.argv.includes('--dry-run');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
const resend = new Resend(process.env.RESEND_API_KEY!);

const APP_URL = process.env.APP_URL || 'https://crm.dreamboxadvertising.co.zw';
const FROM = 'Dreambox CRM <noreply@crm.dreamboxadvertising.co.zw>';

function buildEmailHtml(firstName: string, resetUrl: string) {
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;padding:40px 0;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#12121a;border-radius:16px;border:1px solid rgba(255,255,255,0.06);padding:40px;">
        <tr><td align="center" style="padding-bottom:24px;">
          <span style="font-size:24px;font-weight:700;color:#fff;">Dreambox</span>
          <span style="font-size:24px;font-weight:300;color:#6366f1;"> CRM</span>
        </td></tr>
        <tr><td style="color:#e2e8f0;font-size:16px;line-height:1.6;padding-bottom:16px;">
          Hi ${firstName},
        </td></tr>
        <tr><td style="color:#94a3b8;font-size:14px;line-height:1.6;padding-bottom:8px;">
          We've upgraded our security and updated the password requirements for all accounts.
          Please reset your password using the link below.
        </td></tr>
        <tr><td style="color:#94a3b8;font-size:13px;line-height:1.6;padding-bottom:24px;">
          <strong style="color:#e2e8f0;">New password requirements:</strong><br/>
          &bull; At least 8 characters<br/>
          &bull; One uppercase letter<br/>
          &bull; One lowercase letter<br/>
          &bull; One number<br/>
          &bull; One special character (!@#$%^&* etc.)
        </td></tr>
        <tr><td align="center" style="padding-bottom:32px;">
          <a href="${resetUrl}"
            style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;">
            Reset Password
          </a>
        </td></tr>
        <tr><td style="color:#475569;font-size:12px;line-height:1.6;border-top:1px solid rgba(255,255,255,0.06);padding-top:24px;">
          This link expires in <strong>1 hour</strong>.<br/>
          Or copy this link: <a href="${resetUrl}" style="color:#6366f1;">${resetUrl}</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN (no emails will be sent) ===' : '=== SENDING RESET EMAILS ===');

  const users = await prisma.user.findMany({
    where: { status: 'Active' },
    select: { id: true, email: true, firstName: true },
  });

  console.log(`Found ${users.length} active user(s)\n`);

  let sent = 0;
  let failed = 0;

  for (const user of users) {
    try {
      // Invalidate existing unused tokens
      await prisma.passwordResetToken.updateMany({
        where: { userId: user.id, used: false },
        data: { used: true },
      });

      // Create new token
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

      await prisma.passwordResetToken.create({
        data: { userId: user.id, token, expiresAt },
      });

      // Flag user to force reset on next login
      await prisma.user.update({
        where: { id: user.id },
        data: { mustResetPassword: true },
      });

      const resetUrl = `${APP_URL}/auth/callback?type=reset&token=${token}`;

      if (DRY_RUN) {
        console.log(`[DRY] Would send to: ${user.email} (${user.firstName})`);
        console.log(`      Reset URL: ${resetUrl}\n`);
      } else {
        await resend.emails.send({
          from: FROM,
          to: user.email,
          subject: 'Action Required: Reset Your Dreambox CRM Password',
          html: buildEmailHtml(user.firstName, resetUrl),
        });
        console.log(`[OK] Sent to: ${user.email}`);
      }

      sent++;
    } catch (err: any) {
      console.error(`[FAIL] ${user.email}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone. Sent: ${sent}, Failed: ${failed}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
