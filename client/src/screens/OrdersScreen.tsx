import React, { useEffect, useState, useRef } from 'react';
import { Plus, Search, Edit3, Trash2, X, AlertTriangle, CheckCircle2, UserCheck } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { formatINR } from '../pricing';
import { PaymentStatusBadge } from '../components/DummyPaymentModal';

export const OrderTypeBadge: React.FC<{ type?: string | null }> = ({ type }) => {
  if (type !== 'READY_STOCK' && type !== 'ON_ORDER') return null;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
      type === 'ON_ORDER' ? 'bg-[#EFE8F7] text-[#6A4C93] border-[#6A4C93]/25' : 'bg-[#E3EEE6] text-[#4F7D5B] border-[#4F7D5B]/25'
    }`}>
      Portal · {type === 'ON_ORDER' ? 'On Order' : 'Ready Stock'}
    </span>
  );
};

interface OrdersScreenProps {
  onNewOrder: () => void;
  onSelectOrder: (orderId: string) => void;
  onEditOrder?: (orderId: string) => void;
  initialStatus?: 'All' | 'OPEN' | 'IN_PROGRESS' | 'CLOSED';
  initialZone?: string;
  initialState?: string;
  initialCity?: string;
}

export const OrdersScreen: React.FC<OrdersScreenProps> = ({ 
  onNewOrder, 
  onSelectOrder,
  onEditOrder,
  initialStatus = 'All',
  initialZone = 'All',
  initialState = 'All',
  initialCity = 'All'
}) => {
  const { isAdmin, isBusinessAdmin } = useAuth();
  const canFilterByRep = isAdmin || isBusinessAdmin;
  const [orders, setOrders] = useState<any[]>([]);
  const [reps, setReps] = useState<any[]>([]);
  const [repFilter, setRepFilter] = useState<string>('All');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'OPEN' | 'IN_PROGRESS' | 'CLOSED'>(initialStatus);
  const [brandFilter, setBrandFilter] = useState<'ALL' | 'AI925' | 'ORAANI'>('ALL');
  const [zoneFilter, setZoneFilter] = useState<string>(initialZone);
  const [stateFilter, setStateFilter] = useState<string>(initialState);
  const [cityFilter, setCityFilter] = useState<string>(initialCity);
  const [showRegionFilters, setShowRegionFilters] = useState<boolean>(initialZone !== 'All' || initialState !== 'All' || initialCity !== 'All');

  // Long-press & Action Sheet State
  const [selectedOrderForAction, setSelectedOrderForAction] = useState<any | null>(null);
  const [orderToDelete, setOrderToDelete] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Ref tracking for long press
  const longPressTimerRef = useRef<any>(null);
  const isLongPressTriggeredRef = useRef(false);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (statusFilter !== 'All') params.status = statusFilter;
      if (brandFilter !== 'ALL') params.brand = brandFilter;
      if (zoneFilter !== 'All') params.zone = zoneFilter;
      if (stateFilter !== 'All') params.state = stateFilter;
      if (cityFilter !== 'All') params.city = cityFilter;
      if (repFilter !== 'All') params.sales_rep_id = repFilter;

      const res = await api.getOrders(params);
      setOrders(res.orders || []);
    } catch (err) {
      console.error('Failed to fetch orders:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchOrders();
    }, 200);
    return () => clearTimeout(timer);
  }, [search, statusFilter, brandFilter, zoneFilter, stateFilter, cityFilter, repFilter]);

  useEffect(() => {
    if (!canFilterByRep) return;
    api.getRepresentatives().then(res => setReps(res.representatives || [])).catch(() => {});
  }, [canFilterByRep]);

  // Touch & Mouse Long Press Handlers
  const handleTouchStart = (ord: any, e: React.TouchEvent) => {
    isLongPressTriggeredRef.current = false;
    const t = e.touches[0];
    touchStartPosRef.current = { x: t.clientX, y: t.clientY };
    longPressTimerRef.current = setTimeout(() => {
      isLongPressTriggeredRef.current = true;
      if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(50);
      }
      setSelectedOrderForAction(ord);
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

  const handleMouseDown = (ord: any) => {
    isLongPressTriggeredRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      isLongPressTriggeredRef.current = true;
      setSelectedOrderForAction(ord);
    }, 500);
  };

  const handleMouseUp = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleCardClick = (ordId: string) => {
    if (isLongPressTriggeredRef.current) {
      isLongPressTriggeredRef.current = false;
      return;
    }
    onSelectOrder(ordId);
  };

  // Delete handler for Admin
  const handleDeleteConfirm = async () => {
    if (!orderToDelete) return;
    setDeleting(true);
    try {
      await api.deleteOrder(orderToDelete.id);
      setActionNotice(`Order ${orderToDelete.order_number} deleted successfully.`);
      setTimeout(() => setActionNotice(null), 4000);
      setOrderToDelete(null);
      setSelectedOrderForAction(null);
      fetchOrders();
    } catch (err: any) {
      alert(err.message || 'Failed to delete order');
    } finally {
      setDeleting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    if (status === 'IN_PROGRESS') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FBE8DB] text-[#D97732]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#D97732]"></span>
          In Progress
        </span>
      );
    }
    if (status === 'CLOSED') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#E3EEE6] text-[#4F7D5B]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#4F7D5B]"></span>
          Closed
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FBE9E9] text-[#C94C4C]">
        <span className="w-1.5 h-1.5 rounded-full bg-[#C94C4C]"></span>
        Open
      </span>
    );
  };

  return (
    <div className="px-4 pt-4 pb-24 max-w-lg mx-auto">
      {/* Toast Notice */}
      {actionNotice && (
        <div className="mb-3 p-3 bg-[#E3EEE6] border border-[#4F7D5B]/30 rounded-xl text-xs font-semibold text-[#4F7D5B] flex items-center gap-2 shadow-sm animate-in fade-in">
          <CheckCircle2 size={16} />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* Header matching Screenshot Image 25 */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#2F2923]">
            Orders
          </h1>
          <p className="text-[11px] text-[#766B60]">
            Long press any order to {isAdmin ? 'modify or delete' : 'modify'}
          </p>
        </div>
        <button
          onClick={onNewOrder}
          className="w-10 h-10 rounded-full bg-[#6B5744] hover:bg-[#5C4E43] active:scale-95 text-white flex items-center justify-center shadow-sm transition-transform"
        >
          <Plus size={22} strokeWidth={2.4} />
        </button>
      </div>

      {/* Search Input matching Screenshot Image 25 */}
      <div className="relative mb-3.5">
        <Search
          size={18}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#766B60]"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by ID, company, POC, SKU, mobile"
          className="w-full pl-10 pr-4 py-2.5 bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl text-sm text-[#2F2923] placeholder-[#766B60] focus:outline-none focus:ring-1 focus:ring-[#6B5744]"
        />
      </div>

      {/* Filter Pills matching Screenshot Image 25 */}
      <div className="flex items-center gap-2 mb-2 overflow-x-auto pb-1 no-scrollbar">
        {[
          { key: 'All', label: 'All' },
          { key: 'OPEN', label: 'Open' },
          { key: 'IN_PROGRESS', label: 'In Progress' },
          { key: 'CLOSED', label: 'Closed' }
        ].map((f) => {
          const isActive = statusFilter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key as any)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                isActive
                  ? 'bg-[#6B5744] text-[#FFFCF7]'
                  : 'bg-[#FFFCF7] border border-[#D2BFA7] text-[#2F2923] hover:bg-[#E8DCCB]/30'
              }`}
            >
              {f.label}
            </button>
          );
        })}

        {/* Region Toggle Button */}
        <button
          onClick={() => setShowRegionFilters(!showRegionFilters)}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1 cursor-pointer ${
            zoneFilter !== 'All' || stateFilter !== 'All' || cityFilter !== 'All'
              ? 'bg-[#6B5744] text-white'
              : 'bg-[#FFFCF7] border border-[#D2BFA7] text-[#766B60] hover:text-[#2F2923]'
          }`}
        >
          <span>Region {zoneFilter !== 'All' ? `(${zoneFilter})` : ''}</span>
        </button>
      </div>

      {/* Brand Filter (Requirement 2 & 4) */}
      <div className="flex items-center gap-1.5 mb-3">
        {[
          { key: 'ALL', label: 'All Brands' },
          { key: 'AI925', label: 'AI 925' },
          { key: 'ORAANI', label: 'Oraani' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setBrandFilter(t.key as any)}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition-all border ${
              brandFilter === t.key
                ? 'bg-[#6B5744] text-[#FFFCF7] border-[#6B5744] shadow-xs'
                : 'bg-[#FFFCF7] text-[#766B60] border-[#D2BFA7] hover:border-[#6B5744]/60'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Sales Representative Filter (System & Business Admin) */}
      {canFilterByRep && (
        <div className="flex items-center gap-2 mb-3">
          <label htmlFor="rep-filter" className="flex items-center gap-1 text-[11px] font-bold text-[#766B60] uppercase tracking-wider whitespace-nowrap">
            <UserCheck size={14} className="text-[#6B5744]" />
            Sales Rep
          </label>
          <select
            id="rep-filter"
            value={repFilter}
            onChange={(e) => setRepFilter(e.target.value)}
            className={`flex-1 text-xs font-semibold rounded-xl px-3 py-2 border focus:outline-none focus:ring-1 focus:ring-[#6B5744] ${
              repFilter !== 'All' ? 'bg-[#6B5744] text-white border-[#6B5744]' : 'bg-[#FFFCF7] text-[#2F2923] border-[#D2BFA7]'
            }`}
          >
            <option value="All">All sales reps</option>
            {reps.map((r) => (
              <option key={r.id} value={r.id}>
                {r.full_name}{r.is_active ? '' : ' (inactive)'} · {r.orders_count || 0} orders
              </option>
            ))}
          </select>
          {repFilter !== 'All' && (
            <button onClick={() => setRepFilter('All')} className="text-[11px] font-bold text-[#C94C4C] whitespace-nowrap">
              Clear
            </button>
          )}
        </div>
      )}

      {/* Expanded Region / State / City Filter Bar */}
      {showRegionFilters && (
        <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl p-3 mb-4 shadow-xs animate-in fade-in duration-150">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-[#6B5744] uppercase tracking-wider">Region & Location Filter</span>
            {(zoneFilter !== 'All' || stateFilter !== 'All' || cityFilter !== 'All') && (
              <button
                onClick={() => {
                  setZoneFilter('All');
                  setStateFilter('All');
                  setCityFilter('All');
                }}
                className="text-[10px] font-bold text-[#C94C4C] hover:underline"
              >
                Clear Location Filter
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none mb-2">
            {['All', 'North', 'South', 'East', 'West'].map((z) => (
              <button
                key={z}
                onClick={() => setZoneFilter(z)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  zoneFilter === z
                    ? 'bg-[#6B5744] text-white'
                    : 'bg-[#F5F0E8] text-[#766B60] hover:text-[#2F2923]'
                }`}
              >
                {z}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={stateFilter === 'All' ? '' : stateFilter}
              onChange={(e) => setStateFilter(e.target.value.trim() ? e.target.value : 'All')}
              placeholder="Filter by State..."
              className="text-xs bg-[#F5F0E8]/70 border border-[#D2BFA7] rounded-lg px-2.5 py-1.5 text-[#2F2923] focus:outline-none focus:border-[#6B5744]"
            />
            <input
              type="text"
              value={cityFilter === 'All' ? '' : cityFilter}
              onChange={(e) => setCityFilter(e.target.value.trim() ? e.target.value : 'All')}
              placeholder="Filter by City..."
              className="text-xs bg-[#F5F0E8]/70 border border-[#D2BFA7] rounded-lg px-2.5 py-1.5 text-[#2F2923] focus:outline-none focus:border-[#6B5744]"
            />
          </div>
        </div>
      )}

      {/* Order Cards List */}
      {loading && orders.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-7 h-7 border-2 border-[#6B5744] border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-8 text-center mt-2">
          <p className="text-base font-semibold text-[#2F2923] mb-1">No orders found</p>
          <p className="text-xs text-[#766B60] mb-4">Create your first order to get started</p>
          <button
            onClick={onNewOrder}
            className="px-4 py-2 bg-[#6B5744] text-white text-xs font-semibold rounded-xl"
          >
            + Create Order
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((ord) => (
            <div
              key={ord.id}
              onTouchStart={(e) => handleTouchStart(ord, e)}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onTouchCancel={handleTouchEnd}
              onMouseDown={() => handleMouseDown(ord)}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onContextMenu={(e) => {
                e.preventDefault();
                setSelectedOrderForAction(ord);
              }}
              onClick={() => handleCardClick(ord.id)}
              className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-4 shadow-card hover:border-[#6B5744]/60 active:scale-[0.99] transition-all cursor-pointer select-none relative group"
            >
              {/* Order Number & Status Badge */}
              <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xl font-bold text-[#2F2923]">
                    {ord.order_number}
                  </span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider ${
                    ord.brand === 'ORAANI' ? 'bg-[#E8DCCB] text-[#6B5744] border border-[#B49A7A]' : 'bg-[#2F2923] text-[#F5F0E8]'
                  }`}>
                    {ord.brand === 'ORAANI' ? 'Oraani' : 'AI 925'}
                  </span>
                  {isAdmin && (ord.creator_role === 'SALES_REP' || (Boolean(ord.sales_rep_name) && ord.creator_role !== 'ADMIN')) && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#EBF2FA] text-[#1E5D88] border border-[#BDD6EE]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#1E5D88]"></span>
                      Made by Sales Representative: {ord.creator_role === 'SALES_REP' ? (ord.creator_name || ord.sales_rep_name) : (ord.sales_rep_name || ord.creator_name)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {ord.total_amount > 0 && <PaymentStatusBadge status={ord.payment_status} />}
                  {getStatusBadge(ord.status)}
                </div>
              </div>
              {(ord.order_type === 'READY_STOCK' || ord.order_type === 'ON_ORDER' || (isBusinessAdmin && ord.sales_rep_role === 'SALES_REP')) && (
                <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                  <OrderTypeBadge type={ord.order_type} />
                  {isBusinessAdmin && ord.sales_rep_role === 'SALES_REP' && (
                    <span className="text-[10px] font-semibold text-[#766B60]">Rep: {ord.sales_rep_name}</span>
                  )}
                </div>
              )}

              {/* Company & POC / City */}
              <p className="font-semibold text-base text-[#2F2923]">
                {ord.customer_company_name}
              </p>
              <p className="text-xs text-[#766B60] mb-3">
                {ord.customer_poc_name} · {ord.customer_city} · {ord.customer_zone}
              </p>

              {/* Metric Breakdown Grid matching Screenshot Image 25 */}
              <div className="grid grid-cols-4 gap-1 text-[11px] pt-2 border-t border-[#E8DCCB]">
                <div>
                  <span className="block text-[#766B60] font-semibold">PIECES</span>
                  <span className="font-bold text-[#2F2923]">
                    {ord.delivered_pieces}/{ord.total_pieces}
                  </span>
                </div>
                <div>
                  <span className="block text-[#766B60] font-semibold">EXPECTED</span>
                  <span className="font-bold text-[#2F2923]">
                    {(ord.expected_weight || 0).toFixed(1)}g
                  </span>
                </div>
                <div>
                  <span className="block text-[#766B60] font-semibold">DELIVERED</span>
                  <span className="font-bold text-[#2F2923]">
                    {(ord.delivered_weight || 0).toFixed(1)}g
                  </span>
                </div>
                <div>
                  <span className="block text-[#766B60] font-semibold">{ord.total_amount > 0 ? 'VALUE' : 'DATE'}</span>
                  <span className="font-bold text-[#2F2923]">
                    {ord.total_amount > 0 ? formatINR(ord.total_amount, 0) : ord.order_date}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Long Press Order Action Sheet */}
      {selectedOrderForAction && (
        <div 
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex flex-col justify-end p-4 animate-in fade-in duration-200"
          onClick={() => setSelectedOrderForAction(null)}
        >
          <div 
            className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-3xl p-5 max-w-lg mx-auto w-full shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header info */}
            <div className="flex items-start justify-between border-b border-[#E8DCCB] pb-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xl font-bold text-[#2F2923]">
                    {selectedOrderForAction.order_number}
                  </span>
                  {isAdmin && (selectedOrderForAction.creator_role === 'SALES_REP' || (Boolean(selectedOrderForAction.sales_rep_name) && selectedOrderForAction.creator_role !== 'ADMIN')) && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#EBF2FA] text-[#1E5D88] border border-[#BDD6EE]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#1E5D88]"></span>
                      Made by Sales Representative: {selectedOrderForAction.creator_role === 'SALES_REP' ? (selectedOrderForAction.creator_name || selectedOrderForAction.sales_rep_name) : (selectedOrderForAction.sales_rep_name || selectedOrderForAction.creator_name)}
                    </span>
                  )}
                  {getStatusBadge(selectedOrderForAction.status)}
                </div>
                <p className="font-semibold text-sm text-[#2F2923] mt-0.5">
                  {selectedOrderForAction.customer_company_name}
                </p>
                <p className="text-xs text-[#766B60]">
                  {selectedOrderForAction.customer_poc_name} · {selectedOrderForAction.total_pieces} pcs · {selectedOrderForAction.order_date}
                </p>
              </div>
              <button 
                onClick={() => setSelectedOrderForAction(null)}
                className="w-8 h-8 rounded-full bg-[#E8DCCB]/40 hover:bg-[#E8DCCB] text-[#2F2923] flex items-center justify-center transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Actions list based on role */}
            <div className="space-y-2.5 pt-1">
              {/* Modify Order: Available to BOTH Admin and Sales Representative */}
              <button
                onClick={() => {
                  const ordId = selectedOrderForAction.id;
                  setSelectedOrderForAction(null);
                  if (onEditOrder) {
                    onEditOrder(ordId);
                  }
                }}
                className="w-full py-3 px-4 bg-[#6B5744] hover:bg-[#5C4E43] active:scale-[0.99] text-white font-semibold rounded-2xl flex items-center justify-center gap-2.5 transition-all shadow-sm"
              >
                <Edit3 size={18} />
                <span>Modify Order</span>
              </button>

              {/* Delete Order: ONLY AVAILABLE TO ADMIN */}
              {isAdmin && (
                <button
                  onClick={() => {
                    setOrderToDelete(selectedOrderForAction);
                    setSelectedOrderForAction(null);
                  }}
                  className="w-full py-3 px-4 bg-[#FBE9E9] hover:bg-[#FBE9E9]/80 border border-[#C94C4C]/30 active:scale-[0.99] text-[#C94C4C] font-semibold rounded-2xl flex items-center justify-center gap-2.5 transition-all"
                >
                  <Trash2 size={18} />
                  <span>Delete Order</span>
                </button>
              )}

              {/* View Order Details */}
              <button
                onClick={() => {
                  const ordId = selectedOrderForAction.id;
                  setSelectedOrderForAction(null);
                  onSelectOrder(ordId);
                }}
                className="w-full py-2.5 px-4 bg-[#FFFCF7] border border-[#D2BFA7] hover:bg-[#E8DCCB]/30 text-[#2F2923] text-sm font-semibold rounded-2xl flex items-center justify-center gap-2 transition-colors"
              >
                View Full Details
              </button>
            </div>

            {/* Role indicator footer note */}
            <p className="text-[11px] text-center text-[#766B60] pt-1">
              {isAdmin
                ? 'Admin privileges active: modify or delete order'
                : 'Sales Representative interface: order modification allowed'}
            </p>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal (Admin Only) */}
      {orderToDelete && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => !deleting && setOrderToDelete(null)}
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
                Delete Order {orderToDelete.order_number}?
              </h3>
              <p className="text-xs text-[#766B60] leading-relaxed">
                Are you sure you want to permanently delete this order for{' '}
                <span className="font-semibold text-[#2F2923]">{orderToDelete.customer_company_name}</span>?
                Any allocated inventory will be immediately restored to available stock.
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
                    <span>Delete Permanently</span>
                  </>
                )}
              </button>
              <button
                disabled={deleting}
                onClick={() => setOrderToDelete(null)}
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
