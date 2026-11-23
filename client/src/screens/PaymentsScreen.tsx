import React, { useEffect, useState, useMemo } from 'react';
import { ArrowLeft, Wallet, Search, RefreshCw, CheckCircle2, Building, Phone, Calendar, Hash, ArrowUpRight, ShieldCheck } from 'lucide-react';
import { api } from '../api';
import { formatINR } from '../pricing';

interface PaymentsScreenProps {
  onBack: () => void;
  onSelectOrder?: (orderId: string) => void;
}

type BrandFilter = 'ALL' | 'ORAANI' | 'AI925';

export const PaymentsScreen: React.FC<PaymentsScreenProps> = ({ onBack, onSelectOrder }) => {
  const [payments, setPayments] = useState<any[]>([]);
  const [summary, setSummary] = useState<{
    total_amount: number;
    total_count: number;
    oraani_amount: number;
    oraani_count: number;
    ai925_amount: number;
    ai925_count: number;
  }>({
    total_amount: 0,
    total_count: 0,
    oraani_amount: 0,
    oraani_count: 0,
    ai925_amount: 0,
    ai925_count: 0
  });

  const [brandFilter, setBrandFilter] = useState<BrandFilter>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPayments = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getPayments({
        brand: brandFilter,
        search: searchTerm.trim() || undefined
      });
      setPayments(res.payments || []);
      if (res.summary) {
        setSummary(res.summary);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load payments history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
  }, [brandFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchPayments();
  };

  const formatDate = (isoStr: string) => {
    if (!isoStr) return '—';
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoStr;
    }
  };

  const filteredPayments = useMemo(() => {
    if (!searchTerm.trim()) return payments;
    const term = searchTerm.toLowerCase();
    return payments.filter(p =>
      (p.customer_name && p.customer_name.toLowerCase().includes(term)) ||
      (p.company_name && p.company_name.toLowerCase().includes(term)) ||
      (p.customer_phone && p.customer_phone.includes(term)) ||
      (p.order_number && p.order_number.toLowerCase().includes(term)) ||
      (p.gateway_ref && p.gateway_ref.toLowerCase().includes(term)) ||
      (p.method && p.method.toLowerCase().includes(term))
    );
  }, [payments, searchTerm]);

  return (
    <div className="min-h-screen bg-[#F5F0E8] pb-12">
      {/* Top Header */}
      <div className="bg-[#FFFCF7] border-b border-[#D2BFA7] sticky top-0 z-20 px-4 py-3 shadow-xs">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              aria-label="Back"
              className="w-9 h-9 rounded-xl bg-[#F5F0E8] hover:bg-[#E8DCCB] text-[#2F2923] flex items-center justify-center transition-colors"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="text-lg font-bold text-[#2F2923] flex items-center gap-2">
                <Wallet size={19} className="text-[#6B5744]" /> Payment Transactions
              </h1>
              <p className="text-[11px] text-[#766B60]">
                Customer payment ledger & gateway settlements
              </p>
            </div>
          </div>

          <button
            onClick={fetchPayments}
            disabled={loading}
            className="w-9 h-9 rounded-xl bg-[#F5F0E8] hover:bg-[#E8DCCB] text-[#6B5744] flex items-center justify-center transition-colors disabled:opacity-50"
            title="Refresh payments"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 pt-4 space-y-4">
        {/* KPI Overview Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-3.5 shadow-card">
            <span className="text-[10px] font-bold text-[#766B60] uppercase tracking-wider block mb-1">
              Total Collected
            </span>
            <p className="text-lg font-bold text-[#4F7D5B]">{formatINR(summary.total_amount, 0)}</p>
            <p className="text-[10px] text-[#766B60] mt-0.5">{summary.total_count} transactions</p>
          </div>

          <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-3.5 shadow-card">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold text-[#A85832] uppercase tracking-wider">
                Oraani Payments
              </span>
              <span className="w-2 h-2 rounded-full bg-[#A85832]" />
            </div>
            <p className="text-lg font-bold text-[#2F2923]">{formatINR(summary.oraani_amount, 0)}</p>
            <p className="text-[10px] text-[#766B60] mt-0.5">{summary.oraani_count} transactions</p>
          </div>

          <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-3.5 shadow-card">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold text-[#4A5D6E] uppercase tracking-wider">
                AI 925 Payments
              </span>
              <span className="w-2 h-2 rounded-full bg-[#4A5D6E]" />
            </div>
            <p className="text-lg font-bold text-[#2F2923]">{formatINR(summary.ai925_amount, 0)}</p>
            <p className="text-[10px] text-[#766B60] mt-0.5">{summary.ai925_count} transactions</p>
          </div>

          <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-3.5 shadow-card">
            <span className="text-[10px] font-bold text-[#766B60] uppercase tracking-wider block mb-1">
              Active Gateway
            </span>
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#2F2923]">
              <ShieldCheck size={14} className="text-[#4F7D5B]" /> Razorpay (Live)
            </div>
            <p className="text-[10px] text-[#766B60] mt-0.5">UPI, Cards, NetBanking</p>
          </div>
        </div>

        {/* Filter Tabs & Search Bar */}
        <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-3.5 shadow-card space-y-3">
          {/* Brand Filter Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-[#F5F0E8] border border-[#D2BFA7] rounded-xl overflow-x-auto">
            <button
              type="button"
              onClick={() => setBrandFilter('ALL')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all text-center whitespace-nowrap ${
                brandFilter === 'ALL'
                  ? 'bg-[#6B5744] text-white shadow-xs'
                  : 'text-[#766B60] hover:text-[#2F2923]'
              }`}
            >
              All Brands ({summary.total_count})
            </button>
            <button
              type="button"
              onClick={() => setBrandFilter('ORAANI')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all text-center whitespace-nowrap flex items-center justify-center gap-1.5 ${
                brandFilter === 'ORAANI'
                  ? 'bg-[#A85832] text-white shadow-xs'
                  : 'text-[#766B60] hover:text-[#2F2923]'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-[#E07A5F]" />
              Oraani ({summary.oraani_count})
            </button>
            <button
              type="button"
              onClick={() => setBrandFilter('AI925')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all text-center whitespace-nowrap flex items-center justify-center gap-1.5 ${
                brandFilter === 'AI925'
                  ? 'bg-[#4A5D6E] text-white shadow-xs'
                  : 'text-[#766B60] hover:text-[#2F2923]'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-[#94A3B8]" />
              AI 925 ({summary.ai925_count})
            </button>
          </div>

          {/* Search Bar */}
          <form onSubmit={handleSearchSubmit} className="relative">
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search by customer name, phone, order #, reference ID..."
              className="w-full pl-9 pr-20 py-2 bg-white border border-[#D2BFA7] rounded-xl text-xs text-[#2F2923] placeholder-[#766B60] focus:outline-none focus:ring-1 focus:ring-[#6B5744]"
            />
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#766B60]" />
            <button
              type="submit"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-[#6B5744] hover:bg-[#584534] text-white text-[11px] font-bold rounded-lg transition-colors"
            >
              Filter
            </button>
          </form>
        </div>

        {/* Transactions List */}
        {error && (
          <div className="p-4 bg-[#FBE9E9] border border-[#C94C4C]/30 rounded-2xl text-xs text-[#C94C4C] font-semibold">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center text-[#766B60] space-y-2">
            <div className="w-6 h-6 border-2 border-[#6B5744] border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs font-semibold">Loading payment history...</p>
          </div>
        ) : filteredPayments.length === 0 ? (
          <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-8 text-center shadow-card space-y-2">
            <Wallet size={32} className="mx-auto text-[#D2BFA7]" />
            <h3 className="text-sm font-bold text-[#2F2923]">No payment transactions found</h3>
            <p className="text-xs text-[#766B60]">
              {brandFilter !== 'ALL'
                ? `No payments recorded yet for ${brandFilter === 'ORAANI' ? 'Oraani' : 'AI 925'}.`
                : 'Transactions will appear here as customers complete payments.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs text-[#766B60] px-1 font-semibold">
              <span>Showing {filteredPayments.length} transactions</span>
              <span>Sorted by latest</span>
            </div>

            {filteredPayments.map(p => {
              const isOraani = p.brand === 'ORAANI';

              return (
                <div
                  key={p.id}
                  className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-4 shadow-card hover:border-[#6B5744] transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0 flex-1">
                      {/* Customer Name & Brand Badge */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-[#2F2923] truncate">
                          {p.customer_name || 'Customer'}
                        </span>
                        {p.company_name && p.company_name !== p.customer_name && (
                          <span className="text-xs text-[#766B60] flex items-center gap-1 truncate">
                            <Building size={11} /> {p.company_name}
                          </span>
                        )}
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                            isOraani
                              ? 'bg-[#FDF0EA] text-[#A85832] border-[#E8C2B2]'
                              : 'bg-[#F0F4F8] text-[#334E68] border-[#BCCCDC]'
                          }`}
                        >
                          {isOraani ? 'Oraani' : 'AI 925'}
                        </span>
                      </div>

                      {/* Phone & Order link */}
                      <div className="flex items-center gap-3 text-xs text-[#766B60] flex-wrap">
                        {p.customer_phone && (
                          <span className="flex items-center gap-1 font-mono">
                            <Phone size={11} /> +91 {p.customer_phone}
                          </span>
                        )}
                        {p.customer_city && (
                          <span>· {p.customer_city}</span>
                        )}
                        <button
                          type="button"
                          onClick={() => onSelectOrder && onSelectOrder(p.order_id)}
                          className="font-bold text-[#6B5744] hover:underline flex items-center gap-0.5"
                        >
                          <Hash size={11} /> {p.order_number || p.order_id}
                          <ArrowUpRight size={11} />
                        </button>
                      </div>
                    </div>

                    {/* Amount & Status */}
                    <div className="text-right shrink-0">
                      <p className="text-base font-bold text-[#4F7D5B]">
                        + {formatINR(p.amount, 2)}
                      </p>
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#4F7D5B] bg-[#E3EEE6] px-2 py-0.5 rounded-full mt-0.5">
                        <CheckCircle2 size={10} /> {p.status || 'SUCCESS'}
                      </span>
                    </div>
                  </div>

                  {/* Transaction Metadata Footer */}
                  <div className="mt-3 pt-2.5 border-t border-[#E8DCCB] flex items-center justify-between text-[11px] text-[#766B60] flex-wrap gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-1.5 py-0.5 rounded bg-[#F5F0E8] text-[#2F2923] font-bold uppercase text-[10px]">
                        {p.method || 'GATEWAY'}
                      </span>
                      {p.gateway_ref && (
                        <span className="font-mono text-[10px] text-[#766B60] bg-white border border-[#D2BFA7] px-1.5 py-0.5 rounded select-all">
                          Ref: {p.gateway_ref}
                        </span>
                      )}
                      <span className="text-[10px]">
                        {p.paid_by_type === 'CUSTOMER' ? 'Paid via Customer Portal' : 'Collected by Staff'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 text-[10px]">
                      <Calendar size={11} /> {formatDate(p.created_at)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
