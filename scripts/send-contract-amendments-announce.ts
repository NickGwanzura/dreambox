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
      <table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;padding:40px;">
        <tr><td align="center" style="padding-bottom:24px;">
          <span style="font-size:24px;font-weight:700;color:#1e293b;">Dreambox</span>
          <span style="font-size:24px;font-weight:300;color:#6366f1;"> CRM</span>
        </td></tr>

        <tr><td align="center" style="padding-bottom:4px;">
          <span style="display:inline-block;padding:6px 14px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;border-radius:999px;">New Feature</span>
        </td></tr>

        <tr><td align="center" style="color:#1e293b;font-size:22px;font-weight:800;padding:12px 0 8px 0;">
          Contract Amendments — Extend, Reduce, or Adjust Rates
        </td></tr>

        <tr><td style="color:#64748b;font-size:14px;line-height:1.6;padding-bottom:24px;" align="center">
          Hi ${firstName}, you can now amend contracts directly from the Rentals screen — extend terms, terminate early, or change monthly rates — all with conflict checking and automatic invoice generation.
        </td></tr>

        <!-- CORE FEATURES -->
        <tr><td style="padding-bottom:20px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef2ff;border-radius:12px;border:1px solid #c7d2fe;padding:24px;">
            <tr><td>
              <p style="font-size:11px;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px 0;">Three Ways to Amend</p>

              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:8px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong style="color:#059669;">&#9654; Extend</strong> &mdash; Add months to a contract with quick +1, +3, +6, +12 buttons. The system automatically generates invoices for each added month with proper VAT. A timeline bar shows the original period vs. the extension at a glance.
                </td></tr>
                <tr><td style="padding:8px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong style="color:#dc2626;">&#9654; Reduce</strong> &mdash; End a contract early. The amendment modal shows any affected invoices that have dates beyond the new end date and calculates the credit due to the client (negative financial impact).
                </td></tr>
                <tr><td style="padding:8px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong style="color:#6366f1;">&#9654; Change Rate</strong> &mdash; Adjust the monthly rate mid-contract. The financial impact section shows the rate delta and new contract total. Quick +/-$50, +/-$100, +/-$500 buttons make adjustments fast.
                </td></tr>
              </table>
            </td></tr>
          </table>
        </td></tr>

        <!-- HOW TO USE -->
        <tr><td style="padding-bottom:20px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;padding:24px;">
            <tr><td>
              <p style="font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px 0;">How to Amend a Contract</p>

              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>Step 1.</strong> Go to <strong>Contracts</strong> and click any contract to open the detail panel.
                </td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>Step 2.</strong> Click the <strong>&ldquo;Amend Contract&rdquo;</strong> button at the bottom of the detail panel.
                </td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>Step 3.</strong> Choose <strong>Extend</strong>, <strong>Reduce</strong>, or <strong>Rate Change</strong>. The modal shows:
                  <ul style="margin:8px 0 0 20px;padding:0;">
                    <li>Visual timeline of the contract period</li>
                    <li>Financial impact summary (inc. VAT breakdown)</li>
                    <li>Conflict warnings if the billboard side is already booked</li>
                    <li>Affected invoices highlighted on reductions</li>
                  </ul>
                </td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>Step 4.</strong> Enter a reason for the amendment (e.g., &ldquo;Client requested 3-month extension&rdquo;) and click <strong>Apply Amendment</strong>.
                </td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>Step 5.</strong> The contract end date and total value update automatically. For extensions, invoices for the added months are created instantly. Every amendment is logged in the amendment history.
                </td></tr>
              </table>
            </td></tr>
          </table>
        </td></tr>

        <!-- SMART CHECKS -->
        <tr><td style="padding-bottom:20px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef3c7;border-radius:12px;border:1px solid #fde68a;padding:24px;">
            <tr><td>
              <p style="font-size:11px;font-weight:700;color:#b45309;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px 0;">Built-in Safety Checks</p>
              <p style="font-size:13px;color:#1e293b;line-height:1.6;margin:0;">
                <strong>&#10003; Billboard availability</strong> &mdash; extending a contract checks whether the billboard side will be available for the additional months.<br/><br/>
                <strong>&#10003; Atomic updates</strong> &mdash; the system automatically rolls back changes if any step fails (contract update + amendment record + invoice generation), so you never get partial data.<br/><br/>
                <strong>&#10003; Invoice conflict detection</strong> &mdash; early termination highlights invoices that fall beyond the new end date, so you know exactly which records may need adjustment.<br/><br/>
                <strong>&#10003; Full audit trail</strong> &mdash; every amendment is recorded with the reason, financial impact, and timestamp. View the full amendment history from within the amendment modal.
              </p>
            </td></tr>
          </table>
        </td></tr>

        <tr><td align="center" style="padding-bottom:32px;">
          <a href="${APP_URL}"
            style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;">
            Open Dreambox CRM
          </a>
        </td></tr>

        <tr><td style="color:#94a3b8;font-size:11px;line-height:1.6;border-top:1px solid #e2e8f0;padding-top:20px;text-align:center;">
          Reply to this email with any questions or feedback. The contract amendments feature is live now on crm.dreamboxadvertising.co.zw.<br/><br/>
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

  console.log(`Sending contract amendments update to ${users.length} active users...\n`);

  for (const user of users) {
    try {
      const { data, error } = await resend.emails.send({
        from: FROM,
        to: user.email,
        subject: 'Dreambox CRM — Contract Amendments: extend, reduce, or change rates with one click',
        html: buildHtml(user.firstName || 'there'),
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
