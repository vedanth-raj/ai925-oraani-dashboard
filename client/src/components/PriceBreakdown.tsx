import React from 'react';
import { type Breakdown, formatINR, formatGrams } from '../pricing';

interface PriceBreakdownProps {
  breakdown: Breakdown;
  silverRate: number | null;
  labourPerGram: number | null; // null when lines in a cart use different making charges
  rateDate?: string | null;
  title?: string;
  note?: string;
  // Separate lines (e.g. one per weight × size) listed before the totals when there is more than one
  lines?: { key: string; label: string; breakdown: Breakdown; labour: number }[];
  // Rows after GST that change the amount payable (delivery charge, discount)
  extras?: { label: string; amount: number }[];
}

const SEGMENTS = [
  { key: 'silver_amount', label: 'Silver', color: '#8C939B' },
  { key: 'labour_amount', label: 'Making', color: '#B49A7A' },
  { key: 'gst_amount', label: 'GST', color: '#6B5744' }
] as const;

export function rateDateLabel(iso?: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const PriceBreakdown: React.FC<PriceBreakdownProps> = ({ breakdown, silverRate, labourPerGram, rateDate, title = 'Price Breakdown', note, lines, extras }) => {
  const total = breakdown.total || 0;
  const payable = total + (extras || []).reduce((s, e) => s + e.amount, 0);

  return (
    <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-4 shadow-card">
      <div className="flex items-start justify-between gap-2 mb-1">
        <h3 className="text-sm font-bold text-[#2F2923] uppercase tracking-wider">{title}</h3>
        <span className="text-[10px] font-semibold text-[#6B5744] bg-[#E8DCCB]/60 px-2 py-0.5 rounded-full whitespace-nowrap">
          Silver rate · {rateDateLabel(rateDate)}
        </span>
      </div>
      <p className="text-[11px] text-[#766B60] mb-3">
        {note || 'Silver per gram + making charges per gram, with 3% GST on the whole.'}
      </p>

      {/* Visual distribution of the final price */}
      {total > 0 && (
        <div className="mb-3">
          <div className="flex h-3 w-full rounded-full overflow-hidden bg-[#E8DCCB]" role="img" aria-label="Price distribution">
            {SEGMENTS.map(seg => {
              const value = breakdown[seg.key];
              const pct = (value / total) * 100;
              return pct > 0 ? (
                <div key={seg.key} style={{ width: `${pct}%`, backgroundColor: seg.color }} title={`${seg.label}: ${formatINR(value)}`} />
              ) : null;
            })}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
            {SEGMENTS.map(seg => (
              <span key={seg.key} className="flex items-center gap-1 text-[10px] text-[#766B60]">
                <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: seg.color }} />
                {seg.label} {total > 0 ? Math.round((breakdown[seg.key] / total) * 100) : 0}%
              </span>
            ))}
          </div>
        </div>
      )}

      {lines && lines.length > 1 && (
        <div className="mb-3 overflow-x-auto rounded-xl border border-[#E8DCCB]">
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="bg-[#F5F0E8] text-[9px] uppercase text-[#766B60]">
                <th className="px-2 py-1.5 text-left font-bold">Item</th>
                <th className="px-2 py-1.5 text-right font-bold">Wt.</th>
                <th className="px-2 py-1.5 text-right font-bold">Silver</th>
                <th className="px-2 py-1.5 text-right font-bold">Making</th>
                <th className="px-2 py-1.5 text-right font-bold">GST</th>
                <th className="px-2 py-1.5 text-right font-bold">Total</th>
              </tr>
            </thead>
            <tbody>
              {lines.map(l => (
                <tr key={l.key} className="border-t border-[#E8DCCB] text-[#2F2923]">
                  <td className="px-2 py-1.5 font-semibold whitespace-nowrap">{l.label}</td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">{formatGrams(l.breakdown.weight_g)}</td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">{formatINR(l.breakdown.silver_amount, 0)}</td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">
                    {formatINR(l.breakdown.labour_amount, 0)}
                    <span className="block text-[9px] text-[#766B60]">@{formatINR(l.labour)}/g</span>
                  </td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">{formatINR(l.breakdown.gst_amount, 0)}</td>
                  <td className="px-2 py-1.5 text-right font-bold whitespace-nowrap">{formatINR(l.breakdown.total, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="divide-y divide-[#E8DCCB] text-sm">
        <div className="flex items-center justify-between py-2">
          <span className="text-[#766B60]">Total weight</span>
          <span className="font-semibold text-[#2F2923]">{formatGrams(breakdown.weight_g)}</span>
        </div>
        <div className="flex items-center justify-between py-2">
          <span className="text-[#766B60]">
            Silver {silverRate !== null ? `(${formatINR(silverRate)}/g)` : '(rate pending)'}
          </span>
          <span className="font-semibold text-[#2F2923]">{formatINR(breakdown.silver_amount)}</span>
        </div>
        <div className="flex items-center justify-between py-2">
          <div>
            <span className="text-[#766B60]">
              Making charges {labourPerGram !== null ? `(${formatINR(labourPerGram)}/g)` : '(per product)'}
            </span>
            {breakdown.slab_discount_per_gram && breakdown.slab_discount_per_gram > 0 ? (
              <span className="block text-[10px] text-[#4F7D5B] font-semibold">
                Includes −{formatINR(breakdown.slab_discount_per_gram)}/g weight slab discount
              </span>
            ) : null}
            {breakdown.state_premium_pct && breakdown.state_premium_pct > 0 ? (
              <span className="block text-[10px] text-[#6B5744]">
                +{breakdown.state_premium_pct}% state labour markup applied
              </span>
            ) : null}
          </div>
          <span className="font-semibold text-[#2F2923]">{formatINR(breakdown.labour_amount)}</span>
        </div>
        <div className="flex items-center justify-between py-2">
          <span className="text-[#766B60]">Subtotal</span>
          <span className="font-semibold text-[#2F2923]">{formatINR(breakdown.subtotal)}</span>
        </div>
        <div className="flex items-center justify-between py-2">
          <span className="text-[#766B60]">GST (3%)</span>
          <span className="font-semibold text-[#2F2923]">{formatINR(breakdown.gst_amount)}</span>
        </div>
        {(extras || []).map(e => (
          <div key={e.label} className="flex items-center justify-between py-2">
            <span className="text-[#766B60]">{e.label}</span>
            <span className={`font-semibold ${e.amount < 0 ? 'text-[#4F7D5B]' : 'text-[#2F2923]'}`}>
              {e.amount < 0 ? `− ${formatINR(-e.amount)}` : e.amount === 0 ? 'Free' : formatINR(e.amount)}
            </span>
          </div>
        ))}
        <div className="flex items-center justify-between pt-3">
          <span className="text-base font-bold text-[#2F2923]">Total</span>
          <span className="text-lg font-extrabold text-[#2F2923]">{formatINR(payable)}</span>
        </div>
      </div>
    </div>
  );
};
