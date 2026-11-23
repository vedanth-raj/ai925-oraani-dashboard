import React, { useEffect, useState, useRef } from 'react';
import { MapPin, RefreshCw, ChevronRight, UserCheck, Calendar, Filter, X, Inbox, UserPlus, ClipboardList, Wallet, UserCog, PhoneCall } from 'lucide-react';
import { api, type RequestsSummary } from '../api';
import { useAuth } from '../auth';
import { formatINR } from '../pricing';
import { SilverRateCard } from '../components/SilverRateCard';
import type { RequestsTab } from './RequestsScreen';

interface DashboardScreenProps {
  onSelectStatus?: (status: 'OPEN' | 'IN_PROGRESS' | 'CLOSED' | 'All') => void;
  onNavigateToOrders?: (filters?: { zone?: string; state?: string; city?: string; status?: string }) => void;
  onOpenRequests?: (tab: RequestsTab) => void;
  onOpenPayments?: () => void;
}

export const DashboardScreen: React.FC<DashboardScreenProps> = ({ onSelectStatus, onNavigateToOrders, onOpenRequests, onOpenPayments }) => {
  const { user, isRep, isAdmin, isBusinessAdmin } = useAuth();
  const isStaffAdmin = isAdmin || isBusinessAdmin;
  const [requests, setRequests] = useState<RequestsSummary | null>(null);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Interactive Filter States
  const [timeframe, setTimeframe] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('monthly');
  const [selectedZone, setSelectedZone] = useState<string>('All');
  const [selectedState, setSelectedState] = useState<string>('All');
  const [selectedCity, setSelectedCity] = useState<string>('All');

  // Interactive Hover / Tap Tooltip state for stacked parts
  const [activeTooltip, setActiveTooltip] = useState<{
    bar: any;
    x: number;
    y: number;
  } | null>(null);

  const chartContainerRef = useRef<HTMLDivElement | null>(null);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      setError(null);
      const params: any = { timeframe };
      if (selectedZone !== 'All') params.zone = selectedZone;
      if (selectedState !== 'All') params.state = selectedState;
      if (selectedCity !== 'All') params.city = selectedCity;

      const res = await api.getOverview(params);
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, [timeframe, selectedZone, selectedState, selectedCity]);

  // Customer requests / new customer sign-ups: refresh every 30 s so new ones show up as notifications
  useEffect(() => {
    if (!isStaffAdmin) return;
    const loadRequests = () => api.getRequestsSummary().then(setRequests).catch(() => {});
    loadRequests();
    const timer = setInterval(loadRequests, 30000);
    return () => clearInterval(timer);
  }, [isStaffAdmin]);

  const handleOpenOrdersWithFilter = (extraFilters?: { zone?: string; state?: string; city?: string; status?: string }) => {
    if (onNavigateToOrders) {
      onNavigateToOrders({
        zone: selectedZone !== 'All' ? selectedZone : extraFilters?.zone,
        state: selectedState !== 'All' ? selectedState : extraFilters?.state,
        city: selectedCity !== 'All' ? selectedCity : extraFilters?.city,
        status: extraFilters?.status || 'All'
      });
    } else if (onSelectStatus) {
      onSelectStatus((extraFilters?.status as any) || 'All');
    }
  };

  const kpis = data?.kpis || {};
  const chartData = data?.chart || { bars: [], max_pieces: 100, max_weight: 1000, reps: [] };
  const regions = data?.region_breakdown || [];
  const filterOptions = data?.filter_options || { zones: ['North', 'South', 'East', 'West'], states: [], cities: [] };

  const bars = chartData.bars || [];
  const maxPieces = Math.max(chartData.max_pieces || 50, 10);

  // Y-axis ticks for pieces
  const yTicks = [
    Math.round(maxPieces),
    Math.round(maxPieces * 0.75),
    Math.round(maxPieces * 0.50),
    Math.round(maxPieces * 0.25),
    0
  ];

  return (
    <div className="px-4 pt-4 pb-28 max-w-lg mx-auto" onClick={() => setActiveTooltip(null)}>
      {/* Brand & Heading */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="text-xs font-semibold tracking-wider text-[#766B60] uppercase">
            AI925
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-[#2F2923]">
            Overview
          </h1>
        </div>
        <button
          onClick={fetchDashboard}
          title="Refresh metrics"
          className="p-2 text-[#766B60] hover:text-[#2F2923] hover:bg-[#E8DCCB]/40 rounded-full transition-colors cursor-pointer"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && (
        <div className="mb-3 p-3 bg-[#FBE9E9] border border-[#C94C4C]/25 rounded-xl text-xs text-[#C94C4C] font-medium">
          {error}
        </div>
      )}

      {/* Role / Context Scope Badge */}
      <div className="mb-4">
        {isRep ? (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#E8DCCB]/60 rounded-full text-xs font-semibold text-[#6B5744]">
            <UserCheck size={14} />
            <span>My Salesperson Dashboard ({user?.full_name})</span>
          </div>
        ) : isBusinessAdmin ? (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#E8DCCB]/60 rounded-full text-xs font-semibold text-[#6B5744]">
            <UserCheck size={14} />
            <span>Business Administrator Dashboard</span>
          </div>
        ) : (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#E8DCCB]/60 rounded-full text-xs font-semibold text-[#6B5744]">
            <UserCheck size={14} />
            <span>System Administrator Dashboard (Global)</span>
          </div>
        )}
      </div>

      {/* REQUESTS PANELS: Customer Requests with New Customers beside it (both administrators) */}
      {isStaffAdmin && (
        <div className="mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => onOpenRequests && onOpenRequests('stock')}
              className="relative text-left bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-3.5 shadow-card hover:border-[#6B5744] active:scale-[0.98] transition-all"
            >
              <div className="flex items-center gap-2 text-[#6B5744] mb-1">
                <Inbox size={16} />
                <span className="text-[11px] font-bold uppercase tracking-wider">Customer Requests</span>
              </div>
              <p className="text-2xl font-bold text-[#2F2923]">{requests?.open_stock_requests ?? '—'}</p>
              <p className="text-[11px] text-[#766B60]">open seller requests</p>
              {(requests?.open_stock_requests || 0) > 0 && (
                <span className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full bg-[#C94C4C] animate-pulse" />
              )}
            </button>
            <button
              onClick={() => onOpenRequests && onOpenRequests('customers')}
              className={`relative text-left rounded-2xl p-3.5 shadow-card active:scale-[0.98] transition-all border ${
                (requests?.awaiting_my_approval || 0) > 0 ? 'bg-[#FBE8DB] border-[#D97732]/40' : 'bg-[#FFFCF7] border-[#D2BFA7] hover:border-[#6B5744]'
              }`}
            >
              <div className="flex items-center gap-2 text-[#6B5744] mb-1">
                <UserPlus size={16} />
                <span className="text-[11px] font-bold uppercase tracking-wider">New Customers</span>
              </div>
              <p className="text-2xl font-bold text-[#2F2923]">{requests?.pending_customers ?? '—'}</p>
              <p className="text-[11px] text-[#766B60]">
                {(requests?.awaiting_my_approval || 0) > 0 ? `${requests?.awaiting_my_approval} need your approval` : 'under verification'}
              </p>
              {(requests?.awaiting_my_approval || 0) > 0 && (
                <span className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full bg-[#D97732] animate-pulse" />
              )}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => onOpenRequests && onOpenRequests('on_order')}
              className="text-left bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-3.5 shadow-card hover:border-[#6B5744] active:scale-[0.98] transition-all"
            >
              <div className="flex items-center gap-2 text-[#6B5744] mb-1">
                <ClipboardList size={16} />
                <span className="text-[11px] font-bold uppercase tracking-wider">On-Order</span>
              </div>
              <p className="text-xl font-bold text-[#2F2923]">{requests?.on_order_open ?? '—'}</p>
              <p className="text-[11px] text-[#766B60]">new purchase requests</p>
            </button>
            <button
              type="button"
              onClick={onOpenPayments}
              className="text-left bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-3.5 shadow-card hover:border-[#6B5744] active:scale-[0.98] transition-all cursor-pointer w-full group"
            >
              <div className="flex items-center justify-between text-[#6B5744] mb-1">
                <div className="flex items-center gap-2">
                  <Wallet size={16} />
                  <span className="text-[11px] font-bold uppercase tracking-wider">Payments</span>
                </div>
                <ChevronRight size={14} className="text-[#D2BFA7] group-hover:text-[#6B5744] group-hover:translate-x-0.5 transition-all" />
              </div>
              <p className="text-base font-bold text-[#4F7D5B]">{formatINR(requests?.payments_received || 0, 0)}</p>
              <p className="text-[11px] text-[#766B60]">
                received · {formatINR(requests?.payments_outstanding || 0, 0)} due ({requests?.unpaid_orders || 0})
              </p>
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => onOpenRequests && onOpenRequests('changes')}
              className="relative text-left bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-3.5 shadow-card hover:border-[#6B5744] active:scale-[0.98] transition-all"
            >
              <div className="flex items-center gap-2 text-[#6B5744] mb-1">
                <UserCog size={16} />
                <span className="text-[11px] font-bold uppercase tracking-wider">Profile Changes</span>
              </div>
              <p className="text-xl font-bold text-[#2F2923]">{requests?.profile_changes ?? '—'}</p>
              <p className="text-[11px] text-[#766B60]">details / passwords to approve</p>
              {(requests?.profile_changes || 0) > 0 && (
                <span className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full bg-[#D97732] animate-pulse" />
              )}
            </button>
            <button
              onClick={() => onOpenRequests && onOpenRequests('calls')}
              className="relative text-left bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-3.5 shadow-card hover:border-[#6B5744] active:scale-[0.98] transition-all"
            >
              <div className="flex items-center gap-2 text-[#6B5744] mb-1">
                <PhoneCall size={16} />
                <span className="text-[11px] font-bold uppercase tracking-wider">Call Bookings</span>
              </div>
              <p className="text-xl font-bold text-[#2F2923]">{requests?.call_bookings ?? '—'}</p>
              <p className="text-[11px] text-[#766B60]">customised orders to discuss</p>
              {(requests?.call_bookings || 0) > 0 && (
                <span className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full bg-[#C94C4C] animate-pulse" />
              )}
            </button>
          </div>
        </div>
      )}

      {/* Today's silver rate drives every product price; this is the only place it is changed */}
      <div className="mb-4">
        <SilverRateCard canManage={isStaffAdmin} showSettings={isStaffAdmin} />
      </div>

      {/* INTERACTIVE REGION & DRILLDOWN FILTER BAR */}
      <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-3 shadow-xs mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#6B5744]">
            <Filter size={14} />
            <span>Region Filter</span>
          </div>
          {(selectedZone !== 'All' || selectedState !== 'All' || selectedCity !== 'All') && (
            <button
              onClick={() => {
                setSelectedZone('All');
                setSelectedState('All');
                setSelectedCity('All');
              }}
              className="text-[11px] font-semibold text-[#C94C4C] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <X size={12} />
              Reset Filters
            </button>
          )}
        </div>

        {/* Zone Pill Toggles */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none">
          {['All', 'North', 'South', 'East', 'West'].map((zone) => (
            <button
              key={zone}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedZone(zone);
                setSelectedState('All');
                setSelectedCity('All');
              }}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                selectedZone === zone
                  ? 'bg-[#6B5744] text-white shadow-xs'
                  : 'bg-[#F5F0E8] text-[#766B60] hover:text-[#2F2923] hover:bg-[#E8DCCB]'
              }`}
            >
              {zone}
            </button>
          ))}
        </div>

        {/* State & City Dropdown Selectors */}
        <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-[#E8DCCB]">
          <div>
            <label className="block text-[10px] font-bold text-[#766B60] uppercase mb-1">State</label>
            <select
              value={selectedState}
              onChange={(e) => {
                setSelectedState(e.target.value);
                setSelectedCity('All');
              }}
              className="w-full text-xs font-medium bg-[#F5F0E8]/70 border border-[#D2BFA7] rounded-lg px-2 py-1.5 text-[#2F2923] focus:outline-none focus:border-[#6B5744]"
            >
              <option value="All">All States</option>
              {filterOptions.states.map((st: string) => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-[#766B60] uppercase mb-1">City</label>
            <select
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              className="w-full text-xs font-medium bg-[#F5F0E8]/70 border border-[#D2BFA7] rounded-lg px-2 py-1.5 text-[#2F2923] focus:outline-none focus:border-[#6B5744]"
            >
              <option value="All">All Cities</option>
              {filterOptions.cities
                .filter((c: any) => selectedState === 'All' || c.state === selectedState)
                .map((c: any) => (
                  <option key={c.city} value={c.city}>{c.city}</option>
                ))}
            </select>
          </div>
        </div>
      </div>

      {/* 4 KPI Cards (2x2 Grid) */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        {/* TOTAL ORDERS */}
        <div
          onClick={() => handleOpenOrdersWithFilter()}
          className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-4 shadow-card hover:border-[#6B5744] hover:shadow-md active:scale-[0.98] transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold tracking-wider text-[#766B60] uppercase group-hover:text-[#6B5744]">
              TOTAL ORDERS
            </p>
            <ChevronRight size={14} className="text-[#B49A7A] group-hover:translate-x-0.5 transition-transform" />
          </div>
          <p className="text-2xl font-bold text-[#2F2923] mt-1">
            {kpis.total_orders || 0}
          </p>
          <p className="text-xs text-[#766B60] mt-0.5">
            {kpis.total_pieces || 0} pieces · Tap to view
          </p>
        </div>

        {/* EXPECTED WEIGHT */}
        <div
          onClick={() => handleOpenOrdersWithFilter()}
          className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-4 shadow-card hover:border-[#6B5744] hover:shadow-md active:scale-[0.98] transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold tracking-wider text-[#766B60] uppercase group-hover:text-[#6B5744]">
              EXPECTED WEIGHT
            </p>
            <ChevronRight size={14} className="text-[#B49A7A] group-hover:translate-x-0.5 transition-transform" />
          </div>
          <p className="text-2xl font-bold text-[#2F2923] mt-1">
            {(kpis.expected_weight || 0).toFixed(1)}g
          </p>
          <p className="text-xs text-[#766B60] mt-0.5">
            Ordered total
          </p>
        </div>

        {/* DELIVERED */}
        <div
          onClick={() => handleOpenOrdersWithFilter()}
          className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-4 shadow-card hover:border-[#6B5744] hover:shadow-md active:scale-[0.98] transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold tracking-wider text-[#766B60] uppercase group-hover:text-[#6B5744]">
              DELIVERED
            </p>
            <ChevronRight size={14} className="text-[#B49A7A] group-hover:translate-x-0.5 transition-transform" />
          </div>
          <p className="text-2xl font-bold text-[#2F2923] mt-1">
            {(kpis.delivered_weight || 0).toFixed(1)}g
          </p>
          <p className="text-xs text-[#766B60] mt-0.5">
            Actual recorded
          </p>
        </div>

        {/* REMAINING EST. */}
        <div
          onClick={() => handleOpenOrdersWithFilter()}
          className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-4 shadow-card hover:border-[#6B5744] hover:shadow-md active:scale-[0.98] transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold tracking-wider text-[#766B60] uppercase group-hover:text-[#6B5744]">
              REMAINING EST.
            </p>
            <ChevronRight size={14} className="text-[#B49A7A] group-hover:translate-x-0.5 transition-transform" />
          </div>
          <p className="text-2xl font-bold text-[#2F2923] mt-1">
            {(kpis.remaining_est_weight || 0).toFixed(1)}g
          </p>
          <p className="text-xs text-[#766B60] mt-0.5">
            Expected – delivered
          </p>
        </div>
      </div>

      {/* 3 Status Cards */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div
          onClick={() => handleOpenOrdersWithFilter({ status: 'OPEN' })}
          className="bg-[#FBE9E9] rounded-2xl p-3 text-center border border-[#C94C4C]/15 transition-transform cursor-pointer hover:scale-[1.02] active:scale-[0.98] shadow-xs"
        >
          <p className="text-2xl font-bold text-[#C94C4C]">{kpis.open_orders || 0}</p>
          <p className="text-[11px] font-bold tracking-wider text-[#C94C4C] uppercase mt-0.5">OPEN</p>
        </div>

        <div
          onClick={() => handleOpenOrdersWithFilter({ status: 'IN_PROGRESS' })}
          className="bg-[#FBE8DB] rounded-2xl p-3 text-center border border-[#D97732]/15 transition-transform cursor-pointer hover:scale-[1.02] active:scale-[0.98] shadow-xs"
        >
          <p className="text-2xl font-bold text-[#D97732]">{kpis.in_progress_orders || 0}</p>
          <p className="text-[11px] font-bold tracking-wider text-[#D97732] uppercase mt-0.5">IN PROGRESS</p>
        </div>

        <div
          onClick={() => handleOpenOrdersWithFilter({ status: 'CLOSED' })}
          className="bg-[#E3EEE6] rounded-2xl p-3 text-center border border-[#4F7D5B]/15 transition-transform cursor-pointer hover:scale-[1.02] active:scale-[0.98] shadow-xs"
        >
          <p className="text-2xl font-bold text-[#4F7D5B]">{kpis.closed_orders || 0}</p>
          <p className="text-[11px] font-bold tracking-wider text-[#4F7D5B] uppercase mt-0.5">CLOSED</p>
        </div>
      </div>

      {/* INTERACTIVE STACKED CHART: Salesperson Pieces Parts (Matching reference image) */}
      <div className="mb-6 relative" ref={chartContainerRef}>
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="text-base font-bold text-[#2F2923] flex items-center gap-1.5">
            <Calendar size={16} className="text-[#6B5744]" />
            <span>Pieces Ordered by Salesperson</span>
          </h2>

          {/* Timeframe selector: Daily, Weekly, Monthly, Yearly */}
          <div className="flex items-center bg-[#E8DCCB]/60 p-0.5 rounded-xl">
            {(['daily', 'weekly', 'monthly', 'yearly'] as const).map((tf) => (
              <button
                key={tf}
                onClick={(e) => {
                  e.stopPropagation();
                  setTimeframe(tf);
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold capitalize transition-all cursor-pointer ${
                  timeframe === tf
                    ? 'bg-[#6B5744] text-white shadow-xs'
                    : 'text-[#766B60] hover:text-[#2F2923]'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        {/* Active Tooltip Popover (Matching Reference Image) */}
        {activeTooltip && (
          <div
            className="absolute z-30 bg-white border border-[#D2BFA7] rounded-xl p-3 shadow-xl pointer-events-none transition-all duration-100 min-w-[190px]"
            style={{
              left: `${Math.min(Math.max(activeTooltip.x - 95, 10), 300)}px`,
              top: `${Math.max(activeTooltip.y - 120, 10)}px`
            }}
          >
            <div className="border-b border-[#E8DCCB] pb-1.5 mb-2">
              <p className="text-xs font-bold text-[#2F2923]">
                {activeTooltip.bar.label || activeTooltip.bar.month_name}
              </p>
              <p className="text-[10px] text-[#766B60]">
                Total: <strong>{activeTooltip.bar.total_pieces} pcs</strong> · {(activeTooltip.bar.ordered_weight || 0).toFixed(1)}g
              </p>
            </div>

            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {activeTooltip.bar.parts && activeTooltip.bar.parts.length > 0 ? (
                activeTooltip.bar.parts.map((part: any, pIdx: number) => (
                  <div key={pIdx} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 min-w-0 pr-2">
                      <span
                        className="w-2.5 h-2.5 rounded-xs shrink-0"
                        style={{ backgroundColor: part.color }}
                      />
                      <span className="truncate text-[#2F2923] font-medium">{part.rep_name}</span>
                    </div>
                    <span className="font-bold text-[#2F2923] shrink-0 font-mono">
                      {part.pieces} pcs
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-[11px] text-[#766B60] italic">No sales recorded</p>
              )}
            </div>

            {/* Pointer arrow */}
            <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-b border-r border-[#D2BFA7] rotate-45"></div>
          </div>
        )}

        {/* The Stacked Bar Graph Box */}
        <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-4 shadow-card">
          <div className="flex h-56">
            {/* Y-axis (Pieces Scale) */}
            <div className="flex flex-col justify-between items-end pr-2.5 pb-6 text-[10px] text-[#766B60] font-mono select-none w-8 shrink-0">
              {yTicks.map((val, i) => (
                <span key={i}>{val}</span>
              ))}
            </div>

            {/* Bars Area */}
            <div className="flex-1 flex flex-col min-w-0">
              <div className="flex-1 flex items-end justify-between border-b border-[#D2BFA7] px-1 pb-1 relative gap-1">
                {bars.map((bar: any, idx: number) => {
                  const totalBarPieces = bar.total_pieces || 0;
                  const barHeightPercent = maxPieces > 0 ? Math.min(100, Math.round((totalBarPieces / maxPieces) * 100)) : 0;
                  const isHovered = activeTooltip?.bar?.key === bar.key;

                  return (
                    <div
                      key={idx}
                      onClick={(e) => {
                        e.stopPropagation();
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        const containerRect = chartContainerRef.current?.getBoundingClientRect();
                        setActiveTooltip({
                          bar,
                          x: rect.left - (containerRect?.left || 0) + rect.width / 2,
                          y: rect.top - (containerRect?.top || 0)
                        });
                      }}
                      onMouseEnter={(e) => {
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        const containerRect = chartContainerRef.current?.getBoundingClientRect();
                        setActiveTooltip({
                          bar,
                          x: rect.left - (containerRect?.left || 0) + rect.width / 2,
                          y: rect.top - (containerRect?.top || 0)
                        });
                      }}
                      className="flex-1 flex flex-col items-center h-full justify-end cursor-pointer group"
                    >
                      {/* Stacked Bar Container */}
                      <div
                        style={{ height: `${Math.max(barHeightPercent, 4)}%` }}
                        className={`w-full max-w-[28px] rounded-t-sm flex flex-col-reverse overflow-hidden transition-all ${
                          isHovered ? 'ring-2 ring-[#6B5744] brightness-105 scale-[1.03]' : ''
                        }`}
                      >
                        {bar.parts && bar.parts.length > 0 ? (
                          bar.parts.map((part: any, pIdx: number) => {
                            const partPercent = totalBarPieces > 0 ? (part.pieces / totalBarPieces) * 100 : 0;
                            return (
                              <div
                                key={pIdx}
                                style={{
                                  height: `${partPercent}%`,
                                  backgroundColor: part.color
                                }}
                                className="w-full transition-all"
                                title={`${part.rep_name}: ${part.pieces} pcs`}
                              />
                            );
                          })
                        ) : (
                          <div className="w-full h-full bg-[#E8DCCB]/40" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* X-axis Labels */}
              <div className="flex justify-between px-1 pt-2 text-[10px] font-medium text-[#766B60]">
                {bars.map((bar: any, idx: number) => (
                  <span
                    key={idx}
                    className="flex-1 text-center truncate font-medium"
                    title={bar.label || bar.month_name}
                  >
                    {bar.month_short || bar.label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Reps Legend */}
          {chartData.reps && chartData.reps.length > 0 && (
            <div className="mt-3 pt-3 border-t border-[#E8DCCB] flex flex-wrap items-center gap-3 text-xs">
              {chartData.reps.map((rep: any) => (
                <div key={rep.id} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs shrink-0" style={{ backgroundColor: rep.color }} />
                  <span className="text-[#2F2923] text-[11px] font-medium">{rep.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Region Breakdown Section */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="text-base font-bold text-[#2F2923] flex items-center gap-1.5">
            <MapPin size={16} className="text-[#6B5744]" />
            <span>Region Breakdown</span>
          </h2>
          <span className="text-xs text-[#766B60]">Tap region to view orders</span>
        </div>

        <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-2 shadow-card divide-y divide-[#E8DCCB]">
          {regions.map((reg: any) => (
            <div
              key={reg.region}
              onClick={() => handleOpenOrdersWithFilter({ zone: reg.region })}
              className="flex items-center justify-between py-3 px-3 hover:bg-[#F5F0E8]/50 active:bg-[#E8DCCB]/30 rounded-xl transition-colors cursor-pointer group"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#E8DCCB]/60 text-[#6B5744] flex items-center justify-center shrink-0 font-bold text-xs">
                  {reg.region.slice(0, 1)}
                </div>
                <div>
                  <span className="font-semibold text-sm text-[#2F2923] group-hover:text-[#6B5744] transition-colors">
                    {reg.region} Zone
                  </span>
                  <p className="text-[10px] text-[#766B60]">
                    {reg.total_pieces || 0} pieces ordered
                  </p>
                </div>
              </div>

              <div className="text-xs text-[#766B60] flex items-center gap-2">
                <span>
                  <strong className="text-[#2F2923]">{reg.orders_count}</strong> orders ·{' '}
                  <strong className="text-[#2F2923]">{(reg.total_weight_g || 0).toFixed(1)}g</strong>
                </span>
                <ChevronRight size={14} className="text-[#B49A7A] group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
