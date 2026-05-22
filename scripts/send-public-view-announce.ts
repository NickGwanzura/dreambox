import 'dotenv/config';
import { Resend } from 'resend';
import { prisma } from '../lib/prisma';

const resend = new Resend(process.env.RESEND_API_KEY!);

const FROM = 'Dreambox CRM <noreply@crm.dreamboxadvertising.co.zw>';
const APP_URL = 'https://crm.dreamboxadvertising.co.zw';
const PUBLIC_URL = 'https://crm.dreamboxadvertising.co.zw/locations';

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
          Public Billboard Map is Live
        </td></tr>

        <tr><td style="color:#64748b;font-size:14px;line-height:1.6;padding-bottom:24px;" align="center">
          Hi ${firstName}, your full billboard inventory is now visible on a public, sharable map of Zimbabwe. Clients and prospects can browse locations, see dimensions and rates, and get AI-powered daily traffic estimates — no login required.
        </td></tr>

        <!-- ACCESS -->
        <tr><td style="padding-bottom:20px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef2ff;border-radius:12px;border:1px solid #c7d2fe;padding:24px;">
            <tr><td>
              <p style="font-size:11px;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px 0;">1 &middot; Accessing the Public Map</p>
              <p style="font-size:17px;font-weight:700;color:#1e1b4b;margin:0 0 16px 0;">Two ways to reach it.</p>

              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>From inside the CRM:</strong> click <strong>Billboard Locations</strong> in the sidebar (the MapPin icon, just below Billboards). This opens the public view in a new browser tab.
                </td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>Shareable link:</strong> <a href="${PUBLIC_URL}" style="color:#6366f1;">${PUBLIC_URL}</a> — send this to anyone. No login or password needed.
                </td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>Individual billboards</strong> also have their own unique URL. Open any billboard detail from the sidebar or map, then copy the browser address bar link.
                </td></tr>
              </table>
            </td></tr>
          </table>
        </td></tr>

        <!-- HOW IT WORKS -->
        <tr><td style="padding-bottom:20px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border-radius:12px;border:1px solid #fde68a;padding:24px;">
            <tr><td>
              <p style="font-size:11px;font-weight:700;color:#b45309;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px 0;">2 &middot; How the Map Works</p>
              <p style="font-size:17px;font-weight:700;color:#78350f;margin:0 0 16px 0;">Zimbabwe view, all billboards, AI estimates.</p>

              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>Map is locked to Zimbabwe.</strong> Pan and zoom, but the viewport stays within the country boundaries. The default view shows all billboards across Zimbabwe.
                </td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>Sidebar inventory panel.</strong> On the left side of the map, a searchable, filterable list of every billboard. Use the search bar to find by name or location, or filter by town and type (Static / LED).
                </td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>Click a billboard</strong> in the sidebar or on the map to see its details: dimensions, configuration (sides or slots), monthly rates, availability status, and location.
                </td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>AI daily traffic estimates.</strong> Billboard locations now show an estimated daily view count generated by AI, based on location, town, and billboard type. This helps clients understand the reach of each site.
                </td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>Images coming soon.</strong> You will see a notice on the map noting that billboard images are coming. This is the next feature we are building.
                </td></tr>
              </table>
            </td></tr>
          </table>
        </td></tr>

        <!-- RENAME BILLBOARDS -->
        <tr><td style="padding-bottom:24px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#ecfdf5;border-radius:12px;border:1px solid #a7f3d0;padding:24px;">
            <tr><td>
              <p style="font-size:11px;font-weight:700;color:#059669;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px 0;">3 &middot; Rename Your Billboards</p>
              <p style="font-size:17px;font-weight:700;color:#064e3b;margin:0 0 16px 0;">Make them client-ready before sharing the map.</p>

              <p style="font-size:13px;color:#1e293b;line-height:1.6;margin:0 0 12px 0;">
                Currently most billboards are named with internal identifiers (e.g. "10x20 Harare"). Before you share the public map link with clients, please rename each billboard to something descriptive and professional.
              </p>

              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>Where:</strong> sidebar &rarr; <strong>Billboards</strong> &rarr; click a billboard &rarr; edit the <strong>Name</strong> field.
                </td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>Good example:</strong> "Samora Machel Avenue" instead of "10x20 Harare".
                </td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>Also fill in Location and Town</strong> accurately — these show on the map and help clients find the site.
                </td></tr>
              </table>

              <p style="font-size:13px;color:#1e293b;line-height:1.6;margin:12px 0 0 0;">
                Once renamed, the public map will immediately reflect the new names. Images are coming in the next update — for now, a placeholder icon is shown.
              </p>
            </td></tr>
          </table>
        </td></tr>

        <!-- QUICK TIPS -->
        <tr><td style="padding-bottom:24px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;padding:20px;">
            <tr><td>
              <p style="font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px 0;">Quick Tips</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:5px 0;font-size:12px;color:#475569;line-height:1.5;">
                  &bull; The map link is <strong>completely public</strong> — no login required. Share it on your website, in proposals, or via email.
                </td></tr>
                <tr><td style="padding:5px 0;font-size:12px;color:#475569;line-height:1.5;">
                  &bull; The sidebar inventory panel has a <strong>search bar</strong> — use it to quickly find a specific billboard by name or location.
                </td></tr>
                <tr><td style="padding:5px 0;font-size:12px;color:#475569;line-height:1.5;">
                  &bull; Filter buttons let you narrow down by <strong>town</strong> or <strong>billboard type</strong> (Static / LED).
                </td></tr>
                <tr><td style="padding:5px 0;font-size:12px;color:#475569;line-height:1.5;">
                  &bull; Clicking a billboard on the map <strong>centers and zooms</strong> to that location and highlights it with a green marker.
                </td></tr>
                <tr><td style="padding:5px 0;font-size:12px;color:#475569;line-height:1.5;">
                  &bull; AI daily view estimates are shown in the billboard detail — these are <strong>estimates</strong> based on location and traffic patterns, not actual measured counts.
                </td></tr>
              </table>
            </td></tr>
          </table>
        </td></tr>

        <tr><td align="center" style="padding-bottom:32px;">
          <a href="${PUBLIC_URL}"
            style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;">
            Open Public Billboard Map
          </a>
        </td></tr>

        <tr><td style="color:#94a3b8;font-size:11px;line-height:1.6;border-top:1px solid #e2e8f0;padding-top:20px;text-align:center;">
          Reply to this email with any questions or feedback. The public map is live at crm.dreamboxadvertising.co.zw/locations.<br/><br/>
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

  console.log(`Sending public billboard map announcement to ${users.length} active users...\n`);

  for (const user of users) {
    try {
      const { data, error } = await resend.emails.send({
        from: FROM,
        to: user.email,
        subject: 'Dreambox CRM — Public Billboard Map is live (sharable link + AI traffic estimates)',
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
