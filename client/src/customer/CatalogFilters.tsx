import React, { useEffect } from 'react';
import { SlidersHorizontal, X, Scale, Ruler } from 'lucide-react';
import { sameNum, STANDARD_INCHES } from '../pricing';

export const WEIGHT_MIN = 1;
export const WEIGHT_MAX = 250;
const WEIGHT_PRESETS: { label: string; range: [number, number] }[] = [
  { label: 'Under 5 g', range: [WEIGHT_MIN, 5] },
  { label: 'Under 10 g', range: [WEIGHT_MIN, 10] },
  { label: 'Under 15 g', range: [WEIGHT_MIN, 15] },
  { label: 'Under 20 g', range: [WEIGHT_MIN, 20] },
  { label: '10 - 15 g', range: [10, 15] },
  { label: '10 - 20 g', range: [10, 20] }
];

export interface CatalogFilterState {
  weight: [number, number];
  size: [number, number] | null; // null = any size
}

export const NO_FILTERS: CatalogFilterState = { weight: [WEIGHT_MIN, WEIGHT_MAX], size: null };

export const weightActive = (f: CatalogFilterState) => f.weight[0] > WEIGHT_MIN || f.weight[1] < WEIGHT_MAX;
export const activeFilterCount = (f: CatalogFilterState) => (weightActive(f) ? 1 : 0) + (f.size ? 1 : 0);
// One exact size opens the product page on that size
export const singleSize = (f: CatalogFilterState) => (f.size && sameNum(f.size[0], f.size[1]) ? f.size[0] : undefined);

export const weightLabel = (r: [number, number]) => (r[0] <= WEIGHT_MIN ? `Under ${r[1]} g` : `${r[0]} – ${r[1]} g`);
export const sizeLabel = (r: [number, number]) => (sameNum(r[0], r[1]) ? `${r[0]}"` : `${r[0]}" – ${r[1]}"`);

