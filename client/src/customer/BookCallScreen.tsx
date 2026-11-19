import React, { useEffect, useState } from 'react';
import { ArrowLeft, PhoneCall, CheckCircle2, Loader2 } from 'lucide-react';
import { portalApi, type CustomerAccount } from '../api';

const STATUS_LABEL: Record<string, string> = { OPEN: 'Requested', SCHEDULED: 'Scheduled', DONE: 'Done', CANCELLED: 'Cancelled' };

// "Book a call" for a customised order: the team calls back to discuss the design
export const BookCallScreen: React.FC<{ account: CustomerAccount; onBack: () => void }> = ({ account, onBack }) => {
  const today = new Date().toISOString().split('T')[0];
  const [phone, setPhone] = useState(account.phone);
  const [date, setDate] = useState(today);
  const [slot, setSlot] = useState('');
  const [notes, setNotes] = useState('');
  const [slots, setSlots] = useState<string[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = () => portalApi.getCallBookings().then(res => { setBookings(res.bookings); setSlots(res.slots); }).catch(() => {});
  useEffect(() => { load(); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await portalApi.bookCall({ phone, preferred_date: date, preferred_slot: slot, notes });
      setDone(res.message);
      setNotes('');
      load();
    } catch (err: any) {
      setError(err.message || 'Could not book the call');
    } finally {
      setBusy(false);
    }
  };

  const fieldCls = 'w-full px-3 py-2.5 bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl text-sm text-[#2F2923] focus:outline-none focus:ring-1 focus:ring-[#6B5744]';

  return (
    <div className="px-4 pt-4 pb-24">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} className="w-10 h-10 rounded-full bg-[#FFFCF7] border border-[#D2BFA7] flex items-center justify-center" aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-[#2F2923]">Book a Call</h1>
          <p className="text-xs text-[#766B60]">Get a customised order</p>
        </div>
      </div>

      {done ? (
        <div className="bg-[#E3EEE6] border border-[#4F7D5B]/30 rounded-2xl p-4 mb-4 flex items-start gap-2">
          <CheckCircle2 size={18} className="text-[#4F7D5B] shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-[#2F2923]">{done}</p>
            <button onClick={() => setDone(null)} className="mt-2 text-xs font-bold text-[#6B5744]">Book another call</button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-4 shadow-card space-y-3 mb-5">
          <div>
            <label className="block text-[11px] font-bold text-[#766B60] uppercase mb-1" htmlFor="call-notes">What would you like made? *</label>
            <textarea id="call-notes" rows={4} required value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Design, weight, size, quantity, finish, delivery date…" className={fieldCls} />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-[#766B60] uppercase mb-1" htmlFor="call-phone">Call me on</label>
            <input id="call-phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)} className={fieldCls} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-bold text-[#766B60] uppercase mb-1" htmlFor="call-date">Preferred day</label>
              <input id="call-date" type="date" min={today} value={date} onChange={e => setDate(e.target.value)} className={fieldCls} />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-[#766B60] uppercase mb-1" htmlFor="call-slot">Time</label>
              <select id="call-slot" value={slot} onChange={e => setSlot(e.target.value)} className={fieldCls}>
                <option value="">Any time</option>
                {slots.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          {error && <p className="text-xs text-[#C94C4C] font-medium">{error}</p>}
          <button type="submit" disabled={busy} className="w-full py-3 bg-[#6B5744] text-white font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <PhoneCall size={16} />} Book the call
          </button>
        </form>
      )}

      {bookings.length > 0 && (
        <div>
          <p className="text-[11px] font-bold text-[#766B60] uppercase tracking-wider mb-2">My call bookings</p>
          <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl divide-y divide-[#E8DCCB]">
            {bookings.map(b => (
              <div key={b.id} className="p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-[#2F2923]">
                    {b.preferred_date ? new Date(b.preferred_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'Any day'}
                    {b.preferred_slot ? ` · ${b.preferred_slot}` : ''}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${b.status === 'DONE' ? 'bg-[#E3EEE6] text-[#4F7D5B]' : b.status === 'CANCELLED' ? 'bg-[#FBE9E9] text-[#C94C4C]' : 'bg-[#FBE8DB] text-[#D97732]'}`}>
                    {STATUS_LABEL[b.status] || b.status}
                  </span>
                </div>
                <p className="text-[#766B60] mt-1 line-clamp-2">{b.notes}</p>
                {b.admin_notes && <p className="text-[#6B5744] mt-1">Seller: {b.admin_notes}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
