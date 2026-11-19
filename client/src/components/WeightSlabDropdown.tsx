// Making charge slabs of one standard weight: net quantity (g of that weight in an order) → making ₹/g, and
// the purchase type it applies to. Opens like a dropdown; tap a slab to edit it, long-press to delete it, or
// add a custom slab.
import React, { useRef, useState } from 'react';
import { ChevronDown, Check, Plus, Trash2, X } from 'lucide-react';
import type { TierType } from '../api';
import { formatINR, formatWeightSlab } from '../pricing';

export interface WeightSlabDraft {
  min_g: string;
  max_g: string; // '' = & above
  making: string;
  order_type: TierType; // 'ALL' = both purchase types
}

const LONG_PRESS_MS = 550;
const boxCls = 'w-full min-w-0 px-2 py-1.5 bg-[#FFFCF7] border border-[#D2BFA7] rounded-lg text-xs text-[#2F2923] text-center focus:outline-none focus:ring-1 focus:ring-[#6B5744]';

const TYPES: TierType[] = ['ALL', 'READY_STOCK', 'ON_ORDER'];
const TYPE_TEXT: Record<TierType, string> = { ALL: 'Both', READY_STOCK: 'Ready Stock', ON_ORDER: 'On Order' };
const TYPE_CHIP: Record<TierType, string> = {
  ALL: 'bg-[#E8DCCB] text-[#6B5744] border-[#E8DCCB]',
  READY_STOCK: 'bg-[#E3EEE6] text-[#4F7D5B] border-[#E3EEE6]',
  ON_ORDER: 'bg-[#EFE8F7] text-[#6A4C93] border-[#EFE8F7]'
};

const num = (v: string) => parseFloat(v);
const filled = (v: string) => v.trim() !== '';

// Slabs in quantity order (unfinished rows last)
export function sortSlabDrafts(rows: WeightSlabDraft[]): WeightSlabDraft[] {
  const start = (r: WeightSlabDraft) => (filled(r.min_g) ? num(r.min_g) : Infinity);
  return [...rows].sort((a, b) => start(a) - start(b) || TYPES.indexOf(a.order_type) - TYPES.indexOf(b.order_type));
}

const formatDraft = (r: WeightSlabDraft) => formatWeightSlab({ min_g: num(r.min_g) || 0, max_g: filled(r.max_g) ? num(r.max_g) : null });

// First problem with a weight's slabs, or null when they are usable. The slabs one purchase type uses (its
// own and 'Both') must not overlap.
export function slabDraftError(rows: WeightSlabDraft[]): string | null {
  if (rows.length === 0) return 'Add at least one making charge slab';
  const sorted = sortSlabDrafts(rows);
  for (const r of sorted) {
    if (!(num(r.min_g) >= 0)) return 'Every slab needs a starting net quantity';
    if (filled(r.max_g) && !(num(r.max_g) >= num(r.min_g))) return `Slab from ${r.min_g} g ends below its start`;
    if (!(num(r.making) >= 0)) return `Enter the making charge for the slab from ${r.min_g} g`;
  }
  for (const mode of ['READY_STOCK', 'ON_ORDER'] as TierType[]) {
    const used = sorted.filter(r => r.order_type === 'ALL' || r.order_type === mode);
    for (let i = 1; i < used.length; i++) {
      const prev = used[i - 1];
      if (!filled(prev.max_g) || num(prev.max_g) >= num(used[i].min_g)) {
        return `${TYPE_TEXT[mode]} slabs ${formatDraft(prev)} and ${formatDraft(used[i])} overlap`;
      }
    }
  }
  return null;
}

