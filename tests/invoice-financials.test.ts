import { describe, expect, it } from 'vitest';
import { invoiceLineItemsGross, normalizeInvoiceFinancials } from '../services/invoiceFinancials';

describe('invoice financial normalisation', () => {
  it('derives a finite total from line-item evidence when PostgreSQL contains NaN', () => {
    const result = normalizeInvoiceFinancials({
      id: 'INV-LEGACY',
      items: [{ description: 'Monthly Rental', amount: 575 }],
      subtotal: 'NaN',
      vatAmount: 0,
      total: 'NaN',
    });

    expect(result.total).toBe(575);
    expect(result.subtotal).toBe(575);
    expect(result.vatAmount).toBe(0);
    expect(result.financialDataWarning).toMatch(/derived from the invoice line items/);
  });

  it('keeps valid stored values unchanged and rounds line-item sums', () => {
    expect(invoiceLineItemsGross([{ amount: 10.005 }, { amount: 2.004 }])).toBe(12.01);
    const result = normalizeInvoiceFinancials({ subtotal: 100, vatAmount: 15.5, total: 115.5, items: [{ amount: 115.5 }] });
    expect(result).not.toHaveProperty('financialDataWarning');
    expect(result).toMatchObject({ subtotal: 100, vatAmount: 15.5, total: 115.5 });
  });
});
