import React, { useEffect, useState } from 'react';
import { KeyRound, Eye, EyeOff, Loader2, History } from 'lucide-react';
import { api, type CustomerCredentials } from '../api';

function fmt(iso?: string | null) {
  return iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
}

const SOURCE_LABEL: Record<string, string> = { REGISTERED: 'Set at sign-up', CHANGED: 'Changed by customer', SET_BY_ADMIN: 'Set by System Administrator' };

// System Administrator only: the customer's portal sign-in, the password in force and every earlier one.
// Refreshes every 30 s so an approved password change shows without reopening the page.
export const CustomerCredentialsCard: React.FC<{ customerId: string }> = ({ customerId }) => {
  const [data, setData] = useState<CustomerCredentials | null>(null);
  const [show, setShow] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [newPassword, setNewPassword] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => api.getCustomerCredentials({ customer_id: customerId }).then(setData).catch(err => setError(err.message));
  useEffect(() => {
    load();
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [customerId]);

  if (!data) return null;
  if (!data.account) {
    return (
      <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-4 shadow-card text-xs text-[#766B60]">
        <p className="font-bold text-[#2F2923] flex items-center gap-1.5 mb-1"><KeyRound size={14} /> Portal sign-in</p>
        This customer has no customer portal account.
      </div>
    );
  }
  const a = data.account;
  const mask = (p: string | null) => (p === null ? 'Not recorded' : show ? p : '•'.repeat(Math.max(6, p.length)));

  const savePassword = async () => {
    if (!newPassword || newPassword.length < 6) return setError('Password must be at least 6 characters');
    setBusy(true);
    setError(null);
    try {
      const res = await api.setCustomerPassword(a.id, newPassword);
      setMessage(res.message);
      setNewPassword(null);
      load();
    } catch (err: any) {
      setError(err.message || 'Could not save the password');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-4 shadow-card space-y-2 text-xs">
      <div className="flex items-center justify-between">
        <p className="font-bold text-[#2F2923] flex items-center gap-1.5"><KeyRound size={14} /> Portal sign-in</p>
        <button onClick={() => setShow(s => !s)} className="flex items-center gap-1 text-[11px] font-bold text-[#6B5744]" aria-label={show ? 'Hide passwords' : 'Show passwords'}>
          {show ? <EyeOff size={13} /> : <Eye size={13} />} {show ? 'Hide' : 'Show'}
        </button>
      </div>
      <div className="grid grid-cols-[80px_1fr] gap-y-1 gap-x-2">
        <span className="text-[#766B60]">Mobile</span><span className="font-semibold text-[#2F2923]">{a.phone}</span>
        <span className="text-[#766B60]">Email</span><span className="font-semibold text-[#2F2923] break-all">{a.email}</span>
        <span className="text-[#766B60]">Password</span>
        <span className="font-semibold text-[#2F2923]">
          <code className="px-1.5 py-0.5 bg-[#F5F0E8] rounded">{mask(a.password)}</code>
        </span>
        <span className="text-[#766B60]">Changed</span>
        <span className="text-[#2F2923]">{a.password_changed_at ? fmt(a.password_changed_at) : `Not since sign-up (${fmt(a.created_at)})`}</span>
      </div>
      {!a.password_recorded && (
        <p className="text-[11px] text-[#D97732]">This password was set before passwords were recorded. It shows here after the customer's next change, or set a new one below.</p>
      )}
      {a.pending_password && (
        <p className="text-[11px] text-[#D97732]">
          Waiting for approval: new password <code className="px-1 bg-[#F5F0E8] rounded">{mask(a.pending_password.password)}</code> (asked {fmt(a.pending_password.requested_at)})
        </p>
      )}

      {data.history.length > 0 && (
        <div>
          <button onClick={() => setHistoryOpen(o => !o)} className="flex items-center gap-1 text-[11px] font-bold text-[#6B5744]">
            <History size={12} /> {historyOpen ? 'Hide' : 'Show'} password history ({data.history.length})
          </button>
          {historyOpen && (
            <div className="mt-1.5 divide-y divide-[#E8DCCB] border border-[#E8DCCB] rounded-xl">
              {data.history.map((h, i) => (
                <div key={i} className="px-2.5 py-1.5 flex items-center justify-between gap-2">
                  <code className="px-1.5 py-0.5 bg-[#F5F0E8] rounded">{mask(h.password)}</code>
                  <span className="text-[10px] text-[#766B60] text-right">
                    {SOURCE_LABEL[h.source] || h.source}{h.approved_by_name ? ` · ${h.approved_by_name}` : ''}<br />{fmt(h.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {newPassword === null ? (
        <button onClick={() => { setNewPassword(''); setMessage(null); }} className="text-[11px] font-bold text-[#6B5744]">Set a new password</button>
      ) : (
        <div className="flex items-center gap-1.5">
          <input autoFocus value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="New password (6+ characters)"
            className="flex-1 px-2.5 py-1.5 bg-[#F5F0E8] border border-[#D2BFA7] rounded-lg text-xs" aria-label="New password" />
          <button onClick={savePassword} disabled={busy} className="px-3 py-1.5 bg-[#6B5744] text-white rounded-lg text-[11px] font-bold flex items-center gap-1">
            {busy && <Loader2 size={12} className="animate-spin" />} Save
          </button>
          <button onClick={() => setNewPassword(null)} className="px-2 py-1.5 text-[11px] font-semibold text-[#766B60]">Cancel</button>
        </div>
      )}
      {message && <p className="text-[11px] font-semibold text-[#4F7D5B]">{message}</p>}
      {error && <p className="text-[11px] font-semibold text-[#C94C4C]">{error}</p>}
    </div>
  );
};
