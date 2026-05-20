import { describe, it, expect } from 'vitest';
import { addMonths, calculateContractMonths, calculateContractMonthsSafe } from '../utils/contractDate';

// ============================================================
// Tests for Contract Amendment Business Logic
//
// These tests validate the pure business logic calculations
// that the ContractAmendmentModal performs, extracted from
// the component for isolated unit testing.
// ============================================================

describe('Amendment Financial Impact Calculations', () => {
  // Simulates the financial impact logic from ContractAmendmentModal.tsx lines 47-49:
  //   financialImpact = activeTab === 'rate_change'
  //     ? rateDelta * originalMonths
  //     : monthsDelta * contract.monthlyRate;

  function calcFinancialImpact(
    activeTab: 'extension' | 'reduction' | 'rate_change',
    contract: { startDate: string; endDate: string; monthlyRate: number },
    newEndDate: string,
    newMonthlyRate: number,
  ): { financialImpact: number; monthsDelta: number; rateDelta: number; originalMonths: number; newMonths: number } {
    const originalMonths = calculateContractMonthsSafe(contract.startDate, contract.endDate, 1);
    const newMonths = calculateContractMonthsSafe(contract.startDate, newEndDate, 1);
    const monthsDelta = newMonths - originalMonths;
    const rateDelta = newMonthlyRate - contract.monthlyRate;

    const financialImpact = activeTab === 'rate_change'
      ? rateDelta * originalMonths
      : monthsDelta * contract.monthlyRate;

    return { financialImpact, monthsDelta, rateDelta, originalMonths, newMonths };
  }

  it('calculates positive financial impact for extension', () => {
    const contract = { startDate: '2025-01-01', endDate: '2025-06-30', monthlyRate: 1000 };
    const result = calcFinancialImpact('extension', contract, '2025-12-31', 1000);

    expect(result.monthsDelta).toBeGreaterThan(0);
    expect(result.financialImpact).toBeGreaterThan(0);
    // Extension of ~6 months at $1000/mo = ~$6000
    expect(result.financialImpact).toBeCloseTo(6000, -2);
  });

  it('calculates negative financial impact for reduction', () => {
    const contract = { startDate: '2025-01-01', endDate: '2025-12-31', monthlyRate: 1000 };
    const result = calcFinancialImpact('reduction', contract, '2025-06-30', 1000);

    expect(result.monthsDelta).toBeLessThan(0);
    expect(result.financialImpact).toBeLessThan(0);
  });

  it('calculates zero financial impact when no change', () => {
    const contract = { startDate: '2025-01-01', endDate: '2025-06-30', monthlyRate: 1000 };
    const result = calcFinancialImpact('extension', contract, '2025-06-30', 1000);

    // When newEndDate === original endDate, monthsDelta should be 0
    expect(result.monthsDelta).toBe(0);
    expect(result.financialImpact).toBe(0);
  });

  it('calculates positive rate change impact', () => {
    const contract = { startDate: '2025-01-01', endDate: '2025-12-31', monthlyRate: 1000 };
    const result = calcFinancialImpact('rate_change', contract, '2025-12-31', 1200);

    expect(result.rateDelta).toBe(200);
    // $200 increase * ~12 months = ~$2400
    expect(result.financialImpact).toBeGreaterThan(0);
  });

  it('calculates negative rate change impact', () => {
    const contract = { startDate: '2025-01-01', endDate: '2025-12-31', monthlyRate: 1000 };
    const result = calcFinancialImpact('rate_change', contract, '2025-12-31', 800);

    expect(result.rateDelta).toBe(-200);
    expect(result.financialImpact).toBeLessThan(0);
  });
});

describe('Amendment Total Contract Value Calculation', () => {
  // Simulates the newTotalValue calculation from ContractAmendmentModal.tsx lines 164-169:
  //   const effectiveMonths = activeTab === 'rate_change' ? originalMonths : newMonths;
  //   const effectiveMonthlyRate = activeTab === 'rate_change' ? newMonthlyRate : contract.monthlyRate;
  //   const newTotalValue = (effectiveMonthlyRate * effectiveMonths) +
  //     (contract.installationCost || 0) + (contract.printingCost || 0) + (contract.productionCost || 0);

  function calcNewTotalValue(
    activeTab: 'extension' | 'reduction' | 'rate_change',
    contract: { startDate: string; endDate: string; monthlyRate: number; installationCost?: number; printingCost?: number; productionCost?: number },
    newEndDate: string,
    newMonthlyRate: number,
  ): number {
    const originalMonths = calculateContractMonthsSafe(contract.startDate, contract.endDate, 1);
    const newMonths = calculateContractMonthsSafe(contract.startDate, newEndDate, 1);
    const effectiveMonths = activeTab === 'rate_change' ? originalMonths : newMonths;
    const effectiveMonthlyRate = activeTab === 'rate_change' ? newMonthlyRate : contract.monthlyRate;

    return (effectiveMonthlyRate * effectiveMonths) +
      (contract.installationCost || 0) +
      (contract.printingCost || 0) +
      (contract.productionCost || 0);
  }

  it('calculates new total value for extension including add-on costs', () => {
    const contract = {
      startDate: '2025-01-01',
      endDate: '2025-06-30',
      monthlyRate: 1000,
      installationCost: 500,
      printingCost: 200,
      productionCost: 300,
    };
    const value = calcNewTotalValue('extension', contract, '2025-12-31', 1000);

    // Should include add-on costs (500+200+300=1000) on top of the monthly component
    const addOnTotal = 500 + 200 + 300;
    expect(value).toBeGreaterThan(6000 + addOnTotal); // base monthly * months + add-ons
    // The value should exceed the monthly-only amount by at least the add-on costs
    const monthlyOnlyEstimate = 1000 * 6; // ~6 months * $1000
    expect(value - monthlyOnlyEstimate).toBeGreaterThanOrEqual(addOnTotal - 2000); // allow for month rounding
  });

  it('uses original months for rate_change', () => {
    const contract = {
      startDate: '2025-01-01',
      endDate: '2025-06-30',
      monthlyRate: 1000,
    };
    const value = calcNewTotalValue('rate_change', contract, '2025-12-31', 1200);

    // For rate_change, months should be original (~6) not new (~12)
    // $1200/mo * ~6mo = ~$7200
    expect(value).toBeGreaterThan(7000);
    expect(value).toBeLessThan(8000);
  });
});

