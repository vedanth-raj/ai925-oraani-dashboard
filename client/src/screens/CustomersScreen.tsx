import React, { useEffect, useState, useRef } from 'react';
import { 
  Plus, Search, ChevronRight, MapPin, Building2, Phone, 
  Edit3, Trash2, X, AlertTriangle, CheckCircle, Lock, User
} from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { PresenceDot } from '../components/CustomerPortalCard';

interface CustomersScreenProps {
  onNewCustomer: () => void;
  onSelectCustomer: (customerId: string) => void;
  onEditCustomer?: (customerId: string) => void;
}

export const CustomersScreen: React.FC<CustomersScreenProps> = ({
  onNewCustomer,
  onSelectCustomer,
  onEditCustomer,
}) => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [brandFilter, setBrandFilter] = useState<'ALL' | 'AI925' | 'ORAANI'>('ALL');

  // Long press & Action states
  const [selectedCustomerForAction, setSelectedCustomerForAction] = useState<any | null>(null);
  const [customerToDelete, setCustomerToDelete] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Long-press timer references
  const longPressTimerRef = useRef<any>(null);
  const isLongPressTriggeredRef = useRef(false);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const params: any = {};
      if (search) params.search = search;
      if (brandFilter !== 'ALL') params.brand = brandFilter;
      const res = await api.getCustomers(Object.keys(params).length ? params : undefined);
      setCustomers(res.customers || []);
    } catch (err) {
      console.error('Failed to fetch customers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCustomers();
    }, 200);
    return () => clearTimeout(timer);
  }, [search, brandFilter]);

  // Keep the green "using the app" dots current while the System Administrator has the list open
  useEffect(() => {
    if (!isAdmin) return;
    const timer = setInterval(() => {
      const params: any = {};
      if (search) params.search = search;
      if (brandFilter !== 'ALL') params.brand = brandFilter;
      api.getCustomers(Object.keys(params).length ? params : undefined).then(res => setCustomers(res.customers || [])).catch(() => {});
    }, 60000);
    return () => clearInterval(timer);
  }, [isAdmin, search, brandFilter]);

  // Touch & Mouse Long Press Handlers (500ms duration)
  const handleTouchStart = (c: any, e: React.TouchEvent) => {
    isLongPressTriggeredRef.current = false;
    const t = e.touches[0];
    touchStartPosRef.current = { x: t.clientX, y: t.clientY };
    longPressTimerRef.current = setTimeout(() => {
      isLongPressTriggeredRef.current = true;
      if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(50);
      }
      setSelectedCustomerForAction(c);
    }, 500);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartPosRef.current) return;
    const t = e.touches[0];
    const dx = Math.abs(t.clientX - touchStartPosRef.current.x);
    const dy = Math.abs(t.clientY - touchStartPosRef.current.y);
    if (dx > 10 || dy > 10) {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (isLongPressTriggeredRef.current) {
      e.preventDefault();
    }
  };

  const handleMouseDown = (c: any) => {
    isLongPressTriggeredRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      isLongPressTriggeredRef.current = true;
      setSelectedCustomerForAction(c);
    }, 500);
  };

  const handleMouseUp = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleCardClick = (cId: string) => {
    if (isLongPressTriggeredRef.current) {
      isLongPressTriggeredRef.current = false;
      return;
    }
    onSelectCustomer(cId);
  };

  // Delete Customer Handler (Admin Only)
  const handleDeleteConfirm = async () => {
    if (!customerToDelete) return;
    setDeleting(true);
    try {
      const res = await api.deleteCustomer(customerToDelete.id);
      setActionNotice(res.message || `Customer "${customerToDelete.poc_name}" deleted.`);
      setTimeout(() => setActionNotice(null), 4000);
      setCustomerToDelete(null);
      setSelectedCustomerForAction(null);
      fetchCustomers();
    } catch (err: any) {
      alert(err.message || 'Failed to delete customer');
    } finally {
      setDeleting(false);
    }
  };

  const getInitials = (name: string) => {
    if (!name) return 'C';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <div className="pb-24 pt-4 px-4 max-w-lg mx-auto">
      {/* Toast Notice */}
      {actionNotice && (
        <div className="mb-4 bg-[#E3EEE6] border border-[#4F7D5B]/30 text-[#4F7D5B] p-3 rounded-2xl text-xs font-semibold flex items-center gap-2 shadow-xs animate-in fade-in">
          <CheckCircle size={16} className="shrink-0" />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-[#2F2923]">Customers</h1>
          <p className="text-xs text-[#766B60]">
            {customers.length} {customers.length === 1 ? 'account' : 'accounts'} registered · Long-press to manage
          </p>
        </div>
        <button
          onClick={onNewCustomer}
          className="w-10 h-10 rounded-full bg-[#6B5744] text-[#FFFCF7] flex items-center justify-center shadow-md hover:bg-[#584534] active:scale-95 transition-all"
          title="Add Customer"
        >
          <Plus size={22} strokeWidth={2.5} />
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative mb-4">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#766B60]" size={18} />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by POC, company, city..."
          className="w-full bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl pl-10 pr-4 py-2.5 text-sm text-[#2F2923] placeholder-[#766B60]/60 focus:outline-none focus:ring-2 focus:ring-[#6B5744]/30 focus:border-[#6B5744] transition-all"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#766B60] hover:text-[#2F2923]"
          >
            Clear
          </button>
        )}
      </div>

      {/* Brand Filter Tabs (Requirement 2) */}
      <div className="flex gap-2 mb-4">
        {[
          { key: 'ALL', label: 'All Brands' },
          { key: 'AI925', label: 'AI 925' },
          { key: 'ORAANI', label: 'Oraani' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setBrandFilter(t.key as any)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
              brandFilter === t.key
                ? 'bg-[#6B5744] text-[#FFFCF7] border-[#6B5744] shadow-xs'
                : 'bg-[#FFFCF7] text-[#766B60] border-[#D2BFA7] hover:border-[#6B5744]/60'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Customers List */}
      {loading && customers.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-3 border-[#6B5744] border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : customers.length === 0 ? (
        <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl p-8 text-center mt-4">
          <Building2 className="mx-auto text-[#B49A7A] mb-2 opacity-50" size={36} />
          <p className="text-sm font-semibold text-[#2F2923]">No customers found</p>
          <p className="text-xs text-[#766B60] mt-1">
            {search ? 'Try modifying your search term' : 'Add your first customer to get started'}
          </p>
          {!search && (
            <button
              onClick={onNewCustomer}
              className="mt-4 px-4 py-2 rounded-lg bg-[#6B5744] text-[#FFFCF7] text-xs font-semibold hover:bg-[#584534]"
            >
              Add New Customer
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {customers.map((c) => {
            const initials = getInitials(c.poc_name);
            const ordersCount = Number(c.orders_count || 0);
            const totalGrams = Number(c.total_grams_ordered || 0);

            return (
              <div
                key={c.id}
                onTouchStart={(e) => handleTouchStart(c, e)}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onMouseDown={() => handleMouseDown(c)}
                onMouseUp={handleMouseUp}
                onContextMenu={(e) => e.preventDefault()}
                onClick={() => handleCardClick(c.id)}
                className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl p-3.5 flex items-center justify-between shadow-xs hover:border-[#B49A7A] active:bg-[#F5F0E8] transition-all cursor-pointer select-none"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {/* Initials Avatar */}
                  <div className="relative w-12 h-12 rounded-full bg-[#E8DCCB] text-[#6B5744] font-bold text-sm flex items-center justify-center shrink-0 border border-[#D2BFA7]">
                    {initials}
                    {/* System Administrator: green dot while this customer is using the app */}
                    {isAdmin && <PresenceDot online={Boolean(c.portal_online)} className="absolute bottom-0 right-0" />}
                  </div>

                  {/* Customer Info */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h3 className="font-bold text-[#2F2923] text-sm leading-snug truncate">
                        {c.poc_name}
                      </h3>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider ${
                        c.brand === 'ORAANI' ? 'bg-[#E8DCCB] text-[#6B5744] border border-[#B49A7A]' : 'bg-[#2F2923] text-[#F5F0E8]'
                      }`}>
                        {c.brand === 'ORAANI' ? 'Oraani' : 'AI 925'}
                      </span>
                      {c.rep_edit_count >= 1 && (
                        <span className="text-[10px] px-1.5 py-0.2 bg-[#F5F0E8] text-[#766B60] border border-[#D2BFA7]/60 rounded-md font-semibold">
                          Modified
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#766B60] font-medium truncate mt-0.5">
                      {c.company_name}
                    </p>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-[#766B60]">
                      {c.city && (
                        <span className="flex items-center gap-0.5">
                          <MapPin size={11} className="shrink-0 text-[#B49A7A]" />
                          <span>{c.city}</span>
                          {c.zone && <span className="opacity-75">· {c.zone}</span>}
                        </span>
                      )}
                      {c.phone && (
                        <span className="flex items-center gap-0.5 opacity-80">
                          <Phone size={10} className="shrink-0 text-[#B49A7A]" />
                          <span>{c.phone}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Metrics & Arrow */}
                <div className="flex items-center gap-2 shrink-0 pl-2">
                  <div className="text-right">
                    <p className="text-xs font-semibold text-[#6B5744]">
                      {totalGrams.toFixed(1)}g
                    </p>
                    <p className="text-[11px] text-[#766B60]">
                      {ordersCount} {ordersCount === 1 ? 'order' : 'orders'}
                    </p>
                  </div>
                  <ChevronRight size={18} className="text-[#B49A7A]" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Role-Based Action Sheet on Long Press */}
      {selectedCustomerForAction && (
        <div 
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end justify-center p-3 sm:items-center animate-in fade-in"
          onClick={() => setSelectedCustomerForAction(null)}
        >
          <div 
            className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-3xl p-5 max-w-sm w-full shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[#D2BFA7]/50 pb-3">
              <div className="min-w-0 pr-2">
                <p className="text-xs font-semibold text-[#6B5744] uppercase tracking-wider">
                  Customer Options
                </p>
                <h3 className="text-base font-bold text-[#2F2923] truncate">
                  {selectedCustomerForAction.poc_name}
                </h3>
                <p className="text-xs text-[#766B60] truncate">
                  {selectedCustomerForAction.company_name} {selectedCustomerForAction.city ? `· ${selectedCustomerForAction.city}` : ''}
                </p>
              </div>
              <button
                onClick={() => setSelectedCustomerForAction(null)}
                className="w-8 h-8 rounded-full bg-[#F5F0E8] flex items-center justify-center text-[#766B60] hover:text-[#2F2923]"
              >
                <X size={18} />
              </button>
            </div>

            {/* Actions List */}
            <div className="space-y-2.5">
              {/* Modify Customer Option */}
              {(() => {
                const repModificationsUsed = (selectedCustomerForAction.rep_edit_count || 0) >= 1;
                const isCreatorRep = selectedCustomerForAction.created_by_id === user?.id;
                const isRepBlocked = !isAdmin && (!isCreatorRep && selectedCustomerForAction.created_by_id);
                const isRepLocked = !isAdmin && repModificationsUsed;

                if (isRepLocked) {
                  return (
                    <div className="w-full py-3 px-4 bg-[#F5F0E8] border border-[#D2BFA7] text-[#766B60] rounded-2xl flex flex-col items-center justify-center gap-1 cursor-not-allowed">
                      <div className="flex items-center gap-2 font-semibold text-sm">
                        <Lock size={16} />
                        <span>Modify Customer Details</span>
                      </div>
                      <span className="text-[11px] text-[#C94C4C] font-medium">
                        Modification locked (Already modified once by sales representative)
                      </span>
                    </div>
                  );
                }

                if (isRepBlocked) {
                  return (
                    <div className="w-full py-3 px-4 bg-[#F5F0E8] border border-[#D2BFA7] text-[#766B60] rounded-2xl flex flex-col items-center justify-center gap-1 cursor-not-allowed">
                      <div className="flex items-center gap-2 font-semibold text-sm">
                        <Lock size={16} />
                        <span>Modify Customer Details</span>
                      </div>
                      <span className="text-[11px] text-[#C94C4C] font-medium">
                        Only available for customers you added
                      </span>
                    </div>
                  );
                }

                return (
                  <button
                    onClick={() => {
                      const cId = selectedCustomerForAction.id;
                      setSelectedCustomerForAction(null);
                      if (onEditCustomer) {
                        onEditCustomer(cId);
                      }
                    }}
                    className="w-full py-3 px-4 bg-[#6B5744] hover:bg-[#584534] active:scale-[0.99] text-[#FFFCF7] font-semibold rounded-2xl flex flex-col items-center justify-center gap-0.5 transition-all shadow-xs"
                  >
                    <div className="flex items-center gap-2 text-sm">
                      <Edit3 size={17} />
                      <span>Modify Customer Details</span>
                    </div>
                    {!isAdmin && (
                      <span className="text-[10px] text-[#D2BFA7] font-normal">
                        (1 modification allowed after adding)
                      </span>
                    )}
                  </button>
                );
              })()}

              {/* Delete Customer: ONLY AVAILABLE TO ADMIN */}
              {isAdmin && (
                <button
                  onClick={() => {
                    setCustomerToDelete(selectedCustomerForAction);
                    setSelectedCustomerForAction(null);
                  }}
                  className="w-full py-3 px-4 bg-[#FBE9E9] hover:bg-[#FBE9E9]/80 border border-[#C94C4C]/30 active:scale-[0.99] text-[#C94C4C] font-semibold rounded-2xl flex items-center justify-center gap-2.5 transition-all"
                >
                  <Trash2 size={18} />
                  <span>Delete Customer</span>
                </button>
              )}

              {/* View Customer Details */}
              <button
                onClick={() => {
                  const cId = selectedCustomerForAction.id;
                  setSelectedCustomerForAction(null);
                  onSelectCustomer(cId);
                }}
                className="w-full py-2.5 px-4 bg-[#FFFCF7] border border-[#D2BFA7] hover:bg-[#E8DCCB]/30 text-[#2F2923] text-sm font-semibold rounded-2xl flex items-center justify-center gap-2 transition-colors"
              >
                <User size={16} className="text-[#6B5744]" />
                <span>View Full Details & History</span>
              </button>
            </div>

            {/* Role indicator footer note */}
            <p className="text-[11px] text-center text-[#766B60] pt-1">
              {isAdmin
                ? 'Admin privileges active: modify anytime or delete customer'
                : 'Sales Representative interface: 1 customer modification allowed'}
            </p>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal (Admin Only) */}
      {customerToDelete && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => !deleting && setCustomerToDelete(null)}
        >
          <div 
            className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-2xl bg-[#FBE9E9] text-[#C94C4C] flex items-center justify-center mx-auto">
              <AlertTriangle size={24} />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-lg font-bold text-[#2F2923]">
                Delete Customer Account?
              </h3>
              <p className="text-xs text-[#766B60] leading-relaxed">
                Are you sure you want to delete{' '}
                <span className="font-semibold text-[#2F2923]">{customerToDelete.poc_name}</span> ({customerToDelete.company_name})?
                Existing order ledgers will be safely preserved in history.
              </p>
            </div>

            <div className="space-y-2 pt-2">
              <button
                disabled={deleting}
                onClick={handleDeleteConfirm}
                className="w-full py-3 bg-[#C94C4C] hover:bg-[#B33F3F] active:scale-[0.99] disabled:opacity-50 text-white font-semibold rounded-2xl transition-all shadow-sm flex items-center justify-center gap-2"
              >
                {deleting ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <>
                    <Trash2 size={16} />
                    <span>Confirm Delete</span>
                  </>
                )}
              </button>
              <button
                disabled={deleting}
                onClick={() => setCustomerToDelete(null)}
                className="w-full py-2.5 bg-[#FFFCF7] border border-[#D2BFA7] text-[#2F2923] text-sm font-semibold rounded-2xl hover:bg-[#E8DCCB]/30 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
