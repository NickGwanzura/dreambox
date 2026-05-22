import 'dotenv/config';
import { Resend } from 'resend';
import { prisma } from '../lib/prisma';

const resend = new Resend(process.env.RESEND_API_KEY!);

const FROM = 'Dreambox CRM <noreply@crm.dreamboxadvertising.co.zw>';
const APP_URL = 'https://crm.dreamboxadvertising.co.zw';

function buildHtml(firstName: string): string {
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#ffffff;font-family:'General Sans',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:40px 0;">
    <tr><td align="center">
      <table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;padding:40px;">
        <tr><td align="center" style="padding-bottom:24px;">
          <span style="font-size:24px;font-weight:700;color:#1e293b;">Dreambox</span>
          <span style="font-size:24px;font-weight:300;color:#6366f1;"> CRM</span>
        </td></tr>

        <tr><td align="center" style="padding-bottom:4px;">
          <span style="display:inline-block;padding:6px 14px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;border-radius:999px;">Major Update</span>
        </td></tr>

        <tr><td align="center" style="color:#1e293b;font-size:22px;font-weight:800;padding:12px 0 8px 0;">
          Contracts, Invoices & Financials — Upgraded
        </td></tr>

        <tr><td style="color:#64748b;font-size:14px;line-height:1.6;padding-bottom:24px;" align="center">
          Hi ${firstName}, we've shipped a set of powerful new features that connect contracts and invoices more tightly than ever. Here's what changed.
        </td></tr>

        <!-- 1. Contract Amendments Cascade to Invoices -->
        <tr><td style="padding-bottom:20px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef2ff;border-radius:12px;border:1px solid #c7d2fe;padding:24px;">
            <tr><td>
              <p style="font-size:11px;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px 0;">1 &middot; Smarter Contract Amendments</p>
              <p style="font-size:17px;font-weight:700;color:#1e1b4b;margin:0 0 16px 0;">Amend a contract &rarr; invoices update automatically</p>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;">
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>Rate changes.</strong> When you adjust the monthly rate via the Amend modal (Contracts &rarr; Adjust Term &rarr; Rate Change), all pending and overdue invoices tied to that contract are now <strong>automatically updated</strong> with the new rate and recalculated totals. No more manually editing each invoice.
                </td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>Term reductions.</strong> If you shorten a contract, any invoices that fall beyond the new end date are <strong>automatically removed</strong> — no orphaned invoices.
                </td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>Extensions</strong> already auto-generated extension invoices — that behaviour is unchanged.
                </td></tr>
              </table>
            </td></tr>
          </table>
        </td></tr>

        <!-- 2. End Contract -->
        <tr><td style="padding-bottom:20px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border-radius:12px;border:1px solid #fecaca;padding:24px;">
            <tr><td>
              <p style="font-size:11px;font-weight:700;color:#dc2626;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px 0;">2 &middot; End Contract — Cleanly</p>
              <p style="font-size:17px;font-weight:700;color:#7f1d1d;margin:0 0 16px 0;">Finish a contract the right way.</p>

              <p style="font-size:13px;color:#1e293b;line-height:1.6;margin:0 0 12px 0;">
                There's now a dedicated <strong>End Contract</strong> button (red, with a confirmation prompt) on every active or pending contract in both <strong>Contracts</strong> and <strong>Rentals</strong>.
              </p>

              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>What it does:</strong> marks the contract as Expired, <strong>frees the billboard side/slot</strong> for new rentals, and stops the contract from affecting auto-billing, upcoming billings, and financial calculations — all in one click.
                </td></tr>
              </table>
              <p style="font-size:12px;color:#64748b;margin-top:12px;line-height:1.5;">
                <strong>Note:</strong> This does <em>not</em> delete the contract or its invoices — it simply ends it. Historical records remain intact.
              </p>
            </td></tr>
          </table>
        </td></tr>

        <!-- 3. Quotations, Proformas & Receipts -->
        <tr><td style="padding-bottom:20px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border-radius:12px;border:1px solid #fde68a;padding:24px;">
            <tr><td>
              <p style="font-size:11px;font-weight:700;color:#b45309;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px 0;">3 &middot; Quotations &rarr; Invoices &bull; Proformas &bull; Receipts</p>
              <p style="font-size:17px;font-weight:700;color:#78350f;margin:0 0 16px 0;">New document types and conversions in Financials.</p>

              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>Quote → Invoice.</strong> Open <strong>Financials → Quotations</strong>. Each quotation now has a <strong>Convert to Invoice</strong> button (arrow icon) that instantly turns it into a real Invoice — no need to re-enter data. The existing &ldquo;Convert to Contract&rdquo; button is still there too.
                </td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>Proforma Invoices.</strong> A new <strong>Proformas</strong> tab in Financials lets you create proforma invoices (pre-billing documents). Each proforma can also be <strong>converted to a real Invoice</strong> with one click. Proformas use a <code style="background:#fff7ed;color:#78350f;padding:1px 5px;border-radius:4px;font-family:monospace;font-size:11px;">PRO-</code> prefix so they're easy to identify.
                </td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>Receipts from Paid Invoices.</strong> Paid invoices in Financials now show a <strong>Generate Receipt</strong> button that creates an official receipt document. Great for client record-keeping.
                </td></tr>
              </table>
            </td></tr>
          </table>
        </td></tr>

        <!-- 4. New Font -->
        <tr><td style="padding-bottom:24px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;padding:20px;">
            <tr><td>
              <p style="font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px 0;">4 &middot; Fresh Look</p>
              <p style="font-size:17px;font-weight:700;color:#0f172a;margin:0 0 12px 0;">General Sans — a cleaner, more modern typeface.</p>
              <p style="font-size:13px;color:#475569;line-height:1.6;margin:0;">
                The entire CRM has been updated to use <strong>General Sans</strong>. You'll notice crisper text, better readability, and a more polished feel across every page.
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
          Reply to this email with any questions or feedback.<br/><br/>
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

  console.log(`Sending contracts-financials-update to ${users.length} active users...\n`);

  for (const user of users) {
    try {
      const { data, error } = await resend.emails.send({
        from: FROM,
        to: user.email,
        subject: 'Dreambox CRM — Major update: Contract amendments cascade, End Contract, Proformas & more',
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
