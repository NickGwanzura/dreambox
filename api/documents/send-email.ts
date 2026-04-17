/**
 * POST /api/documents/send-email
 * Sends a contract, invoice, quotation, or receipt to the client via email,
 * with a generated PDF attachment.
 *
 * Body: { documentType: 'contract' | 'invoice' | 'quotation' | 'receipt', documentId: string }
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Resend } from 'resend';
import { prisma } from '../../lib/prisma';
import { requireAuth, cors } from '../../lib/auth';
import { escapeHtml } from '../../lib/htmlEscape';
import { buildInvoicePdf, buildContractPdf } from '../../lib/documentPdf';

const resend = new Resend(process.env.RESEND_API_KEY);
const APP_URL = process.env.APP_URL || 'https://crm.dreamboxadvertising.co.zw';
const DEFAULT_FROM = 'Dreambox CRM <noreply@crm.dreamboxadvertising.co.zw>';

type DocType = 'contract' | 'invoice' | 'quotation' | 'receipt';

function buildFromAddress(company: any): string {
  const name = (company?.senderName || company?.name || 'Dreambox CRM').replace(/[<>"]/g, '').trim();
  const email = (company?.senderEmail || '').trim();
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return `${name} <${email}>`;
  }
  return DEFAULT_FROM;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const payload = requireAuth(req, res);
  if (!payload) return;

  const { documentType, documentId } = req.body ?? {};
  if (!documentType || !documentId) {
    return res.status(400).json({ error: 'documentType and documentId required' });
  }

  const validTypes: DocType[] = ['contract', 'invoice', 'quotation', 'receipt'];
  if (!validTypes.includes(documentType)) {
    return res.status(400).json({ error: `Invalid documentType. Must be one of: ${validTypes.join(', ')}` });
  }

  try {
    // Load company profile once — used for branding, sender, banking details.
    const company = (await prisma.companyProfile.findUnique({ where: { id: 'profile_v1' } })) as any || {};
    const FROM = buildFromAddress(company);

    let clientEmail: string;
    let clientName: string;
    let contactPerson: string;
    let subject: string;
    let html: string;
    let pdfBuffer: Buffer;
    let pdfFilename: string;

    if (documentType === 'contract') {
      const contract = await prisma.contract.findUnique({ where: { id: documentId } });
      if (!contract) return res.status(404).json({ error: 'Contract not found' });

      const client = await prisma.client.findUnique({ where: { id: contract.clientId } });
      if (!client) return res.status(404).json({ error: 'Client not found' });

      const billboard = await prisma.billboard.findUnique({ where: { id: contract.billboardId } });

      clientEmail = client.email;
      clientName = client.companyName;
      contactPerson = escapeHtml(client.contactPerson);
      subject = `Your Billboard Contract — ${billboard?.name || 'Billboard'} (${contract.startDate} to ${contract.endDate})`;

      html = buildDocEmail({
        company,
        contactPerson,
        title: 'Billboard Rental Contract',
        intro: `Please find below the details of your billboard rental contract${company?.name ? ` with ${escapeHtml(company.name)}` : ''}. A PDF copy is attached.`,
        rows: [
          ['Billboard', billboard?.name || 'N/A'],
          ['Location', billboard?.location || 'N/A'],
          ['Period', `${contract.startDate} to ${contract.endDate}`],
          ['Monthly Rate', `$${contract.monthlyRate.toLocaleString()}`],
          ['Installation', `$${contract.installationCost.toLocaleString()}`],
          ['Printing', `$${contract.printingCost.toLocaleString()}`],
          ['VAT', contract.hasVat ? '15%' : 'None'],
          ['Total Value', `$${contract.totalContractValue.toLocaleString()}`],
        ],
        status: contract.status,
        statusColor: contract.status === 'Active' ? '#10b981' : contract.status === 'Pending' ? '#f59e0b' : '#64748b',
      });

      pdfBuffer = await buildContractPdf(
        contract as any,
        client as any,
        billboard?.name || 'Billboard',
        billboard?.location || '',
        company
      );
      pdfFilename = `Contract-${contract.id.slice(0, 8)}.pdf`;
    } else {
      const invoice = await prisma.invoice.findUnique({ where: { id: documentId } });
      if (!invoice) return res.status(404).json({ error: 'Document not found' });

      const typeMap: Record<string, string> = { invoice: 'Invoice', quotation: 'Quotation', receipt: 'Receipt' };
      if (String(invoice.type).toLowerCase() !== documentType) {
        return res.status(400).json({ error: `Document is a ${invoice.type}, not a ${documentType}` });
      }

      const client = await prisma.client.findUnique({ where: { id: invoice.clientId } });
      if (!client) return res.status(404).json({ error: 'Client not found' });

      clientEmail = client.email;
      clientName = client.companyName;
      contactPerson = escapeHtml(client.contactPerson);

      const items = (invoice.items as any[]) || [];
      const typeLabel = typeMap[documentType] || 'Document';
      const brand = company?.name || 'Dreambox Advertising';

      subject = `${typeLabel} #${invoice.id.slice(0, 8)} — $${invoice.total.toLocaleString()} | ${brand}`;

      const itemRows = items.map(item =>
        `<tr>
          <td style="padding:8px 12px;color:#64748b;font-size:13px;border-bottom:1px solid #f1f5f9;">${escapeHtml(String(item.description || ''))}</td>
          <td style="padding:8px 12px;color:#1e293b;font-size:13px;text-align:right;border-bottom:1px solid #f1f5f9;">$${Number(item.amount).toLocaleString()}</td>
        </tr>`
      ).join('');

      const summaryRows: [string, string][] = [
        ['Subtotal', `$${invoice.subtotal.toLocaleString()}`],
      ];
      if (invoice.discountAmount && invoice.discountAmount > 0) {
        summaryRows.push(['Discount', `-$${invoice.discountAmount.toLocaleString()}`]);
      }
      if (invoice.vatAmount > 0) {
        summaryRows.push(['VAT (15%)', `$${invoice.vatAmount.toLocaleString()}`]);
      }
      summaryRows.push(['Total', `$${invoice.total.toLocaleString()}`]);

      const introText = documentType === 'quotation'
        ? `Please find your quotation from ${escapeHtml(brand)} below. This quote is valid for 30 days. A PDF copy is attached.`
        : documentType === 'receipt'
        ? `Thank you for your payment. Here is your receipt from ${escapeHtml(brand)}. A PDF copy is attached.`
        : `Please find your invoice from ${escapeHtml(brand)} below. Payment is due at your earliest convenience. A PDF copy is attached.`;

      html = buildInvoiceEmail({
        company,
        contactPerson,
        typeLabel,
        intro: introText,
        date: invoice.date,
        docId: invoice.id,
        itemRows,
        summaryRows,
        status: invoice.status,
        statusColor: invoice.status === 'Paid' ? '#10b981' : invoice.status === 'Overdue' ? '#ef4444' : '#f59e0b',
        paymentMethod: invoice.paymentMethod || undefined,
        paymentReference: invoice.paymentReference || undefined,
        includeBanking: documentType !== 'receipt',
      });

      pdfBuffer = await buildInvoicePdf(invoice as any, client as any, company);
      pdfFilename = `${typeLabel}-${invoice.id.slice(0, 8)}.pdf`;
    }

    await resend.emails.send({
      from: FROM,
      to: clientEmail,
      subject,
      html,
      attachments: [{ filename: pdfFilename, content: pdfBuffer }],
    });

    console.log(`[documents/send-email] Sent ${documentType} ${documentId} to ${clientEmail} with PDF attachment`);
    return res.status(200).json({ message: `${documentType} sent to ${clientEmail}`, to: clientEmail, attachment: pdfFilename });
  } catch (e: any) {
    console.error('[documents/send-email]', e);
    return res.status(500).json({ error: 'Failed to send email' });
  }
}

// ── Shared email helpers ────────────────────────────────────────────────────

function brandMark(company: any) {
  const name = escapeHtml(company?.name || 'Dreambox');
  return `<span style="font-size:24px;font-weight:700;color:#1e293b;">${name}</span>`;
}

function footerBlock(company: any) {
  const lines: string[] = [];
  if (company?.name) lines.push(escapeHtml(company.name));
  const addr = [company?.address, company?.city, company?.country].filter(Boolean).map((x: string) => escapeHtml(x)).join(', ');
  if (addr) lines.push(addr);
  if (company?.phone) lines.push(`Tel: ${escapeHtml(company.phone)}`);
  if (company?.supportEmail) lines.push(escapeHtml(company.supportEmail));
  if (company?.website) lines.push(escapeHtml(company.website));
  if (company?.vatNumber) lines.push(`VAT: ${escapeHtml(company.vatNumber)}`);

  const sig = company?.emailSignature
    ? `<div style="margin-top:8px;color:#64748b;font-size:11px;white-space:pre-wrap;">${escapeHtml(company.emailSignature)}</div>`
    : '';

  return `<p style="margin:0;">${lines.join(' · ')}</p>${sig}`;
}

function bankingBlock(company: any): string {
  const rows: [string, string][] = [];
  if (company?.bankName) rows.push(['Bank', company.bankName]);
  if (company?.bankAccountName) rows.push(['Account Name', company.bankAccountName]);
  if (company?.bankAccountNumber) rows.push(['Account No.', company.bankAccountNumber]);
  if (company?.bankBranch) rows.push(['Branch', company.bankBranch]);
  if (company?.bankSwift) rows.push(['SWIFT/BIC', company.bankSwift]);
  if (rows.length === 0 && !company?.paymentTerms) return '';

  const bankRows = rows.map(([k, v]) =>
    `<tr><td style="padding:6px 12px;color:#64748b;font-size:12px;">${escapeHtml(k)}</td><td style="padding:6px 12px;color:#1e293b;font-size:12px;text-align:right;font-family:monospace;">${escapeHtml(v)}</td></tr>`
  ).join('');

  const terms = company?.paymentTerms
    ? `<tr><td colspan="2" style="padding:8px 12px;color:#64748b;font-size:11px;font-style:italic;border-top:1px solid #f1f5f9;">${escapeHtml(company.paymentTerms)}</td></tr>`
    : '';

  return `<tr><td style="padding-top:16px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;overflow:hidden;">
      <tr style="background:#f1f5f9;"><td colspan="2" style="padding:10px 12px;font-size:11px;font-weight:700;color:#1e293b;text-transform:uppercase;letter-spacing:1px;">Payment Details</td></tr>
      ${bankRows}
      ${terms}
    </table>
  </td></tr>`;
}

// ── Generic document email (contracts) ──────────────────────────────────────

function buildDocEmail(opts: {
  company: any;
  contactPerson: string;
  title: string;
  intro: string;
  rows: [string, string][];
  status: string;
  statusColor: string;
}) {
  const detailRows = opts.rows.map(([label, value]) => {
    const isBold = label === 'Total Value';
    return `<tr>
      <td style="padding:10px 16px;font-size:13px;color:#64748b;border-bottom:1px solid #f1f5f9;">${label}</td>
      <td style="padding:10px 16px;font-size:${isBold ? '16px' : '13px'};color:#1e293b;font-weight:${isBold ? '700' : '400'};text-align:right;border-bottom:1px solid #f1f5f9;">${value}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#ffffff;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:40px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;padding:40px;">
        <tr><td align="center" style="padding-bottom:8px;">${brandMark(opts.company)}</td></tr>
        <tr><td align="center" style="padding-bottom:24px;">
          <span style="display:inline-block;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#fff;background:${opts.statusColor};">${escapeHtml(opts.status)}</span>
        </td></tr>
        <tr><td style="color:#1e293b;font-size:16px;line-height:1.6;padding-bottom:8px;">Dear ${opts.contactPerson},</td></tr>
        <tr><td style="color:#64748b;font-size:14px;line-height:1.6;padding-bottom:24px;">${opts.intro}</td></tr>
        <tr><td>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:12px;overflow:hidden;">
            <tr style="background:#f1f5f9;">
              <td colspan="2" style="padding:12px 16px;font-size:14px;font-weight:700;color:#1e293b;">${escapeHtml(opts.title)}</td>
            </tr>
            ${detailRows}
          </table>
        </td></tr>
        ${bankingBlock(opts.company)}
        <tr><td style="padding-top:24px;color:#94a3b8;font-size:11px;border-top:1px solid #e2e8f0;margin-top:24px;">
          ${footerBlock(opts.company)}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Invoice / Quotation / Receipt email ─────────────────────────────────────

function buildInvoiceEmail(opts: {
  company: any;
  contactPerson: string;
  typeLabel: string;
  intro: string;
  date: string;
  docId: string;
  itemRows: string;
  summaryRows: [string, string][];
  status: string;
  statusColor: string;
  paymentMethod?: string;
  paymentReference?: string;
  includeBanking: boolean;
}) {
  const summaryHtml = opts.summaryRows.map(([label, value]) => {
    const isTotal = label === 'Total';
    return `<tr${isTotal ? ' style="background:#f1f5f9;"' : ''}>
      <td style="padding:${isTotal ? '12px' : '8px'} 12px;font-size:${isTotal ? '14px' : '12px'};color:${isTotal ? '#1e293b' : '#64748b'};font-weight:${isTotal ? '700' : '400'};">${label}</td>
      <td style="padding:${isTotal ? '12px' : '8px'} 12px;font-size:${isTotal ? '16px' : '12px'};color:#1e293b;font-weight:${isTotal ? '700' : '400'};text-align:right;">${value}</td>
    </tr>`;
  }).join('');

  const paymentInfo = opts.paymentMethod
    ? `<tr><td style="padding:8px 12px;color:#64748b;font-size:12px;">Payment Method</td><td style="padding:8px 12px;color:#1e293b;font-size:12px;text-align:right;">${escapeHtml(opts.paymentMethod)}</td></tr>
       ${opts.paymentReference ? `<tr><td style="padding:8px 12px;color:#64748b;font-size:12px;">Reference</td><td style="padding:8px 12px;color:#1e293b;font-size:12px;text-align:right;">${escapeHtml(opts.paymentReference)}</td></tr>` : ''}`
    : '';

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#ffffff;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:40px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;padding:40px;">
        <tr><td align="center" style="padding-bottom:8px;">${brandMark(opts.company)}</td></tr>
        <tr><td align="center" style="padding-bottom:4px;">
          <span style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:2px;">${escapeHtml(opts.typeLabel)}</span>
        </td></tr>
        <tr><td align="center" style="padding-bottom:24px;">
          <span style="display:inline-block;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#fff;background:${opts.statusColor};">${escapeHtml(opts.status)}</span>
        </td></tr>

        <tr><td style="padding-bottom:16px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;padding:16px;">
            <tr>
              <td style="text-align:center;"><div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Doc #</div><div style="font-size:13px;color:#1e293b;font-weight:600;font-family:monospace;">${escapeHtml(opts.docId.slice(0, 8))}</div></td>
              <td style="text-align:center;"><div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Date</div><div style="font-size:13px;color:#1e293b;font-weight:600;">${escapeHtml(opts.date)}</div></td>
            </tr>
          </table>
        </td></tr>

        <tr><td style="color:#1e293b;font-size:15px;line-height:1.6;padding-bottom:8px;">Dear ${opts.contactPerson},</td></tr>
        <tr><td style="color:#64748b;font-size:13px;line-height:1.6;padding-bottom:24px;">${opts.intro}</td></tr>

        <tr><td>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:12px;overflow:hidden;">
            <tr style="background:#f1f5f9;">
              <th style="padding:10px 12px;text-align:left;font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">Description</th>
              <th style="padding:10px 12px;text-align:right;font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">Amount</th>
            </tr>
            ${opts.itemRows}
            <tr><td colspan="2" style="height:1px;background:#e2e8f0;"></td></tr>
            ${summaryHtml}
            ${paymentInfo}
          </table>
        </td></tr>

        ${opts.includeBanking ? bankingBlock(opts.company) : ''}

        <tr><td style="padding-top:24px;color:#94a3b8;font-size:11px;border-top:1px solid #e2e8f0;margin-top:24px;">
          ${footerBlock(opts.company)}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
