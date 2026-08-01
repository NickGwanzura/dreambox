import type { HttpRequest, HttpResponse } from '../lib/http';
import { z } from 'zod';
import { cors, requireManagerOrAdmin } from '../lib/auth';
import { prisma } from '../lib/prisma';

const actionSchema = z.object({
  receiptId: z.string().min(1),
  action: z.enum(['approve', 'reject', 'resolve-remediation']),
  note: z.string().trim().min(10).max(2000),
});

export default async function handler(req: HttpRequest, res: HttpResponse) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const payload = await requireManagerOrAdmin(req, res);
  if (!payload) return;
  if (req.method === 'GET') {
    const receipts = await prisma.invoice.findMany({ where: { type: 'Receipt', isVoided: false, OR: [{ receivedBy: null }, { receivedByUserId: null }, { paymentReference: null }, { approvalStatus: 'Pending' }] }, orderBy: { createdAt: 'asc' }, take: 500 });
    return res.status(200).json(receipts);
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const parsed = actionSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: 'Receipt, action, and a meaningful note are required.' });
  const { receiptId, action, note } = parsed.data;
  const receipt = await prisma.invoice.findUnique({ where: { id: receiptId } });
  if (!receipt || receipt.type !== 'Receipt') return res.status(404).json({ error: 'Receipt not found' });
  if (action === 'approve' && receipt.receivedByUserId === payload.userId) return res.status(409).json({ error: 'The payment recorder cannot approve their own payment.' });
  const approvalStatus = action === 'approve' ? 'Approved' : action === 'reject' ? 'Rejected' : receipt.approvalStatus;
  const updated = await prisma.$transaction(async tx => {
    const row = await tx.invoice.update({ where: { id: receipt.id }, data: { approvalStatus, approvedBy: action === 'approve' ? payload.userId : null, approvedAt: action === 'approve' ? new Date() : null, approvalNote: note } });
    await tx.paymentReview.upsert({ where: { receiptId }, create: { receiptId, status: action === 'resolve-remediation' ? 'Resolved' : 'Closed', resolvedBy: payload.userId, resolvedAt: new Date(), resolutionNote: note }, update: { status: action === 'resolve-remediation' ? 'Resolved' : 'Closed', resolvedBy: payload.userId, resolvedAt: new Date(), resolutionNote: note } });
    await tx.auditLog.create({ data: { action: `PAYMENT_${action.toUpperCase()}`, details: `Receipt ${receiptId}: ${note}`, userId: payload.userId, userEmail: payload.email, tableName: 'invoices', recordId: receiptId, beforeData: receipt as any, afterData: row as any } });
    return row;
  });
  return res.status(200).json(updated);
}
