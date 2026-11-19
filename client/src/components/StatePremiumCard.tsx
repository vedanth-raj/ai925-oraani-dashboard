import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Loader2, AlertCircle, CheckCircle2, TrendingUp } from 'lucide-react';
import { api, type StatePremium } from '../api';

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
  'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Delhi', 'Jammu and Kashmir',
  'Ladakh', 'Chandigarh', 'Puducherry'
];

export const StatePremiumCard: React.FC = () => {
  const [premiums, setPremiums] = useState<StatePremium[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedState, setSelectedState] = useState('Goa');
  const [premiumPct, setPremiumPct] = useState('100');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchPremiums = async () => {
    try {
      setLoading(true);
      const res = await api.getStatePremiums();
      setPremiums(res.state_premiums || []);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPremiums();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const pct = parseFloat(premiumPct);
    if (isNaN(pct) || pct < 0) {
      setError('Please enter a valid premium percentage (e.g. 100 for 2X price)');
      return;
    }
    setSaving(true);
    try {
      const res = await api.saveStatePremium({ state: selectedState, premium_pct: pct });
      setNotice(res.message || `Saved premium for ${selectedState}`);
      setTimeout(() => setNotice(null), 3000);
      fetchPremiums();
    } catch (err: any) {
      setError(err.message || 'Failed to save state premium');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, stateName: string) => {
    if (!window.confirm(`Remove premium pricing rule for ${stateName}?`)) return;
    setDeletingId(id);
    try {
      await api.deleteStatePremium(id);
      fetchPremiums();
    } catch (err: any) {
      alert(err.message || 'Failed to delete state premium');
    } finally {
      setDeletingId(null);
    }
  };

  const multiplierText = (pct: number) => {
    const mult = 1 + pct / 100;
    return `${pct}% (+${mult.toFixed(2)}x)`;
  };

  return (
    <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl p-4 shadow-xs">
      <div className="flex items-center gap-2 mb-2">
        <TrendingUp size={16} className="text-[#6B5744]" />
        <h2 className="text-xs font-bold text-[#2F2923] uppercase tracking-wider">
          State Extra Costs on Labour Charges
        </h2>
      </div>

      <p className="text-[11px] text-[#766B60] mb-4 leading-relaxed">
        Set prior extra costs according to states in percent of labour charges. For example: if <strong>Goa is set to +20%</strong>, customers of Goa viewing products will see 20% extra applied to the labour charges.
      </p>

      {notice && (
        <div className="mb-3 p-2.5 bg-[#E3EEE6] border border-[#4F7D5B]/30 rounded-xl text-xs font-semibold text-[#4F7D5B] flex items-center gap-1.5 animate-in fade-in">
          <CheckCircle2 size={14} />
          <span>{notice}</span>
        </div>
      )}

      {error && (
        <div className="mb-3 p-2.5 bg-[#FBE9E9] border border-[#C94C4C]/30 rounded-xl text-xs font-semibold text-[#C94C4C] flex items-center gap-1.5 animate-in fade-in">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      {/* Add / Update Rule Form */}
      <form onSubmit={handleSave} className="bg-[#F5F0E8]/70 border border-[#D2BFA7] rounded-xl p-3 mb-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div>
            <label className="block text-[10px] font-bold text-[#766B60] uppercase mb-1">
              Select State
            </label>
            <select
              value={selectedState}
              onChange={(e) => setSelectedState(e.target.value)}
              className="w-full bg-[#FFFCF7] border border-[#D2BFA7] rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[#2F2923] focus:outline-none focus:border-[#6B5744]"
            >
              {INDIAN_STATES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-[#766B60] uppercase mb-1">
              Extra Labour Cost (%)
            </label>
            <div className="relative">
              <input
                type="number"
                min="0"
                step="0.5"
                value={premiumPct}
                onChange={(e) => setPremiumPct(e.target.value)}
                placeholder="e.g. 20 for +20%"
                className="w-full bg-[#FFFCF7] border border-[#D2BFA7] rounded-lg pl-2.5 pr-7 py-1.5 text-xs font-bold text-[#2F2923] focus:outline-none focus:border-[#6B5744]"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[#766B60]">%</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] text-[#766B60]">
            Labour Multiplier: <strong className="text-[#2F2923]">{(1 + (parseFloat(premiumPct) || 0) / 100).toFixed(2)}x</strong> of base labour charge
          </span>
          <button
            type="submit"
            disabled={saving}
            className="px-3.5 py-1.5 bg-[#6B5744] hover:bg-[#584534] disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition-all shadow-xs"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
            <span>Save Rule</span>
          </button>
        </div>
      </form>

      {/* Active Rules List */}
      <div>
        <h3 className="text-[11px] font-bold text-[#766B60] uppercase tracking-wider mb-2">
          Active State Pricing Rules ({premiums.length})
        </h3>

        {loading && premiums.length === 0 ? (
          <div className="py-4 text-center">
            <Loader2 size={18} className="animate-spin text-[#6B5744] mx-auto" />
          </div>
        ) : premiums.length === 0 ? (
          <p className="text-xs text-[#766B60] italic py-2 text-center bg-[#F5F0E8]/40 rounded-lg border border-[#D2BFA7]/50">
            No state premium rules configured. All states use normal base pricing.
          </p>
        ) : (
          <div className="space-y-2">
            {premiums.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl px-3 py-2 text-xs"
              >
                <div>
                  <span className="font-bold text-[#2F2923]">{p.state}</span>
                  <span className="ml-2 px-2 py-0.5 rounded-full bg-[#E8DCCB] text-[#6B5744] font-bold text-[10px]">
                    +{p.premium_pct}% ({multiplierText(p.premium_pct)})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(p.id, p.state)}
                  disabled={deletingId === p.id}
                  className="w-7 h-7 rounded-lg text-[#C94C4C] hover:bg-[#FBE9E9] flex items-center justify-center transition-colors"
                  title="Remove Rule"
                >
                  {deletingId === p.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={14} />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
