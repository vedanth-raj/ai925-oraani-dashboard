import React, { useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';

const ADD_NEW = '__add_new__';

// Dropdown of saved values with a last "+ Add new…" entry that opens a box to type one; the new value is
// saved through `onCreate` (shared by every product) and then selected.
export const OptionSelect: React.FC<{
  value: string;
  options: string[];
  onChange: (value: string) => void;
  onCreate: (value: string) => Promise<void>;
  placeholder?: string;
  className: string;
  ariaLabel: string;
}> = ({ value, options, onChange, onCreate, placeholder = 'Select', className, ariaLabel }) => {
  const [adding, setAdding] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = value && !options.some(o => o.toLowerCase() === value.toLowerCase()) ? [...options, value] : options;

  const save = async () => {
    const v = (adding || '').trim();
    if (!v) return setAdding(null);
    setBusy(true);
    setError(null);
    try {
      await onCreate(v);
      onChange(v);
      setAdding(null);
    } catch (err: any) {
      setError(err.message || 'Could not add it');
    } finally {
      setBusy(false);
    }
  };

  if (adding !== null) {
    return (
      <div>
        <div className="flex items-center gap-1">
          <input
            autoFocus
            value={adding}
            onChange={e => setAdding(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save(); } if (e.key === 'Escape') setAdding(null); }}
            placeholder="New value"
            aria-label={`New ${ariaLabel}`}
            className={className}
          />
          <button type="button" onClick={save} disabled={busy} className="w-8 h-8 shrink-0 rounded-lg bg-[#6B5744] text-white flex items-center justify-center" aria-label="Save">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
          </button>
          <button type="button" onClick={() => { setAdding(null); setError(null); }} className="w-8 h-8 shrink-0 rounded-lg bg-[#F5F0E8] border border-[#D2BFA7] text-[#766B60] flex items-center justify-center" aria-label="Cancel">
            <X size={13} />
          </button>
        </div>
        {error && <p className="text-[10px] text-[#C94C4C] mt-0.5">{error}</p>}
      </div>
    );
  }

  return (
    <select
      value={value}
      onChange={e => (e.target.value === ADD_NEW ? setAdding('') : onChange(e.target.value))}
      className={className}
      aria-label={ariaLabel}
    >
      <option value="">{placeholder}</option>
      {list.map(o => <option key={o} value={o}>{o}</option>)}
      <option value={ADD_NEW}>+ Add new…</option>
    </select>
  );
};
