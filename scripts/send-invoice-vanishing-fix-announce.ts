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
          <span style="display:inline-block;padding:6px 14px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;border-radius:999px;">Bug Fix</span>
        </td></tr>

        <tr><td align="center" style="color:#1e293b;font-size:22px;font-weight:800;padding:12px 0 8px 0;">
          Invoices No Longer Disappear — Here's What Was Happening
        </td></tr>

        <tr><td style="color:#64748b;font-size:14px;line-height:1.6;padding-bottom:24px;" align="center">
          Hi ${firstName}, we found and fixed three bugs that were causing invoices to be deleted without warning. Here's what was going wrong and what's changed.
        </td></tr>

        <!-- THE PROBLEM -->
        <tr><td style="padding-bottom:20px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border-radius:12px;border:1px solid #fecaca;padding:24px;">
            <tr><td>
              <p style="font-size:11px;font-weight:700;color:#dc2626;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px 0;">The Problem</p>
              <p style="font-size:15px;font-weight:700;color:#7f1d1d;margin:0 0 12px 0;">Invoices Were Being Deleted Silently in Three Scenarios</p>
              <p style="font-size:13px;color:#1e293b;line-height:1.6;margin:0;">
                When you shortened a contract's end date, removed a billboard line from a multi-billboard contract, or deleted a contract entirely, the system was automatically deleting any invoices tied to the affected period or line — with no warning or confirmation. This meant invoices could vanish the moment you clicked "Save" or "Delete", leaving no trace and no way to undo.
              </p>
            </td></tr>
          </table>
        </td></tr>

        <!-- FIX 1 -->
        <tr><td style="padding-bottom:20px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef2ff;border-radius:12px;border:1px solid #c7d2fe;padding:24px;">
            <tr><td>
              <p style="font-size:11px;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px 0;">Fix 1 &middot; Contract Reductions</p>
              <p style="font-size:17px;font-weight:700;color:#1e1b4b;margin:0 0 12px 0;">Shorter contract? You'll be asked before any invoices are removed.</p>
              <p style="font-size:13px;color:#1e293b;line-height:1.6;margin:0;">
                When you reduce a contract's end date, the system now shows you exactly which invoices fall beyond the new end date and how much value is affected. You see a clear warning with the count and total dollar amount before anything happens. You can either cancel the reduction or confirm that you want to proceed and delete those invoices. No more surprises.
              </p>
            </td></tr>
          </table>
        </td></tr>

        <!-- FIX 2 -->
        <tr><td style="padding-bottom:20px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border-radius:12px;border:1px solid #fde68a;padding:24px;">
            <tr><td>
              <p style="font-size:11px;font-weight:700;color:#b45309;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px 0;">Fix 2 &middot; Multi-Billboard Lines</p>
              <p style="font-size:17px;font-weight:700;color:#78350f;margin:0 0 12px 0;">Removing a billboard line? Invoices for that line are protected.</p>
              <p style="font-size:13px;color:#1e293b;line-height:1.6;margin:0;">
                If you edit a contract with multiple billboard lines and remove some of them, the system now checks whether those lines have any invoices. If they do, a warning shows you the billboard name and invoice count for each affected line. You can cancel and keep the lines, or confirm to proceed and delete the invoices. This prevents accidental loss when cleaning up contract details.
              </p>
            </td></tr>
          </table>
        </td></tr>

        <!-- FIX 3 -->
        <tr><td style="padding-bottom:20px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border-radius:12px;border:1px solid #fecaca;padding:24px;">
            <tr><td>
              <p style="font-size:11px;font-weight:700;color:#dc2626;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px 0;">Fix 3 &middot; Contract Deletion</p>
              <p style="font-size:17px;font-weight:700;color:#7f1d1d;margin:0 0 12px 0;">Deleting a contract with invoices? You'll get a strong warning.</p>
              <p style="font-size:13px;color:#1e293b;line-height:1.6;margin:0;">
                If you try to delete a contract that has paid invoices, you'll now see a prominent red warning explaining that ending the contract (which preserves all records) is the safer choice instead. You can still choose "Delete Anyway" if you intend to remove everything, but the default recommendation is to use "End Contract" instead — which marks the contract as expired without deleting any financial history.
              </p>
            </td></tr>
          </table>
        </td></tr>

        <!-- QUALITY -->
        <tr><td style="padding-bottom:24px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border-radius:12px;border:1px solid #bbf7d0;padding:20px;">
            <tr><td>
              <p style="font-size:11px;font-weight:700;color:#15803d;text-transform:uppercase;letter-spacing:1px;margin:0 0 4px 0;">Quality Assurance</p>
              <p style="font-size:15px;font-weight:700;color:#14532d;margin:0 0 8px 0;">48 new automated tests guard against regression.</p>
              <p style="font-size:13px;color:#166534;line-height:1.6;margin:0;">
                We wrote 48 unit tests covering every guard scenario — reduction confirmations, line deletion warnings, paid invoice protections, the two-click confirmation flow, and the data layer cascade behavior. Any future changes that break these protections will be caught immediately.
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
          Reply to this email with any questions or feedback. These fixes are live now on crm.dreamboxadvertising.co.zw.<br/><br/>
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

  console.log(`Sending invoice-guards update to ${users.length} active users...\n`);

  for (const user of users) {
    try {
      const { data, error } = await resend.emails.send({
        from: FROM,
        to: user.email,
        subject: 'Dreambox CRM — Invoices no longer vanish: critical bug fixes deployed',
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
