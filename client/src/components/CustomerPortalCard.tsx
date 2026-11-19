import React, { useEffect, useState } from 'react';
import { MapPin, Loader2, Smartphone } from 'lucide-react';
import { api, type CustomerAccess } from '../api';

// Green dot while the customer has the portal open (heartbeat in the last 2 minutes)
export const PresenceDot: React.FC<{ online: boolean; className?: string }> = ({ online, className = '' }) =>
  online ? (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full bg-[#2E9E5B] ring-2 ring-[#FFFCF7] ${className}`}
      title="Using the app now"
      aria-label="Using the app now"
      role="img"
    />
  ) : null;

export function lastSeenLabel(iso?: string | null): string {
  if (!iso) return 'Never opened the app';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 2) return 'Using the app now';
  if (mins < 60) return `Last seen ${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Last seen ${hrs} h ago`;
  return `Last seen ${new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

// Two switches: which portal sections the customer may see
export const AccessToggles: React.FC<{
  ready: boolean;
  order: boolean;
  onChange: (next: { can_view_ready: boolean; can_view_order: boolean }) => void;
  disabled?: boolean;
}> = ({ ready, order, onChange, disabled }) => {
  const item = (label: string, on: boolean, next: { can_view_ready: boolean; can_view_order: boolean }) => (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(next)}
      className={`flex-1 flex items-center justify-between gap-2 rounded-xl px-3 py-2 border text-xs font-bold transition-all disabled:opacity-60 ${
        on ? 'bg-[#E3EEE6] border-[#4F7D5B]/40 text-[#2F2923]' : 'bg-[#F5F0E8] border-[#E8DCCB] text-[#766B60]'
      }`}
    >
      <span>{label}</span>
      <span className={`relative w-8 h-4.5 rounded-full transition-colors ${on ? 'bg-[#4F7D5B]' : 'bg-[#D2BFA7]'}`} style={{ height: 18 }}>
        <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-all ${on ? 'left-4' : 'left-0.5'}`} />
      </span>
    </button>
  );
  return (
    <div>
      <p className="text-[10px] font-bold text-[#766B60] uppercase mb-1">Customer can view</p>
      <div className="flex gap-2">
        {item('Ready Stock', ready, { can_view_ready: !ready, can_view_order: order })}
        {item('Order Purchase', order, { can_view_ready: ready, can_view_order: !order })}
      </div>
      {!ready && !order && <p className="text-[10px] text-[#C94C4C] mt-1">The customer will not be able to buy anything.</p>}
    </div>
  );
};

export const LastLocation: React.FC<{ account: any }> = ({ account }) =>
  account.last_latitude !== null && account.last_latitude !== undefined ? (
    <a
      href={`https://www.google.com/maps?q=${account.last_latitude},${account.last_longitude}`}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-1.5 text-[11px] font-semibold text-[#6B5744]"
    >
      <MapPin size={12} />
      Last location {Number(account.last_latitude).toFixed(4)}, {Number(account.last_longitude).toFixed(4)}
      {account.last_location_at ? ` · ${new Date(account.last_location_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}
    </a>
  ) : (
    <p className="flex items-center gap-1.5 text-[11px] text-[#766B60]"><MapPin size={12} /> No location shared yet</p>
  );

// Customer details: portal account type, presence, last location and section visibility (both administrators)
export const CustomerPortalCard: React.FC<{ customerId: string }> = ({ customerId }) => {
  const [account, setAccount] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => api.getPortalAccountForCustomer(customerId)
      .then(res => { if (!cancelled) setAccount(res.account); })
      .catch(err => { if (!cancelled) setError(err.message || 'Could not load the portal account'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    load();
    const timer = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [customerId]);

  const save = async (access: CustomerAccess) => {
    if (!account) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api.setCustomerAccess(account.id, access);
      setAccount(res.account);
      setNotice(res.message);
      setTimeout(() => setNotice(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-4 flex justify-center"><Loader2 size={18} className="animate-spin text-[#6B5744]" /></div>;
  }
  if (!account) {
    return error ? <p className="text-xs text-[#C94C4C]">{error}</p> : null;
  }

  return (
    <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-4 shadow-card space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-[#2F2923] flex items-center gap-1.5"><Smartphone size={15} /> Customer app</p>
        {account.account_type && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-[#F5F0E8] text-[#6B5744] border border-[#D2BFA7]">{account.account_type}</span>
        )}
      </div>
      <div className="space-y-1">
        <p className={`flex items-center gap-1.5 text-xs font-semibold ${account.online ? 'text-[#2E9E5B]' : 'text-[#766B60]'}`}>
          {account.online ? <PresenceDot online /> : <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#D2BFA7]" />}
          {lastSeenLabel(account.last_seen_at)}
        </p>
        <LastLocation account={account} />
      </div>
      {account.status === 'APPROVED' && (
        <AccessToggles ready={account.can_view_ready} order={account.can_view_order} disabled={saving} onChange={save} />
      )}
      {notice && <p className="text-[11px] font-semibold text-[#4F7D5B]">{notice}</p>}
      {error && <p className="text-[11px] font-semibold text-[#C94C4C]">{error}</p>}
    </div>
  );
};
