import type { CatalogProduct, WeightSlabDiscount } from '../api';
import { addBreakdowns, makingFor, priceBreakdown, sameNum, unitWeightFor, MIN_ORDER_GRAMS, type Breakdown } from '../pricing';

export type PurchaseMode = 'READY_STOCK' | 'ON_ORDER';

export interface CartLine {
  product_id: string;
  name: string;
  sku: string;
  image_path: string | null;
  std_weight_g?: number | null; // standard weight (g per piece); missing on lines saved before weights existed
  size_inches: number;
  pieces: number;
}

export type Carts = Record<PurchaseMode, CartLine[]>;

export const EMPTY_CARTS: Carts = { READY_STOCK: [], ON_ORDER: [] };

export const MODE_LABEL: Record<PurchaseMode, string> = {
  READY_STOCK: 'Ready Stock',
  ON_ORDER: 'On Order Purchase'
};

function cartKey(accountId: string) {
  return `ai925_cart_${accountId}`;
}

export function loadCarts(accountId: string): Carts {
  try {
    const raw = localStorage.getItem(cartKey(accountId));
    if (!raw) return EMPTY_CARTS;
    const parsed = JSON.parse(raw);
    return { READY_STOCK: parsed.READY_STOCK || [], ON_ORDER: parsed.ON_ORDER || [] };
  } catch {
    return EMPTY_CARTS;
  }
}

export function saveCarts(accountId: string, carts: Carts) {
  try {
    localStorage.setItem(cartKey(accountId), JSON.stringify(carts));
  } catch {
    // storage unavailable: cart lives in memory for this visit
  }
}

export function sameLine(a: Pick<CartLine, 'product_id' | 'std_weight_g' | 'size_inches'>, b: Pick<CartLine, 'product_id' | 'std_weight_g' | 'size_inches'>): boolean {
  return a.product_id === b.product_id && sameNum(a.size_inches, b.size_inches) && sameNum(a.std_weight_g || 0, b.std_weight_g || 0);
}

export function addLine(lines: CartLine[], line: CartLine): CartLine[] {
  const idx = lines.findIndex(l => sameLine(l, line));
  if (idx === -1) return [...lines, line];
  return lines.map((l, i) => (i === idx ? { ...l, pieces: l.pieces + line.pieces } : l));
}

export function productQty(lines: CartLine[], productId: string): number {
  return lines.filter(l => l.product_id === productId).reduce((s, l) => s + l.pieces, 0);
}

export function lineUnitWeight(line: CartLine, product: CatalogProduct): number {
  return unitWeightFor(product.sizes, product.std_weight_per_20in, line.size_inches, line.std_weight_g ?? null);
}

// Grams of a product across cart lines (quantity slabs can be written in g / kg)
export function productGrams(lines: CartLine[], product: CatalogProduct): number {
  return lines.filter(l => l.product_id === product.id).reduce((s, l) => s + lineUnitWeight(l, product) * l.pieces, 0);
}

// Grams of one standard weight of a product across cart lines (weight slabs are priced on this)
export function stdGrams(lines: CartLine[], product: CatalogProduct, std: number | null | undefined): number {
  return lines
    .filter(l => l.product_id === product.id && sameNum(l.std_weight_g || 0, std || 0))
    .reduce((s, l) => s + lineUnitWeight(l, product) * l.pieces, 0);
}

// Ready stock row matching a line's standard weight and size (any weight for older lines)
export function readyRowFor(product: CatalogProduct, line: Pick<CartLine, 'std_weight_g' | 'size_inches'>) {
  return product.sizes.find(s => sameNum(s.size_inches, line.size_inches) && (!line.std_weight_g || sameNum(s.std_weight_g, line.std_weight_g)));
}

export interface PricedLine {
  line: CartLine;
  product: CatalogProduct | undefined;
  unitWeight: number;
  labour: number;
  breakdown: Breakdown;
  stockShort: boolean;
}

export interface PricedCart {
  rows: PricedLine[];
  total: Breakdown;
  labourUniform: number | null;
  gramsShort: number; // grams still needed to reach the minimum order weight (0 when met)
  issues: string[];
  activeSlabDiscount: number;
  matchedSlab: WeightSlabDiscount | null;
}

