import React, { useEffect, useState, useRef } from 'react';
import { 
  ArrowLeft, Download, Upload, Plus, Trash2, Search, 
  CheckCircle2, AlertCircle, Loader2, Truck, FileSpreadsheet, Scale, ShieldCheck
} from 'lucide-react';
import { api, type DeliveryPincode, type DeliveryWeightSlab } from '../api';
import { formatINR } from '../pricing';
import { getIndianStateFromPincode } from '../utils/pincode';

interface DeliveryChargesScreenProps {
  onBack: () => void;
}

export const DeliveryChargesScreen: React.FC<DeliveryChargesScreenProps> = ({ onBack }) => {
  const [activeTab, setActiveTab] = useState<'weight_slabs' | 'pincodes'>('weight_slabs');
  
  // Weight Slabs State
  const [weightSlabs, setWeightSlabs] = useState<DeliveryWeightSlab[]>([]);
  const [slabsLoading, setSlabsLoading] = useState(false);
  const [minWeightG, setMinWeightG] = useState('0');
  const [maxWeightG, setMaxWeightG] = useState('500');
  const [noMaxWeight, setNoMaxWeight] = useState(false);
  const [shippingCharge, setShippingCharge] = useState('100');
  const [savingSlab, setSavingSlab] = useState(false);

  // Pincodes State
  const [pincodes, setPincodes] = useState<DeliveryPincode[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState('');
  const [pincodesLoading, setPincodesLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Single Pincode Form
  const [singlePin, setSinglePin] = useState('');
  const [singleCharge, setSingleCharge] = useState('');
  const [singleCity, setSingleCity] = useState('');
  const [singleState, setSingleState] = useState('');
  const [savingSingle, setSavingSingle] = useState(false);

  // Status & Feedback
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fetchWeightSlabs = async () => {
    try {
      setSlabsLoading(true);
      const res = await api.getDeliveryWeightSlabs();
      setWeightSlabs(res.delivery_weight_slabs || []);
    } catch (err: any) {
      console.warn('Failed to load weight delivery slabs:', err);
    } finally {
      setSlabsLoading(false);
    }
  };

  const fetchPincodes = async (query = search) => {
    try {
      setPincodesLoading(true);
      const res = await api.getDeliveryPincodes(query);
      setPincodes(res.delivery_pincodes || []);
      setTotalCount(res.total_count || 0);
    } catch (err: any) {
      setError(err.message || 'Failed to load delivery pincodes');
    } finally {
      setPincodesLoading(false);
    }
  };

  useEffect(() => {
    fetchWeightSlabs();
    fetchPincodes();
  }, []);

  const handleSaveSlab = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const min = parseFloat(minWeightG);
    const max = noMaxWeight ? null : parseFloat(maxWeightG);
    const charge = parseFloat(shippingCharge);

    if (isNaN(min) || min < 0) {
      setError('Minimum weight must be 0 grams or more');
      return;
    }
    if (!noMaxWeight && (isNaN(max!) || max! <= min)) {
      setError('Maximum weight must be greater than minimum weight');
      return;
    }
    if (isNaN(charge) || charge < 0) {
      setError('Shipping charge must be 0 or more');
      return;
    }

    try {
      setSavingSlab(true);
      const res = await api.saveDeliveryWeightSlab({
        min_weight_g: min,
        max_weight_g: max,
        shipping_charge: charge
      });
      setWeightSlabs(res.delivery_weight_slabs || []);
      setNotice(res.message || 'Saved shipping weight slab');
      if (max) {
        setMinWeightG(max.toString());
        setMaxWeightG((max + 500).toString());
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save delivery slab');
    } finally {
      setSavingSlab(false);
    }
  };

  const handleDeleteSlab = async (id: string) => {
    try {
      const res = await api.deleteDeliveryWeightSlab(id);
      setWeightSlabs(res.delivery_weight_slabs || []);
      setNotice('Weight delivery slab removed');
    } catch (err: any) {
      setError(err.message || 'Failed to delete slab');
    }
  };

  const handlePinInputChange = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 6);
    setSinglePin(digits);
    const autoState = getIndianStateFromPincode(digits);
    if (autoState) {
      setSingleState(autoState);
    }
  };

  const handleSaveSinglePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (singlePin.length !== 6) {
      setError('Please enter a valid 6-digit Indian PIN code');
      return;
    }

    const numCharge = parseFloat(singleCharge);
    if (isNaN(numCharge) || numCharge < 0) {
      setError('Delivery charge must be a valid positive number');
      return;
    }

    try {
      setSavingSingle(true);
      const res = await api.saveDeliveryPincodeSingle({
        pincode: singlePin,
        charge: numCharge,
        city: singleCity.trim(),
        state: singleState.trim()
      });
      setNotice(res.message || 'Saved PIN delivery charge');
      setSinglePin('');
      setSingleCharge('');
      setSingleCity('');
      setSingleState('');
      fetchPincodes();
    } catch (err: any) {
      setError(err.message || 'Failed to save PIN delivery charge');
    } finally {
      setSavingSingle(false);
    }
  };

  const handleDeletePin = async (pin: string) => {
    if (!confirm(`Remove custom delivery charge for PIN ${pin}?`)) return;
    try {
      const res = await api.deleteDeliveryPincode(pin);
      setNotice(res.message);
      setPincodes(prev => prev.filter(p => p.pincode !== pin));
      setTotalCount(c => Math.max(0, c - 1));
    } catch (err: any) {
      setError(err.message || 'Failed to delete PIN code');
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchPincodes(search);
  };

  const handleDownloadFile = () => {
    const token = localStorage.getItem('ai925_token') || sessionStorage.getItem('ai925_token');
    const url = `/api/pricing/delivery-pincodes/export?token=${encodeURIComponent(token || '')}`;
    window.open(url, '_blank');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      setError(null);
      setNotice(null);
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.uploadDeliveryPincodesFile(fd);
      setNotice(res.message || 'Uploaded delivery pincodes file successfully');
      fetchPincodes();
    } catch (err: any) {
      setError(err.message || 'Failed to upload Excel file');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[#D2BFA7]">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 rounded-full hover:bg-[#E8DCCB] text-[#6B5744] transition-colors cursor-pointer"
            aria-label="Go back"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-[#2F2923] flex items-center gap-2">
              <Truck size={20} className="text-[#6B5744]" />
              Shipping & Delivery Rules
            </h1>
            <p className="text-xs text-[#766B60]">
              Configure net weight slabs and custom PIN code delivery charges
            </p>
          </div>
        </div>
      </div>

      {/* Segmented Control Tabs */}
      <div className="grid grid-cols-2 gap-1.5 bg-[#E8DCCB]/60 p-1 rounded-2xl">
        <button
          type="button"
          onClick={() => { setActiveTab('weight_slabs'); setError(null); }}
          className={`py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'weight_slabs' ? 'bg-[#FFFCF7] text-[#2F2923] shadow-xs' : 'text-[#766B60] hover:text-[#2F2923]'}`}
        >
          <Scale size={14} />
          Net Weight Slabs ({weightSlabs.length})
        </button>
        <button
          type="button"
          onClick={() => { setActiveTab('pincodes'); setError(null); }}
          className={`py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'pincodes' ? 'bg-[#FFFCF7] text-[#2F2923] shadow-xs' : 'text-[#766B60] hover:text-[#2F2923]'}`}
        >
          <FileSpreadsheet size={14} />
          PIN Code Rates ({totalCount})
        </button>
      </div>

      {/* Notifications */}
      {notice && (
        <div className="p-3 bg-[#E3EEE6] border border-[#4F7D5B]/30 rounded-xl flex items-center gap-2 text-xs text-[#4F7D5B] font-medium animate-fadeIn">
          <CheckCircle2 size={16} className="shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {error && (
        <div className="p-3 bg-[#FBE9E9] border border-[#C94C4C]/30 rounded-xl flex items-center gap-2 text-xs text-[#C94C4C] font-medium animate-fadeIn">
          <AlertCircle size={16} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 1: NET WEIGHT SLABS (Shipping Rules by Total Weight) */}
      {/* ======================================================== */}
      {activeTab === 'weight_slabs' && (
        <div className="space-y-4">
          {/* Customer Privacy Banner */}
          <div className="bg-[#FAF6F0] border border-[#D2BFA7]/70 rounded-2xl p-3 flex items-start gap-2.5">
            <ShieldCheck size={18} className="text-[#4F7D5B] shrink-0 mt-0.5" />
            <div className="text-xs text-[#766B60]">
              <span className="font-bold text-[#2F2923]">Hidden from Customer:</span> When customers place orders, the system automatically checks their order's total net weight and applies the matching shipping charge directly. Slab tiers and rules remain completely invisible to customers.
            </div>
          </div>

          {/* Add New Weight Slab Card */}
          <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-4 shadow-xs">
            <h2 className="text-sm font-bold text-[#2F2923] mb-3 flex items-center gap-2">
              <Plus size={16} className="text-[#6B5744]" />
              Add Weight Slab Rule
            </h2>

            <form onSubmit={handleSaveSlab} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-[#766B60] uppercase mb-1">
                    Min Weight (grams)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={minWeightG}
                    onChange={e => setMinWeightG(e.target.value)}
                    placeholder="0"
                    required
                    className="w-full px-3 py-2 bg-[#F5F0E8] border border-[#D2BFA7] rounded-xl text-xs font-semibold text-[#2F2923] focus:outline-none focus:border-[#6B5744]"
                  />
                  <span className="text-[10px] text-[#766B60] mt-0.5 block">
                    {parseFloat(minWeightG) >= 1000 ? `(${(parseFloat(minWeightG)/1000).toFixed(2)} kg)` : ''}
                  </span>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-bold text-[#766B60] uppercase">
                      Max Weight (grams)
                    </label>
                    <label className="flex items-center gap-1 text-[11px] text-[#6B5744] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={noMaxWeight}
                        onChange={e => setNoMaxWeight(e.target.checked)}
                        className="rounded"
                      />
                      <span>No Limit</span>
                    </label>
                  </div>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    disabled={noMaxWeight}
                    value={noMaxWeight ? '' : maxWeightG}
                    onChange={e => setMaxWeightG(e.target.value)}
                    placeholder={noMaxWeight ? 'Above' : '500'}
                    required={!noMaxWeight}
                    className="w-full px-3 py-2 bg-[#F5F0E8] border border-[#D2BFA7] rounded-xl text-xs font-semibold text-[#2F2923] disabled:opacity-50 focus:outline-none focus:border-[#6B5744]"
                  />
                  {!noMaxWeight && parseFloat(maxWeightG) >= 1000 && (
                    <span className="text-[10px] text-[#766B60] mt-0.5 block">
                      {`(${(parseFloat(maxWeightG)/1000).toFixed(2)} kg)`}
                    </span>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#766B60] uppercase mb-1">
                    Shipping Charge (₹)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={shippingCharge}
                    onChange={e => setShippingCharge(e.target.value)}
                    placeholder="100"
                    required
                    className="w-full px-3 py-2 bg-[#F5F0E8] border border-[#D2BFA7] rounded-xl text-xs font-bold text-[#2F2923] focus:outline-none focus:border-[#6B5744]"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={savingSlab}
                  className="px-5 py-2.5 bg-[#6B5744] hover:bg-[#584534] disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
                >
                  {savingSlab ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  Add Delivery Slab
                </button>
              </div>
            </form>
          </div>

          {/* Weight Slabs List */}
          <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-4 shadow-xs">
            <h3 className="text-sm font-bold text-[#2F2923] mb-3">
              Configured Weight Slabs ({weightSlabs.length})
            </h3>

            {slabsLoading ? (
              <div className="py-8 flex justify-center text-[#6B5744]">
                <Loader2 size={24} className="animate-spin" />
              </div>
            ) : weightSlabs.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#766B60]">
                No weight slabs configured. Add your first slab above.
              </div>
            ) : (
              <div className="divide-y divide-[#E8DCCB]">
                {weightSlabs.map(s => {
                  const minG = Number(s.min_weight_g) || 0;
                  const maxG = s.max_weight_g !== null && s.max_weight_g !== undefined ? Number(s.max_weight_g) : null;
                  const minLabel = minG >= 1000 ? `${(minG/1000).toFixed(1)} kg (${minG} g)` : `${minG} g`;
                  const maxLabel = maxG ? (maxG >= 1000 ? `${(maxG/1000).toFixed(1)} kg (${maxG} g)` : `${maxG} g`) : 'and above';

                  return (
                    <div key={s.id} className="py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#E8DCCB]/60 flex items-center justify-center text-[#6B5744]">
                          <Scale size={16} />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-[#2F2923]">
                            {minLabel} ➔ {maxLabel}
                          </div>
                          <p className="text-[11px] text-[#766B60]">
                            Orders in this net weight range ship for {formatINR(s.shipping_charge)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-sm font-extrabold text-[#4F7D5B] bg-[#E3EEE6] px-3 py-1 rounded-xl">
                          {formatINR(s.shipping_charge)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteSlab(s.id)}
                          className="p-1.5 text-[#C94C4C] hover:bg-[#FBE9E9] rounded-lg transition-colors cursor-pointer"
                          title="Delete slab"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: PIN CODE RATES (Custom PIN Rules & Excel Import) */}
      {/* ======================================================== */}
      {activeTab === 'pincodes' && (
        <div className="space-y-4">
          {/* Actions & Bulk Tools */}
          <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-4 shadow-xs">
            <h2 className="text-sm font-bold text-[#2F2923] mb-3">Bulk Pincode Management (Excel)</h2>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleDownloadFile}
                className="px-3.5 py-2 bg-[#FAF6F0] hover:bg-[#E8DCCB] text-[#2F2923] border border-[#D2BFA7] rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Download size={14} className="text-[#6B5744]" />
                Export Pincodes (.xlsx)
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="px-3.5 py-2 bg-[#6B5744] hover:bg-[#584534] disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                Upload Pincodes (.xlsx / .csv)
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>
            <p className="text-[11px] text-[#766B60] mt-2">
              Excel columns supported: <strong>Pincode</strong>, <strong>Delivery Charge</strong>, <strong>City</strong>, <strong>State</strong>.
            </p>
          </div>

          {/* Add / Edit Single Pincode */}
          <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-4 shadow-xs">
            <h2 className="text-sm font-bold text-[#2F2923] mb-3">Add Custom PIN Code</h2>
            <form onSubmit={handleSaveSinglePin} className="grid grid-cols-1 sm:grid-cols-5 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-[#766B60] uppercase mb-1">PIN Code *</label>
                <input
                  type="text"
                  maxLength={6}
                  value={singlePin}
                  onChange={e => handlePinInputChange(e.target.value)}
                  placeholder="e.g. 403001"
                  required
                  className="w-full px-2.5 py-1.5 bg-[#F5F0E8] border border-[#D2BFA7] rounded-xl text-xs font-mono font-bold text-[#2F2923] focus:outline-none focus:border-[#6B5744]"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[#766B60] uppercase mb-1">Charge (₹) *</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={singleCharge}
                  onChange={e => setSingleCharge(e.target.value)}
                  placeholder="150"
                  required
                  className="w-full px-2.5 py-1.5 bg-[#F5F0E8] border border-[#D2BFA7] rounded-xl text-xs font-bold text-[#2F2923] focus:outline-none focus:border-[#6B5744]"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[#766B60] uppercase mb-1">State (Auto-detected)</label>
                <input
                  type="text"
                  value={singleState}
                  onChange={e => setSingleState(e.target.value)}
                  placeholder="State"
                  className="w-full px-2.5 py-1.5 bg-[#F5F0E8] border border-[#D2BFA7] rounded-xl text-xs text-[#2F2923] focus:outline-none focus:border-[#6B5744]"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[#766B60] uppercase mb-1">City / District</label>
                <input
                  type="text"
                  value={singleCity}
                  onChange={e => setSingleCity(e.target.value)}
                  placeholder="City"
                  className="w-full px-2.5 py-1.5 bg-[#F5F0E8] border border-[#D2BFA7] rounded-xl text-xs text-[#2F2923] focus:outline-none focus:border-[#6B5744]"
                />
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={savingSingle}
                  className="w-full py-1.5 bg-[#6B5744] hover:bg-[#584534] disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1"
                >
                  {savingSingle ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                  Save PIN
                </button>
              </div>
            </form>
          </div>

          {/* Pincodes Search & List */}
          <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-[#2F2923]">Custom Delivery Pincodes</h3>
              <span className="text-xs text-[#766B60] font-medium">{totalCount} total saved</span>
            </div>

            <form onSubmit={handleSearch} className="flex gap-2 mb-3">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search by PIN, city or state..."
                  className="w-full pl-8 pr-3 py-1.5 bg-[#F5F0E8] border border-[#D2BFA7] rounded-xl text-xs font-medium text-[#2F2923] focus:outline-none focus:border-[#6B5744]"
                />
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#766B60]" />
              </div>
              <button
                type="submit"
                className="px-3 py-1.5 bg-[#6B5744] text-white rounded-xl text-xs font-semibold cursor-pointer"
              >
                Filter
              </button>
            </form>

            {pincodesLoading ? (
              <div className="py-8 flex justify-center text-[#6B5744]">
                <Loader2 size={24} className="animate-spin" />
              </div>
            ) : pincodes.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#766B60]">
                No custom delivery pincodes found. Upload an Excel file or add a PIN above.
              </div>
            ) : (
              <div className="divide-y divide-[#E8DCCB] max-h-96 overflow-y-auto">
                {pincodes.map(p => (
                  <div key={p.pincode} className="py-2.5 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold text-[#2F2923]">{p.pincode}</span>
                        <span className="text-xs font-bold text-[#4F7D5B] bg-[#E3EEE6] px-2 py-0.5 rounded-md">
                          {formatINR(p.charge)}
                        </span>
                      </div>
                      {(p.city || p.state) && (
                        <p className="text-[11px] text-[#766B60] mt-0.5">
                          {[p.city, p.state].filter(Boolean).join(', ')}
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeletePin(p.pincode)}
                      className="p-1.5 text-[#C94C4C] hover:bg-[#FBE9E9] rounded-lg transition-colors cursor-pointer"
                      title="Delete PIN charge"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
