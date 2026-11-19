import React, { useEffect, useState, useRef } from 'react';
import { 
  ArrowLeft, Download, Upload, Plus, Trash2, Search, 
  CheckCircle2, AlertCircle, Loader2, Truck, FileSpreadsheet
} from 'lucide-react';
import { api, type DeliveryPincode } from '../api';
import { formatINR } from '../pricing';

interface DeliveryChargesScreenProps {
  onBack: () => void;
}

export const DeliveryChargesScreen: React.FC<DeliveryChargesScreenProps> = ({ onBack }) => {
  const [pincodes, setPincodes] = useState<DeliveryPincode[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Single Pincode Form
  const [singlePin, setSinglePin] = useState('');
  const [singleCharge, setSingleCharge] = useState('');
  const [singleCity, setSingleCity] = useState('');
  const [singleState, setSingleState] = useState('');
  const [savingSingle, setSavingSingle] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fetchPincodes = async (query = search) => {
    try {
      setLoading(true);
      const res = await api.getDeliveryPincodes(query);
      setPincodes(res.delivery_pincodes || []);
      setTotalCount(res.total_count || 0);
    } catch (err: any) {
      setError(err.message || 'Failed to load delivery pincodes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPincodes();
  }, []);

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
    setError(null);
    setNotice(null);
    setUploading(true);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await api.uploadDeliveryPincodesFile(formData);
      setNotice(res.message || `Successfully imported pincodes.`);
      fetchPincodes('');
    } catch (err: any) {
      setError(err.message || 'Failed to upload Excel file. Ensure valid headers (Pincode, Charge).');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSaveSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const pin = singlePin.replace(/\D/g, '');
    if (pin.length !== 6) {
      setError('Please enter a valid 6-digit Indian PIN code');
      return;
    }
    const charge = parseFloat(singleCharge);
    if (isNaN(charge) || charge < 0) {
      setError('Please enter a valid delivery charge amount (0 or more)');
      return;
    }

    setSavingSingle(true);
    try {
      const res = await api.saveDeliveryPincodeSingle({
        pincode: pin,
        charge,
        city: singleCity.trim(),
        state: singleState.trim()
      });
      setNotice(res.message || `Saved delivery charge for PIN ${pin}`);
      setSinglePin('');
      setSingleCharge('');
      setSingleCity('');
      setSingleState('');
      fetchPincodes('');
    } catch (err: any) {
      setError(err.message || 'Failed to save delivery charge');
    } finally {
      setSavingSingle(false);
    }
  };

  const handleDelete = async (pin: string) => {
    if (!window.confirm(`Remove custom delivery charge for PIN ${pin}?`)) return;
    try {
      await api.deleteDeliveryPincode(pin);
      fetchPincodes();
    } catch (err: any) {
      alert(err.message || 'Failed to delete pincode');
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
          <h1 className="text-xl font-bold text-[#2F2923]">Customize Delivery Charges</h1>
          <p className="text-xs text-[#766B60]">Manage pincode-level shipping costs & bulk Excel sync</p>
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

      {/* Bulk Excel Upload & Download Bar */}
      <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-4 shadow-card mb-4">
        <div className="flex items-center gap-2 mb-2">
          <FileSpreadsheet size={18} className="text-[#6B5744]" />
          <h2 className="text-xs font-bold text-[#2F2923] uppercase tracking-wider">Excel / CSV Bulk Sync</h2>
        </div>
        <p className="text-xs text-[#766B60] mb-3 leading-relaxed">
          Upload an Excel (.xlsx) file containing <strong>Pincode</strong> and <strong>Delivery Charge</strong> columns, or download the current data.
        </p>

        <div className="grid grid-cols-2 gap-2.5">
          <button
            onClick={handleDownloadFile}
            className="py-2.5 px-3 bg-[#F5F0E8] border border-[#D2BFA7] hover:border-[#6B5744] text-[#6B5744] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-xs"
          >
            <Download size={15} />
            <span>Download Excel</span>
          </button>

          <label className="py-2.5 px-3 bg-[#6B5744] text-white hover:bg-[#544333] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-xs cursor-pointer">
            {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
            <span>{uploading ? 'Processing...' : 'Upload Excel'}</span>
            <input
              type="file"
              ref={fileInputRef}
              accept=".xlsx,.xls,.csv"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* Single Pincode Direct Edit Card */}
      <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-4 shadow-card mb-4">
        <div className="flex items-center gap-2 mb-2">
          <Plus size={18} className="text-[#6B5744]" />
          <h2 className="text-xs font-bold text-[#2F2923] uppercase tracking-wider">Quick Single PIN Edit</h2>
        </div>
        <p className="text-xs text-[#766B60] mb-3">Add or override the delivery charge directly for a single PIN code:</p>

        <form onSubmit={handleSaveSingle} className="space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-bold text-[#766B60] uppercase mb-1">PIN Code *</label>
              <input
                type="text"
                maxLength={6}
                value={singlePin}
                onChange={e => setSinglePin(e.target.value.replace(/\D/g, ''))}
                placeholder="e.g. 403001"
                className="w-full bg-[#F5F0E8] border border-[#D2BFA7] rounded-xl px-3 py-2 text-xs font-bold text-[#2F2923] focus:outline-none focus:border-[#6B5744]"
                required
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[#766B60] uppercase mb-1">Delivery Charge (₹) *</label>
              <input
                type="number"
                min="0"
                step="1"
                value={singleCharge}
                onChange={e => setSingleCharge(e.target.value)}
                placeholder="e.g. 150"
                className="w-full bg-[#F5F0E8] border border-[#D2BFA7] rounded-xl px-3 py-2 text-xs font-bold text-[#2F2923] focus:outline-none focus:border-[#6B5744]"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-bold text-[#766B60] uppercase mb-1">City / District (Optional)</label>
              <input
                type="text"
                value={singleCity}
                onChange={e => setSingleCity(e.target.value)}
                placeholder="e.g. Panaji"
                className="w-full bg-[#F5F0E8] border border-[#D2BFA7] rounded-xl px-3 py-2 text-xs font-medium text-[#2F2923] focus:outline-none focus:border-[#6B5744]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[#766B60] uppercase mb-1">State (Optional)</label>
              <input
                type="text"
                value={singleState}
                onChange={e => setSingleState(e.target.value)}
                placeholder="e.g. Goa"
                className="w-full bg-[#F5F0E8] border border-[#D2BFA7] rounded-xl px-3 py-2 text-xs font-medium text-[#2F2923] focus:outline-none focus:border-[#6B5744]"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={savingSingle}
            className="w-full py-2.5 bg-[#6B5744] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-98 shadow-xs disabled:opacity-50"
          >
            {savingSingle ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            <span>{savingSingle ? 'Saving...' : 'Save Pincode Charge'}</span>
          </button>
        </form>
      </div>

      {/* Pincodes Table & Search */}
      <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-4 shadow-card">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Truck size={17} className="text-[#6B5744]" />
            <h2 className="text-xs font-bold text-[#2F2923] uppercase tracking-wider">Active Pincode Rates</h2>
          </div>
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#E8DCCB] text-[#6B5744]">
            {totalCount} Total
          </span>
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
            className="px-3 py-1.5 bg-[#6B5744] text-white rounded-xl text-xs font-semibold"
          >
            Filter
          </button>
        </form>

        {loading ? (
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
                  onClick={() => handleDelete(p.pincode)}
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
  );
};
