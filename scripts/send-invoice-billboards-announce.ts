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

  console.log(`Sending invoice-billboards update to ${users.length} users...\n`);

  for (const user of users) {
    try {
      await resend.emails.send({
        from: FROM,
        to: user.email,
        subject: 'Dreambox CRM — billboards now selectable on invoices & quotes',
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
          Billing just got a lot faster. On <strong style="color:#1e293b;">Invoices</strong>, <strong style="color:#1e293b;">Quotations</strong>, and <strong style="color:#1e293b;">Receipts</strong> you can now pick billboards directly as line items &mdash; no more typing out descriptions and chasing rates. And when you invoice, availability updates itself.
        </td></tr>

        <tr><td style="padding-bottom:24px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;padding:20px;">
            <tr><td>
              <p style="font-size:13px;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px 0;">What&apos;s New</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:8px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>&#10003; Billboard picker inside the Line Items panel</strong> &mdash; every billboard in your inventory, searchable by name, location, or town. Pick as many as you want in one go.
                </td></tr>
                <tr><td style="padding:8px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>&#10003; Static billboards show Side A and Side B separately</strong> &mdash; each with its own rate and current status badge (Available / Rented / Maintenance). Tick either or both.
                </td></tr>
                <tr><td style="padding:8px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>&#10003; LED billboards take a slot quantity</strong> &mdash; enter how many slots the client is taking and the line item auto-totals <em>rate &times; slots</em>. Availability shows &ldquo;3 of 10 available&rdquo; at a glance.
                </td></tr>
                <tr><td style="padding:8px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>&#10003; Auto-filled but still editable</strong> &mdash; description and amount get pre-populated from the billboard, and you can tweak both per line if the deal has custom terms.
                </td></tr>
                <tr><td style="padding:8px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>&#10003; Custom line items still work</strong> &mdash; the manual &ldquo;description + amount&rdquo; row is still there below the picker for printing, installation, fees, anything ad-hoc.
                </td></tr>
              </table>
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="padding-bottom:24px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;padding:20px;">
            <tr><td>
              <p style="font-size:13px;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px 0;">Availability Updates Itself</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:8px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>Creating an Invoice</strong> that references a billboard flips the relevant side(s) to <strong>Rented</strong> and credits the client automatically. LED <em>rentedSlots</em> increases by the invoiced quantity.
                </td></tr>
                <tr><td style="padding:8px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>Quotations don&apos;t lock anything</strong> &mdash; they&apos;re tentative until you convert them to a contract or invoice. Only Invoices affect availability.
                </td></tr>
                <tr><td style="padding:8px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>Deleting an Invoice</strong> frees the side/slot only if nothing else still holds it &mdash; contracts and other invoices are respected. No accidental double-frees.
                </td></tr>
                <tr><td style="padding:8px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>Maintenance status is protected</strong> &mdash; a billboard marked for maintenance won&apos;t get flipped to Rented by invoicing.
                </td></tr>
              </table>
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="color:#64748b;font-size:14px;line-height:1.6;padding-bottom:20px;">
          <strong style="color:#1e293b;">Try it:</strong> New Invoice &rarr; scroll to Line Items &rarr; the billboard picker is right at the top. Search, tick, hit <em>Add Selected to Line Items</em>.
        </td></tr>

        <tr><td style="color:#64748b;font-size:14px;line-height:1.6;padding-bottom:24px;">
          Older invoices created before today won&apos;t have billboard links &mdash; only new ones going forward. That&apos;s intentional. As always, ping me if anything looks off.
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
