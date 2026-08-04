import type { HttpRequest, HttpResponse } from '../lib/http';
import { cors, requireManagerOrAdmin } from '../lib/auth';
import { prisma } from '../lib/prisma';

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

/**
 * Manager/Admin-only summaries for the Today command center. Proof URLs and
 * proof metadata are intentionally never selected or returned from this route.
 */
export default async function handler(req: HttpRequest, res: HttpResponse) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const payload = await requireManagerOrAdmin(req, res);
  if (!payload) return;

  try {
    const reviews = await prisma.paymentReview.findMany({
      where: { status: 'Open' },
      orderBy: { createdAt: 'asc' },
      take: 250,
      select: {
        id: true,
        receiptId: true,
        status: true,
        assignedTo: true,
        createdAt: true,
      },
    });
    const receiptIds = reviews.map(review => review.receiptId);
    const receipts = receiptIds.length === 0
      ? []
      : await prisma.invoice.findMany({
        where: { id: { in: receiptIds }, type: 'Receipt', isVoided: false },
        select: {
          id: true,
          clientId: true,
          date: true,
          total: true,
          paymentMethod: true,
          paymentReference: true,
          approvalStatus: true,
        },
      });
    const receiptById = new Map(receipts.map(receipt => [receipt.id, receipt]));

    return res.status(200).json(reviews.map(review => {
      const receipt = receiptById.get(review.receiptId);
      return {
        id: review.id,
        receiptId: review.receiptId,
        status: review.status,
        assignedTo: review.assignedTo,
        createdAt: iso(review.createdAt),
        ...(receipt ? {
          receipt: {
            id: receipt.id,
            clientId: receipt.clientId,
            date: receipt.date,
            total: Number(receipt.total),
            paymentMethod: receipt.paymentMethod,
            paymentReference: receipt.paymentReference,
            approvalStatus: receipt.approvalStatus,
          },
        } : {}),
      };
    }));
  } catch {
    return res.status(500).json({ error: 'Could not load Today payment reviews.' });
  }
}
