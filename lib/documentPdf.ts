/**
 * Server-side PDF generation for invoices, quotations, receipts, and contracts.
 *
 * Returns a Buffer that can be attached to Resend emails as `attachments[].content`.
 * Uses pdfkit (pure-JS) so it runs in Vercel/Node serverless environments without
 * headless-browser overhead.
 */
import PDFDocument from 'pdfkit';

export type CompanyProfileLite = {
  name?: string | null;
  vatNumber?: string | null;
  regNumber?: string | null;
  email?: string | null;
  supportEmail?: string | null;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  logo?: string | null;
  bankName?: string | null;
  bankAccountName?: string | null;
  bankAccountNumber?: string | null;
  bankBranch?: string | null;
  bankSwift?: string | null;
  paymentTerms?: string | null;
};

export type ClientLite = {
  companyName: string;
  contactPerson: string;
  email: string;
  phone?: string | null;
  address?: string | null;
};

export type InvoiceLike = {
  id: string;
  type: string;
  date: string;
  dueDate?: string | null;
  items: any;
  subtotal: number;
  discountAmount?: number | null;
  vatAmount: number;
  total: number;
  status: string;
  paymentMethod?: string | null;
  paymentReference?: string | null;
};

export type ContractLike = {
  id: string;
  startDate: string;
  endDate: string;
  monthlyRate: number;
  installationCost: number;
  printingCost: number;
  hasVat: boolean;
  totalContractValue: number;
  status: string;
};

type BufferResolver = (buf: Buffer) => void;