// Two-thumb slider on a numeric range
const DualRange: React.FC<{
  min: number; max: number; step: number; value: [number, number]; onChange: (v: [number, number]) => void; label: string; unit: string;
}> = ({ min, max, step, value, onChange, label, unit }) => {
  const [lo, hi] = value;
  const span = Math.max(step, max - min);
  const pct = (v: number) => ((v - min) / span) * 100;
  return (
    <div>
      <div className="dual-range">
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-[#E8DCCB]" />
        <div className="absolute top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-[#6B5744]" style={{ left: `${pct(lo)}%`, right: `${100 - pct(hi)}%` }} />
        <input type="range" min={min} max={max} step={step} value={lo}
          onChange={e => onChange([Math.min(parseFloat(e.target.value), hi), hi])} aria-label={`Minimum ${label}`} />
        <input type="range" min={min} max={max} step={step} value={hi}
          onChange={e => onChange([lo, Math.max(parseFloat(e.target.value), lo)])} aria-label={`Maximum ${label}`} />
      </div>
      <div className="flex justify-between text-[10px] text-[#766B60] mt-1">
        <span>{min}{unit}</span>
        <span>{max}{unit}</span>
      </div>
    </div>
  );
};

const chip = (active: boolean) =>
  `px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap border transition-all ${
    active ? 'bg-[#2F2923] text-white border-[#2F2923]' : 'bg-[#F5F0E8] border-[#D2BFA7] text-[#2F2923]'
  }`;

// The single "Filter" button with a badge for how many filters are on
export const FilterButton: React.FC<{ count: number; onClick: () => void }> = ({ count, onClick }) => (
  <button
    onClick={onClick}
    aria-label={count > 0 ? `Filter, ${count} active` : 'Filter'}
    className={`relative shrink-0 h-[42px] px-3.5 rounded-xl border flex items-center gap-1.5 text-sm font-bold transition-all ${
      count > 0 ? 'bg-[#6B5744] text-white border-[#6B5744]' : 'bg-[#FFFCF7] text-[#2F2923] border-[#D2BFA7]'
    }`}
  >
    <SlidersHorizontal size={16} /> Filter
    {count > 0 && (
      <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#C94C4C] text-white text-[10px] flex items-center justify-center">{count}</span>
    )}
  </button>
);

// Bottom sheet: weight (presets or slide) and size (pick or slide), applied as they change
export const FilterSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  value: CatalogFilterState;
  onChange: React.Dispatch<React.SetStateAction<CatalogFilterState>>;
  readySizes: { size: number; pieces: number }[] | null; // null for On Order (any size can be made)
  resultCount: number;
}> = ({ open, onClose, value, onChange, readySizes, resultCount }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const [wLo, wHi] = value.weight;
  const anyWeight = !weightActive(value);
  const sizeList = readySizes ? readySizes.map(s => s.size) : STANDARD_INCHES;
  const sizeMin = sizeList.length > 0 ? Math.min(...sizeList) : 14;
  const sizeMax = sizeList.length > 0 ? Math.max(...sizeList) : 30;
  const sizeRange: [number, number] = value.size ?? [sizeMin, sizeMax];
  const setSize = (r: [number, number] | null) =>
    onChange(prev => ({ ...prev, size: r && sameNum(r[0], sizeMin) && sameNum(r[1], sizeMax) && !sameNum(sizeMin, sizeMax) ? null : r }));

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="filter-title"
        className="w-full max-w-lg bg-[#FFFCF7] border border-[#D2BFA7] rounded-t-3xl sm:rounded-2xl p-5 max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id="filter-title" className="text-base font-bold text-[#2F2923] flex items-center gap-2"><SlidersHorizontal size={18} /> Filter</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-[#F5F0E8] border border-[#D2BFA7] flex items-center justify-center text-[#766B60]" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <section aria-labelledby="f-weight" className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <h3 id="f-weight" className="flex items-center gap-1 text-[11px] font-bold uppercase text-[#766B60]"><Scale size={13} /> Weight (per 20")</h3>
            <span className="text-xs font-bold text-[#2F2923]">{anyWeight ? 'Any weight' : weightLabel(value.weight)}</span>
          </div>
          <div className="flex flex-wrap gap-1.5 mb-3">
            <button onClick={() => onChange(prev => ({ ...prev, weight: [WEIGHT_MIN, WEIGHT_MAX] }))} aria-pressed={anyWeight} className={chip(anyWeight)}>Any</button>
            {WEIGHT_PRESETS.map(p => {
              const active = wLo === p.range[0] && wHi === p.range[1];
              return (
                <button key={p.label} onClick={() => onChange(prev => ({ ...prev, weight: p.range }))} aria-pressed={active} className={chip(active)}>{p.label}</button>
              );
            })}
          </div>
          <DualRange min={WEIGHT_MIN} max={WEIGHT_MAX} step={1} value={value.weight} label="weight in grams" unit=" g"
            onChange={r => onChange(prev => ({ ...prev, weight: r }))} />
        </section>

        <section aria-labelledby="f-size" className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <h3 id="f-size" className="flex items-center gap-1 text-[11px] font-bold uppercase text-[#766B60]"><Ruler size={13} /> Size (inches)</h3>
            <span className="text-xs font-bold text-[#2F2923]">{value.size ? sizeLabel(value.size) : 'Any size'}</span>
          </div>
          {readySizes && readySizes.length === 0 ? (
            <p className="text-xs text-[#766B60]">No sizes in ready stock right now.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5 mb-3">
                <button onClick={() => setSize(null)} aria-pressed={!value.size} className={chip(!value.size)}>Any</button>
                {(readySizes ?? STANDARD_INCHES.map(s => ({ size: s, pieces: -1 }))).map(s => {
                  const active = Boolean(value.size && sameNum(value.size[0], s.size) && sameNum(value.size[1], s.size));
                  return (
                    <button key={s.size} onClick={() => setSize(active ? null : [s.size, s.size])} aria-pressed={active} className={chip(active)}>
                      {s.size}"{s.pieces >= 0 && <span className={`ml-1 ${active ? 'text-white/75' : 'text-[#4F7D5B]'}`}>{s.pieces} pcs</span>}
                    </button>
                  );
                })}
              </div>
              {sizeMax > sizeMin && (
                <DualRange min={sizeMin} max={sizeMax} step={0.5} value={sizeRange} label="size in inches" unit={'"'}
                  onChange={r => setSize(r)} />
              )}
              {!readySizes && <p className="text-[10px] text-[#766B60] mt-2">Made to order in any size; one size picked here opens each product on that size.</p>}
            </>
          )}
        </section>

        <div className="flex gap-2">
          <button onClick={() => onChange(NO_FILTERS)} className="flex-1 py-3 bg-[#F5F0E8] border border-[#D2BFA7] rounded-xl text-sm font-semibold text-[#2F2923]">Reset</button>
          <button onClick={onClose} className="flex-[2] py-3 bg-[#6B5744] text-white rounded-xl text-sm font-bold">
            Show {resultCount} product{resultCount === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  );
};

// Removable chips under the search bar for the filters that are on
export const ActiveFilters: React.FC<{ value: CatalogFilterState; onChange: React.Dispatch<React.SetStateAction<CatalogFilterState>> }> = ({ value, onChange }) => {
  if (activeFilterCount(value) === 0) return null;
  const pill = 'flex items-center gap-1 pl-3 pr-2 py-1 rounded-full bg-[#E8DCCB] text-[11px] font-semibold text-[#2F2923]';
  return (
    <div className="flex flex-wrap gap-1.5 mb-3">
      {weightActive(value) && (
        <span className={pill}>
          Weight {weightLabel(value.weight)}
          <button onClick={() => onChange(prev => ({ ...prev, weight: [WEIGHT_MIN, WEIGHT_MAX] }))} aria-label="Remove weight filter" className="p-0.5"><X size={12} /></button>
        </span>
      )}
      {value.size && (
        <span className={pill}>
          Size {sizeLabel(value.size)}
          <button onClick={() => onChange(prev => ({ ...prev, size: null }))} aria-label="Remove size filter" className="p-0.5"><X size={12} /></button>
        </span>
      )}
    </div>
  );
};