const TypeChip: React.FC<{ type: TierType }> = ({ type }) => (
  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${TYPE_CHIP[type]}`}>{TYPE_TEXT[type]}</span>
);

const SlabEditor: React.FC<{ initial: WeightSlabDraft; onSave: (r: WeightSlabDraft) => void; onCancel: () => void }> = ({ initial, onSave, onCancel }) => {
  const [draft, setDraft] = useState(initial);
  const [err, setErr] = useState<string | null>(null);
  const set = (patch: Partial<WeightSlabDraft>) => { setDraft({ ...draft, ...patch }); setErr(null); };
  const save = () => {
    const e = slabDraftError([draft]);
    if (e) return setErr(e);
    onSave(draft);
  };
  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); save(); }
    if (e.key === 'Escape') onCancel();
  };
  return (
    <div className="px-2 py-2 bg-[#F5F0E8] space-y-1.5">
      <div className="grid grid-cols-[1fr_auto_1fr_1fr] gap-1.5 items-center">
        <input autoFocus type="number" min="0" step="any" value={draft.min_g} placeholder="From g" aria-label="From grams" className={boxCls}
          onKeyDown={key} onChange={e => set({ min_g: e.target.value })} />
        <span className="text-[11px] text-[#766B60]">–</span>
        <input type="number" min="0" step="any" value={draft.max_g} placeholder="& above" aria-label="To grams" className={boxCls}
          onKeyDown={key} onChange={e => set({ max_g: e.target.value })} />
        <input type="number" min="0" step="0.01" value={draft.making} placeholder="₹/gm" aria-label="Making charge per gram" className={boxCls}
          onKeyDown={key} onChange={e => set({ making: e.target.value })} />
      </div>
      <div className="flex items-center gap-1">
        {TYPES.map(t => (
          <button key={t} type="button" onClick={() => set({ order_type: t })} aria-pressed={draft.order_type === t}
            className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${draft.order_type === t
              ? t === 'READY_STOCK' ? 'bg-[#4F7D5B] border-[#4F7D5B] text-white' : t === 'ON_ORDER' ? 'bg-[#6A4C93] border-[#6A4C93] text-white' : 'bg-[#6B5744] border-[#6B5744] text-white'
              : 'bg-[#FFFCF7] border-[#D2BFA7] text-[#766B60]'}`}>
            {TYPE_TEXT[t]}
          </button>
        ))}
        <span className="flex-1" />
        <button type="button" onClick={save} className="w-7 h-7 rounded-lg bg-[#6B5744] text-white flex items-center justify-center" aria-label="Save slab"><Check size={13} /></button>
        <button type="button" onClick={onCancel} className="w-7 h-7 rounded-lg border border-[#D2BFA7] text-[#766B60] flex items-center justify-center" aria-label="Cancel"><X size={13} /></button>
      </div>
      {err && <p className="text-[10px] font-semibold text-[#C94C4C]">{err}</p>}
    </div>
  );
};