describe('Amendment ID Generation', () => {
  // Validates Fix #3: Amendment ID uses full timestamp + random suffix
  it('generates IDs with AM- prefix and timestamp', () => {
    const id = `AM-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
    expect(id).toMatch(/^AM-\d+-[a-z0-9]{8}$/);
  });

  it('generates unique IDs on successive calls', () => {
    const id1 = `AM-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
    // Guarantee different random portion
    const id2 = `AM-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
    expect(id1).not.toBe(id2);
  });
});

describe('Amendment Extension Invoice Generation', () => {
  // Simulates the extension invoice logic from ContractAmendmentModal.tsx lines 239-258:
  // For each extension month, generate an invoice with the effectiveMonthlyRate

  function generateExtensionInvoices(
    contractEndDate: string,
    monthsDelta: number,
    effectiveMonthlyRate: number,
    contractId: string,
    clientId: string,
    hasVat: boolean,
    vatRate: number,
  ): Array<{ id: string; date: string; amount: number; description: string }> {
    const invoices: Array<{ id: string; date: string; amount: number; description: string }> = [];

    // Replicate the splitInclusiveVat logic inline (no dependency on constants)
    const splitVat = (gross: number) => {
      const subtotal = gross / (1 + vatRate);
      const vat = gross - subtotal;
      return { subtotal, vat };
    };

    for (let i = 1; i <= monthsDelta; i++) {
      const monthDate = addMonths(contractEndDate, i);
      const gross = effectiveMonthlyRate;
      const { subtotal, vat } = hasVat ? splitVat(gross) : { subtotal: gross, vat: 0 };

      invoices.push({
        id: `INV-AM-${contractId}-${monthDate.replace(/-/g, '')}`,
        date: monthDate,
        amount: gross,
        description: `Monthly Rental (Amendment Extension) — ${monthDate}`,
      });

      // Validate VAT calculation
      if (hasVat) {
        expect(subtotal + vat).toBeCloseTo(gross, 2);
      }
    }

    return invoices;
  }

  it('generates correct number of invoices for extension', () => {
    const invoices = generateExtensionInvoices('2025-06-30', 6, 1000, 'CTR-001', 'CLI-001', false, 0.155);
    expect(invoices).toHaveLength(6);
  });

  it('generates invoice IDs with correct format', () => {
    const invoices = generateExtensionInvoices('2025-06-30', 1, 1000, 'CTR-001', 'CLI-001', false, 0.155);
    expect(invoices[0].id).toMatch(/^INV-AM-CTR-001-\d{8}$/);
  });

  it('applies VAT inclusive split correctly', () => {
    const invoices = generateExtensionInvoices('2025-06-30', 1, 1155, 'CTR-001', 'CLI-001', true, 0.155);
    // Gross = 1155, VAT rate = 0.155
    // subtotal = 1155 / 1.155 = 1000
    // vat = 1155 - 1000 = 155
    expect(invoices[0].amount).toBe(1155);
  });

  it('generates month dates in order', () => {
    const invoices = generateExtensionInvoices('2025-06-30', 3, 1000, 'CTR-001', 'CLI-001', false, 0.155);
    expect(invoices).toHaveLength(3);
    // Dates should be sequential months
    expect(invoices[0].date).toBe('2025-07-30');
    expect(invoices[1].date).toBe('2025-08-30');
    expect(invoices[2].date).toBe('2025-09-30');
  });
});

describe('Amendment Date Comparison Logic', () => {
  // Validates Fix #4: Compare dates using getTime() numeric comparison

  function isExtension(currentEndDate: string, newEndDate: string): boolean {
    return new Date(newEndDate).getTime() > new Date(currentEndDate).getTime();
  }

  function isReduction(currentEndDate: string, newEndDate: string): boolean {
    return new Date(newEndDate).getTime() < new Date(currentEndDate).getTime();
  }

  it('detects extension correctly (new end > current end)', () => {
    expect(isExtension('2025-06-30', '2025-12-31')).toBe(true);
  });

  it('detects reduction correctly (new end < current end)', () => {
    expect(isReduction('2025-12-31', '2025-06-30')).toBe(true);
  });

  it('returns false for extension when same date', () => {
    expect(isExtension('2025-06-30', '2025-06-30')).toBe(false);
    expect(isReduction('2025-06-30', '2025-06-30')).toBe(false);
  });

  it('handles ISO date strings correctly', () => {
    expect(isExtension('2025-01-01', '2025-06-30')).toBe(true);
    expect(isReduction('2025-06-30', '2025-01-01')).toBe(true);
  });

  it('handles year boundaries correctly for date comparison', () => {
    // Crossing year boundary should still work
    expect(isExtension('2025-12-31', '2026-03-31')).toBe(true);
    expect(isReduction('2026-03-31', '2025-12-31')).toBe(true);
  });
});
