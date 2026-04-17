import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Resend } from 'resend';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
const resend = new Resend(process.env.RESEND_API_KEY!);

const FROM = 'Dreambox CRM <noreply@crm.dreamboxadvertising.co.zw>';
const APP_URL = 'https://crm.dreamboxadvertising.co.zw';

async function main() {
  const users = await prisma.user.findMany({
    where: { status: 'Active' },
    select: { email: true, firstName: true },
  });

  console.log(`Sending resolved notice to ${users.length} users...\n`);

  for (const user of users) {
    try {
      await resend.emails.send({
        from: FROM,
        to: user.email,
        subject: 'Password Reset Issue Resolved — Dreambox CRM',
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
        <tr><td style="color:#e2e8f0;font-size:16px;line-height:1.6;padding-bottom:16px;">
          Hi ${user.firstName},
        </td></tr>
        <tr><td style="color:#94a3b8;font-size:14px;line-height:1.6;padding-bottom:16px;">
          The password reset issue that some users were experiencing has now been <strong style="color:#10b981;">resolved</strong>.
        </td></tr>
        <tr><td style="color:#94a3b8;font-size:14px;line-height:1.6;padding-bottom:24px;">
          You can now log in and reset your password without any issues. If you still have trouble, please contact your administrator.
        </td></tr>
        <tr><td align="center" style="padding-bottom:32px;">
          <a href="${APP_URL}"
            style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;">
            Go to Dreambox CRM
          </a>
        </td></tr>
        <tr><td style="color:#475569;font-size:12px;line-height:1.6;border-top:1px solid rgba(255,255,255,0.06);padding-top:24px;">
          Thank you for your patience.<br>
          — The Dreambox Team
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
      });
      console.log(`[OK] ${user.email}`);
    } catch (err: any) {
      console.error(`[FAIL] ${user.email}: ${err.message}`);
    }
  }

  console.log('\nDone.');
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