export const WeightSlabDropdown: React.FC<{
  slabs: WeightSlabDraft[];
  onChange: (slabs: WeightSlabDraft[]) => void;
  label?: string;
}> = ({ slabs, onChange, label = 'Making charges (₹/gm) *' }) => {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const timer = useRef<number | null>(null);
  const longPressed = useRef(false);

  const sorted = sortSlabDrafts(slabs);
  const makings = sorted.map(s => num(s.making)).filter(v => v >= 0);
  const summary = sorted.length === 0
    ? 'No slabs'
    : `${sorted.length} slab${sorted.length === 1 ? '' : 's'} · ${makings.length ? (Math.max(...makings) === Math.min(...makings) ? formatINR(makings[0], 0) : `${formatINR(Math.max(...makings), 0)}–${formatINR(Math.min(...makings), 0)}`) : '—'}/gm`;
  const error = slabDraftError(slabs);

  const clearTimer = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  const pressStart = (i: number) => {
    longPressed.current = false;
    clearTimer();
    timer.current = window.setTimeout(() => {
      longPressed.current = true;
      setEditing(null);
      setConfirmDelete(i);
      if (navigator.vibrate) navigator.vibrate(30);
    }, LONG_PRESS_MS);
  };
  const tap = (i: number) => {
    if (longPressed.current) return;
    setConfirmDelete(null);
    setEditing(i);
  };

  const saveAt = (i: number | 'new', row: WeightSlabDraft) => {
    onChange(sortSlabDrafts(i === 'new' ? [...sorted, row] : sorted.map((r, j) => (j === i ? row : r))));
    setEditing(null);
  };
  const removeAt = (i: number) => {
    onChange(sorted.filter((_, j) => j !== i));
    setConfirmDelete(null);
  };

  // Next custom slab starts one gram after the last range
  const nextStart = (() => {
    const last = sorted[sorted.length - 1];
    return last && filled(last.max_g) ? String(num(last.max_g) + 1) : '';
  })();

  const rowGrid = 'grid grid-cols-[1.2fr_1fr_auto] gap-2 items-center';

  return (
    <div>
      <label className="block text-[10px] font-bold text-[#766B60] uppercase mb-1">{label}</label>
      <button
        type="button"
        onClick={() => { setOpen(!open); setEditing(null); setConfirmDelete(null); }}
        aria-expanded={open}
        className={`w-full px-2.5 py-2 bg-[#FFFCF7] border rounded-lg text-sm text-left flex items-center justify-between gap-2 focus:outline-none focus:ring-1 focus:ring-[#6B5744] ${error ? 'border-[#C94C4C]/60' : 'border-[#D2BFA7]'}`}
      >
        <span className={`truncate ${sorted.length ? 'text-[#2F2923]' : 'text-[#766B60]/70'}`}>{summary}</span>
        <ChevronDown size={16} className={`shrink-0 text-[#766B60] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-1.5 rounded-xl border border-[#D2BFA7] bg-[#FFFCF7] overflow-hidden shadow-card">
          <div className={`${rowGrid} px-3 py-1.5 bg-[#F5F0E8] text-[10px] font-bold uppercase text-[#766B60]`}>
            <span>Net qty</span><span className="text-right">Making / gm</span><span className="text-right">Purchase type</span>
          </div>
          {sorted.map((r, i) => (
            <div key={`${r.min_g}-${r.max_g}-${r.order_type}-${i}`} className="border-t border-[#E8DCCB]">
              {editing === i ? (
                <SlabEditor initial={r} onSave={row => saveAt(i, row)} onCancel={() => setEditing(null)} />
              ) : confirmDelete === i ? (
                <div className="px-3 py-2 flex items-center justify-between gap-2 bg-[#FBE9E9]">
                  <span className="text-xs font-semibold text-[#C94C4C]">Delete {formatDraft(r)} ({TYPE_TEXT[r.order_type]})?</span>
                  <span className="flex gap-1.5">
                    <button type="button" onClick={() => removeAt(i)} className="px-2.5 py-1 rounded-lg bg-[#C94C4C] text-white text-[11px] font-bold flex items-center gap-1"><Trash2 size={12} /> Delete</button>
                    <button type="button" onClick={() => setConfirmDelete(null)} className="px-2.5 py-1 rounded-lg border border-[#D2BFA7] bg-[#FFFCF7] text-[11px] font-semibold text-[#766B60]">Cancel</button>
                  </span>
                </div>
              ) : (
                <button
                  type="button"
                  onPointerDown={() => pressStart(i)}
                  onPointerUp={clearTimer}
                  onPointerLeave={clearTimer}
                  onPointerCancel={clearTimer}
                  onContextMenu={e => e.preventDefault()}
                  onClick={() => tap(i)}
                  className={`w-full ${rowGrid} px-3 py-2 text-xs text-[#2F2923] hover:bg-[#F5F0E8] select-none [-webkit-touch-callout:none]`}
                  title="Tap to edit · long-press to delete"
                >
                  <span className="text-left font-semibold">{formatDraft(r)}</span>
                  <span className="text-right font-bold">{filled(r.making) ? `${formatINR(num(r.making))}/gm` : '—'}</span>
                  <span className="text-right"><TypeChip type={r.order_type} /></span>
                </button>
              )}
            </div>
          ))}
          <div className="border-t border-[#E8DCCB]">
            {editing === 'new' ? (
              <SlabEditor initial={{ min_g: nextStart, max_g: '', making: '', order_type: 'ALL' }} onSave={row => saveAt('new', row)} onCancel={() => setEditing(null)} />
            ) : (
              <button type="button" onClick={() => { setConfirmDelete(null); setEditing('new'); }}
                className="w-full px-3 py-2 flex items-center gap-1 text-xs font-semibold text-[#6B5744] hover:bg-[#E8DCCB]/60">
                <Plus size={14} /> Add custom slab
              </button>
            )}
          </div>
          <p className="px-3 py-1.5 text-[10px] text-[#766B60] bg-[#F5F0E8]/60 border-t border-[#E8DCCB]">
            Net qty is the total grams of this weight in one order. Purchase type picks Ready Stock, On Order or both. Tap a slab to edit · long-press to delete.
          </p>
        </div>
      )}
      {error && <p className="text-[10px] font-semibold text-[#C94C4C] mt-1">{error}</p>}
    </div>
  );
};
