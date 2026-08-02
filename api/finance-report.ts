import type { HttpRequest, HttpResponse } from '../lib/http';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { cors, requireManagerOrAdmin } from '../lib/auth';
import { buildForensicFinanceReport } from '../services/forensicFinance';
import { createHash, randomUUID } from 'node:crypto';

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
      // Expenses through the end date are retained for as-of controls; the
      // forensic service applies the requested P&L window separately.
      prisma.expense.findMany({ where: { date: { lte: parsed.data.endDate } } }),
    ]);
    const invoices = invoiceRows.map(row => ({ ...row, subtotal: Number(row.subtotal), discountAmount: row.discountAmount == null ? undefined : Number(row.discountAmount), vatAmount: Number(row.vatAmount), total: Number(row.total), proofUploadedAt: row.proofUploadedAt?.toISOString(), recordedAt: row.recordedAt?.toISOString(), postedAt: row.postedAt?.toISOString(), voidedAt: row.voidedAt?.toISOString() })) as any;
    const expenses = expenseRows.map(row => ({ ...row, amount: Number(row.amount) })) as any;
    const report = buildForensicFinanceReport(
      invoices,
      clientRows as any,
      expenses,
      new Date(`${parsed.data.endDate}T23:59:59Z`),
      parsed.data,
    );
    if (!report.period) throw new Error('Period-scoped finance report was not generated.');
    const generatedAt = new Date().toISOString();
    const reportId = randomUUID();
    const response = {
      ...report,
      // `totals` are as-of ledger controls for aging; `period` is the only
      // P&L window and therefore cannot accidentally include prior invoices.
      period: report.period,
      generatedBy: payload.email,
      generatedAt,
      reportId,
      basis: {
        revenue: 'Accrual basis from active, non-void invoices dated within the selected period; VAT shown separately.',
        collections: 'Cash basis from approved, active, non-void receipts dated within the selected period.',
        expenses: 'Expense-date basis within the selected period.',
        aging: `Outstanding balances as at ${parsed.data.endDate}.`,
      },
    };
    const reportHash = createHash('sha256').update(JSON.stringify(response)).digest('hex');
    await prisma.auditLog.create({
      data: {
        action: 'FINANCE_REPORT_GENERATED',
        details: `Forensic director report ${reportId} generated for ${parsed.data.startDate} to ${parsed.data.endDate}; SHA-256 ${reportHash}`,
        userId: payload.userId,
        userEmail: payload.email,
        tableName: 'finance_reports',
        recordId: reportId,
        afterData: {
          reportHash,
          startDate: parsed.data.startDate,
          endDate: parsed.data.endDate,
          asOfTotals: response.totals,
          period: response.period,
          exceptionCount: response.exceptions.length,
        },
        ipAddress: req.ip || null,
        userAgent: req.headers['user-agent'] || null,
      },
    });
    return res.status(200).json({ ...response, reportHash });
  } catch (error: any) {
    return res.status(500).json({ error: 'Could not generate the forensic financial report.', detail: process.env.NODE_ENV === 'development' ? error?.message : undefined });
  }
}
