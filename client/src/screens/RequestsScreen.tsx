import React, { useEffect, useState } from 'react';
import {
  ArrowLeft, Inbox, UserPlus, ClipboardList, Phone, Mail, MapPin, Check, X, MessageCircle,
  Edit3, CheckCircle2, Clock, IdCard, ChevronRight, Loader2, UserCog, PhoneCall, Trash2
} from 'lucide-react';
import { ProfileChangesTab, CallBookingsTab } from './RequestsExtraTabs';
import { api } from '../api';
import { useAuth } from '../auth';
import { formatINR } from '../pricing';
import { PaymentStatusBadge } from '../components/DummyPaymentModal';
import { AccessToggles, BrandAccessToggle, PresenceDot, LastLocation, lastSeenLabel } from '../components/CustomerPortalCard';
import type { CustomerAccess } from '../api';

export type RequestsTab = 'stock' | 'customers' | 'on_order' | 'changes' | 'calls';

interface RequestsScreenProps {
  onBack: () => void;
  onSelectOrder: (orderId: string) => void;
  initialTab?: RequestsTab;
}

function whatsappNumber(raw: string): string {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.length === 10 ? '91' + digits : digits;
}

// Same wa.me hand-off used for order summaries
export function sendApprovalWhatsApp(account: any) {
  const brand = String(account.brand || 'AI925').toUpperCase();
  const isBoth = brand === 'BOTH';
  const isOraani = brand === 'ORAANI';
  const brandName = isBoth ? 'AI 925 & Oraani' : isOraani ? 'Oraani' : 'AI925';
  const companyName = isBoth ? 'Aryan International & Oraani Silver' : isOraani ? 'Oraani Silver' : 'Aryan International';
  const portalUrl = isBoth
    ? `https://app.ai925.in and https://app.oraani.in`
    : isOraani ? `${window.location.origin}/oraani` : `${window.location.origin}/ai925`;

  const msg = [
    `*Dear ${account.full_name},*`,
    ``,
    `Your ${brandName} customer account has been verified and approved. ✅`,
    ``,
    `You can now sign in with your mobile number or email to browse *Ready Stock* and place *On Order* purchases:`,
    portalUrl,
    ``,
    `Thank you for choosing ${brandName}!`,
    ``,
    `Regards,`,
    `${companyName}`
  ].join('\n');
  window.open(`https://wa.me/${whatsappNumber(account.phone)}?text=${encodeURIComponent(msg)}`, '_blank');
}

function fmtDate(iso?: string | null) {
  return iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
}

const statusStyle: Record<string, string> = {
  OPEN: 'bg-[#FBE9E9] text-[#C94C4C]',
  IN_PROGRESS: 'bg-[#FBE8DB] text-[#D97732]',
  CLOSED: 'bg-[#E3EEE6] text-[#4F7D5B]',
  PENDING: 'bg-[#FBE8DB] text-[#D97732]',
  APPROVED: 'bg-[#E3EEE6] text-[#4F7D5B]',
  REJECTED: 'bg-[#FBE9E9] text-[#C94C4C]'
};

