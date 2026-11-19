// Requests inbox tabs for customer profile / password changes and "Book a call" requests
import React, { useEffect, useState } from 'react';
import { Check, X, Loader2, Phone, KeyRound, ArrowRight } from 'lucide-react';
import { api, type ProfileChangeRequest } from '../api';

const FIELD_LABEL: Record<string, string> = {
  full_name: 'Name', company_name: 'Company', phone: 'Mobile', email: 'Email', address: 'Address', pin_code: 'PIN code'
};

function fmtDate(iso?: string | null) {
  return iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
}

const filterBtn = (active: boolean) =>
  `px-3 py-1.5 rounded-full text-[11px] font-bold border ${active ? 'bg-[#2F2923] text-white border-[#2F2923]' : 'bg-[#FFFCF7] text-[#766B60] border-[#D2BFA7]'}`;

export const ProfileChangesTab: React.FC<{ isSystemAdmin: boolean; onChanged: (message: string) => void }> = ({ isSystemAdmin, onChanged }) => {
  const [status, setStatus] = useState<'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const [rows, setRows] = useState<ProfileChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api.getProfileChanges(status).then(r => setRows(r.requests)).catch(err => setError(err.message)).finally(() => setLoading(false));
  };
  useEffect(load, [status]);

  const act = async (row: ProfileChangeRequest, approve: boolean) => {
    let reason = '';
    if (!approve) {
      reason = window.prompt('Reason for rejecting (the customer sees this):', 'Details could not be verified') ?? '';
      if (reason === '') return;
    }
    setBusyId(row.id);
    setError(null);
    try {
      const res = approve ? await api.approveProfileChange(row.id) : await api.rejectProfileChange(row.id, reason);
      onChanged(res.message);
      load();
    } catch (err: any) {
      setError(err.message || 'Could not update the request');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <p className="text-[11px] text-[#766B60] mb-3">Customers asking to change their details or password. Either administrator can approve; the change then applies to the portal account and the customer record.</p>
      <div className="flex gap-1.5 mb-3">
        {(['PENDING', 'APPROVED', 'REJECTED'] as const).map(s => (
          <button key={s} onClick={() => setStatus(s)} className={filterBtn(status === s)}>{s === 'PENDING' ? 'Waiting' : s === 'APPROVED' ? 'Approved' : 'Rejected'}</button>
        ))}
      </div>
      {error && <div className="mb-3 p-3 bg-[#FBE9E9] rounded-xl text-xs text-[#C94C4C]">{error}</div>}
      {loading && rows.length === 0 ? (
        <div className="py-12 flex justify-center"><Loader2 className="animate-spin text-[#6B5744]" /></div>
      ) : rows.length === 0 ? (
        <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-6 text-center text-xs text-[#766B60]">No {status === 'PENDING' ? 'changes waiting' : status.toLowerCase() + ' changes'}.</div>
      ) : (
        <div className="space-y-3">
          {rows.map(r => (
            <div key={r.id} className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-4 shadow-card">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <p className="font-bold text-sm text-[#2F2923]">{r.current.full_name}</p>
                  <p className="text-[11px] text-[#766B60]">{r.current.company_name || ''}{r.current.company_name ? ' · ' : ''}{r.current.phone} · asked {fmtDate(r.created_at)}</p>
                </div>
              </div>
              <div className="space-y-1.5 text-xs">
                {Object.entries(r.changes).map(([field, value]) => (
                  <div key={field} className="grid grid-cols-[72px_1fr] gap-2 items-start">
                    <span className="text-[10px] font-bold uppercase text-[#766B60] pt-0.5">{FIELD_LABEL[field] || field}</span>
                    <span className="flex flex-wrap items-center gap-1">
                      <span className="line-through text-[#766B60]">{r.current[field] || '—'}</span>
                      <ArrowRight size={11} className="text-[#766B60]" />
                      <span className="font-semibold text-[#2F2923]">{value || '—'}</span>
                    </span>
                  </div>
                ))}
                {r.changes_password && (
                  <div className="grid grid-cols-[72px_1fr] gap-2 items-start">
                    <span className="text-[10px] font-bold uppercase text-[#766B60] pt-0.5">Password</span>
                    <span className="flex items-center gap-1 font-semibold text-[#2F2923]">
                      <KeyRound size={12} /> {isSystemAdmin && r.new_password ? <code className="px-1.5 py-0.5 bg-[#F5F0E8] rounded">{r.new_password}</code> : 'New password'}
                    </span>
                  </div>
                )}
              </div>
              {r.status === 'PENDING' ? (
                <div className="flex gap-2 mt-3">
                  <button disabled={busyId === r.id} onClick={() => act(r, false)} className="flex-1 py-2 bg-[#FFFCF7] border border-[#C94C4C]/40 text-[#C94C4C] rounded-xl text-xs font-bold flex items-center justify-center gap-1"><X size={14} /> Reject</button>
                  <button disabled={busyId === r.id} onClick={() => act(r, true)} className="flex-1 py-2 bg-[#4F7D5B] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1">
                    {busyId === r.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Approve
                  </button>
                </div>
              ) : (
                <p className="text-[11px] text-[#766B60] mt-3">
                  {r.status === 'APPROVED' ? 'Approved' : 'Rejected'}{r.reviewed_by_name ? ` by ${r.reviewed_by_name}` : ''} · {fmtDate(r.reviewed_at)}
                  {r.rejected_reason ? ` · ${r.rejected_reason}` : ''}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
};

const CALL_STATUS: { key: string; label: string }[] = [
  { key: 'OPEN', label: 'New' },
  { key: 'SCHEDULED', label: 'Scheduled' },
  { key: 'DONE', label: 'Done' },
  { key: 'CANCELLED', label: 'Cancelled' }
];

export const CallBookingsTab: React.FC<{ onChanged: (message: string) => void }> = ({ onChanged }) => {
  const [filter, setFilter] = useState<'Active' | 'DONE' | 'CANCELLED'>('Active');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api.getCallBookings(filter === 'Active' ? undefined : filter).then(r => setRows(r.bookings)).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(load, [filter]);

  const update = async (b: any, status: string) => {
    setBusyId(b.id);
    try {
      await api.updateCallBooking(b.id, { status, admin_notes: notes[b.id] ?? b.admin_notes ?? '' });
      onChanged(`Call with ${b.customer_name} marked ${CALL_STATUS.find(s => s.key === status)?.label.toLowerCase()}`);
      load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <p className="text-[11px] text-[#766B60] mb-3">Customers who booked a call for a customised order.</p>
      <div className="flex gap-1.5 mb-3">
        {(['Active', 'DONE', 'CANCELLED'] as const).map(s => (
          <button key={s} onClick={() => setFilter(s)} className={filterBtn(filter === s)}>{s === 'Active' ? 'To call' : s === 'DONE' ? 'Done' : 'Cancelled'}</button>
        ))}
      </div>
      {loading && rows.length === 0 ? (
        <div className="py-12 flex justify-center"><Loader2 className="animate-spin text-[#6B5744]" /></div>
      ) : rows.length === 0 ? (
        <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-6 text-center text-xs text-[#766B60]">No call bookings here.</div>
      ) : (
        <div className="space-y-3">
          {rows.map(b => (
            <div key={b.id} className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-4 shadow-card">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-sm text-[#2F2923]">{b.customer_name}{b.company_name ? ` · ${b.company_name}` : ''}</p>
                  <p className="text-[11px] text-[#766B60]">
                    {b.preferred_date ? new Date(b.preferred_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'Any day'}
                    {b.preferred_slot ? ` · ${b.preferred_slot}` : ' · any time'} · booked {fmtDate(b.created_at)}
                  </p>
                </div>
                <a href={`tel:${b.phone}`} className="flex items-center gap-1 px-3 py-1.5 bg-[#4F7D5B] text-white rounded-xl text-xs font-bold shrink-0">
                  <Phone size={13} /> {b.phone}
                </a>
              </div>
              <p className="text-xs text-[#2F2923] mt-2 whitespace-pre-wrap bg-[#F5F0E8] rounded-xl p-2.5">{b.notes}</p>
              <textarea
                rows={2}
                value={notes[b.id] ?? b.admin_notes ?? ''}
                onChange={e => setNotes(n => ({ ...n, [b.id]: e.target.value }))}
                placeholder="Note for the customer (e.g. call fixed for Monday 11am)"
                className="w-full mt-2 px-3 py-2 bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl text-xs text-[#2F2923]"
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {CALL_STATUS.map(s => (
                  <button
                    key={s.key}
                    disabled={busyId === b.id}
                    onClick={() => update(b, s.key)}
                    className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border ${b.status === s.key ? 'bg-[#6B5744] text-white border-[#6B5744]' : 'bg-[#FFFCF7] text-[#2F2923] border-[#D2BFA7]'}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              {b.handled_by_name && <p className="text-[10px] text-[#766B60] mt-1.5">Last updated by {b.handled_by_name}</p>}
            </div>
          ))}
        </div>
      )}
    </>
  );
};
