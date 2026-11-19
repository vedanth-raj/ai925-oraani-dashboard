import React, { useEffect, useState } from 'react';
import { ArrowLeft, Search, Building2, ChevronRight } from 'lucide-react';
import { api } from '../api';

interface CompaniesScreenProps {
  onBack: () => void;
  onSelectCompany?: (companyName: string) => void;
}

export const CompaniesScreen: React.FC<CompaniesScreenProps> = ({
  onBack,
  onSelectCompany,
}) => {
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchCompanies = async () => {
    try {
      setLoading(true);
      const res = await api.getCompaniesSummary(search || undefined);
      setCompanies(res.companies || []);
    } catch (err) {
      console.error('Failed to load companies summary:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCompanies();
    }, 200);
    return () => clearTimeout(timer);
  }, [search]);

  return (
    <div className="pb-24 pt-4 px-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={onBack}
          className="w-10 h-10 rounded-full bg-[#FFFCF7] border border-[#D2BFA7] flex items-center justify-center text-[#2F2923] hover:bg-[#E8DCCB] transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-[#2F2923]">Companies</h1>
          <p className="text-xs text-[#766B60]">
            {companies.length} {companies.length === 1 ? 'business' : 'businesses'} registered
          </p>
        </div>
      </div>

      {/* Search Input */}
      <div className="relative mb-4">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#766B60]" size={18} />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search companies..."
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

      {/* Company Cards List */}
      {loading && companies.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-3 border-[#6B5744] border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : companies.length === 0 ? (
        <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl p-8 text-center mt-4">
          <Building2 className="mx-auto text-[#B49A7A] mb-2 opacity-50" size={36} />
          <p className="text-sm font-semibold text-[#2F2923]">No companies found</p>
          <p className="text-xs text-[#766B60] mt-1">
            {search ? 'Try adjusting your search query' : 'Customers will appear grouped by company here'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {companies.map((c, idx) => {
            const pocCount = Number(c.poc_count || 1);
            const ordersCount = Number(c.orders_count || 0);
            const orderedGrams = Number(c.total_ordered_grams || 0);
            const deliveredGrams = Number(c.total_delivered_grams || 0);
            const openOrders = Number(c.open_orders_count || 0);

            return (
              <div
                key={idx}
                onClick={() => onSelectCompany && onSelectCompany(c.company_name)}
                className={`bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl p-4 shadow-xs transition-all ${
                  onSelectCompany ? 'hover:border-[#B49A7A] active:bg-[#F5F0E8] cursor-pointer' : ''
                }`}
              >
                {/* Company Name & Location Meta */}
                <div className="flex items-start justify-between mb-3">
                  <div className="min-w-0">
                    <h3 className="font-bold text-base text-[#2F2923] leading-snug truncate">
                      {c.company_name}
                    </h3>
                    <div className="flex items-center gap-1.5 text-xs text-[#766B60] mt-0.5">
                      <span>{pocCount} {pocCount === 1 ? 'POC' : 'POCs'}</span>
                      {c.city && <span>· {c.city}</span>}
                      {c.zone && (
                        <span className="inline-block bg-[#E8DCCB] text-[#6B5744] px-1.5 py-0.2 rounded text-[10px] font-bold">
                          {c.zone}
                        </span>
                      )}
                    </div>
                  </div>
                  {onSelectCompany && <ChevronRight size={18} className="text-[#B49A7A] shrink-0" />}
                </div>

                {/* 4 KPI Metrics Grid (ORDERS, ORDERED (g), DELIVERED (g), OPEN) */}
                <div className="grid grid-cols-4 gap-2 pt-2 border-t border-[#E8DCCB]">
                  <div className="text-center">
                    <p className="text-[10px] font-bold text-[#766B60] uppercase tracking-wider">Orders</p>
                    <p className="text-xs font-bold text-[#2F2923] mt-0.5">{ordersCount}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] font-bold text-[#6B5744] uppercase tracking-wider">Ordered (g)</p>
                    <p className="text-xs font-bold text-[#6B5744] mt-0.5 truncate">
                      {orderedGrams.toFixed(1)}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] font-bold text-[#4F7D5B] uppercase tracking-wider">Delivered (g)</p>
                    <p className="text-xs font-bold text-[#4F7D5B] mt-0.5 truncate">
                      {deliveredGrams.toFixed(1)}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] font-bold text-[#C94C4C] uppercase tracking-wider">Open</p>
                    <p className="text-xs font-bold text-[#C94C4C] mt-0.5">{openOrders}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
