// Reference tables for a product: ready stock, standard weights, order quantity slabs, and the
// customer-facing quantity price strip (₹/pc and discount per slab, like a pack-size price list).
import React from 'react';
import type { PriceTier, TierType, TierUnit, WeightSlab } from '../api';
import { formatINR, formatTierQty, formatWeightSlab, perGramAllIn, round2, sameNum, slabDiscountPct, tierMaking, TIER_TYPE_LABEL } from '../pricing';

const th = 'px-2.5 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-[#766B60] bg-[#F5F0E8] whitespace-nowrap';
const td = 'px-2.5 py-2 text-xs text-[#2F2923] whitespace-nowrap';
const grams = (g: number) => `${parseFloat(Number(g).toFixed(3))} g`;

const Frame: React.FC<{ title?: string; note?: React.ReactNode; children: React.ReactNode }> = ({ title, note, children }) => (
  <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl overflow-hidden shadow-card">
    {title && <p className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-[#2F2923] border-b border-[#E8DCCB] text-center">{title}</p>}
    <div className="overflow-x-auto">{children}</div>
    {note && <p className="px-3 py-1.5 text-[10px] text-[#766B60] border-t border-[#E8DCCB] bg-[#F5F0E8]/60">{note}</p>}
  </div>
);

// Rows that share a standard weight are grouped so the weight prints once, like the reference sheet
function groupByStd<T extends { std_weight_g: number }>(rows: T[]): T[][] {
  const groups: T[][] = [];
  for (const r of [...rows].sort((a, b) => a.std_weight_g - b.std_weight_g)) {
    const last = groups[groups.length - 1];
    if (last && sameNum(last[0].std_weight_g, r.std_weight_g)) last.push(r);
    else groups.push([r]);
  }
  return groups;
}

export interface ReadyRowView {
  std_weight_g: number;
  size_inches: number;
  stock_qty: number;
  weight_g: number;
}

// Ready Stock: Standard Wt. | Size | Qty, plus piece weight and (with a rate) price per piece
export const ReadyStockTable: React.FC<{
  rows: ReadyRowView[];
  title?: string;
  priceFor?: (row: ReadyRowView) => number | null;
  selected?: { std: number; size: number } | null;
  onSelect?: (row: ReadyRowView) => void;
  note?: React.ReactNode;
}> = ({ rows, title = 'Ready Stock Window', priceFor, selected, onSelect, note }) => {
  if (rows.length === 0) return null;
  return (
    <Frame title={title} note={note}>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={th}>Standard Wt.</th>
            <th className={th}>Size</th>
            <th className={th}>Qty.</th>
            <th className={th}>Wt / pc</th>
            {priceFor && <th className={th}>₹ / pc</th>}
          </tr>
        </thead>
        <tbody>
          {groupByStd(rows).map(group => group.map((r, i) => {
            const active = selected && sameNum(selected.std, r.std_weight_g) && sameNum(selected.size, r.size_inches);
            const price = priceFor ? priceFor(r) : null;
            return (
              <tr
                key={`${r.std_weight_g}-${r.size_inches}`}
                onClick={onSelect ? () => onSelect(r) : undefined}
                className={`border-t border-[#E8DCCB] ${onSelect ? 'cursor-pointer hover:bg-[#F5F0E8]' : ''} ${active ? 'bg-[#E8DCCB]' : ''}`}
              >
                {i === 0 && <td rowSpan={group.length} className={`${td} font-bold align-top bg-[#FFFCF7]`}>{grams(r.std_weight_g)}</td>}
                <td className={`${td} font-semibold`}>{r.size_inches}"</td>
                <td className={`${td} font-bold ${r.stock_qty > 0 ? 'text-[#4F7D5B]' : 'text-[#C94C4C]'}`}>{r.stock_qty > 0 ? `${r.stock_qty} pcs` : 'Nil'}</td>
                <td className={td}>{grams(r.weight_g)}</td>
                {priceFor && <td className={`${td} font-semibold`}>{price === null ? '—' : formatINR(price, 0)}</td>}
              </tr>
            );
          }))}
        </tbody>
      </table>
    </Frame>
  );
};

export interface WeightRowView {
  std_weight_g: number;
  making_charge: number | null;
  weight_slabs?: WeightSlab[];
  sku_code?: string | null;
  wire_size?: string | null;
  endings?: string | null;
  lock_type?: string | null;
  extra?: Record<string, string>;
}

// Standard Wt. | Pricing | SKU Code | Wire Size | Endings | Lock Type | custom columns
export const WeightOptionsTable: React.FC<{
  rows: WeightRowView[];
  columns?: string[];
  showInternal?: boolean; // wire size & endings are hidden from sales reps and customers
  title?: string;
  pricePerPiece?: (row: WeightRowView) => number | null;
  selectedStd?: number | null;
  onSelect?: (row: WeightRowView) => void;
  note?: React.ReactNode;
}> = ({ rows, columns = [], showInternal = true, title = 'Standard Weights', pricePerPiece, selectedStd, onSelect, note }) => {
  if (rows.length === 0) return null;
  return (
    <Frame title={title} note={note}>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={th}>Standard Wt.</th>
            <th className={th}>Pricing</th>
            {pricePerPiece && <th className={th}>₹ / pc</th>}
            <th className={th}>SKU Code</th>
            {showInternal && <th className={th}>Wire Size</th>}
            {showInternal && <th className={th}>Endings</th>}
            <th className={th}>Lock Type</th>
            {columns.map(c => <th key={c} className={th}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const active = selectedStd !== null && selectedStd !== undefined && sameNum(selectedStd, r.std_weight_g);
            const ppc = pricePerPiece ? pricePerPiece(r) : null;
            return (
              <tr
                key={r.std_weight_g}
                onClick={onSelect ? () => onSelect(r) : undefined}
                className={`border-t border-[#E8DCCB] ${onSelect ? 'cursor-pointer hover:bg-[#F5F0E8]' : ''} ${active ? 'bg-[#E8DCCB]' : ''}`}
              >
                <td className={`${td} font-bold`}>{grams(r.std_weight_g)}</td>
                <td className={td}>
                  {r.weight_slabs && r.weight_slabs.length > 1
                    ? r.weight_slabs.map((sl, k) => (
                        <span key={k} className="block">
                          {formatWeightSlab(sl)}: {formatINR(sl.making)}/g{sl.order_type && sl.order_type !== 'ALL' ? ` · ${TIER_TYPE_LABEL[sl.order_type]}` : ''}
                        </span>
                      ))
                    : r.making_charge === null || r.making_charge === undefined ? '—' : `${formatINR(r.making_charge)}/g`}
                </td>
                {pricePerPiece && <td className={`${td} font-semibold`}>{ppc === null ? '—' : formatINR(ppc, 0)}</td>}
                <td className={td}>{r.sku_code || '—'}</td>
                {showInternal && <td className={td}>{r.wire_size || '—'}</td>}
                {showInternal && <td className={td}>{r.endings || '—'}</td>}
                <td className={td}>{r.lock_type || '—'}</td>
                {columns.map(c => <td key={c} className={td}>{r.extra?.[c] || '—'}</td>)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </Frame>
  );
};

export interface SlabRowView {
  min_qty: number;
  max_qty: number | null;
  qty_unit?: TierUnit;
  making: number;
  order_type?: TierType;
}

// Pricing: Order Qty | Making Charges | Type, grouped by type
export const OrderQtyTable: React.FC<{ rows: SlabRowView[]; title?: string; note?: React.ReactNode }> = ({ rows, title = 'Pricing', note }) => {
  if (rows.length === 0) return null;
  const order: TierType[] = ['READY_STOCK', 'ON_ORDER', 'ALL'];
  const sorted = [...rows].sort((a, b) => order.indexOf(a.order_type || 'ALL') - order.indexOf(b.order_type || 'ALL'));
  return (
    <Frame title={title} note={note}>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={th}>Order Qty</th>
            <th className={th}>Making Charges</th>
            <th className={th}>Type</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={i} className="border-t border-[#E8DCCB]">
              <td className={`${td} font-semibold`}>{formatTierQty(r)}</td>
              <td className={td}>{formatINR(r.making)}/g</td>
              <td className={td}>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${r.order_type === 'READY_STOCK' ? 'bg-[#E3EEE6] text-[#4F7D5B]' : r.order_type === 'ON_ORDER' ? 'bg-[#EFE8F7] text-[#6A4C93]' : 'bg-[#E8DCCB] text-[#6B5744]'}`}>
                  {TIER_TYPE_LABEL[r.order_type || 'ALL']}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Frame>
  );
};

// Quantity price strip: MRP per piece, then each slab's quantity, making charge per gram and per piece, and
// discount, with the slab in force highlighted
export const SlabPriceStrip: React.FC<{
  tiers: PriceTier[];
  silverRate: number | null;
  baseMaking: number;
  pieceWeight: number;
  activeTier: PriceTier | null;
  title?: string; // optional centred heading, e.g. "Get discount- 1.5 g"
}> = ({ tiers, silverRate, baseMaking, pieceWeight, activeTier, title }) => {
  const rate = silverRate || 0;
  const mrp = round2(perGramAllIn(rate, baseMaking) * pieceWeight);
  return (
    <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl overflow-hidden shadow-card">
      {title && (
        <div className="px-3 py-2.5 border-b border-[#E8DCCB] text-center text-sm font-bold uppercase tracking-wider text-[#2F2923]">{title}</div>
      )}
      <div className="px-3 py-2 flex items-baseline justify-between border-b border-[#E8DCCB]">
        <span className="text-xs text-[#766B60]">MRP: <strong className="text-[#2F2923]">{silverRate ? formatINR(mrp) : '—'}</strong> / pc</span>
        <span className="text-[10px] text-[#766B60] text-right">{grams(pieceWeight)} per piece · making {formatINR(baseMaking)}/g</span>
      </div>
      {tiers.length === 0 ? (
        <p className="px-3 py-2 text-[11px] text-[#766B60]">Same price for every quantity.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <tbody>
              <tr>
                <th className={`${th} sticky left-0`}>Qty</th>
                {tiers.map(t => (
                  <td key={t.id || `${t.min_qty}-${t.qty_unit}`} className={`${td} text-center font-bold ${activeTier === t ? 'bg-[#6B5744] text-white' : ''}`}>{formatTierQty(t)}</td>
                ))}
              </tr>
              <tr className="border-t border-[#E8DCCB]">
                <th className={`${th} sticky left-0`}>Making / g</th>
                {tiers.map(t => (
                  <td key={t.id || `${t.min_qty}-${t.qty_unit}`} className={`${td} text-center font-semibold ${activeTier === t ? 'bg-[#E8DCCB]' : ''}`}>
                    {formatINR(tierMaking(t))}
                  </td>
                ))}
              </tr>
              <tr className="border-t border-[#E8DCCB]">
                <th className={`${th} sticky left-0`}>Making / pc</th>
                {tiers.map(t => (
                  <td key={t.id || `${t.min_qty}-${t.qty_unit}`} className={`${td} text-center font-semibold ${activeTier === t ? 'bg-[#E8DCCB]' : ''}`}>
                    {formatINR(round2(tierMaking(t) * pieceWeight))}
                  </td>
                ))}
              </tr>
              <tr className="border-t border-[#E8DCCB]">
                <th className={`${th} sticky left-0`}>Discount</th>
                {tiers.map(t => (
                  <td key={t.id || `${t.min_qty}-${t.qty_unit}`} className={`${td} text-center font-bold text-[#4F7D5B] ${activeTier === t ? 'bg-[#E8DCCB]' : ''}`}>
                    {slabDiscountPct(rate, baseMaking, tierMaking(t)).toFixed(2)}%
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// Net quantity price strip for a standard weight with its own making charge slabs: net grams of that weight,
// making per gram and the discount on the full rate, with the slab in force highlighted
export const WeightSlabStrip: React.FC<{
  slabs: WeightSlab[];
  silverRate: number | null;
  baseMaking: number;
  netGrams: number;
  activeSlab: WeightSlab | null;
  title?: string; // optional centred heading, e.g. "Get discount- 1.5 g"
}> = ({ slabs, silverRate, baseMaking, netGrams, activeSlab, title }) => {
  const rate = silverRate || 0;
  const isActive = (sl: WeightSlab) => activeSlab !== null && sameNum(activeSlab.min_g, sl.min_g);
  return (
    <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl overflow-hidden shadow-card">
      {title && (
        <div className="px-3 py-2.5 border-b border-[#E8DCCB] text-center text-sm font-bold uppercase tracking-wider text-[#2F2923]">{title}</div>
      )}
      <div className="px-3 py-2 flex items-baseline justify-between border-b border-[#E8DCCB]">
        <span className="text-xs text-[#766B60]">Your net qty: <strong className="text-[#2F2923]">{grams(netGrams)}</strong></span>
        <span className="text-[10px] text-[#766B60] text-right">making {activeSlab ? formatINR(activeSlab.making) : formatINR(baseMaking)}/g</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <tbody>
            <tr>
              <th className={`${th} sticky left-0`}>Net qty</th>
              {slabs.map(sl => (
                <td key={sl.min_g} className={`${td} text-center font-bold ${isActive(sl) ? 'bg-[#6B5744] text-white' : ''}`}>{formatWeightSlab(sl)}</td>
              ))}
            </tr>
            <tr className="border-t border-[#E8DCCB]">
              <th className={`${th} sticky left-0`}>Making / g</th>
              {slabs.map(sl => (
                <td key={sl.min_g} className={`${td} text-center font-semibold ${isActive(sl) ? 'bg-[#E8DCCB]' : ''}`}>{formatINR(sl.making)}</td>
              ))}
            </tr>
            <tr className="border-t border-[#E8DCCB]">
              <th className={`${th} sticky left-0`}>Discount</th>
              {slabs.map(sl => (
                <td key={sl.min_g} className={`${td} text-center font-bold text-[#4F7D5B] ${isActive(sl) ? 'bg-[#E8DCCB]' : ''}`}>
                  {slabDiscountPct(rate, baseMaking, sl.making).toFixed(2)}%
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};
