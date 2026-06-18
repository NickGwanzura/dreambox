import { describe, it, expect } from 'vitest';
import { getProductionFee, STATIC_PRODUCTION_FEES } from '../utils/productionFee';
import { BillboardType } from '../types';

// ============================================================
// productionFee.ts — billboard production fee lookup
// ============================================================

describe('getProductionFee', () => {
  it('returns 0 for null input', () => {
    expect(getProductionFee(null)).toBe(0);
  });

  it('returns 0 for undefined input', () => {
    expect(getProductionFee(undefined)).toBe(0);
  });

  it('returns 0 for LED billboards', () => {
    expect(getProductionFee({ type: BillboardType.LED, width: 7, height: 6 })).toBe(0);
  });

  it('returns the fee for a matching 7x6 Static billboard', () => {
    const fee = getProductionFee({ type: BillboardType.Static, width: 7, height: 6 });
    expect(fee).toBe(750);
  });

  it('returns the fee for a rotated 6x7 Static billboard (same physical size)', () => {
    const fee = getProductionFee({ type: BillboardType.Static, width: 6, height: 7 });
    expect(fee).toBe(750);
  });

  it('returns the fee for a 12x4 Static billboard', () => {
    const fee = getProductionFee({ type: BillboardType.Static, width: 12, height: 4 });
    expect(fee).toBe(850);
  });

  it('returns 0 for an unknown Static billboard size', () => {
    const fee = getProductionFee({ type: BillboardType.Static, width: 10, height: 5 });
    expect(fee).toBe(0);
  });

  it('returns 0 when width/height are non-numeric', () => {
    const fee = getProductionFee({ type: BillboardType.Static, width: NaN, height: NaN });
    expect(fee).toBe(0);
  });

  it('each fee in the rules table is positive', () => {
    STATIC_PRODUCTION_FEES.forEach(r => {
      expect(r.fee).toBeGreaterThan(0);
    });
  });
});
