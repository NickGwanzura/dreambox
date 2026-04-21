import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Resend } from 'resend';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
const resend = new Resend(process.env.RESEND_API_KEY!);

const FROM = 'Dreambox CRM <noreply@crm.dreamboxadvertising.co.zw>';
const APP_URL = 'https://crm.dreamboxadvertising.co.zw';

const RECIPIENT_EMAILS = ['rufarod@gmail.com', 'nicholas.gwanzura@outlook.com'];

async function main() {
  const users = await prisma.user.findMany({
    where: { email: { in: RECIPIENT_EMAILS } },
    select: { email: true, firstName: true },
  });

  console.log(`Sending Settings Error fix note to ${users.length} users...\n`);

  for (const user of users) {
    try {
      await resend.emails.send({
        from: FROM,
        to: user.email,
        subject: 'Dreambox CRM — that "Settings Error" is fixed',
        html: `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#ffffff;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:40px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;padding:40px;">
        <tr><td align="center" style="padding-bottom:24px;">
          <span style="font-size:24px;font-weight:700;color:#1e293b;">Dreambox</span>
          <span style="font-size:24px;font-weight:300;color:#6366f1;"> CRM</span>
        </td></tr>

        <tr><td style="color:#1e293b;font-size:16px;line-height:1.6;padding-bottom:12px;">
          Hi ${user.firstName},
        </td></tr>

        <tr><td style="color:#64748b;font-size:14px;line-height:1.6;padding-bottom:20px;">
          If you ever opened <strong style="color:#1e293b;">Settings</strong> (or any other page) and got a red <strong style="color:#1e293b;">&ldquo;Failed to fetch dynamically imported module&rdquo;</strong> error &mdash; that&apos;s been fixed.
        </td></tr>

        <tr><td style="padding-bottom:24px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;padding:20px;">
            <tr><td>
              <p style="font-size:13px;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px 0;">What Was Happening</p>
              <p style="font-size:13px;color:#1e293b;line-height:1.6;margin:0 0 16px 0;">
                Every time we deploy, the CRM&apos;s internal file names change (e.g. <code style="background:#e2e8f0;padding:2px 6px;border-radius:4px;font-size:12px;">Settings-BuDuGa_N.js</code> &rarr; a new hash). If you had the app open in a tab <em>during</em> a deploy, your browser kept looking for the old file name, and the server no longer had it. The result was the red error screen.
              </p>

              <p style="font-size:13px;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px 0;">What&apos;s New</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:8px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>&#10003; The CRM now auto-recovers on its own</strong> &mdash; when it detects a missing file after a deploy, it silently reloads once and picks up the fresh version. You shouldn&apos;t see the red screen again.
                </td></tr>
                <tr><td style="padding:8px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>&#10003; Loop protection built in</strong> &mdash; if the reload itself fails (e.g. a genuinely broken deploy), it won&apos;t keep refreshing forever. You&apos;ll see the error screen so we can catch the real problem instead of the app hiding it.
                </td></tr>
                <tr><td style="padding:8px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>&#10003; Applies to every page, not just Settings</strong> &mdash; Dashboard, Financials, CRM, Payments, Contracts, everything. The same recovery kicks in wherever a page fails to load after a deploy.
                </td></tr>
              </table>
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="color:#64748b;font-size:14px;line-height:1.6;padding-bottom:20px;">
          <strong style="color:#1e293b;">What to do if you see it one more time:</strong> just reload the page (Ctrl/Cmd+R). After that, the auto-recovery takes over and you shouldn&apos;t need to think about it again.
        </td></tr>

        <tr><td style="color:#64748b;font-size:14px;line-height:1.6;padding-bottom:24px;">
          Reply to this email if you hit anything else.
        </td></tr>

        <tr><td align="center" style="padding-bottom:32px;">
          <a href="${APP_URL}"
            style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;">
            Open Dreambox CRM
          </a>
        </td></tr>

        <tr><td style="color:#94a3b8;font-size:11px;line-height:1.6;border-top:1px solid #e2e8f0;padding-top:20px;text-align:center;">
          Dreambox Advertising (Pvt) Ltd &middot; 54 Brooke Village, Borrowdale Brooke, Harare<br/>
          +263 778 018 909 &middot; info@dreamboxadvertising.com &middot; crm.dreamboxadvertising.co.zw
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
