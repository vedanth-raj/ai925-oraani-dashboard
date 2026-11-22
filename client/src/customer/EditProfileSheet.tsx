import React, { useState } from 'react';
import { X, Loader2, Eye, EyeOff, Check } from 'lucide-react';
import { portalApi, type CustomerAccount } from '../api';
import { getIndianStateFromPincode } from '../utils/pincode';

// Customer asks to change their details and / or password. Nothing changes until an administrator approves.
export const EditProfileSheet: React.FC<{ account: CustomerAccount; onClose: () => void; onSent: (account: CustomerAccount, message: string) => void }> = ({ account, onClose, onSent }) => {
  const [form, setForm] = useState({
    full_name: account.full_name,
    company_name: account.company_name || '',
    phone: account.phone,
    email: account.email,
    address: account.address,
    pin_code: account.pin_code || '',
    state: account.state || ''
  });
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword && newPassword !== confirm) {
      setError('The new passwords do not match');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await portalApi.requestProfileChange({ ...form, current_password: currentPassword, ...(newPassword ? { new_password: newPassword } : {}) });
      onSent(res.account, res.message);
    } catch (err: any) {
      setError(err.message || 'Could not send the change');
    } finally {
      setBusy(false);
    }
  };

  const fieldCls = 'w-full px-3 py-2.5 bg-[#F5F0E8] border border-[#D2BFA7] rounded-xl text-sm text-[#2F2923] focus:outline-none focus:ring-1 focus:ring-[#6B5744]';
  const labelCls = 'block text-[11px] font-bold text-[#766B60] uppercase mb-1';

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <form 
        onSubmit={submit} 
        className="w-full max-w-md bg-[#FFFCF7] border border-[#D2BFA7] rounded-t-3xl sm:rounded-2xl max-h-[90dvh] sm:max-h-[85vh] flex flex-col shadow-2xl overflow-hidden" 
        onClick={e => e.stopPropagation()}
      >
        {/* Sticky Header */}
        <div className="px-5 pt-4 pb-3 border-b border-[#E8DCCB] flex items-center justify-between shrink-0 bg-[#FFFCF7]">
          <div>
            <h3 className="font-bold text-base text-[#2F2923]">Change my details</h3>
            <p className="text-[11px] text-[#766B60]">Requires administrator approval to apply</p>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="w-8 h-8 rounded-full bg-[#F5F0E8] border border-[#D2BFA7] flex items-center justify-center text-[#766B60] hover:text-[#2F2923] active:scale-95 transition-transform" 
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5 overscroll-contain">
          <p className="text-xs text-[#766B60] bg-[#FBE8DB]/60 rounded-xl px-3 py-2 border border-[#E8DCCB]">
            Changes are sent to our administrator and apply once approved.
          </p>

          <div><label className={labelCls} htmlFor="pf-name">Name</label><input id="pf-name" value={form.full_name} onChange={e => set('full_name', e.target.value)} className={fieldCls} /></div>
          <div><label className={labelCls} htmlFor="pf-company">Company</label><input id="pf-company" value={form.company_name} onChange={e => set('company_name', e.target.value)} className={fieldCls} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className={labelCls} htmlFor="pf-phone">Mobile</label><input id="pf-phone" type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} className={fieldCls} /></div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className={labelCls} htmlFor="pf-pin">PIN code</label>
                {form.state && <span className="text-[10px] text-[#4F7D5B] font-bold flex items-center gap-0.5"><Check size={10} /> {form.state}</span>}
              </div>
              <input 
                id="pf-pin" 
                inputMode="numeric" 
                maxLength={6} 
                value={form.pin_code} 
                onChange={e => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 6);
                  const detectedState = getIndianStateFromPincode(digits);
                  setForm(f => ({ ...f, pin_code: digits, ...(detectedState ? { state: detectedState } : {}) }));
                }} 
                className={fieldCls} 
              />
            </div>
          </div>
          <div>
            <label className={labelCls} htmlFor="pf-state">State</label>
            <input 
              id="pf-state" 
              value={form.state} 
              onChange={e => set('state', e.target.value)} 
              placeholder="Auto-detected from PIN" 
              className={fieldCls} 
            />
          </div>
          <div><label className={labelCls} htmlFor="pf-email">Email</label><input id="pf-email" type="email" value={form.email} onChange={e => set('email', e.target.value)} className={fieldCls} /></div>
          <div><label className={labelCls} htmlFor="pf-address">Address</label><textarea id="pf-address" rows={2} value={form.address} onChange={e => set('address', e.target.value)} className={fieldCls} /></div>

          <div className="pt-2 border-t border-[#E8DCCB]">
            <p className="text-[11px] font-bold text-[#2F2923] uppercase mb-2">New password (optional)</p>
            <div className="grid grid-cols-2 gap-2">
              <input type={show ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="New password" autoComplete="new-password" className={fieldCls} aria-label="New password" />
              <input type={show ? 'text' : 'password'} value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repeat it" autoComplete="new-password" className={fieldCls} aria-label="Repeat new password" />
            </div>
          </div>

          <div>
            <label className={labelCls} htmlFor="pf-current">Current password *</label>
            <div className="relative">
              <input id="pf-current" type={show ? 'text' : 'password'} required value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} autoComplete="current-password" className={`${fieldCls} pr-10`} />
              <button type="button" onClick={() => setShow(s => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[#766B60]" aria-label={show ? 'Hide passwords' : 'Show passwords'}>
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
        </div>

        {/* Sticky Action Footer (Always visible, lifted above iPhone Home Bar and Safari bar) */}
        <div className="shrink-0 bg-[#FFFCF7] border-t border-[#D2BFA7] px-5 pt-3.5 pb-[max(1.75rem,calc(env(safe-area-inset-bottom)+1.25rem))] shadow-[0_-4px_16px_rgba(47,41,35,0.08)]">
          {error && <p className="text-xs text-[#C94C4C] font-semibold mb-2">{error}</p>}
          <button 
            type="submit" 
            disabled={busy} 
            className="w-full py-3.5 bg-[#6B5744] hover:bg-[#584534] active:bg-[#4A3B2C] text-white font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 shadow-md text-sm transition-all cursor-pointer"
          >
            {busy && <Loader2 size={16} className="animate-spin" />} Send for approval
          </button>
        </div>
      </form>
    </div>
  );
};