const round3 = (n: number) => parseFloat(n.toFixed(3));

// Same rules as the server: a standard weight with its own slabs is priced by the net grams of that weight in
// this cart; otherwise the product's slab for this purchase type by its total pieces / grams, else the weight's
// pricing. If statePremiumPct is provided, state labour adjustment is applied. Weight slab discounts apply by total order weight.
export function priceCart(
  lines: CartLine[],
  products: Record<string, CatalogProduct>,
  silverRate: number,
  mode: PurchaseMode,
  statePremiumPct = 0,
  weightSlabDiscounts: WeightSlabDiscount[] = []
): PricedCart {
  const issues: string[] = [];

  // Calculate total order grams across valid lines
  const totalGrams = lines.reduce((sum, line) => {
    const prod = products[line.product_id];
    return sum + (prod ? lineUnitWeight(line, prod) * line.pieces : 0);
  }, 0);
  const totalKg = totalGrams / 1000;

  // Find matching active weight slab discount
  let activeSlabDiscount = 0;
  let matchedSlab: WeightSlabDiscount | null = null;
  const sortedSlabs = [...weightSlabDiscounts].sort((a, b) => (Number(b.min_kg) || 0) - (Number(a.min_kg) || 0));
  for (const slab of sortedSlabs) {
    if (slab.is_active !== false) {
      const min = Number(slab.min_kg) || 0;
      const max = slab.max_kg === null || slab.max_kg === undefined ? null : Number(slab.max_kg);
      if (totalKg >= min && (max === null || totalKg < max)) {
        activeSlabDiscount = Number(slab.discount_per_gram) || 0;
        matchedSlab = slab;
        break;
      }
    }
  }

  const rows: PricedLine[] = lines.map(line => {
    const product = products[line.product_id];
    if (!product) {
      return { line, product, unitWeight: 0, labour: 0, breakdown: priceBreakdown(0, 0, 0), stockShort: false };
    }
    const { labour } = makingFor(
      product,
      line.std_weight_g ?? null,
      mode,
      productQty(lines, product.id),
      productGrams(lines, product),
      stdGrams(lines, product, line.std_weight_g),
      statePremiumPct
    );
    const unitWeight = lineUnitWeight(line, product);
    const size = readyRowFor(product, line);
    const stockShort = mode === 'READY_STOCK' && (!size || size.stock_qty < line.pieces);
    return {
      line,
      product,
      unitWeight,
      labour,
      breakdown: priceBreakdown(unitWeight * line.pieces, silverRate, labour, 0, activeSlabDiscount),
      stockShort
    };
  });

  for (const r of rows) {
    if (!r.product) {
      issues.push(`${r.line.name} is no longer available — remove it to continue`);
      continue;
    }
    if (r.stockShort) {
      const size = readyRowFor(r.product, r.line);
      issues.push(`${r.product.name} ${r.line.std_weight_g ? `${r.line.std_weight_g} g ` : ''}${r.line.size_inches}": only ${size ? size.stock_qty : 0} pcs in ready stock`);
    }
  }

  const total = addBreakdowns(rows.map(r => r.breakdown));
  total.state_premium_pct = statePremiumPct;
  total.slab_discount_per_gram = activeSlabDiscount;

  const minGrams = MIN_ORDER_GRAMS[mode];
  const gramsShort = rows.length > 0 && total.weight_g < minGrams ? round3(minGrams - total.weight_g) : 0;
  if (gramsShort > 0) {
    issues.push(`Minimum ${MODE_LABEL[mode]} order is ${minGrams} g of silver — your cart has ${round3(total.weight_g)} g. Add ${gramsShort} g more to check out.`);
  }

  const labours = Array.from(new Set(rows.filter(r => r.product).map(r => r.labour)));
  return {
    rows,
    total,
    gramsShort,
    labourUniform: labours.length === 1 ? labours[0] : null,
    issues,
    activeSlabDiscount,
    matchedSlab
  };
}