const Pill: React.FC<{ status: string }> = ({ status }) => (
  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusStyle[status] || 'bg-[#F5F0E8] text-[#766B60]'}`}>
    {status.replace('_', ' ')}
  </span>
);

const ContactLine: React.FC<{ phone?: string; email?: string; address?: string }> = ({ phone, email, address }) => (
  <div className="space-y-0.5 text-[11px] text-[#766B60]">
    {phone && (
      <a href={`tel:${phone}`} className="flex items-center gap-1.5 text-[#6B5744] font-medium"><Phone size={11} />{phone}</a>
    )}
    {email && (
      <a href={`mailto:${email}`} className="flex items-center gap-1.5 text-[#6B5744] font-medium break-all"><Mail size={11} />{email}</a>
    )}
    {address && <p className="flex items-start gap-1.5"><MapPin size={11} className="mt-0.5 shrink-0" />{address}</p>}
  </div>
);

export const RequestsScreen: React.FC<RequestsScreenProps> = ({ onBack, onSelectOrder, initialTab = 'stock' }) => {
  const { isAdmin, isBusinessAdmin } = useAuth();
  const [tab, setTab] = useState<RequestsTab>(initialTab);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [stockFilter, setStockFilter] = useState<'Active' | 'CLOSED' | 'All'>('Active');
  const [stockRequests, setStockRequests] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);

  const [accountFilter, setAccountFilter] = useState<'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const [accounts, setAccounts] = useState<any[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<any | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [previewCard, setPreviewCard] = useState<string | null>(null);
  const [justApproved, setJustApproved] = useState<any | null>(null);
  // Sections chosen before approving (both open unless an administrator switches one off)
  const [pendingAccess, setPendingAccess] = useState<Record<string, CustomerAccess>>({});

  const [onOrders, setOnOrders] = useState<any[]>([]);

  const myApprovalField = isAdmin ? 'sys_approved_at' : 'biz_approved_at';
  const myRoleLabel = isAdmin ? 'System' : 'Business';

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [sum] = await Promise.all([
        api.getRequestsSummary(),
        tab === 'stock'
          ? api.getStockRequests(stockFilter === 'Active' ? undefined : stockFilter).then(r => setStockRequests(r.requests))
          : tab === 'customers'
            ? api.getCustomerAccounts(accountFilter).then(r => setAccounts(r.accounts))
            : tab === 'on_order'
              ? api.getOnOrderRequests('All').then(r => setOnOrders(r.orders))
              : Promise.resolve()
      ]);
      setSummary(sum);
    } catch (err: any) {
      setError(err.message || 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [tab, stockFilter, accountFilter]);

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 4000);
  };

  const approve = async (account: any) => {
    setBusyId(account.id);
    try {
      const initialAccess = {
        can_view_ready: true,
        can_view_order: true,
        brand: account.brand || 'AI925'
      };
      const res = await api.approveCustomerAccount(account.id, pendingAccess[account.id] || initialAccess);
      flash(res.message);
      // Final approval: prompt to notify on WhatsApp (opened from a tap so popup blockers allow it)
      if (res.fully_approved) setJustApproved(res.account);
      await load();
    } catch (err: any) {
      alert(err.message || 'Approval failed');
    } finally {
      setBusyId(null);
    }
  };

  const reject = async () => {
    if (!rejecting) return;
    setBusyId(rejecting.id);
    try {
      await api.rejectCustomerAccount(rejecting.id, rejectReason);
      setRejecting(null);
      setRejectReason('');
      flash('Customer registration rejected');
      await load();
    } catch (err: any) {
      alert(err.message || 'Failed to reject');
    } finally {
      setBusyId(null);
    }
  };

  const saveAccess = async (account: any, access: CustomerAccess) => {
    setBusyId(account.id);
    try {
      const res = await api.setCustomerAccess(account.id, access);
      setAccounts(prev => prev.map(a => (a.id === account.id ? res.account : a)));
      flash(res.message);
    } catch (err: any) {
      alert(err.message || 'Could not save');
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteAccount = async (account: any) => {
    if (!confirm(`Are you sure you want to completely delete customer "${account.full_name}" (${account.phone})?\n\nThis will wipe all customer history, approval records, orders, and portal accounts, allowing them to sign up fresh as a new customer.`)) return;
    setBusyId(account.id);
    try {
      await api.deleteCustomerAccount(account.id);
      flash(`Customer "${account.full_name}" deleted completely.`);
      await load();
    } catch (err: any) {
      alert(err.message || 'Failed to delete customer account');
    } finally {
      setBusyId(null);
    }
  };

  const saveRequest = async (id: string, data: any, msg: string) => {
    setBusyId(id);
    try {
      await api.updateStockRequest(id, data);
      setEditing(null);
      flash(msg);
      await load();
    } catch (err: any) {
      alert(err.message || 'Failed to update request');
    } finally {
      setBusyId(null);
    }
  };

  const tabs: { key: RequestsTab; label: string; icon: React.ElementType; count: number }[] = [
    { key: 'stock', label: 'Customer Requests', icon: Inbox, count: summary?.open_stock_requests || 0 },
    { key: 'customers', label: 'New Customers', icon: UserPlus, count: summary?.pending_customers || 0 },
    { key: 'on_order', label: 'On-Order', icon: ClipboardList, count: summary?.on_order_open || 0 },
    { key: 'changes', label: 'Profile Changes', icon: UserCog, count: summary?.profile_changes || 0 },
    { key: 'calls', label: 'Call Bookings', icon: PhoneCall, count: summary?.call_bookings || 0 }
  ];

  return (
    <div className="pb-24 pt-4 px-4 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={onBack}
          className="w-10 h-10 rounded-full bg-[#FFFCF7] border border-[#D2BFA7] flex items-center justify-center text-[#2F2923] hover:bg-[#E8DCCB]"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-[#2F2923] leading-tight">Requests</h1>
          <p className="text-xs text-[#766B60]">{isAdmin ? 'System Administrator' : isBusinessAdmin ? 'Business Administrator' : ''} inbox</p>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-1 bg-[#E8DCCB]/60 p-1 rounded-2xl mb-4">
        {tabs.map(t => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`relative flex flex-col items-center gap-0.5 py-2 px-0.5 rounded-xl text-[10px] font-bold transition-all ${
                active ? 'bg-[#FFFCF7] text-[#2F2923] shadow-xs' : 'text-[#766B60]'
              }`}
            >
              <Icon size={16} />
              <span className="leading-tight text-center">{t.label}</span>
              {t.count > 0 && (
                <span className="absolute top-1 right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#C94C4C] text-white text-[10px] flex items-center justify-center">
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {notice && (
        <div className="mb-3 p-3 bg-[#E3EEE6] border border-[#4F7D5B]/30 rounded-xl text-xs font-semibold text-[#4F7D5B] flex items-center gap-2">
          <CheckCircle2 size={16} /> {notice}
        </div>
      )}
      {error && <div className="mb-3 p-3 bg-[#FBE9E9] rounded-xl text-xs text-[#C94C4C]">{error}</div>}

      {justApproved && (
        <div className="mb-3 p-3 bg-[#FFFCF7] border-2 border-[#25D366]/50 rounded-2xl shadow-card">
          <p className="text-sm font-bold text-[#2F2923]">{justApproved.full_name} is approved ✅</p>
          <p className="text-[11px] text-[#766B60] mb-2">The portal is now open for this customer. Let them know:</p>
          <div className="flex gap-2">
            <button onClick={() => setJustApproved(null)} className="px-3 py-2 bg-[#F5F0E8] border border-[#D2BFA7] rounded-xl text-xs font-semibold">Later</button>
            <button
              onClick={() => {
                sendApprovalWhatsApp(justApproved);
                api.markCustomerNotified(justApproved.id).catch(() => {});
                setJustApproved(null);
              }}
              className="flex-1 py-2 bg-[#25D366] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5"
            >
              <MessageCircle size={14} /> Notify on WhatsApp
            </button>
          </div>
        </div>
      )}

      {/* ---------------- CUSTOMER (SELLER) REQUESTS ---------------- */}
      {tab === 'stock' && (
        <>
          <div className="flex gap-2 mb-3">
            {(['Active', 'CLOSED', 'All'] as const).map(f => (
              <button
                key={f}
                onClick={() => setStockFilter(f)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold ${
                  stockFilter === f ? 'bg-[#6B5744] text-white' : 'bg-[#FFFCF7] border border-[#D2BFA7] text-[#2F2923]'
                }`}
              >
                {f === 'Active' ? 'Open' : f === 'CLOSED' ? 'Closed' : 'All'}
              </button>
            ))}
          </div>
          {loading && stockRequests.length === 0 ? (
            <div className="py-12 flex justify-center"><Loader2 className="animate-spin text-[#6B5744]" /></div>
          ) : stockRequests.length === 0 ? (
            <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-6 text-center text-xs text-[#766B60]">No customer requests here.</div>
          ) : (
            <div className="space-y-3">
              {stockRequests.map(r => (
                <div key={r.id} className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-4 shadow-card">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="font-bold text-sm text-[#2F2923]">{r.product_name}</p>
                      <p className="text-[11px] text-[#766B60]">
                        {r.product_sku} · {r.size_inches ? `${r.size_inches} in` : 'any size'} · <strong className="text-[#2F2923]">{r.quantity} pcs</strong>
                      </p>
                    </div>
                    <Pill status={r.status} />
                  </div>
                  {r.notes && <p className="text-xs text-[#2F2923] bg-[#F5F0E8] rounded-lg px-2.5 py-1.5 mb-2">"{r.notes}"</p>}
                  <div className="border-t border-[#E8DCCB] pt-2">
                    <p className="text-xs font-bold text-[#2F2923]">{r.customer_name}{r.company_name ? ` · ${r.company_name}` : ''}</p>
                    <ContactLine phone={r.customer_phone} email={r.customer_email} address={r.customer_address} />
                    <p className="text-[10px] text-[#766B60] mt-1">
                      Requested {fmtDate(r.created_at)}{r.handled_by_name ? ` · last updated by ${r.handled_by_name}` : ''}
                    </p>
                    {r.admin_notes && <p className="text-[11px] text-[#6B5744] mt-1">Seller note: {r.admin_notes}</p>}
                  </div>

                  {editing?.id === r.id ? (
                    <div className="mt-3 pt-3 border-t border-[#E8DCCB] space-y-2">
                      <div className="grid grid-cols-3 gap-2">
                        <label className="text-[10px] font-bold text-[#766B60] uppercase">Size (in)
                          <input type="number" value={editing.size_inches} onChange={e => setEditing({ ...editing, size_inches: e.target.value })}
                            className="mt-0.5 w-full px-2 py-1.5 bg-[#F5F0E8] border border-[#D2BFA7] rounded-lg text-xs text-[#2F2923]" />
                        </label>
                        <label className="text-[10px] font-bold text-[#766B60] uppercase">Qty
                          <input type="number" min="1" value={editing.quantity} onChange={e => setEditing({ ...editing, quantity: e.target.value })}
                            className="mt-0.5 w-full px-2 py-1.5 bg-[#F5F0E8] border border-[#D2BFA7] rounded-lg text-xs text-[#2F2923]" />
                        </label>
                        <label className="text-[10px] font-bold text-[#766B60] uppercase">Status
                          <select value={editing.status} onChange={e => setEditing({ ...editing, status: e.target.value })}
                            className="mt-0.5 w-full px-2 py-1.5 bg-[#F5F0E8] border border-[#D2BFA7] rounded-lg text-xs text-[#2F2923]">
                            <option value="OPEN">Open</option>
                            <option value="IN_PROGRESS">In progress</option>
                            <option value="CLOSED">Closed</option>
                          </select>
                        </label>
                      </div>
                      <textarea rows={2} value={editing.admin_notes} placeholder="Note for this request (e.g. restock date)"
                        onChange={e => setEditing({ ...editing, admin_notes: e.target.value })}
                        className="w-full px-2.5 py-1.5 bg-[#F5F0E8] border border-[#D2BFA7] rounded-lg text-xs text-[#2F2923]" />
                      <div className="flex gap-2">
                        <button onClick={() => setEditing(null)} className="flex-1 py-2 bg-[#F5F0E8] border border-[#D2BFA7] rounded-xl text-xs font-semibold">Cancel</button>
                        <button disabled={busyId === r.id}
                          onClick={() => saveRequest(r.id, editing, 'Request updated')}
                          className="flex-1 py-2 bg-[#6B5744] text-white rounded-xl text-xs font-semibold">Save</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => setEditing({ id: r.id, size_inches: r.size_inches ?? '', quantity: r.quantity, status: r.status, admin_notes: r.admin_notes || '' })}
                        className="flex-1 py-2 bg-[#F5F0E8] border border-[#D2BFA7] rounded-xl text-xs font-semibold text-[#2F2923] flex items-center justify-center gap-1.5"
                      >
                        <Edit3 size={13} /> Modify
                      </button>
                      <a
                        href={`https://wa.me/${whatsappNumber(r.customer_phone)}?text=${encodeURIComponent(`Hello ${r.customer_name}, regarding your request for ${r.product_name}${r.size_inches ? ` (${r.size_inches} in)` : ''} x ${r.quantity} pcs: `)}`}
                        target="_blank" rel="noreferrer"
                        className="py-2 px-3 bg-[#25D366]/15 border border-[#25D366]/40 text-[#128C7E] rounded-xl text-xs font-semibold flex items-center gap-1"
                      >
                        <MessageCircle size={13} />
                      </a>
                      {r.status !== 'CLOSED' ? (
                        <button disabled={busyId === r.id}
                          onClick={() => saveRequest(r.id, { status: 'CLOSED' }, 'Request closed')}
                          className="flex-1 py-2 bg-[#4F7D5B] text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5">
                          <Check size={13} /> Close
                        </button>
                      ) : (
                        <button disabled={busyId === r.id}
                          onClick={() => saveRequest(r.id, { status: 'OPEN' }, 'Request reopened')}
                          className="flex-1 py-2 bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl text-xs font-semibold text-[#2F2923]">
                          Reopen
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ---------------- NEW CUSTOMER VERIFICATION ---------------- */}
      {tab === 'customers' && (
        <>
          <div className="flex gap-2 mb-3">
            {(['PENDING', 'APPROVED', 'REJECTED'] as const).map(f => (
              <button
                key={f}
                onClick={() => setAccountFilter(f)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold ${
                  accountFilter === f ? 'bg-[#6B5744] text-white' : 'bg-[#FFFCF7] border border-[#D2BFA7] text-[#2F2923]'
                }`}
              >
                {f === 'PENDING' ? 'Under verification' : f === 'APPROVED' ? 'Approved' : 'Rejected'}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-[#766B60] mb-3">
            A customer can use the portal as soon as <strong>either</strong> the Business Administrator or the System Administrator approves.
          </p>
          {loading && accounts.length === 0 ? (
            <div className="py-12 flex justify-center"><Loader2 className="animate-spin text-[#6B5744]" /></div>
          ) : accounts.length === 0 ? (
            <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-6 text-center text-xs text-[#766B60]">No customers here.</div>
          ) : (
            <div className="space-y-3">
              {accounts.map(a => {
                const iApproved = Boolean(a[myApprovalField]);
                return (
                  <div key={a.id} className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-4 shadow-card">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div>
                        <p className="font-bold text-sm text-[#2F2923] flex items-center gap-1.5">
                          {a.full_name}
                          {isAdmin && <PresenceDot online={Boolean(a.online)} />}
                        </p>
                        {a.company_name && <p className="text-xs text-[#766B60] font-semibold">{a.company_name}</p>}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {a.brand === 'BOTH' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-[#E8F0FE] text-[#1E429F] border border-[#B4C6FC]">Both Brands</span>
                        ) : a.brand === 'ORAANI' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-[#FBF0EA] text-[#8C4A28] border border-[#E9C5B2]">Oraani</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-[#F5F0E8] text-[#6B5744] border border-[#D2BFA7]">AI 925</span>
                        )}
                        {a.account_type && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-[#F5F0E8] text-[#6B5744] border border-[#D2BFA7]">{a.account_type}</span>
                        )}
                        <Pill status={a.status} />
                      </div>
                    </div>
                    <ContactLine phone={a.phone} email={a.email} address={a.address} />
                    <p className="text-[10px] text-[#766B60] mt-1">Signed up {fmtDate(a.created_at)}{a.status === 'APPROVED' ? ` · ${lastSeenLabel(a.last_seen_at)}` : ''}</p>
                    {a.status === 'APPROVED' && <div className="mt-1"><LastLocation account={a} /></div>}

                    <div className="mt-2">
                      <p className="text-[10px] font-bold text-[#766B60] uppercase flex items-center gap-1 mb-1"><IdCard size={12} /> GST / ID Card</p>
                      {a.id_card_path ? (
                        <button onClick={() => setPreviewCard(a.id_card_path)} className="w-32 h-20 rounded-lg overflow-hidden border border-[#D2BFA7]">
                          <img src={a.id_card_path} alt={`${a.full_name} GST / ID card`} className="w-full h-full object-cover" />
                        </button>
                      ) : (
                        <p className="text-[11px] text-[#766B60] italic">Not uploaded (optional)</p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 mt-3">
                      {[
                        { label: 'Business Admin', at: a.biz_approved_at, by: a.biz_approved_by_name },
                        { label: 'System Admin', at: a.sys_approved_at, by: a.sys_approved_by_name }
                      ].map(step => (
                        <div key={step.label} className={`rounded-xl px-2.5 py-2 text-[11px] border ${step.at ? 'bg-[#E3EEE6] border-[#4F7D5B]/30' : 'bg-[#F5F0E8] border-[#E8DCCB]'}`}>
                          <p className={`font-bold flex items-center gap-1 ${step.at ? 'text-[#4F7D5B]' : 'text-[#766B60]'}`}>
                            {step.at ? <CheckCircle2 size={12} /> : <Clock size={12} />} {step.label}
                          </p>
                          <p className="text-[10px] text-[#766B60]">{step.at ? `Approved by ${step.by || '—'}` : a.status === 'APPROVED' ? 'Not needed' : 'Pending'}</p>
                        </div>
                      ))}
                    </div>

                    {a.status !== 'REJECTED' && (
                      <div className="mt-3 space-y-2">
                        {a.status === 'APPROVED' ? (
                          <>
                            <AccessToggles ready={a.can_view_ready} order={a.can_view_order} disabled={busyId === a.id} onChange={next => saveAccess(a, next)} />
                            <BrandAccessToggle brand={a.brand || 'AI925'} disabled={busyId === a.id} onChange={b => saveAccess(a, { brand: b })} />
                          </>
                        ) : (
                          <>
                            <AccessToggles
                              ready={pendingAccess[a.id]?.can_view_ready ?? (a.can_view_ready !== 0)}
                              order={pendingAccess[a.id]?.can_view_order ?? (a.can_view_order !== 0)}
                              disabled={busyId === a.id}
                              onChange={next => setPendingAccess(prev => ({ ...prev, [a.id]: { ...(prev[a.id] || { can_view_ready: a.can_view_ready !== 0, can_view_order: a.can_view_order !== 0, brand: a.brand || 'AI925' }), ...next } }))}
                            />
                            <BrandAccessToggle
                              brand={pendingAccess[a.id]?.brand || a.brand || 'AI925'}
                              disabled={busyId === a.id}
                              onChange={b => setPendingAccess(prev => ({ ...prev, [a.id]: { ...(prev[a.id] || { can_view_ready: a.can_view_ready !== 0, can_view_order: a.can_view_order !== 0 }), brand: b } }))}
                            />
                          </>
                        )}
                      </div>
                    )}

                    {a.status === 'REJECTED' && a.rejected_reason && (
                      <p className="text-[11px] text-[#C94C4C] mt-2">Reason: {a.rejected_reason}</p>
                    )}

                    {a.status === 'APPROVED' ? (
                      <div className="space-y-2 mt-3">
                        <button
                          onClick={async () => {
                            sendApprovalWhatsApp(a);
                            await api.markCustomerNotified(a.id).catch(() => {});
                            load();
                          }}
                          className="w-full py-2.5 bg-[#25D366] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs"
                        >
                          <MessageCircle size={14} /> {a.notified_at ? `Notified ${fmtDate(a.notified_at)} · Send again` : 'Notify customer on WhatsApp'}
                        </button>
                        {isAdmin && (
                          <button
                            disabled={busyId === a.id}
                            onClick={() => handleDeleteAccount(a)}
                            className="w-full py-2 bg-transparent text-[#A34343] hover:bg-[#FBE9E9] border border-[#A34343]/30 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                          >
                            <Trash2 size={13} /> Delete & Reset (wipe history, allow re-signup)
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2 mt-3">
                        <div className="flex gap-2">
                          <button
                            disabled={busyId === a.id}
                            onClick={() => setRejecting(a)}
                            className="flex-1 py-2.5 bg-[#FBE9E9] border border-[#C94C4C]/30 text-[#C94C4C] rounded-xl text-xs font-bold flex items-center justify-center gap-1"
                          >
                            <X size={14} /> Reject
                          </button>
                          <button
                            disabled={busyId === a.id || (iApproved && a.status === 'PENDING')}
                            onClick={() => approve(a)}
                            className="flex-[2] py-2.5 bg-[#4F7D5B] disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1"
                          >
                            {busyId === a.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                            {iApproved && a.status === 'PENDING' ? `${myRoleLabel} approval done` : `Approve as ${myRoleLabel} Admin`}
                          </button>
                        </div>
                        {isAdmin && (
                          <button
                            disabled={busyId === a.id}
                            onClick={() => handleDeleteAccount(a)}
                            className="w-full py-2 bg-transparent text-[#A34343] hover:bg-[#FBE9E9] border border-[#A34343]/30 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                          >
                            <Trash2 size={13} /> Delete & Reset (wipe history, allow re-signup)
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ---------------- ON-ORDER PURCHASE REQUESTS ---------------- */}
      {tab === 'on_order' && (
        <>
          <p className="text-[11px] text-[#766B60] mb-3">On Order Purchase requests placed by customers from the portal. Open one to plan production and record deliveries.</p>
          {loading && onOrders.length === 0 ? (
            <div className="py-12 flex justify-center"><Loader2 className="animate-spin text-[#6B5744]" /></div>
          ) : onOrders.length === 0 ? (
            <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-6 text-center text-xs text-[#766B60]">No on-order requests yet.</div>
          ) : (
            <div className="space-y-3">
              {onOrders.map(o => (
                <button key={o.id} onClick={() => onSelectOrder(o.id)}
                  className="w-full text-left bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-4 shadow-card hover:border-[#6B5744]">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-base text-[#2F2923]">{o.order_number}</span>
                    <div className="flex items-center gap-1.5">
                      <PaymentStatusBadge status={o.payment_status} small />
                      <Pill status={o.status} />
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-[#2F2923]">{o.company_name}</p>
                  <p className="text-[11px] text-[#766B60]">{o.poc_name} · {o.customer_phone}</p>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#E8DCCB] text-xs">
                    <span className="text-[#766B60]">{o.total_pieces} pcs · {Number(o.expected_weight).toFixed(2)} g · {fmtDate(o.created_at)}</span>
                    <span className="font-bold text-[#2F2923] flex items-center gap-1">{formatINR(o.total_amount, 0)} <ChevronRight size={14} /></span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* ---------------- PROFILE / PASSWORD CHANGES ---------------- */}
      {tab === 'changes' && <ProfileChangesTab isSystemAdmin={isAdmin} onChanged={(m) => { flash(m); api.getRequestsSummary().then(setSummary).catch(() => {}); }} />}

      {/* ---------------- BOOK A CALL ---------------- */}
      {tab === 'calls' && <CallBookingsTab onChanged={(m) => { flash(m); api.getRequestsSummary().then(setSummary).catch(() => {}); }} />}

      {/* Reject dialog */}
      {rejecting && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setRejecting(null)}>
          <div className="w-full max-w-sm bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-5" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-base text-[#2F2923] mb-1">Reject {rejecting.full_name}?</h3>
            <p className="text-xs text-[#766B60] mb-3">The customer will see this reason when they sign in.</p>
            <textarea rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="e.g. GST number could not be verified"
              className="w-full px-3 py-2 bg-[#F5F0E8] border border-[#D2BFA7] rounded-xl text-sm text-[#2F2923] mb-3" />
            <div className="flex gap-2">
              <button onClick={() => setRejecting(null)} className="flex-1 py-2.5 bg-[#F5F0E8] border border-[#D2BFA7] rounded-xl text-xs font-semibold">Cancel</button>
              <button disabled={busyId === rejecting.id} onClick={reject} className="flex-1 py-2.5 bg-[#C94C4C] text-white rounded-xl text-xs font-semibold">Reject</button>
            </div>
          </div>
        </div>
      )}

      {previewCard && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setPreviewCard(null)}>
          <img src={previewCard} alt="GST / ID card" className="max-w-full max-h-[85vh] rounded-xl bg-[#FFFCF7]" />
        </div>
      )}
    </div>
  );
};
