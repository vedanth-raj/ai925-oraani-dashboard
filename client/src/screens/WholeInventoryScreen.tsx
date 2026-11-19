import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Pencil, Save, X, Loader2, Search, CheckCircle2, Boxes } from 'lucide-react';
import { api, type InventoryChain, type InventoryPayload, type InventoryRow, type InventoryUpdate } from '../api';
import { formatGrams } from '../pricing';

interface WholeInventoryScreenProps {
  onBack: () => void;
}

const rowKey = (productId: string, r: Pick<InventoryRow, 'std_weight_g' | 'size_inches'>) => `${productId}|${r.std_weight_g}|${r.size_inches}`;
const grams = (n: number) => `${n.toLocaleString('en-IN', { maximumFractionDigits: 3 })} g`;

// Rows of one chain grouped by standard weight, weights and sizes ascending
function byWeight(rows: InventoryRow[]): { std: number; rows: InventoryRow[] }[] {
  const groups: { std: number; rows: InventoryRow[] }[] = [];
  for (const r of [...rows].sort((a, b) => a.std_weight_g - b.std_weight_g || a.size_inches - b.size_inches)) {
    const g = groups.find(x => Math.abs(x.std - r.std_weight_g) < 0.001);
    if (g) g.rows.push(r);
    else groups.push({ std: r.std_weight_g, rows: [r] });
  }
  return groups;
}

