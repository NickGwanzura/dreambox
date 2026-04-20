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

  console.log(`Sending availability + public-network update to ${users.length} users...\n`);

  for (const user of users) {
    try {
      await resend.emails.send({
        from: FROM,
        to: user.email,
        subject: 'New in Dreambox CRM — Full-network public view & trustworthy Availability PDF',
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
          Two updates this week — both aimed at making the sheets you send to prospects more useful and more accurate.
        </td></tr>

        <tr><td style="padding-bottom:24px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;padding:20px;">
            <tr><td>
              <p style="font-size:13px;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px 0;">What's New</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:8px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>&#10003; Public asset view shows the full network</strong> &mdash; when a prospect opens a shared billboard link, they now see every other Dreambox site on the map (the featured board highlighted, others as muted pins) plus a &ldquo;More Locations&rdquo; grid under the detail card so they can explore the whole inventory, not just one site.
                </td></tr>
                <tr><td style="padding:8px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>&#10003; Availability PDF now reports traffic</strong> &mdash; the sheet has two new KPI cards (<em>Daily Views</em> and <em>Monthly Impressions</em>), two new table columns (<em>Daily Views</em> and <em>Monthly Impr.</em> per site), and a bold Network Totals footer row so a prospect sees the reach of the whole open network at a glance.
                </td></tr>
                <tr><td style="padding:8px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>&#10003; Availability numbers are now trustworthy</strong> &mdash; the PDF previously read static status flags that could drift from reality (future-dated contracts blocked sides early, expired contracts never reverted). It now derives openings from <em>active contracts with today&apos;s date in range</em>, the same logic the Billboards page uses. The title now reads &ldquo;Availability as of &lt;date&gt;&rdquo; to make clear this is a point-in-time snapshot.
                </td></tr>
                <tr><td style="padding:8px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>&#10003; Honest labelling of impressions</strong> &mdash; the PDF now says &ldquo;Monthly Impressions&rdquo; (daily views &times; 30), not &ldquo;Monthly Reach&rdquo; which implies unique people. A methodology note makes the calculation explicit at the foot of the sheet.
                </td></tr>
              </table>
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="color:#64748b;font-size:14px;line-height:1.6;padding-bottom:20px;">
          <strong style="color:#1e293b;">Tip:</strong> on the Billboards page, click <em>Availability PDF</em> to generate the updated sheet. If a site&apos;s daily traffic number looks stale, edit the billboard and either enter a fresh survey number or click <em>Auto-Generate</em>.
        </td></tr>

        <tr><td style="color:#64748b;font-size:14px;line-height:1.6;padding-bottom:24px;">
          Questions or feedback? Reply to this email or reach out to your administrator.
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