function collect(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise<Buffer>((resolve: BufferResolver, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

// ── Colours / layout tokens ─────────────────────────────────────────────────
const INK = '#1e293b';
const MUTE = '#64748b';
const SOFT = '#94a3b8';
const LINE = '#e2e8f0';
const ACCENT = '#6366f1';

function money(n: number) {
  return `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function tryDecodeLogo(logo?: string | null): Buffer | null {
  if (!logo) return null;
  try {
    // Accept "data:image/png;base64,..." or raw base64
    const m = /^data:image\/[a-zA-Z0-9+.-]+;base64,(.+)$/.exec(logo);
    const b64 = m ? m[1] : logo;
    return Buffer.from(b64, 'base64');
  } catch {
    return null;
  }
}

function drawHeader(doc: PDFKit.PDFDocument, company: CompanyProfileLite, title: string) {
  const left = 50;
  const top = 40;

  const logoBuf = tryDecodeLogo(company.logo);
  if (logoBuf) {
    try { doc.image(logoBuf, left, top, { fit: [80, 60] }); } catch { /* ignore broken logo */ }
  }

  doc.fillColor(INK).font('Helvetica-Bold').fontSize(18)
    .text(company.name || 'Company', left + (logoBuf ? 92 : 0), top + 4);

  const lines = [
    company.address,
    [company.city, company.country].filter(Boolean).join(', '),
    company.phone,
    company.email,
    company.website,
    company.vatNumber ? `VAT: ${company.vatNumber}` : null,
    company.regNumber ? `Reg: ${company.regNumber}` : null,
  ].filter(Boolean) as string[];

  doc.font('Helvetica').fontSize(9).fillColor(MUTE);
  lines.forEach((l, i) => doc.text(l, left + (logoBuf ? 92 : 0), top + 26 + i * 11));

  // Title on the right
  doc.font('Helvetica-Bold').fontSize(22).fillColor(ACCENT)
    .text(title.toUpperCase(), 350, top, { width: 210, align: 'right' });

  // Divider
  const dividerY = top + Math.max(80, 26 + lines.length * 11 + 10);
  doc.moveTo(left, dividerY).lineTo(560, dividerY).strokeColor(LINE).lineWidth(1).stroke();
  doc.y = dividerY + 14;
}

function drawFooter(doc: PDFKit.PDFDocument, company: CompanyProfileLite) {
  const bottom = 770;
  doc.strokeColor(LINE).lineWidth(0.5).moveTo(50, bottom).lineTo(560, bottom).stroke();
  doc.font('Helvetica').fontSize(8).fillColor(SOFT)
    .text(
      `${company.name || 'Company'}${company.website ? ' · ' + company.website : ''}${company.supportEmail ? ' · ' + company.supportEmail : ''}`,
      50, bottom + 6, { width: 510, align: 'center' }
    );
}

function kvRow(doc: PDFKit.PDFDocument, label: string, value: string, y: number) {
  doc.font('Helvetica').fontSize(9).fillColor(MUTE).text(label, 50, y);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text(value, 150, y);
}

// ── Invoice / Quotation / Receipt PDF ───────────────────────────────────────

export async function buildInvoicePdf(
  invoice: InvoiceLike,
  client: ClientLite,
  company: CompanyProfileLite
): Promise<Buffer> {
  const typeLabel = String(invoice.type || 'Invoice');
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const done = collect(doc);

  drawHeader(doc, company, typeLabel);

  // Meta panel (left: bill-to; right: doc details)
  const metaY = doc.y;
  doc.font('Helvetica-Bold').fontSize(10).fillColor(MUTE).text('BILL TO', 50, metaY);
  doc.font('Helvetica-Bold').fontSize(12).fillColor(INK).text(client.companyName, 50, metaY + 14);
  doc.font('Helvetica').fontSize(9).fillColor(MUTE);
  const billLines = [client.contactPerson, client.email, client.phone, client.address].filter(Boolean) as string[];
  billLines.forEach((l, i) => doc.text(l, 50, metaY + 30 + i * 11));

  kvRow(doc, 'Document #', invoice.id.slice(0, 8).toUpperCase(), metaY);
  kvRow(doc, 'Date', invoice.date, metaY + 14);
  if (invoice.dueDate) kvRow(doc, 'Due Date', invoice.dueDate, metaY + 28);
  kvRow(doc, 'Status', invoice.status, metaY + 42);

  // Reposition below both panels
  doc.y = metaY + Math.max(30 + billLines.length * 11 + 10, 70);
  doc.moveDown(1);

  // Items table
  const tableTop = doc.y;
  const col = { desc: 50, amount: 480 };
  doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTE)
    .text('DESCRIPTION', col.desc, tableTop)
    .text('AMOUNT', col.amount, tableTop, { width: 80, align: 'right' });
  doc.moveTo(50, tableTop + 14).lineTo(560, tableTop + 14).strokeColor(LINE).stroke();

  const items: any[] = Array.isArray(invoice.items) ? invoice.items : [];
  let y = tableTop + 22;
  doc.font('Helvetica').fontSize(10).fillColor(INK);
  items.forEach(item => {
    const desc = String(item.description ?? '');
    const amt = Number(item.amount ?? 0);
    const h = doc.heightOfString(desc, { width: 410 });
    doc.fillColor(INK).text(desc, col.desc, y, { width: 410 });
    doc.text(money(amt), col.amount, y, { width: 80, align: 'right' });
    y += Math.max(h, 14) + 6;
  });

  doc.moveTo(50, y + 4).lineTo(560, y + 4).strokeColor(LINE).stroke();
  y += 14;

  // Totals
  const totalRow = (label: string, value: string, bold = false) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 12 : 10)
      .fillColor(bold ? INK : MUTE)
      .text(label, 370, y, { width: 100, align: 'right' });
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 12 : 10).fillColor(INK)
      .text(value, 480, y, { width: 80, align: 'right' });
    y += bold ? 18 : 14;
  };

  totalRow('Subtotal', money(invoice.subtotal));
  if (invoice.discountAmount && invoice.discountAmount > 0) totalRow('Discount', `-${money(invoice.discountAmount)}`);
  if (invoice.vatAmount > 0) totalRow('VAT (15%)', money(invoice.vatAmount));
  y += 4;
  doc.moveTo(370, y).lineTo(560, y).strokeColor(LINE).stroke();
  y += 8;
  totalRow('TOTAL', money(invoice.total), true);

  // Payment method (for receipts / paid invoices)
  if (invoice.paymentMethod) {
    y += 10;
    doc.font('Helvetica-Bold').fontSize(10).fillColor(MUTE).text('PAYMENT', 50, y);
    y += 14;
    doc.font('Helvetica').fontSize(9).fillColor(INK).text(`Method: ${invoice.paymentMethod}`, 50, y);
    if (invoice.paymentReference) { y += 12; doc.text(`Reference: ${invoice.paymentReference}`, 50, y); }
    y += 14;
  }

  // Banking / payment terms (skip for receipts)
  if (typeLabel.toLowerCase() !== 'receipt' && (company.bankName || company.bankAccountNumber || company.paymentTerms)) {
    y += 14;
    doc.font('Helvetica-Bold').fontSize(10).fillColor(MUTE).text('PAYMENT DETAILS', 50, y);
    y += 14;
    doc.font('Helvetica').fontSize(9).fillColor(INK);
    const bankLines = [
      company.bankName ? `Bank: ${company.bankName}` : null,
      company.bankAccountName ? `Account Name: ${company.bankAccountName}` : null,
      company.bankAccountNumber ? `Account Number: ${company.bankAccountNumber}` : null,
      company.bankBranch ? `Branch: ${company.bankBranch}` : null,
      company.bankSwift ? `SWIFT/BIC: ${company.bankSwift}` : null,
    ].filter(Boolean) as string[];
    bankLines.forEach(l => { doc.text(l, 50, y); y += 12; });
    if (company.paymentTerms) {
      y += 4;
      doc.font('Helvetica-Oblique').fontSize(9).fillColor(MUTE).text(company.paymentTerms, 50, y, { width: 510 });
    }
  }

  drawFooter(doc, company);
  doc.end();
  return done;
}

// ── Contract PDF ────────────────────────────────────────────────────────────

export async function buildContractPdf(
  contract: ContractLike,
  client: ClientLite,
  billboardName: string,
  billboardLocation: string,
  company: CompanyProfileLite
): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const done = collect(doc);

  drawHeader(doc, company, 'Contract');

  const metaY = doc.y;
  doc.font('Helvetica-Bold').fontSize(10).fillColor(MUTE).text('CLIENT', 50, metaY);
  doc.font('Helvetica-Bold').fontSize(12).fillColor(INK).text(client.companyName, 50, metaY + 14);
  doc.font('Helvetica').fontSize(9).fillColor(MUTE);
  const billLines = [client.contactPerson, client.email, client.phone, client.address].filter(Boolean) as string[];
  billLines.forEach((l, i) => doc.text(l, 50, metaY + 30 + i * 11));

  kvRow(doc, 'Contract #', contract.id.slice(0, 8).toUpperCase(), metaY);
  kvRow(doc, 'Start', contract.startDate, metaY + 14);
  kvRow(doc, 'End', contract.endDate, metaY + 28);
  kvRow(doc, 'Status', contract.status, metaY + 42);

  doc.y = metaY + Math.max(30 + billLines.length * 11 + 10, 70);
  doc.moveDown(1);

  const rows: [string, string][] = [
    ['Billboard', billboardName],
    ['Location', billboardLocation],
    ['Period', `${contract.startDate} to ${contract.endDate}`],
    ['Monthly Rate', money(contract.monthlyRate)],
    ['Installation', money(contract.installationCost)],
    ['Printing', money(contract.printingCost)],
    ['VAT', contract.hasVat ? '15%' : 'None'],
  ];

  let y = doc.y;
  rows.forEach(([k, v]) => {
    doc.font('Helvetica').fontSize(10).fillColor(MUTE).text(k, 50, y);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text(v, 200, y);
    y += 18;
  });

  y += 10;
  doc.moveTo(50, y).lineTo(560, y).strokeColor(LINE).stroke();
  y += 12;
  doc.font('Helvetica-Bold').fontSize(14).fillColor(INK).text('TOTAL CONTRACT VALUE', 50, y);
  doc.font('Helvetica-Bold').fontSize(14).fillColor(ACCENT).text(money(contract.totalContractValue), 400, y, { width: 160, align: 'right' });

  drawFooter(doc, company);
  doc.end();
  return done;
}
