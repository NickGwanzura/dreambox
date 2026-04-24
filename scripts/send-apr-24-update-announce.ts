import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Resend } from 'resend';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
const resend = new Resend(process.env.RESEND_API_KEY!);

const FROM = 'Dreambox CRM <noreply@crm.dreamboxadvertising.co.zw>';
const APP_URL = 'https://crm.dreamboxadvertising.co.zw';

function buildHtml(firstName: string): string {
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#ffffff;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;padding:40px;">
        <tr><td align="center" style="padding-bottom:24px;">
          <span style="font-size:24px;font-weight:700;color:#1e293b;">Dreambox</span>
          <span style="font-size:24px;font-weight:300;color:#6366f1;"> CRM</span>
        </td></tr>

        <tr><td style="color:#1e293b;font-size:16px;line-height:1.6;padding-bottom:12px;">
          Hi ${firstName},
        </td></tr>

        <tr><td style="color:#64748b;font-size:14px;line-height:1.6;padding-bottom:24px;">
          Three updates shipped today that change how contracts, clients, and account signups work. All three are already live — here&apos;s what to expect the next time you open the CRM.
        </td></tr>

        <!-- UPDATE 1 — CLIENT PROFILES -->
        <tr><td style="padding-bottom:20px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef2ff;border-radius:12px;border:1px solid #c7d2fe;padding:20px;">
            <tr><td>
              <p style="font-size:11px;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px 0;">1 &middot; Client Profiles</p>
              <p style="font-size:16px;font-weight:700;color:#1e1b4b;margin:0 0 12px 0;">Click any client to open their full profile.</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>&#10003; Cards are clickable now.</strong> In the Clients view, click anywhere on a client card to open their profile. The edit/share/delete icons still work as before.
                </td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>&#10003; See everything at a glance.</strong> Active contracts, total billed, amount paid, and outstanding balance — all on one page.
                </td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>&#10003; Full document history.</strong> Tabbed view of every invoice, quotation, and receipt for that client. Download PDFs, mark invoices paid, or delete — inline, no page jumps.
                </td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>&#10003; Create invoices in context.</strong> &ldquo;New Invoice&rdquo; and &ldquo;New Quotation&rdquo; buttons right on the profile — client is pre-selected, you can link a contract, add line items, toggle VAT, done.
                </td></tr>
              </table>
            </td></tr>
          </table>
        </td></tr>

        <!-- UPDATE 2 — PRODUCTION FEES -->
        <tr><td style="padding-bottom:20px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border-radius:12px;border:1px solid #fde68a;padding:20px;">
            <tr><td>
              <p style="font-size:11px;font-weight:700;color:#b45309;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px 0;">2 &middot; Production Fees on Static Billboards</p>
              <p style="font-size:16px;font-weight:700;color:#78350f;margin:0 0 12px 0;">$750 for 7m × 6m, $850 for 12m × 4m.</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>&#10003; Auto-populates when you pick a static billboard.</strong> The &ldquo;Production Fee&rdquo; field in the rental form fills in based on size — no more remembering prices or chasing invoices after the fact.
                </td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>&#10003; Still editable.</strong> If a specific job needs a different amount, override it in the same field. LED boards and other sizes default to $0.
                </td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>&#10003; Appears as its own line item.</strong> On the invoice, on the contract PDF, in the email summary — a separate &ldquo;Production Fee&rdquo; row with the size for context (e.g. &ldquo;Production Fee (7m x 6m)&rdquo;). No conflation with installation.
                </td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>&#10003; Flows into total contract value.</strong> The 12-month gross already includes it, so VAT and totals come out right without any manual math.
                </td></tr>
              </table>
            </td></tr>
          </table>
        </td></tr>

        <!-- UPDATE 3 — SYSTEM ADMIN / NEW USER ALERTS -->
        <tr><td style="padding-bottom:24px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#ecfdf5;border-radius:12px;border:1px solid #a7f3d0;padding:20px;">
            <tr><td>
              <p style="font-size:11px;font-weight:700;color:#059669;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px 0;">3 &middot; Account Oversight</p>
              <p style="font-size:16px;font-weight:700;color:#064e3b;margin:0 0 12px 0;">Rufaro is now the system administrator.</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>&#10003; Every new user triggers an email to Rufaro.</strong> Whether someone self-signs up or an admin invites them, Rufaro sees the account before it goes live. Pending signups show up with a yellow &ldquo;needs approval&rdquo; banner and a direct link to user management.
                </td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>&#10003; Self-signups stay blocked until approved.</strong> If someone signs themselves up, they can&apos;t reach the app until Rufaro activates the account.
                </td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>&#10003; Nothing taken away from existing admins.</strong> Brian and Nick keep their admin + delete + settings privileges. Rufaro&apos;s oversight sits on top of what was already there.
                </td></tr>
              </table>
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="color:#64748b;font-size:14px;line-height:1.6;padding-bottom:24px;">
          <strong style="color:#1e293b;">Action for you:</strong> nothing to configure. Click a client, see what&apos;s new, and if you hit something unexpected, reply to this email and we&apos;ll take a look.
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
</html>`;
}

async function main() {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY not set in .env');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set in .env');

  const users = await prisma.user.findMany({
    where: { status: 'Active' },
    select: { email: true, firstName: true },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Sending April 24 update to ${users.length} active users...\n`);

  for (const user of users) {
    try {
      const { data, error } = await resend.emails.send({
        from: FROM,
        to: user.email,
        subject: 'Dreambox CRM — 3 new updates: client profiles, production fees, account oversight',
        html: buildHtml(user.firstName),
      });
      if (error) {
        console.error(`[FAIL] ${user.email}: ${error.message ?? JSON.stringify(error)}`);
      } else {
        console.log(`[OK] ${user.email}  id=${data?.id}`);
      }
    } catch (err: any) {
      console.error(`[FAIL] ${user.email}: ${err.message}`);
    }
  }

  console.log('\nDone.');
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
