import React, { useEffect, useState } from 'react';
import { ArrowLeft, Plus, Trash2, Loader2, CheckCircle2, AlertCircle, Scale, Sparkles } from 'lucide-react';
import { api, type WeightSlabDiscount } from '../api';
import { formatINR } from '../pricing';

interface SlabDiscountsScreenProps {
  onBack: () => void;
}

export const SlabDiscountsScreen: React.FC<SlabDiscountsScreenProps> = ({ onBack }) => {
  const [slabs, setSlabs] = useState<WeightSlabDiscount[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [minKg, setMinKg] = useState('1.0');
  const [maxKg, setMaxKg] = useState('2.0');
  const [noMax, setNoMax] = useState(false);
  const [discountPerGram, setDiscountPerGram] = useState('2.0');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchSlabs = async () => {
    try {
      setLoading(true);
      const res = await api.getWeightSlabDiscounts();
      setSlabs(res.weight_slab_discounts || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load weight slab discounts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSlabs();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const min = parseFloat(minKg);
    const max = noMax ? null : parseFloat(maxKg);
    const discount = parseFloat(discountPerGram);

    if (isNaN(min) || min < 0) {
      setError('Minimum weight must be 0 kg or more');
      return;
    }
    if (!noMax && (isNaN(max!) || max! <= min)) {
      setError('Maximum weight must be greater than minimum weight');
      return;
    }
    if (isNaN(discount) || discount <= 0) {
      setError('Discount must be greater than 0 rupees per gram');
      return;
    }

    setSaving(true);
    try {
      const res = await api.addWeightSlabDiscount({
        min_kg: min,
        max_kg: max,
        discount_per_gram: discount,
        is_active: true
      });
      setNotice(res.message || 'Weight slab discount added successfully');
      setSlabs(res.weight_slab_discounts || []);
      setMinKg('');
      setMaxKg('');
      setDiscountPerGram('');
      setTimeout(() => setNotice(null), 3500);
    } catch (err: any) {
      setError(err.message || 'Failed to save slab discount');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, label: string) => {
    if (!window.confirm(`Delete discount slab: ${label}?`)) return;
    setDeletingId(id);
    try {
      const res = await api.deleteWeightSlabDiscount(id);
      setSlabs(res.weight_slab_discounts || []);
      setNotice('Discount slab deleted');
      setTimeout(() => setNotice(null), 3000);
    } catch (err: any) {
      alert(err.message || 'Failed to delete slab');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="pb-28 pt-4 px-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={onBack}
          className="w-9 h-9 rounded-xl bg-[#FFFCF7] border border-[#D2BFA7] text-[#6B5744] hover:bg-[#E8DCCB] flex items-center justify-center transition-all cursor-pointer shadow-xs active:scale-95"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-[#2F2923]">Discount on Slab</h1>
          <p className="text-xs text-[#766B60]">Weight-based discounts on labour charges per gram</p>
        </div>
      </div>

      {notice && (
        <div className="mb-4 p-3 bg-[#E3EEE6] border border-[#4F7D5B]/30 rounded-xl text-xs font-semibold text-[#4F7D5B] flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 size={16} className="shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-[#FBE9E9] border border-[#C94C4C]/30 rounded-xl text-xs font-semibold text-[#C94C4C] flex items-center gap-2 animate-in fade-in">
          <AlertCircle size={16} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Info Card */}
      <div className="bg-[#E8DCCB]/40 border border-[#D2BFA7] rounded-2xl p-4 mb-4 shadow-card">
        <div className="flex items-center gap-2 mb-1.5">
          <Sparkles size={16} className="text-[#6B5744]" />
          <h2 className="text-xs font-bold text-[#6B5744] uppercase tracking-wider">How Slab Discounts Work</h2>
        </div>
        <p className="text-xs text-[#2F2923] leading-relaxed">
          When a customer's total order weight falls within a slab, their labour/making charges are automatically discounted by that rupee amount per gram.
        </p>
        <div className="mt-2 text-[11px] text-[#766B60] bg-[#FFFCF7] p-2.5 rounded-xl border border-[#D2BFA7]/60 space-y-1">
          <p>• <strong>1.0 kg to 2.0 kg</strong>: e.g. ₹2.00/g discount (Saves ₹3,000 on a 1.5kg order)</p>
          <p>• <strong>2.0 kg & above</strong>: e.g. ₹4.00/g discount (Saves ₹10,000 on a 2.5kg order)</p>
        </div>
      </div>

      {/* Add New Slab Form */}
      <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-4 shadow-card mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Plus size={18} className="text-[#6B5744]" />
          <h2 className="text-xs font-bold text-[#2F2923] uppercase tracking-wider">Add Weight Slab Discount</h2>
        </div>

        <form onSubmit={handleSave} className="space-y-3">
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[10px] font-bold text-[#766B60] uppercase mb-1">Min Weight (kg) *</label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={minKg}
                onChange={e => setMinKg(e.target.value)}
                placeholder="e.g. 1.0"
                className="w-full bg-[#F5F0E8] border border-[#D2BFA7] rounded-xl px-3 py-2 text-xs font-bold text-[#2F2923] focus:outline-none focus:border-[#6B5744]"
                required
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-bold text-[#766B60] uppercase">Max Weight (kg)</label>
                <label className="text-[10px] text-[#6B5744] flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={noMax}
                    onChange={e => setNoMax(e.target.checked)}
                    className="rounded"
                  />
                  <span>No Limit</span>
                </label>
              </div>
              <input
                type="number"
                min="0"
                step="0.1"
                disabled={noMax}
                value={noMax ? '' : maxKg}
                onChange={e => setMaxKg(e.target.value)}
                placeholder={noMax ? 'Above' : 'e.g. 2.0'}
                className="w-full bg-[#F5F0E8] border border-[#D2BFA7] rounded-xl px-3 py-2 text-xs font-bold text-[#2F2923] focus:outline-none focus:border-[#6B5744] disabled:opacity-50"
                required={!noMax}
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-[#766B60] uppercase mb-1">
              Discount in Rupees (₹ per gram of labour) *
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-xs text-[#766B60]">₹</span>
              <input
                type="number"
                min="0.1"
                step="0.5"
                value={discountPerGram}
                onChange={e => setDiscountPerGram(e.target.value)}
                placeholder="e.g. 2.0"
                className="w-full bg-[#F5F0E8] border border-[#D2BFA7] rounded-xl pl-7 pr-12 py-2 text-xs font-bold text-[#2F2923] focus:outline-none focus:border-[#6B5744]"
                required
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-[#766B60]">/ gram</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 bg-[#6B5744] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-98 shadow-xs disabled:opacity-50"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            <span>{saving ? 'Saving...' : 'Add Slab Discount'}</span>
          </button>
        </form>
      </div>

      {/* Active Slabs List */}
      <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-4 shadow-card">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Scale size={17} className="text-[#6B5744]" />
            <h2 className="text-xs font-bold text-[#2F2923] uppercase tracking-wider">Configured Slabs</h2>
          </div>
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#E8DCCB] text-[#6B5744]">
            {slabs.length} Slabs
          </span>
        </div>

        {loading ? (
          <div className="py-8 flex justify-center text-[#6B5744]">
            <Loader2 size={24} className="animate-spin" />
          </div>
        ) : slabs.length === 0 ? (
          <div className="py-8 text-center text-xs text-[#766B60]">
            No slab discounts configured yet. Add your first slab above!
          </div>
        ) : (
          <div className="space-y-2.5">
            {slabs.map(s => {
              const label = `${s.min_kg} kg ${s.max_kg ? `to ${s.max_kg} kg` : '& above'}`;
              const gramsLabel = `${s.min_kg * 1000}g ${s.max_kg ? `to ${s.max_kg * 1000}g` : '+'}`;
              return (
                <div
                  key={s.id}
                  className="bg-[#F5F0E8]/70 border border-[#D2BFA7] rounded-xl p-3 flex items-center justify-between shadow-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[#2F2923]">{label}</span>
                      <span className="text-[10px] font-semibold text-[#766B60]">({gramsLabel})</span>
                    </div>
                    <p className="text-xs font-bold text-[#4F7D5B] mt-0.5">
                      -{formatINR(s.discount_per_gram)} / gram off labour charges
                    </p>
                  </div>

                  <button
                    onClick={() => handleDelete(s.id, label)}
                    disabled={deletingId === s.id}
                    className="p-1.5 text-[#C94C4C] hover:bg-[#FBE9E9] rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                    title="Delete slab"
                  >
                    {deletingId === s.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
