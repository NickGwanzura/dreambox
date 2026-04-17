/**
 * Announcement: PDF attachments + banking-detail email upgrade.
 *
 * Sends a branded HTML announcement to every Active user, explaining the
 * new capabilities released in this batch:
 *   - Invoices/Quotes/Receipts/Contracts now send with a PDF attached
 *   - Company Profile gained Banking + Email Signature + Sender fields
 *   - Outbound emails are fully branded from the Company Profile
 *
 * Run:  npx tsx scripts/send-pdf-email-announce.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Resend } from 'resend';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
const resend = new Resend(process.env.RESEND_API_KEY!);

const FROM = 'Dreambox CRM <noreply@crm.dreamboxadvertising.co.zw>';
const APP_URL = process.env.APP_URL || 'https://crm.dreamboxadvertising.co.zw';

function buildHtml(firstName: string): string {
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f8fafc;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;padding:40px;">

        <tr><td align="center" style="padding-bottom:8px;">
          <span style="font-size:26px;font-weight:700;color:#1e293b;">Dreambox</span><span style="font-size:26px;font-weight:300;color:#6366f1;"> CRM</span>
        </td></tr>
        <tr><td align="center" style="padding-bottom:28px;">
          <span style="display:inline-block;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#fff;background:#6366f1;">New Release</span>
        </td></tr>

        <tr><td style="color:#1e293b;font-size:18px;font-weight:700;line-height:1.4;padding-bottom:6px;">
          Hi ${firstName}, your invoice emails just got a serious upgrade.
        </td></tr>

        <tr><td style="color:#64748b;font-size:14px;line-height:1.7;padding-bottom:24px;">
          From today, every document email you send to a client goes out with a proper <strong>PDF attached</strong> and your <strong>banking details</strong> included automatically. No more separate downloads, no more copy-pasting bank info.
        </td></tr>

        <!-- Feature card: PDF attachments -->
        <tr><td style="padding-bottom:16px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;padding:22px;">
            <tr><td>
              <p style="font-size:11px;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:1.5px;margin:0 0 10px 0;">&#128206; Feature 1</p>
              <p style="font-size:16px;font-weight:700;color:#1e293b;margin:0 0 10px 0;">PDF Attachments on Every Email</p>
              <p style="font-size:13px;color:#64748b;line-height:1.7;margin:0 0 14px 0;">
                When you click <em>Send via Email</em> on any of the following, a professionally-formatted PDF is generated on the server and attached automatically:
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:4px 0;font-size:13px;color:#1e293b;">&#10003; &nbsp;Invoices</td></tr>
                <tr><td style="padding:4px 0;font-size:13px;color:#1e293b;">&#10003; &nbsp;Quotations</td></tr>
                <tr><td style="padding:4px 0;font-size:13px;color:#1e293b;">&#10003; &nbsp;Receipts</td></tr>
                <tr><td style="padding:4px 0;font-size:13px;color:#1e293b;">&#10003; &nbsp;Billboard Contracts</td></tr>
              </table>
              <p style="font-size:12px;color:#94a3b8;line-height:1.6;margin:14px 0 0 0;font-style:italic;">
                The PDF carries the company logo, client bill-to block, line items, totals, VAT, and banking details &mdash; all pulled from Settings.
              </p>
            </td></tr>
          </table>
        </td></tr>

        <!-- Feature card: Banking + Signature -->
        <tr><td style="padding-bottom:16px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;padding:22px;">
            <tr><td>
              <p style="font-size:11px;font-weight:700;color:#10b981;text-transform:uppercase;letter-spacing:1.5px;margin:0 0 10px 0;">&#127974; Feature 2</p>
              <p style="font-size:16px;font-weight:700;color:#1e293b;margin:0 0 10px 0;">Banking &amp; Email Signature in Settings</p>
              <p style="font-size:13px;color:#64748b;line-height:1.7;margin:0 0 14px 0;">
                Head to <strong>Settings &rarr; Company Profile</strong> &mdash; you'll see two new sections:
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:4px 0;font-size:13px;color:#1e293b;">&#10003; &nbsp;<strong>Banking &amp; Payment Details</strong> &mdash; bank name, account name &amp; number, branch, SWIFT, payment terms</td></tr>
                <tr><td style="padding:4px 0;font-size:13px;color:#1e293b;">&#10003; &nbsp;<strong>Outgoing Email</strong> &mdash; custom sender name, sender email, and free-text email signature</td></tr>
              </table>
              <p style="font-size:12px;color:#94a3b8;line-height:1.6;margin:14px 0 0 0;font-style:italic;">
                Everything you fill in there flows straight into the next invoice PDF and email you send.
              </p>
            </td></tr>
          </table>
        </td></tr>

        <!-- Feature card: Full branding -->
        <tr><td style="padding-bottom:28px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;padding:22px;">
            <tr><td>
              <p style="font-size:11px;font-weight:700;color:#f59e0b;text-transform:uppercase;letter-spacing:1.5px;margin:0 0 10px 0;">&#10024; Feature 3</p>
              <p style="font-size:16px;font-weight:700;color:#1e293b;margin:0 0 10px 0;">Fully Branded Outbound Emails</p>
              <p style="font-size:13px;color:#64748b;line-height:1.7;margin:0;">
                Client-facing emails are no longer hardcoded &mdash; the company name, address, phone, VAT number, website, and custom signature are all rendered dynamically from your Company Profile. Update once, every future email reflects it.
              </p>
            </td></tr>
          </table>
        </td></tr>

        <!-- Action needed -->
        <tr><td style="padding-bottom:24px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border-left:4px solid #f59e0b;border-radius:8px;padding:16px 20px;">
            <tr><td>
              <p style="font-size:12px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px 0;">Action Needed</p>
              <p style="font-size:13px;color:#78350f;line-height:1.6;margin:0;">
                Please open <strong>Settings &rarr; Company Profile</strong> and fill in the new Banking &amp; Email Signature fields so your next client email goes out complete.
              </p>
            </td></tr>
          </table>
        </td></tr>

        <tr><td align="center" style="padding-bottom:32px;">
          <a href="${APP_URL}" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;">
            Open Settings &rarr; Company Profile
          </a>
        </td></tr>

        <tr><td style="color:#94a3b8;font-size:11px;line-height:1.6;border-top:1px solid #e2e8f0;padding-top:20px;text-align:center;">
          Dreambox Advertising (Pvt) Ltd &middot; crm.dreamboxadvertising.co.zw<br/>
          Questions? Reply to this email or ping your administrator.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function main() {
  const users = await prisma.user.findMany({
    where: { status: 'Active' },
    select: { email: true, firstName: true },
  });

  console.log(`Sending PDF-email announcement to ${users.length} active users...\n`);

  for (const user of users) {
    try {
      await resend.emails.send({
        from: FROM,
        to: user.email,
        subject: 'New: Invoice emails now ship with PDF attachments + banking details',
        html: buildHtml(user.firstName || 'there'),
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
