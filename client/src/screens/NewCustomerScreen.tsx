import React, { useState, useEffect } from 'react';
import { ArrowLeft, Check, Loader2, MapPin, Sparkles, Phone, Plus, Trash2, FileText, Image as ImageIcon, Crosshair, UserCheck } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';

interface NewCustomerScreenProps {
  onBack: () => void;
  onCustomerCreated: (customerId: string) => void;
  customerIdToEdit?: string;
  onCustomerUpdated?: (customerId: string) => void;
}

export const NewCustomerScreen: React.FC<NewCustomerScreenProps> = ({
  onBack,
  onCustomerCreated,
  customerIdToEdit,
  onCustomerUpdated,
}) => {
  const { user } = useAuth();
  const isRep = user?.role === 'SALES_REP';
  const isEditing = Boolean(customerIdToEdit);

  const [initialLoading, setInitialLoading] = useState(isEditing);
  const [pocName, setPocName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [brand, setBrand] = useState<'AI925' | 'ORAANI'>('AI925');
  const [category, setCategory] = useState<'Wholesaler' | 'Retailer' | 'Both' | 'E-commerce' | 'Importer' | 'Exporter'>('Wholesaler');
  const [country, setCountry] = useState('India');
  const [phone, setPhone] = useState('');
  const [alternatePhone, setAlternatePhone] = useState('');
  const [additionalPhones, setAdditionalPhones] = useState<string[]>([]);
  const [gstin, setGstin] = useState('');
  const [address, setAddress] = useState('');
  const [pincode, setPincode] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zone, setZone] = useState<'North' | 'South' | 'East' | 'West'>('North');
  const [existingCustomer, setExistingCustomer] = useState<any>(null);

  // Visiting card upload
  const [visitingCardPath, setVisitingCardPath] = useState<string>('');
  const [uploadingCard, setUploadingCard] = useState(false);

  // Location capture
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locationAddress, setLocationAddress] = useState<string>('');
  const [capturingLocation, setCapturingLocation] = useState(false);

  // Company assignment for Admin / Business Admin
  const [repsList, setRepsList] = useState<any[]>([]);
  const [assignedRepId, setAssignedRepId] = useState<string>('');

  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // If not sales rep, load sales representatives to allow company assignment
    if (!isRep) {
      api.getRepresentatives()
        .then(res => setRepsList(res.representatives || []))
        .catch(console.error);
    }
  }, [isRep]);

  useEffect(() => {
    if (customerIdToEdit) {
      setInitialLoading(true);
      api.getCustomer(customerIdToEdit)
        .then((res) => {
          if (res && res.customer) {
            const c = res.customer;
            setExistingCustomer(c);
            setPocName(c.poc_name || '');
            setCompanyName(c.company_name || '');
            if (c.brand) setBrand(c.brand);
            if (c.category) setCategory(c.category);
            if (c.country) setCountry(c.country);
            setVisitingCardPath(c.visiting_card_path || '');
            setLatitude(c.latitude !== null && c.latitude !== undefined ? Number(c.latitude) : null);
            setLongitude(c.longitude !== null && c.longitude !== undefined ? Number(c.longitude) : null);
            setLocationAddress(c.location_address || '');
            if (c.assigned_rep_id) setAssignedRepId(c.assigned_rep_id);
            setPhone(c.phone || '');
            setAlternatePhone(c.alternate_phone || '');
            if (c.additional_phones) {
              try {
                const arr = JSON.parse(c.additional_phones);
                if (Array.isArray(arr)) setAdditionalPhones(arr);
              } catch (_) {}
            }
            setGstin(c.gstin || '');
            setAddress(c.address || '');
            setPincode(c.pin_code || '');
            setCity(c.city || '');
            setState(c.state || '');
            if (c.zone && ['North', 'South', 'East', 'West'].includes(c.zone)) {
              setZone(c.zone);
            }
          }
        })
        .catch((err) => {
          setError(err.message || 'Failed to load customer details');
        })
        .finally(() => {
          setInitialLoading(false);
        });
    }
  }, [customerIdToEdit]);

  const handleVisitingCardUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingCard(true);
      setError(null);
      const fd = new FormData();
      fd.append('visiting_card', file);
      fd.append('company_name', companyName.trim() || 'company');

      const res = await api.uploadVisitingCard(fd);
      if (res && res.file_path) {
        setVisitingCardPath(res.file_path);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to upload visiting card');
    } finally {
      setUploadingCard(false);
    }
  };

  const handleCaptureLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      return;
    }
    setCapturingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude);
        setLongitude(pos.coords.longitude);
        const autoLocStr = `Lat: ${pos.coords.latitude.toFixed(5)}, Lng: ${pos.coords.longitude.toFixed(5)}`;
        setLocationAddress(autoLocStr);
        setCapturingLocation(false);
      },
      (err) => {
        setCapturingLocation(false);
        setError('Location access denied or unavailable: ' + err.message);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const handlePincodeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
    setPincode(val);

    if (val.length === 6) {
      try {
        setLookupLoading(true);
        setLookupMessage(null);
        const res = await api.lookupPincode(val);
        if (res.city) setCity(res.city);
        if (res.state) setState(res.state);
        if (res.zone && ['North', 'South', 'East', 'West'].includes(res.zone)) {
          setZone(res.zone as any);
        }
        setLookupMessage(`Resolved: ${res.city || ''}, ${res.state || ''} (${res.zone || ''})`);
      } catch (err: any) {
        console.warn('Pincode lookup error:', err);
        setLookupMessage('Postal lookup failed — please fill city & state manually');
      } finally {
        setLookupLoading(false);
      }
    } else {
      setLookupMessage(null);
    }
  };

  const handleAddAdditionalPhone = () => {
    setAdditionalPhones(prev => [...prev, '']);
  };

  const handleAdditionalPhoneChange = (index: number, val: string) => {
    setAdditionalPhones(prev => {
      const copy = [...prev];
      copy[index] = val;
      return copy;
    });
  };

  const handleRemoveAdditionalPhone = (index: number) => {
    setAdditionalPhones(prev => prev.filter((_, i) => i !== index));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pocName.trim()) {
      setError('POC Name is required');
      return;
    }
    if (!companyName.trim()) {
      setError('Company Name is required');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const cleanedAdditional = additionalPhones.map(p => p.trim()).filter(Boolean);

      const payload: any = {
        poc_name: pocName.trim(),
        company_name: companyName.trim(),
        brand,
        category,
        country: country.trim() || 'India',
        phone: phone.trim() || undefined,
        alternate_phone: alternatePhone.trim() || undefined,
        additional_phones: cleanedAdditional,
        gstin: gstin.trim() ? gstin.trim().toUpperCase() : undefined,
        address: address.trim() || undefined,
        pin_code: pincode.trim() || undefined,
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        zone,
        visiting_card_path: visitingCardPath || null,
        latitude: latitude !== null ? latitude : null,
        longitude: longitude !== null ? longitude : null,
        location_address: locationAddress || undefined,
        assigned_rep_id: !isRep && assignedRepId ? assignedRepId : undefined,
      };

      if (isEditing && customerIdToEdit) {
        await api.updateCustomer(customerIdToEdit, payload);
        if (onCustomerUpdated) {
          onCustomerUpdated(customerIdToEdit);
        } else {
          onBack();
        }
      } else {
        const res = await api.createCustomer(payload);
        if (res && res.customer) {
          onCustomerCreated(res.customer.id);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save customer');
    } finally {
      setSaving(false);
    }
  };

  const zones: Array<'North' | 'South' | 'East' | 'West'> = ['North', 'South', 'East', 'West'];
  const categories: Array<'Wholesaler' | 'Retailer' | 'Both' | 'E-commerce' | 'Importer' | 'Exporter'> = [
    'Wholesaler', 'Retailer', 'Both', 'E-commerce', 'Importer', 'Exporter'
  ];

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 border-3 border-[#6B5744] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="pb-24 pt-4 px-4 max-w-lg mx-auto">
      {/* Top Header */}
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={onBack}
          className="w-10 h-10 rounded-full bg-[#FFFCF7] border border-[#D2BFA7] flex items-center justify-center text-[#2F2923] hover:bg-[#E8DCCB] transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-[#2F2923]">
            {isEditing ? 'Modify Customer Details' : 'New Customer'}
          </h1>
          <p className="text-xs text-[#766B60]">
            {isEditing
              ? `Editing ${existingCustomer?.poc_name || 'customer account'}`
              : 'Add customer contact, visiting card and location'}
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-[#FBE9E9] border border-[#C94C4C]/30 text-[#C94C4C] p-3 rounded-xl text-xs mb-4 font-medium">
          {error}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-4">
        {/* Basic Info */}
        <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl p-4 shadow-xs space-y-3">
          <div>
            <label className="block text-xs font-bold text-[#2F2923] uppercase tracking-wider mb-1">
              POC Name <span className="text-[#C94C4C]">*</span>
            </label>
            <input
              type="text"
              required
              value={pocName}
              onChange={(e) => setPocName(e.target.value)}
              placeholder="e.g. Gaurav Agarwal"
              className="w-full bg-[#F5F0E8]/50 border border-[#D2BFA7] rounded-lg px-3 py-2 text-sm text-[#2F2923] placeholder-[#766B60]/60 focus:bg-[#FFFCF7] focus:outline-none focus:ring-2 focus:ring-[#6B5744]/30 focus:border-[#6B5744]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#2F2923] uppercase tracking-wider mb-1">
              Company Name <span className="text-[#C94C4C]">*</span>
            </label>
            <input
              type="text"
              required
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="e.g. Radhe Jewels"
              className="w-full bg-[#F5F0E8]/50 border border-[#D2BFA7] rounded-lg px-3 py-2 text-sm text-[#2F2923] placeholder-[#766B60]/60 focus:bg-[#FFFCF7] focus:outline-none focus:ring-2 focus:ring-[#6B5744]/30 focus:border-[#6B5744]"
            />
          </div>

          {/* Business Category Selection */}
          <div>
            <label className="block text-xs font-bold text-[#2F2923] uppercase tracking-wider mb-1">
              Business Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as any)}
              className="w-full bg-[#F5F0E8]/50 border border-[#D2BFA7] rounded-lg px-3 py-2 text-sm text-[#2F2923] focus:bg-[#FFFCF7] focus:outline-none focus:ring-2 focus:ring-[#6B5744]/30 focus:border-[#6B5744]"
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Brand Affiliation (Requirement 2) */}
          <div>
            <label className="block text-xs font-bold text-[#2F2923] uppercase tracking-wider mb-1.5">
              Brand Affiliation <span className="text-[#C94C4C]">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setBrand('AI925')}
                className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                  brand === 'AI925'
                    ? 'bg-[#6B5744] text-[#FFFCF7] border-[#6B5744] shadow-xs'
                    : 'bg-[#FFFCF7] text-[#2F2923] border-[#D2BFA7] hover:border-[#6B5744]/60'
                }`}
              >
                AI 925
              </button>
              <button
                type="button"
                onClick={() => setBrand('ORAANI')}
                className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                  brand === 'ORAANI'
                    ? 'bg-[#6B5744] text-[#FFFCF7] border-[#6B5744] shadow-xs'
                    : 'bg-[#FFFCF7] text-[#2F2923] border-[#D2BFA7] hover:border-[#6B5744]/60'
                }`}
              >
                Oraani
              </button>
            </div>
          </div>

          {/* Company Assignment for System Administrator & Business Administrator */}
          {!isRep && (
            <div>
              <label className="block text-xs font-bold text-[#6B5744] uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <UserCheck size={14} />
                <span>Assign to Sales Representative</span>
              </label>
              <select
                value={assignedRepId}
                onChange={(e) => setAssignedRepId(e.target.value)}
                className="w-full bg-[#F5F0E8]/50 border border-[#D2BFA7] rounded-lg px-3 py-2 text-sm text-[#2F2923] focus:bg-[#FFFCF7] focus:outline-none focus:ring-2 focus:ring-[#6B5744]/30 focus:border-[#6B5744]"
              >
                <option value="">(Unassigned / Direct House Account)</option>
                {repsList.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.full_name} (@{r.username}) - {r.assigned_region || 'General'}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-[#766B60] mt-1">
                Assigning this company to a representative grants exclusive access to manage its orders.
              </p>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-[#2F2923] uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <FileText size={14} className="text-[#6B5744]" />
              <span>GSTIN Number (Optional)</span>
            </label>
            <input
              type="text"
              maxLength={15}
              value={gstin}
              onChange={(e) => setGstin(e.target.value.toUpperCase())}
              placeholder="e.g. 22AAAAA0000A1Z5"
              className="w-full bg-[#F5F0E8]/50 border border-[#D2BFA7] rounded-lg px-3 py-2 text-sm text-[#2F2923] font-mono uppercase tracking-wider placeholder-[#766B60]/60 focus:bg-[#FFFCF7] focus:outline-none focus:ring-2 focus:ring-[#6B5744]/30 focus:border-[#6B5744]"
            />
          </div>
        </div>

        {/* Visiting Card Upload Section */}
        <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#6B5744] uppercase tracking-wider flex items-center gap-1.5">
              <ImageIcon size={14} />
              <span>Visiting Card Image</span>
            </span>
            {uploadingCard && (
              <span className="text-xs text-[#6B5744] flex items-center gap-1 font-medium">
                <Loader2 size={12} className="animate-spin" /> Uploading...
              </span>
            )}
          </div>
          <p className="text-[11px] text-[#766B60]">
            Image will be saved automatically with the company name.
          </p>

          {visitingCardPath ? (
            <div className="flex items-center gap-3 p-2 bg-[#F5F0E8] rounded-xl border border-[#D2BFA7]">
              <img
                src={visitingCardPath}
                alt="Visiting Card"
                className="w-20 h-14 object-cover rounded-lg border border-[#D2BFA7]"
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-[#2F2923] truncate">Visiting Card Attached</p>
                <a
                  href={visitingCardPath}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-[#6B5744] hover:underline"
                >
                  View full image
                </a>
              </div>
              <button
                type="button"
                onClick={() => setVisitingCardPath('')}
                className="p-1.5 text-[#C94C4C] hover:bg-[#FBE9E9] rounded-lg cursor-pointer"
                title="Remove image"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-[#D2BFA7] rounded-xl bg-[#F5F0E8]/50 hover:bg-[#F5F0E8] cursor-pointer transition-colors">
              <ImageIcon size={24} className="text-[#6B5744] mb-1.5" />
              <span className="text-xs font-bold text-[#2F2923]">Upload Visiting Card</span>
              <span className="text-[10px] text-[#766B60] mt-0.5">JPG, PNG, WebP up to 10MB</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleVisitingCardUpload}
                disabled={uploadingCard}
                className="hidden"
              />
            </label>
          )}
        </div>

        {/* Contact Numbers Section */}
        <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#6B5744] uppercase tracking-wider flex items-center gap-1.5">
              <Phone size={14} />
              <span>Contact Numbers</span>
            </span>
            <button
              type="button"
              onClick={handleAddAdditionalPhone}
              className="text-xs font-semibold text-[#6B5744] hover:text-[#2F2923] flex items-center gap-1 bg-[#F5F0E8] px-2.5 py-1 rounded-md border border-[#D2BFA7] hover:bg-[#E8DCCB] transition-colors cursor-pointer"
            >
              <Plus size={13} />
              <span>Add Number</span>
            </button>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#2F2923] uppercase tracking-wider mb-1">
              Primary Mobile Number
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 9876543210"
              className="w-full bg-[#F5F0E8]/50 border border-[#D2BFA7] rounded-lg px-3 py-2 text-sm text-[#2F2923] placeholder-[#766B60]/60 focus:bg-[#FFFCF7] focus:outline-none focus:ring-2 focus:ring-[#6B5744]/30 focus:border-[#6B5744]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#2F2923] uppercase tracking-wider mb-1">
              Alternate Phone Number
            </label>
            <input
              type="tel"
              value={alternatePhone}
              onChange={(e) => setAlternatePhone(e.target.value)}
              placeholder="e.g. 9820000000 (Optional)"
              className="w-full bg-[#F5F0E8]/50 border border-[#D2BFA7] rounded-lg px-3 py-2 text-sm text-[#2F2923] placeholder-[#766B60]/60 focus:bg-[#FFFCF7] focus:outline-none focus:ring-2 focus:ring-[#6B5744]/30 focus:border-[#6B5744]"
            />
          </div>

          {/* Multiple Additional Numbers dynamic inputs */}
          {additionalPhones.map((extraNum, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input
                type="tel"
                value={extraNum}
                onChange={(e) => handleAdditionalPhoneChange(idx, e.target.value)}
                placeholder={`Extra Contact #${idx + 1}`}
                className="flex-1 bg-[#F5F0E8]/50 border border-[#D2BFA7] rounded-lg px-3 py-2 text-sm text-[#2F2923] placeholder-[#766B60]/60 focus:bg-[#FFFCF7] focus:outline-none focus:ring-2 focus:ring-[#6B5744]/30 focus:border-[#6B5744]"
              />
              <button
                type="button"
                onClick={() => handleRemoveAdditionalPhone(idx)}
                className="p-2 text-[#C94C4C] hover:bg-[#FBE9E9] rounded-lg transition-colors cursor-pointer"
                title="Remove number"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>

        {/* Address, Location Capture & Indian PIN Code Auto-Lookup */}
        <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-bold text-[#6B5744] uppercase tracking-wider">
              <MapPin size={14} />
              <span>Location & Address</span>
            </span>

            {/* "add customer location" button */}
            <button
              type="button"
              onClick={handleCaptureLocation}
              disabled={capturingLocation}
              className="flex items-center gap-1 px-3 py-1 bg-[#6B5744] text-[#FFFCF7] rounded-lg text-xs font-bold shadow-xs hover:bg-[#584534] active:scale-95 transition-all cursor-pointer disabled:opacity-50"
            >
              {capturingLocation ? <Loader2 size={12} className="animate-spin" /> : <Crosshair size={12} />}
              <span>add customer location</span>
            </button>
          </div>

          {latitude !== null && longitude !== null && (
            <div className="p-2.5 bg-[#E3EEE6] border border-[#4F7D5B]/30 rounded-lg text-xs text-[#4F7D5B] flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Check size={14} strokeWidth={2.5} />
                <span>
                  Location Captured: {latitude.toFixed(5)}, {longitude.toFixed(5)}
                </span>
              </div>
              <a
                href={`https://www.google.com/maps?q=${latitude},${longitude}`}
                target="_blank"
                rel="noreferrer"
                className="underline font-bold text-[11px]"
              >
                Test Map
              </a>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-[#2F2923] uppercase tracking-wider mb-1">
              Address
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. Shop 12, Sarafa Bazar"
              className="w-full bg-[#F5F0E8]/50 border border-[#D2BFA7] rounded-lg px-3 py-2 text-sm text-[#2F2923] placeholder-[#766B60]/60 focus:bg-[#FFFCF7] focus:outline-none focus:ring-2 focus:ring-[#6B5744]/30 focus:border-[#6B5744]"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-[#2F2923] uppercase tracking-wider">
                PIN Code (6 digits)
              </label>
              {lookupLoading && (
                <span className="flex items-center gap-1 text-[11px] text-[#6B5744] font-medium">
                  <Loader2 size={12} className="animate-spin" /> Looking up...
                </span>
              )}
            </div>
            <div className="relative">
              <input
                type="text"
                maxLength={6}
                value={pincode}
                onChange={handlePincodeChange}
                placeholder="e.g. 282001"
                className="w-full bg-[#F5F0E8]/50 border border-[#D2BFA7] rounded-lg px-3 py-2 text-sm text-[#2F2923] font-mono tracking-widest placeholder-[#766B60]/60 focus:bg-[#FFFCF7] focus:outline-none focus:ring-2 focus:ring-[#6B5744]/30 focus:border-[#6B5744]"
              />
              {pincode.length === 6 && !lookupLoading && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#4F7D5B]">
                  <Check size={16} strokeWidth={2.5} />
                </span>
              )}
            </div>
            {lookupMessage && (
              <p className="text-[11px] text-[#6B5744] mt-1 flex items-center gap-1">
                <Sparkles size={11} /> {lookupMessage}
              </p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs font-bold text-[#2F2923] uppercase tracking-wider mb-1">
                City
              </label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. Agra"
                className="w-full bg-[#F5F0E8]/50 border border-[#D2BFA7] rounded-lg px-2.5 py-2 text-xs text-[#2F2923] placeholder-[#766B60]/60 focus:bg-[#FFFCF7] focus:outline-none focus:ring-1 focus:ring-[#6B5744]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#2F2923] uppercase tracking-wider mb-1">
                State
              </label>
              <input
                type="text"
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="e.g. Uttar Pradesh"
                className="w-full bg-[#F5F0E8]/50 border border-[#D2BFA7] rounded-lg px-2.5 py-2 text-xs text-[#2F2923] placeholder-[#766B60]/60 focus:bg-[#FFFCF7] focus:outline-none focus:ring-1 focus:ring-[#6B5744]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#2F2923] uppercase tracking-wider mb-1">
                Country
              </label>
              <input
                type="text"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="e.g. India"
                className="w-full bg-[#F5F0E8]/50 border border-[#D2BFA7] rounded-lg px-2.5 py-2 text-xs text-[#2F2923] placeholder-[#766B60]/60 focus:bg-[#FFFCF7] focus:outline-none focus:ring-1 focus:ring-[#6B5744]"
              />
            </div>
          </div>

          {/* Zone Selector */}
          <div>
            <label className="block text-xs font-bold text-[#2F2923] uppercase tracking-wider mb-1.5">
              Zone
            </label>
            <div className="grid grid-cols-4 gap-2">
              {zones.map((z) => {
                const isSelected = zone === z;
                return (
                  <button
                    key={z}
                    type="button"
                    onClick={() => setZone(z)}
                    className={`py-2 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#6B5744] text-[#FFFCF7] border-[#6B5744] shadow-xs'
                        : 'bg-[#FFFCF7] text-[#2F2923] border-[#D2BFA7] hover:bg-[#E8DCCB]'
                    }`}
                  >
                    {z}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={saving}
          className="w-full bg-[#6B5744] text-[#FFFCF7] py-3.5 rounded-xl font-bold text-sm shadow-md hover:bg-[#584534] active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
        >
          {saving ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              {isEditing ? 'Updating Customer...' : 'Saving Customer...'}
            </>
          ) : (
            isEditing ? 'Save Customer Modifications' : 'Save Customer'
          )}
        </button>
      </form>
    </div>
  );
};
