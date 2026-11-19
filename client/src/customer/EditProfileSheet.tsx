import React, { useState } from 'react';
import { X, Loader2, Eye, EyeOff } from 'lucide-react';
import { portalApi, type CustomerAccount } from '../api';

// Customer asks to change their details and / or password. Nothing changes until an administrator approves.
export const EditProfileSheet: React.FC<{ account: CustomerAccount; onClose: () => void; onSent: (account: CustomerAccount, message: string) => void }> = ({ account, onClose, onSent }) => {
  const [form, setForm] = useState({
    full_name: account.full_name,
    company_name: account.company_name || '',
    phone: account.phone,
    email: account.email,
    address: account.address,
    pin_code: account.pin_code || ''
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
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <form onSubmit={submit} className="w-full max-w-md bg-[#FFFCF7] border border-[#D2BFA7] rounded-t-3xl sm:rounded-2xl p-5 max-h-[90vh] overflow-y-auto space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-base text-[#2F2923]">Change my details</h3>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-full bg-[#F5F0E8] border border-[#D2BFA7] flex items-center justify-center text-[#766B60]" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <p className="text-xs text-[#766B60] bg-[#FBE8DB]/60 rounded-xl px-3 py-2">Changes are sent to our administrator and apply once approved.</p>

        <div><label className={labelCls} htmlFor="pf-name">Name</label><input id="pf-name" value={form.full_name} onChange={e => set('full_name', e.target.value)} className={fieldCls} /></div>
        <div><label className={labelCls} htmlFor="pf-company">Company</label><input id="pf-company" value={form.company_name} onChange={e => set('company_name', e.target.value)} className={fieldCls} /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className={labelCls} htmlFor="pf-phone">Mobile</label><input id="pf-phone" type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} className={fieldCls} /></div>
          <div><label className={labelCls} htmlFor="pf-pin">PIN code</label><input id="pf-pin" inputMode="numeric" maxLength={6} value={form.pin_code} onChange={e => set('pin_code', e.target.value)} className={fieldCls} /></div>
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

        {error && <p className="text-xs text-[#C94C4C] font-medium">{error}</p>}
        <button type="submit" disabled={busy} className="w-full py-3 bg-[#6B5744] text-white font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50">
          {busy && <Loader2 size={16} className="animate-spin" />} Send for approval
        </button>
      </form>
    </div>
  );
};
