import React, { useEffect, useState } from 'react';
import { X, Loader2, PackagePlus, Minus, Plus } from 'lucide-react';
import { api } from '../api';
import { STANDARD_INCHES, formatGrams, sameNum } from '../pricing';

// "Inv" on a product card: add pieces to ready stock for one saved standard weight × size (a minus count removes)
export const AddInventorySheet: React.FC<{ product: any; onClose: () => void; onSaved: (message: string) => void }> = ({ product, onClose, onSaved }) => {
  const [detail, setDetail] = useState<{ variants: any[]; weights: number[] } | null>(null);
  const [std, setStd] = useState<number | null>(null);
  const [size, setSize] = useState('20');
  const [qty, setQty] = useState(10);
  const [remove, setRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getProduct(product.id).then(res => {
      const weights: number[] = [];
      for (const w of [...(res.weight_options || []).map((o: any) => o.std_weight_g), ...(res.variants || []).map((v: any) => v.std_weight_g)]) {
        if (w > 0 && !weights.some(x => sameNum(x, w))) weights.push(w);
      }
      weights.sort((a, b) => a - b);
      setDetail({ variants: res.variants || [], weights });
      setStd(weights[0] ?? product.std_weight_per_20in ?? null);
    }).catch(err => setError(err.message || 'Could not load the product'));
  }, [product.id]);

  const sizeNum = parseFloat(size);
  const rows = detail ? detail.variants.filter(v => std !== null && sameNum(v.std_weight_g, std)) : [];
  const current = rows.find(v => sameNum(v.size_inches, sizeNum));
  const sizes = Array.from(new Set([...STANDARD_INCHES, ...rows.map(v => Number(v.size_inches))])).sort((a, b) => a - b);

  const save = async () => {
    if (std === null) return setError('Choose a standard weight');
    if (!(sizeNum >= 1 && sizeNum <= 60)) return setError('Enter a size between 1 and 60 inches');
    if (!(qty > 0)) return setError('Enter how many pieces');
    setBusy(true);
    setError(null);
    try {
      const res = await api.addInventory(product.id, { std_weight_g: std, size_inches: sizeNum, qty: remove ? -qty : qty });
      onSaved(res.message);
    } catch (err: any) {
      setError(err.message || 'Could not update inventory');
    } finally {
      setBusy(false);
    }
  };

  const chip = (active: boolean) =>
    `px-3 py-1.5 rounded-xl text-xs font-bold border ${active ? 'bg-[#6B5744] text-white border-[#6B5744]' : 'bg-[#FFFCF7] text-[#2F2923] border-[#D2BFA7]'}`;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-[#FFFCF7] border border-[#D2BFA7] rounded-t-3xl sm:rounded-2xl p-5 shadow-xl space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-bold text-base text-[#2F2923] flex items-center gap-1.5"><PackagePlus size={18} /> Inventory</h3>
            <p className="text-xs text-[#766B60]">{product.name} · {product.sku}</p>
          </div>
          <button onClick={onClose} className="p-1 text-[#766B60]" aria-label="Close"><X size={18} /></button>
        </div>

        {!detail ? (
          <div className="flex justify-center py-6"><Loader2 className="animate-spin text-[#6B5744]" /></div>
        ) : (
          <>
            <div>
              <p className="text-[11px] font-bold text-[#766B60] uppercase mb-1.5">Standard weight</p>
              <div className="flex flex-wrap gap-1.5">
                {detail.weights.map(w => (
                  <button key={w} type="button" onClick={() => setStd(w)} className={chip(std !== null && sameNum(w, std))}>{formatGrams(w)}</button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#766B60] uppercase mb-1.5">Size (inches)</p>
              <div className="flex flex-wrap gap-1.5 items-center">
                {sizes.map(s => {
                  const row = rows.find(v => sameNum(v.size_inches, s));
                  return (
                    <button key={s} type="button" onClick={() => setSize(String(s))} className={chip(sameNum(s, sizeNum))}>
                      {s}"{row ? <span className="block text-[9px] font-semibold opacity-80">{row.stock_qty} pcs</span> : null}
                    </button>
                  );
                })}
                <input
                  type="number"
                  min={1}
                  max={60}
                  step="0.5"
                  value={size}
                  onChange={e => setSize(e.target.value)}
                  className="w-20 px-2 py-1.5 bg-[#F5F0E8] border border-[#D2BFA7] rounded-xl text-xs font-bold text-center"
                  aria-label="Size in inches"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex bg-[#E8DCCB] p-1 rounded-xl text-xs font-semibold">
                <button type="button" onClick={() => setRemove(false)} className={`px-3 py-1.5 rounded-lg ${!remove ? 'bg-[#6B5744] text-white' : 'text-[#766B60]'}`}>Add</button>
                <button type="button" onClick={() => setRemove(true)} className={`px-3 py-1.5 rounded-lg ${remove ? 'bg-[#C94C4C] text-white' : 'text-[#766B60]'}`}>Remove</button>
              </div>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => setQty(q => Math.max(1, q - 1))} className="w-8 h-8 rounded-lg bg-[#F5F0E8] border border-[#D2BFA7] flex items-center justify-center" aria-label="Fewer pieces"><Minus size={14} /></button>
                <input type="number" min={1} value={qty} onChange={e => setQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-16 text-center py-1.5 bg-[#FFFCF7] border border-[#D2BFA7] rounded-lg text-sm font-bold" aria-label="Pieces" />
                <button type="button" onClick={() => setQty(q => q + 1)} className="w-8 h-8 rounded-lg bg-[#F5F0E8] border border-[#D2BFA7] flex items-center justify-center" aria-label="More pieces"><Plus size={14} /></button>
              </div>
            </div>

            <p className="text-[11px] text-[#766B60]">
              {std !== null && sizeNum > 0
                ? `${formatGrams(std)} × ${sizeNum}" now has ${current ? current.stock_qty : 0} pcs → ${Math.max(0, (current ? current.stock_qty : 0) + (remove ? -qty : qty))} pcs. Each piece weighs ${formatGrams((std * sizeNum) / 20)}.`
                : 'Choose a weight and size.'}
            </p>
          </>
        )}

        {error && <p className="text-xs text-[#C94C4C] font-medium">{error}</p>}
        <button
          type="button"
          onClick={save}
          disabled={busy || !detail}
          className={`w-full py-3 text-white font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 ${remove ? 'bg-[#C94C4C]' : 'bg-[#6B5744]'}`}
        >
          {busy && <Loader2 size={16} className="animate-spin" />} {remove ? `Remove ${qty} pcs` : `Add ${qty} pcs to stock`}
        </button>
      </div>
    </div>
  );
};
