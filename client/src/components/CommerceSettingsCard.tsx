import React, { useEffect, useState } from 'react';
import { Truck, Plus, Trash2, Loader2, Percent, Check } from 'lucide-react';
import { api, type DeliveryRates } from '../api';

const ZONES = ['North', 'South', 'East', 'West'] as const;
const str = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));

// Settings: delivery charges by customer PIN code, and the On Order payment terms (advance %, full payment discount %)
export const CommerceSettingsCard: React.FC = () => {
  const [loaded, setLoaded] = useState(false);
  const [rules, setRules] = useState<{ prefix: string; label: string; charge: string }[]>([]);
  const [zones, setZones] = useState<Record<string, string>>({ North: '', South: '', East: '', West: '' });
  const [defaultCharge, setDefaultCharge] = useState('0');
  const [freeAbove, setFreeAbove] = useState('');
  const [advancePct, setAdvancePct] = useState('20');
  const [discountPct, setDiscountPct] = useState('0.025');
  const [busy, setBusy] = useState<'delivery' | 'terms' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = (r: DeliveryRates) => {
    setRules(r.rules.map(x => ({ prefix: x.prefix, label: x.label, charge: String(x.charge) })));
    setZones({ North: str(r.zones.North), South: str(r.zones.South), East: str(r.zones.East), West: str(r.zones.West) });
    setDefaultCharge(String(r.default_charge));
    setFreeAbove(str(r.free_above));
  };

  useEffect(() => {
    api.getCommerceSettings().then(res => {
      apply(res.delivery_rates);
      setAdvancePct(String(res.payment_terms.advance_pct));
      setDiscountPct(String(res.payment_terms.full_payment_discount_pct));
      setLoaded(true);
    }).catch(err => setError(err.message || 'Could not load settings'));
  }, []);

  const flash = (m: string) => {
    setMessage(m);
    setError(null);
    setTimeout(() => setMessage(null), 3000);
  };

  const saveDelivery = async () => {
    setBusy('delivery');
    try {
      const res = await api.saveDeliveryRates({
        rules: rules.filter(r => r.prefix.trim()).map(r => ({ prefix: r.prefix.trim(), label: r.label.trim(), charge: parseFloat(r.charge) || 0 })),
        zones: Object.fromEntries(ZONES.map(z => [z, zones[z] === '' ? null : parseFloat(zones[z])])) as DeliveryRates['zones'],
        default_charge: parseFloat(defaultCharge) || 0,
        free_above: freeAbove === '' ? null : parseFloat(freeAbove)
      });
      apply(res.delivery_rates);
      flash(res.message);
    } catch (err: any) {
      setError(err.message || 'Could not save delivery charges');
    } finally {
      setBusy(null);
    }
  };

  const saveTerms = async () => {
    setBusy('terms');
    try {
      const res = await api.savePaymentTerms({ advance_pct: parseFloat(advancePct), full_payment_discount_pct: parseFloat(discountPct) });
      setAdvancePct(String(res.payment_terms.advance_pct));
      setDiscountPct(String(res.payment_terms.full_payment_discount_pct));
      flash(res.message);
    } catch (err: any) {
      setError(err.message || 'Could not save payment terms');
    } finally {
      setBusy(null);
    }
  };

  const input = 'w-full px-2.5 py-2 bg-[#FFFCF7] border border-[#D2BFA7] rounded-lg text-xs text-[#2F2923] focus:outline-none focus:ring-1 focus:ring-[#6B5744]';
  const mini = 'block text-[10px] font-bold text-[#766B60] uppercase mb-1';

  if (!loaded && !error) {
    return <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl p-4 flex justify-center"><Loader2 className="animate-spin text-[#6B5744]" size={18} /></div>;
  }

  return (
    <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl p-4 shadow-xs space-y-4">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Truck size={16} className="text-[#6B5744]" />
          <h2 className="text-xs font-bold text-[#2F2923] uppercase tracking-wider">Delivery charges</h2>
        </div>
        <p className="text-[11px] text-[#766B60] mb-3">
          Added to a customer's bill by their PIN code. The longest matching PIN start wins (e.g. "400001" before "400"), then the customer's zone, then the default.
        </p>

        <div className="space-y-2">
          {rules.length > 0 && (
            <div className="grid grid-cols-[80px_1fr_80px_28px] gap-1.5 text-[10px] font-bold text-[#766B60] uppercase">
              <span>PIN starts</span><span>Label</span><span>Charge ₹</span><span />
            </div>
          )}
          {rules.map((r, i) => (
            <div key={i} className="grid grid-cols-[80px_1fr_80px_28px] gap-1.5 items-center">
              <input value={r.prefix} inputMode="numeric" maxLength={6} placeholder="400" className={input} aria-label="PIN code start"
                onChange={e => setRules(rules.map((x, j) => (j === i ? { ...x, prefix: e.target.value.replace(/\D/g, '') } : x)))} />
              <input value={r.label} placeholder="Mumbai" className={input} aria-label="Label"
                onChange={e => setRules(rules.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
              <input value={r.charge} type="number" min="0" step="1" placeholder="0" className={input} aria-label="Charge"
                onChange={e => setRules(rules.map((x, j) => (j === i ? { ...x, charge: e.target.value } : x)))} />
              <button type="button" onClick={() => setRules(rules.filter((_, j) => j !== i))} className="w-7 h-7 rounded-lg text-[#C94C4C] hover:bg-[#FBE9E9] flex items-center justify-center" aria-label="Remove PIN rule">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button type="button" onClick={() => setRules([...rules, { prefix: '', label: '', charge: '' }])} className="flex items-center gap-1 text-xs font-semibold text-[#6B5744] px-2 py-1 rounded-lg hover:bg-[#E8DCCB]/60">
            <Plus size={14} /> PIN code rule
          </button>
        </div>

        <p className={`${mini} mt-3`}>By zone (leave blank to use the default)</p>
        <div className="grid grid-cols-4 gap-1.5">
          {ZONES.map(z => (
            <div key={z}>
              <label className="block text-[10px] text-[#766B60] mb-0.5" htmlFor={`zone-${z}`}>{z}</label>
              <input id={`zone-${z}`} type="number" min="0" step="1" value={zones[z]} placeholder="—" className={input}
                onChange={e => setZones({ ...zones, [z]: e.target.value })} />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 mt-3">
          <div>
            <label className={mini} htmlFor="del-default">Default charge ₹</label>
            <input id="del-default" type="number" min="0" step="1" value={defaultCharge} className={input} onChange={e => setDefaultCharge(e.target.value)} />
          </div>
          <div>
            <label className={mini} htmlFor="del-free">Free above ₹ (optional)</label>
            <input id="del-free" type="number" min="0" step="1" value={freeAbove} placeholder="No limit" className={input} onChange={e => setFreeAbove(e.target.value)} />
          </div>
        </div>
        <button type="button" onClick={saveDelivery} disabled={busy !== null} className="mt-3 w-full py-2.5 bg-[#6B5744] text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50">
          {busy === 'delivery' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save delivery charges
        </button>
      </div>

      <div className="pt-4 border-t border-[#E8DCCB]">
        <div className="flex items-center gap-2 mb-1">
          <Percent size={16} className="text-[#6B5744]" />
          <h2 className="text-xs font-bold text-[#2F2923] uppercase tracking-wider">On Order payment</h2>
        </div>
        <p className="text-[11px] text-[#766B60] mb-3">Customers choose to pay an advance, or the full amount with a discount.</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={mini} htmlFor="adv-pct">Advance %</label>
            <input id="adv-pct" type="number" min="1" max="100" step="1" value={advancePct} className={input} onChange={e => setAdvancePct(e.target.value)} />
          </div>
          <div>
            <label className={mini} htmlFor="disc-pct">Full payment discount %</label>
            <input id="disc-pct" type="number" min="0" step="0.001" value={discountPct} className={input} onChange={e => setDiscountPct(e.target.value)} />
          </div>
        </div>
        <button type="button" onClick={saveTerms} disabled={busy !== null} className="mt-3 w-full py-2.5 bg-[#6B5744] text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50">
          {busy === 'terms' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save payment terms
        </button>
      </div>

      {message && <p className="text-xs font-semibold text-[#4F7D5B]">{message}</p>}
      {error && <p className="text-xs font-semibold text-[#C94C4C]">{error}</p>}
    </div>
  );
};
