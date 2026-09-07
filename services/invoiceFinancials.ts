/**
 * Defensive normalisation for invoices read from PostgreSQL or legacy
 * localStorage. PostgreSQL numeric NaN values are valid numeric values but are
 * not valid application money; never let them turn into an unexplained $0.
 */

export function finiteMoney(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
}

export function invoiceLineItemsGross(items: unknown): number | null {
  if (!Array.isArray(items) || items.length === 0) return null;
  let total = 0;
  for (const item of items) {
    const amount = finiteMoney((item as any)?.amount);
    if (amount == null || amount < 0) return null;
    total += amount;
  }
  return Math.round((total + Number.EPSILON) * 100) / 100;
}

export function normalizeInvoiceFinancials<T extends Record<string, any>>(row: T): T & { financialDataWarning?: string } {
  const gross = invoiceLineItemsGross(row.items);
  const storedSubtotal = finiteMoney(row.subtotal);
  const storedDiscount = finiteMoney(row.discountAmount);
  const storedVat = finiteMoney(row.vatAmount);
  const storedTotal = finiteMoney(row.total);
  const discount = storedDiscount == null ? 0 : Math.max(0, storedDiscount);

  // Prefer stored values. If legacy data contains NaN, derive only from the
  // line-item evidence and any finite VAT/discount values already present.
  const total = storedTotal ?? (gross == null ? 0 : Math.max(0, gross - discount));
  const vatAmount = storedVat ?? 0;
  const subtotal = storedSubtotal ?? Math.max(0, total - vatAmount);
  const wasInvalid = storedSubtotal == null || storedTotal == null || storedVat == null
    || (row.discountAmount != null && storedDiscount == null);

  return {
    ...row,
    subtotal,
    discountAmount: row.discountAmount == null ? undefined : discount,
    vatAmount,
    total,
    ...(wasInvalid ? {
      financialDataWarning: 'Stored financial total was invalid and was derived from the invoice line items. Review before posting reports.',
    } : {}),
  };
}
