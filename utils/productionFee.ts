import { BillboardType } from '../types';

export interface ProductionFeeRule {
  width: number;
  height: number;
  fee: number;
  label: string;
}

export const STATIC_PRODUCTION_FEES: readonly ProductionFeeRule[] = [
  { width: 7, height: 6, fee: 750, label: '7m x 6m' },
  { width: 12, height: 4, fee: 850, label: '12m x 4m' },
];

interface BillboardLike {
  type?: BillboardType | string;
  width?: number;
  height?: number;
}

function matchesDims(rule: ProductionFeeRule, width: number, height: number): boolean {
  // Treat rotations as the same physical billboard (a 7x6 and a 6x7 are identical in reality).
  return (
    (width === rule.width && height === rule.height) ||
    (width === rule.height && height === rule.width)
  );
}

export function getProductionFee(billboard: BillboardLike | null | undefined): number {
  if (!billboard) return 0;
  if (billboard.type !== BillboardType.Static && billboard.type !== 'Static') return 0;
  const w = Number(billboard.width);
  const h = Number(billboard.height);
  if (!Number.isFinite(w) || !Number.isFinite(h)) return 0;
  const hit = STATIC_PRODUCTION_FEES.find(r => matchesDims(r, w, h));
  return hit?.fee ?? 0;
}