// Whole Inventory (System & Business Administrator): chain → weight → size → pieces, with the total stock weight
export const WholeInventoryScreen: React.FC<WholeInventoryScreenProps> = ({ onBack }) => {
  const [data, setData] = useState<InventoryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.getInventory());
    } catch (err: any) {
      setError(err.message || 'Could not load inventory');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // View mode lists only what is on the shelf; edit mode also shows empty rows so they can be restocked
  const chains = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.chains || [])
      .filter(c => !q || c.name.toLowerCase().includes(q) || c.sku.toLowerCase().includes(q))
      .map(c => ({ ...c, rows: editing ? c.rows : c.rows.filter(r => r.stock_qty > 0) }))
      .filter(c => c.rows.length > 0);
  }, [data, search, editing]);

  const qtyOf = (c: InventoryChain, r: InventoryRow) => {
    const v = draft[rowKey(c.product_id, r)];
    return v === undefined ? r.stock_qty : parseInt(v, 10) || 0;
  };

  // Totals follow the edits as they are typed: Σ(unit weight × available pieces)
  const totals = useMemo(() => {
    let pieces = 0;
    let weight = 0;
    for (const c of data?.chains || []) {
      for (const r of c.rows) {
        const v = draft[rowKey(c.product_id, r)];
        const q = v === undefined ? r.stock_qty : parseInt(v, 10) || 0;
        pieces += q;
        weight += r.unit_weight_g * q;
      }
    }
    return { pieces, weight: Math.round(weight * 1000) / 1000 };
  }, [data, draft]);

  const changes: InventoryUpdate[] = useMemo(() => {
    const out: InventoryUpdate[] = [];
    for (const c of data?.chains || []) {
      for (const r of c.rows) {
        const v = draft[rowKey(c.product_id, r)];
        if (v === undefined || v === '') continue;
        const q = parseInt(v, 10);
        if (Number.isInteger(q) && q !== r.stock_qty) {
          out.push({ product_id: c.product_id, std_weight_g: r.std_weight_g, size_inches: r.size_inches, stock_qty: q });
        }
      }
    }
    return out;
  }, [data, draft]);

  const startEdit = () => { setDraft({}); setEditing(true); setNotice(null); };
  const cancelEdit = () => { setDraft({}); setEditing(false); };

  const save = async () => {
    if (changes.length === 0) { cancelEdit(); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await api.updateInventory(changes);
      setData({ chains: res.chains, totals: res.totals });
      setNotice(res.message);
      setDraft({});
      setEditing(false);
      setTimeout(() => setNotice(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Could not save inventory');
    } finally {
      setSaving(false);
    }
  };

  const th = 'px-2 py-2 text-left text-[10px] font-bold uppercase text-[#766B60]';
  const td = 'px-2 py-2';

  return (
    <div className="pb-40 pt-4 px-4 max-w-lg mx-auto">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className="w-10 h-10 rounded-full bg-[#FFFCF7] border border-[#D2BFA7] flex items-center justify-center text-[#2F2923] hover:bg-[#E8DCCB] shrink-0"
            aria-label="Back"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-[#2F2923] leading-tight">Whole Inventory</h1>
            <p className="text-xs text-[#766B60]">Chain · weight · size · pieces available</p>
          </div>
        </div>
        {!editing ? (
          <button
            onClick={startEdit}
            disabled={!data}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#6B5744] text-white rounded-xl text-xs font-bold disabled:opacity-50 shrink-0"
          >
            <Pencil size={14} /> Edit / Modify
          </button>
        ) : (
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={cancelEdit} disabled={saving} className="flex items-center gap-1 px-2.5 py-2 bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl text-xs font-bold text-[#2F2923]">
              <X size={14} /> Cancel
            </button>
            <button onClick={save} disabled={saving} className="flex items-center gap-1 px-3 py-2 bg-[#4F7D5B] text-white rounded-xl text-xs font-bold disabled:opacity-60">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save{changes.length > 0 ? ` (${changes.length})` : ''}
            </button>
          </div>
        )}
      </div>

      <div className="relative mb-3">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#766B60]" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search chain or SKU"
          className="w-full pl-9 pr-3 py-2.5 bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl text-sm text-[#2F2923] placeholder-[#766B60]/70 focus:outline-none focus:ring-1 focus:ring-[#6B5744]"
        />
      </div>

      {editing && (
        <p className="text-[11px] text-[#766B60] mb-3">Type the pieces now on the shelf for each size. Empty sizes are shown too so you can restock them.</p>
      )}
      {notice && (
        <div className="mb-3 p-3 bg-[#E3EEE6] border border-[#4F7D5B]/30 rounded-xl text-xs font-semibold text-[#4F7D5B] flex items-center gap-2">
          <CheckCircle2 size={16} /> {notice}
        </div>
      )}
      {error && <div className="mb-3 p-3 bg-[#FBE9E9] rounded-xl text-xs text-[#C94C4C]">{error}</div>}

      {loading && !data ? (
        <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-[#6B5744]" /></div>
      ) : chains.length === 0 ? (
        <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-6 text-center">
          <Boxes className="mx-auto text-[#B49A7A] mb-2" size={32} />
          <p className="text-sm font-semibold text-[#2F2923]">{search ? 'No chains match your search' : 'No ready stock on the shelf'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {chains.map(c => {
            const chainPieces = c.rows.reduce((s, r) => s + qtyOf(c, r), 0);
            const chainWeight = c.rows.reduce((s, r) => s + r.unit_weight_g * qtyOf(c, r), 0);
            return (
              <section key={c.product_id} className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl shadow-card overflow-hidden" aria-label={c.name}>
                <div className="px-4 py-3 flex items-start justify-between gap-2 border-b border-[#E8DCCB]">
                  <div className="min-w-0">
                    <h2 className="font-bold text-sm text-[#2F2923] truncate">{c.name}</h2>
                    <p className="text-[11px] text-[#766B60]">{c.sku}{c.status !== 'active' ? ' · inactive' : ''}</p>
                  </div>
                  <p className="text-right text-[11px] text-[#766B60] shrink-0">
                    <span className="block font-bold text-[#2F2923]">{chainPieces} pcs</span>
                    {grams(Math.round(chainWeight * 1000) / 1000)}
                  </p>
                </div>
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#F5F0E8]">
                      <th className={th}>Weight</th>
                      <th className={th}>Size</th>
                      <th className={`${th} text-right`}>Qty Available</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byWeight(c.rows).map(group =>
                      group.rows.map((r, i) => {
                        const key = rowKey(c.product_id, r);
                        const changed = draft[key] !== undefined && draft[key] !== '' && parseInt(draft[key], 10) !== r.stock_qty;
                        return (
                          <tr key={key} className={`text-[#2F2923] ${i === 0 ? 'border-t border-[#E8DCCB]' : ''}`}>
                            <td className={`${td} font-bold`}>{i === 0 ? formatGrams(group.std) : ''}</td>
                            <td className={td}>{r.size_inches}"</td>
                            <td className={`${td} text-right`}>
                              {editing ? (
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={draft[key] ?? String(r.stock_qty)}
                                  onChange={e => setDraft(prev => ({ ...prev, [key]: e.target.value.replace(/\D/g, '') }))}
                                  onBlur={() => setDraft(prev => (prev[key] === '' ? { ...prev, [key]: '0' } : prev))}
                                  aria-label={`${c.name} ${group.std} g ${r.size_inches} inch pieces`}
                                  className={`w-20 px-2 py-1 text-right font-bold bg-[#FFFCF7] border rounded-lg focus:outline-none focus:ring-1 focus:ring-[#6B5744] ${
                                    changed ? 'border-[#D97732] bg-[#FBE8DB]/40' : 'border-[#D2BFA7]'
                                  }`}
                                />
                              ) : (
                                <span className="font-bold">{r.stock_qty} pcs</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </section>
            );
          })}
        </div>
      )}

      {/* Total available stock weight = Σ(unit weight × available pieces), kept above the bottom bar */}
      {data && (
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg z-30 px-4 pb-4 safe-bottom">
          <div className="bg-[#2F2923] text-[#F5F0E8] rounded-2xl px-4 py-3 shadow-lg flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#D2BFA7]">Total available stock weight</p>
              <p className="text-xl font-bold">{grams(totals.weight)}</p>
            </div>
            <p className="text-right text-[11px] text-[#D2BFA7]">
              <span className="block text-sm font-bold text-[#F5F0E8]">{totals.pieces.toLocaleString('en-IN')} pcs</span>
              Σ unit weight × qty
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
