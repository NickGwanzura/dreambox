import type { HttpRequest, HttpResponse } from '../lib/http';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { cors, requireManagerOrAdmin } from '../lib/auth';
import { buildForensicFinanceReport } from '../services/forensicFinance';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const querySchema = z.object({
  startDate: z.string().regex(DATE_RE),
  endDate: z.string().regex(DATE_RE),
});

export default async function handler(req: HttpRequest, res: HttpResponse) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const payload = await requireManagerOrAdmin(req, res);
  if (!payload) return;
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success || parsed.data.startDate > parsed.data.endDate) return res.status(400).json({ error: 'Valid startDate and endDate are required.' });

  try {
    const [invoiceRows, clientRows, expenseRows] = await Promise.all([
      prisma.invoice.findMany({ where: { date: { lte: parsed.data.endDate } }, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] }),
      prisma.client.findMany(),
      prisma.expense.findMany({ where: { date: { gte: parsed.data.startDate, lte: parsed.data.endDate } } }),
    ]);
    const invoices = invoiceRows.map(row => ({ ...row, subtotal: Number(row.subtotal), discountAmount: row.discountAmount == null ? undefined : Number(row.discountAmount), vatAmount: Number(row.vatAmount), total: Number(row.total), proofUploadedAt: row.proofUploadedAt?.toISOString(), recordedAt: row.recordedAt?.toISOString(), postedAt: row.postedAt?.toISOString(), voidedAt: row.voidedAt?.toISOString() })) as any;
    const expenses = expenseRows.map(row => ({ ...row, amount: Number(row.amount) })) as any;
    const report = buildForensicFinanceReport(invoices, clientRows as any, expenses, new Date(`${parsed.data.endDate}T23:59:59Z`));
    const inPeriod = (date: string) => date >= parsed.data.startDate && date <= parsed.data.endDate;
    return res.status(200).json({
      ...report,
      period: {
        startDate: parsed.data.startDate,
        endDate: parsed.data.endDate,
        invoiceGross: report.invoices.filter(row => inPeriod(row.invoice.date)).reduce((sum, row) => sum + Number(row.invoice.total), 0),
        invoiceNet: report.invoices.filter(row => inPeriod(row.invoice.date)).reduce((sum, row) => sum + Number(row.invoice.subtotal), 0),
        vat: report.invoices.filter(row => inPeriod(row.invoice.date)).reduce((sum, row) => sum + Number(row.invoice.vatAmount), 0),
        cashCollected: report.receipts.filter(receipt => inPeriod(receipt.date)).reduce((sum, receipt) => sum + Number(receipt.total), 0),
      },
      generatedBy: payload.email,
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Could not generate the forensic financial report.', detail: process.env.NODE_ENV === 'development' ? error?.message : undefined });
  }
}
