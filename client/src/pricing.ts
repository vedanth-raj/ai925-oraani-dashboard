// Client mirror of server/utils/pricing.js — used for live previews. The server recalculates at checkout.
import type { PriceTier, ProductSize, TierType, TierUnit, WeightOption, WeightSlab } from './api';

export const GST_RATE = 0.03;

// Smallest net silver weight a customer order can be placed for, per purchase type (the server checks the same)
export const MIN_ORDER_GRAMS: Record<'READY_STOCK' | 'ON_ORDER', number> = { READY_STOCK: 100, ON_ORDER: 500 };

export function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function formatINR(n: number | null | undefined, decimals = 2): string {
  const v = Number(n) || 0;
  return '₹' + v.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function formatGrams(n: number | null | undefined): string {
  const v = Number(n) || 0;
  return `${parseFloat(v.toFixed(3))} g`;
}

export interface Breakdown {
  weight_g: number;
  silver_amount: number;
  labour_amount: number;
  subtotal: number;
  gst_amount: number;
  total: number;
  state_premium_pct?: number;
}

export function applyStatePremium(val: number, premiumPct = 0): number {
  if (!premiumPct || isNaN(premiumPct) || Number(premiumPct) === 0) return Number(val) || 0;
  return (Number(val) || 0) * (1 + Number(premiumPct) / 100);
}

// Silver per gram + labour per gram, then 3% GST on the whole.
export function priceBreakdown(weightG: number, silverRate: number, labourPerGram: number, statePremiumPct = 0): Breakdown {
  const effectiveSilver = applyStatePremium(silverRate, statePremiumPct);
  const effectiveLabour = applyStatePremium(labourPerGram, statePremiumPct);
  const silver = round2(effectiveSilver * weightG);
  const labour = round2(effectiveLabour * weightG);
  const subtotal = round2(silver + labour);
  const gst = round2(subtotal * GST_RATE);
  return {
    weight_g: weightG,
    silver_amount: silver,
    labour_amount: labour,
    subtotal,
    gst_amount: gst,
    total: round2(subtotal + gst),
    state_premium_pct: Number(statePremiumPct) || 0
  };
}

export function addBreakdowns(parts: Breakdown[]): Breakdown {
  const sum = parts.reduce(
    (acc, p) => ({
      weight_g: acc.weight_g + p.weight_g,
      silver_amount: acc.silver_amount + p.silver_amount,
      labour_amount: acc.labour_amount + p.labour_amount,
      subtotal: acc.subtotal + p.subtotal,
      gst_amount: acc.gst_amount + p.gst_amount,
      total: acc.total + p.total
    }),
    { weight_g: 0, silver_amount: 0, labour_amount: 0, subtotal: 0, gst_amount: 0, total: 0 }
  );
  return {
    weight_g: round2(sum.weight_g * 1000) / 1000,
    silver_amount: round2(sum.silver_amount),
    labour_amount: round2(sum.labour_amount),
    subtotal: round2(sum.subtotal),
    gst_amount: round2(sum.gst_amount),
    total: round2(sum.total)
  };
}

export const sameNum = (a: number, b: number) => Math.abs(Number(a) - Number(b)) < 0.001;

// All-in price per gram (silver + making, plus GST)
export function perGramAllIn(silverRate: number, making: number): number {
  return (silverRate + making) * (1 + GST_RATE);
}

// Making charge of a slab: its discount price when set (older slabs), else its price
export function tierMaking(t: PriceTier): number {
  return t.discount_price_per_gram !== null && t.discount_price_per_gram !== undefined ? Number(t.discount_price_per_gram) : Number(t.price_per_gram) || 0;
}

// Base making charge for a standard weight: that weight's "Pricing", else the product's labour charge
export function baseMakingFor(baseLabour: number, weightOptions: WeightOption[], stdWeight: number | null): number {
  const opt = stdWeight ? weightOptions.find(o => sameNum(o.std_weight_g, stdWeight)) : undefined;
  if (opt && opt.making_charge !== null && opt.making_charge !== undefined) return Number(opt.making_charge);
  return baseLabour;
}

export function qtyInUnit(unit: TierUnit | undefined, pieces: number, grams: number): number {
  if (unit === 'g') return grams;
  if (unit === 'kg') return grams / 1000;
  return pieces;
}

export function tierMatches(t: PriceTier, pieces: number, grams: number): boolean {
  const q = qtyInUnit(t.qty_unit, pieces, grams);
  return q >= t.min_qty && (t.max_qty === null || t.max_qty === undefined || q <= t.max_qty);
}

// Slabs that apply to a purchase type: its own slabs, or slabs for both types when it has none
export function tiersForMode(tiers: PriceTier[], mode: 'READY_STOCK' | 'ON_ORDER'): PriceTier[] {
  const own = tiers.filter(t => t.order_type === mode);
  return own.length > 0 ? own : tiers.filter(t => !t.order_type || t.order_type === 'ALL');
}

export function pickTier(tiers: PriceTier[], mode: 'READY_STOCK' | 'ON_ORDER', pieces: number, grams: number): PriceTier | null {
  return tiersForMode(tiers, mode).find(t => tierMatches(t, pieces, grams)) || null;
}

// Making charge slabs of a standard weight that a purchase type uses (its own and 'Both'), sorted by net grams
export function weightSlabsFor(weightOptions: WeightOption[], stdWeight: number | null, mode: 'READY_STOCK' | 'ON_ORDER'): WeightSlab[] {
  const opt = stdWeight ? weightOptions.find(o => sameNum(o.std_weight_g, stdWeight)) : undefined;
  return (opt?.weight_slabs || [])
    .filter(s => !s.order_type || s.order_type === 'ALL' || s.order_type === mode)
    .sort((a, b) => a.min_g - b.min_g);
}

// Slab for the net grams of one standard weight. Ranges run up to their end weight, so a weight between two
// slabs (100.5 g between 1-100 and 101-500) takes the next one; below the first slab, the first.
export function pickWeightSlab(slabs: WeightSlab[], grams: number): WeightSlab | null {
  if (slabs.length === 0) return null;
  return slabs.find(s => s.max_g === null || s.max_g === undefined || grams <= s.max_g + 1e-9) || slabs[slabs.length - 1];
}

// "1 - 100 g", "1501 g & above"
export function formatWeightSlab(s: Pick<WeightSlab, 'min_g' | 'max_g'>): string {
  const n = (v: number) => parseFloat(Number(v).toFixed(3));
  return s.max_g === null || s.max_g === undefined ? `${n(s.min_g)} g & above` : `${n(s.min_g)} - ${n(s.max_g)} g`;
}

// Default making charge slabs offered for a new standard weight
export const DEFAULT_WEIGHT_SLABS: WeightSlab[] = [
  { min_g: 1, max_g: 100, making: 10, order_type: 'ALL' },
  { min_g: 101, max_g: 500, making: 9, order_type: 'ALL' },
  { min_g: 501, max_g: 1000, making: 8, order_type: 'ALL' },
  { min_g: 1001, max_g: 1500, making: 7, order_type: 'ALL' },
  { min_g: 1501, max_g: null, making: 6, order_type: 'ALL' }
];

// Making charge per gram for one standard weight. A weight with its own slabs is priced by the net grams of
// that weight in the order (`stdGrams`); otherwise by the product's quantity slab for its total pieces / grams.
export function makingFor(
  product: { labour_per_gram: number; weight_options: WeightOption[]; tiers: PriceTier[] },
  stdWeight: number | null,
  mode: 'READY_STOCK' | 'ON_ORDER',
  pieces: number,
  grams: number,
  stdGrams = 0,
  statePremiumPct = 0
): { labour: number; mrp: number; tier: PriceTier | null; weightSlab: WeightSlab | null } {
  const rawMrp = baseMakingFor(product.labour_per_gram, product.weight_options, stdWeight);
  const weightSlab = pickWeightSlab(weightSlabsFor(product.weight_options, stdWeight, mode), stdGrams);
  let rawLabour: number;
  let tier: PriceTier | null = null;
  if (weightSlab) {
    rawLabour = weightSlab.making;
  } else {
    tier = pickTier(product.tiers, mode, pieces, grams);
    rawLabour = tier ? tierMaking(tier) : rawMrp;
  }
  const labour = round2(applyStatePremium(rawLabour, statePremiumPct));
  const mrp = round2(applyStatePremium(rawMrp, statePremiumPct));
  return { labour, mrp, tier, weightSlab };
}

// Discount on the full per-gram rate (silver + base making), so it reads the same at any weight.
export function slabDiscountPct(silverRate: number, baseMaking: number, slabMaking: number): number {
  const full = silverRate + baseMaking;
  return full > 0 ? Math.max(0, round2(((baseMaking - slabMaking) / full) * 100)) : 0;
}

// Weight of one piece. The standard weight is the weight of a 20-inch piece, so a piece weighs
// std × size ÷ 20 (3 g at 14" = 2.1 g). Without a standard weight, the first row for the size, else the
// 20-inch standard weight scaled to the size (older staff orders).
export function unitWeightFor(sizes: ProductSize[], stdWeightPer20: number, sizeInches: number, stdWeight: number | null = null): number {
  if (stdWeight && stdWeight > 0) return (stdWeight * sizeInches) / 20;
  const v = sizes.find(s => sameNum(s.size_inches, sizeInches) && !s.derived);
  if (v) return v.weight_g;
  return (sizeInches / 20) * (stdWeightPer20 || 20);
}

export const TIER_UNIT_LABEL:Record<TierUnit, string> = { pcs: 'pcs', g: 'g', kg: 'kg' };
export const TIER_TYPE_LABEL: Record<TierType, string> = { READY_STOCK: 'Ready Stock', ON_ORDER: 'On Order', ALL: 'Both' };

// "50 - 100 g", "1.5 kg & above", "12 - 999 pcs"
export function formatTierQty(t: Pick<PriceTier, 'min_qty' | 'max_qty' | 'qty_unit'>): string {
  const unit = TIER_UNIT_LABEL[t.qty_unit || 'pcs'];
  const n = (v: number) => parseFloat(Number(v).toFixed(3));
  return t.max_qty === null || t.max_qty === undefined ? `${n(t.min_qty)} ${unit} & above` : `${n(t.min_qty)} - ${n(t.max_qty)} ${unit}`;
}

export const STANDARD_INCHES = [14, 16, 18, 20, 22, 24, 26, 28, 30];

// Range a customer can type for an On Order size (the server checks the same)
export const MIN_ORDER_INCHES = 1;
export const MAX_ORDER_INCHES = 60;
