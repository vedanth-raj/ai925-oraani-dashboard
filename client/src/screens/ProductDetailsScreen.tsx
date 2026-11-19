import React, { useEffect, useState } from 'react';
import { ArrowLeft, BarChart3, SlidersHorizontal, Check, X, Edit3, Trash2, AlertTriangle, Copy, Loader2 } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { ReadyStockTable, WeightOptionsTable, OrderQtyTable } from '../components/ProductTables';
import { perGramAllIn, round2, tierMaking, baseMakingFor } from '../pricing';

interface ProductDetailsScreenProps {
  productId: string;
  onBack: () => void;
  onSelectOrder?: (orderId: string) => void;
  onEditProduct?: (productId: string) => void;
  onProductDeleted?: () => void;
}

export const ProductDetailsScreen: React.FC<ProductDetailsScreenProps> = ({
  productId,
  onBack,
  onSelectOrder,
  onEditProduct,
  onProductDeleted
}) => {
  const { user, isAdmin, isBusinessAdmin } = useAuth();
  const isRep = user?.role === 'SALES_REP';
  const canModify = isAdmin || isBusinessAdmin;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Tabs matching Image 16
  const [statusFilter, setStatusFilter] = useState<'All' | 'OPEN' | 'IN_PROGRESS' | 'CLOSED'>('All');
  const [activeTab, setActiveTab] = useState<'Orders' | 'Monthly' | 'Regions'>('Orders');

  // Bottom Sheets State
  const [sortSheetOpen, setSortSheetOpen] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [sortBy, setSortBy] = useState('Newest order first');

  // Delete Confirmation State
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [duplicating, setDuplicating] = useState(false);

  const fetchDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getProduct(productId);
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load product details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails();
  }, [productId]);

  const handleDeleteProduct = async () => {
    try {
      setDeleting(true);
      await api.deleteProduct(productId);
      setConfirmDeleteOpen(false);
      if (onProductDeleted) {
        onProductDeleted();
      } else {
        onBack();
      }
    } catch (err: any) {
      alert(err.message || 'Failed to delete product');
      setDeleting(false);
    }
  };

  // The copy opens in the edit form so its name, SKU and stock can be set before it goes live
  const handleDuplicate = async () => {
    try {
      setDuplicating(true);
      const res = await api.duplicateProduct(productId);
      onEditProduct?.(res.product.id);
    } catch (err: any) {
      alert(err.message || 'Failed to duplicate product');
    } finally {
      setDuplicating(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <div className="w-8 h-8 border-3 border-[#6B5744] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-[#C94C4C] mb-3">{error || 'Product not found'}</p>
        <button
          onClick={onBack}
          className="px-4 py-2 bg-[#6B5744] text-white rounded-xl text-sm font-medium cursor-pointer"
        >
          Back to Products
        </button>
      </div>
    );
  }

  const { product, kpis, history } = data;
  const variants = data.variants || [];
  const tiers = data.tiers || [];
  const weightOptions = data.weight_options || [];
  const silverRate: number | null = data.silver_rate?.rate_per_gram ?? null;
  // Products without ready stock rows show their overall stock as 20 in pieces at the 20 in standard weight
  const tableSizes = variants.length > 0
    ? variants
    : [{ std_weight_g: product.std_weight_per_20in || 20, size_inches: 20, weight_g: product.std_weight_per_20in || 20, stock_qty: Math.max(0, (product.physical_stock || 0) - (product.reserved_stock || 0)) }];
  const piecePrice = (std: number, weight: number) =>
    silverRate ? round2(perGramAllIn(silverRate, baseMakingFor(product.labour_per_gram || 0, weightOptions, std)) * weight) : null;

  // Filter history
  let filteredHistory = [...(history || [])];
  if (statusFilter !== 'All') {
    filteredHistory = filteredHistory.filter(h => h.status === statusFilter);
  }

  // Sort history
  if (sortBy === 'Newest order first') {
    filteredHistory.sort((a, b) => new Date(b.order_date).getTime() - new Date(a.order_date).getTime());
  } else if (sortBy === 'Oldest order first') {
    filteredHistory.sort((a, b) => new Date(a.order_date).getTime() - new Date(b.order_date).getTime());
  } else if (sortBy === 'Highest quantity ordered') {
    filteredHistory.sort((a, b) => b.requested_pieces - a.requested_pieces);
  } else if (sortBy === 'Lowest quantity ordered') {
    filteredHistory.sort((a, b) => a.requested_pieces - b.requested_pieces);
  } else if (sortBy === 'Highest remaining quantity') {
    filteredHistory.sort((a, b) => b.remaining_pieces - a.remaining_pieces);
  }

  return (
    <div className="min-h-screen bg-[#F5F0E8] pb-24 max-w-lg mx-auto">
      {/* Top Header */}
      <div className="sticky top-0 z-20 bg-[#F5F0E8]/95 backdrop-blur-xs px-4 py-3 border-b border-[#D2BFA7]/40 flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-base font-semibold text-[#2F2923] hover:text-[#6B5744] cursor-pointer"
        >
          <ArrowLeft size={20} />
          <span className="truncate max-w-[200px]">{product.name}</span>
        </button>

        {/* Product Actions: Modify (System & Business Admin) & Delete (System Admin only) */}
        {canModify && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleDuplicate}
              disabled={duplicating}
              title="Duplicate Product"
              className="h-9 px-2.5 rounded-xl bg-[#FFFCF7] border border-[#D2BFA7] text-[#6B5744] hover:bg-[#E8DCCB] flex items-center justify-center gap-1 text-xs font-semibold transition-all cursor-pointer shadow-xs active:scale-95 disabled:opacity-60"
            >
              {duplicating ? <Loader2 size={15} className="animate-spin" /> : <Copy size={15} />} Duplicate
            </button>
            <button
              onClick={() => onEditProduct && onEditProduct(productId)}
              title="Modify Product"
              className="w-9 h-9 rounded-xl bg-[#FFFCF7] border border-[#D2BFA7] text-[#6B5744] hover:bg-[#E8DCCB] flex items-center justify-center transition-all cursor-pointer shadow-xs active:scale-95"
            >
              <Edit3 size={17} />
            </button>
            {isAdmin && (<button
              onClick={() => setConfirmDeleteOpen(true)}
              title="Delete Product"
              className="w-9 h-9 rounded-xl bg-[#FBE9E9] border border-[#C94C4C]/30 text-[#C94C4C] hover:bg-[#C94C4C] hover:text-white flex items-center justify-center transition-all cursor-pointer shadow-xs active:scale-95"
            >
              <Trash2 size={17} />
            </button>)}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {confirmDeleteOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-5 shadow-xl">
            <div className="w-12 h-12 rounded-full bg-[#FBE9E9] text-[#C94C4C] flex items-center justify-center mx-auto mb-3">
              <AlertTriangle size={24} />
            </div>
            <h3 className="text-base font-bold text-[#2F2923] text-center mb-1">Delete Product?</h3>
            <p className="text-xs text-[#766B60] text-center mb-4 leading-relaxed">
              Are you sure you want to delete <strong>{product.name}</strong>? If this product has historical orders, it will be safely archived to protect inventory ledger history.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDeleteOpen(false)}
                className="flex-1 py-2.5 bg-[#F5F0E8] border border-[#D2BFA7] text-[#2F2923] text-xs font-semibold rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteProduct}
                disabled={deleting}
                className="flex-1 py-2.5 bg-[#C94C4C] text-white text-xs font-semibold rounded-xl hover:bg-[#A83838] transition-colors cursor-pointer"
              >
                {deleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="px-4 pt-4 space-y-4">
        {/* Prominent Square Product Image */}
        {product.image_path && (
          <div className="w-full aspect-square rounded-2xl overflow-hidden border border-[#D2BFA7] shadow-card bg-white">
            <img
              src={product.image_path}
              alt={product.name}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Product Spec Card matching Screenshot Image 16 */}
        <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-5 shadow-card">
          <h2 className="text-2xl font-bold text-[#2F2923]">
            {product.name}
          </h2>
          <p className="text-xs text-[#766B60] mb-4">
            {product.sku} · {product.category_name || 'Chains'} · {product.status === 'active' ? 'Active' : 'Inactive'}
          </p>

<p className="text-[11px] text-[#766B60] pt-3 border-t border-[#E8DCCB]">
            {weightOptions.length} standard weight{weightOptions.length === 1 ? '' : 's'} · {variants.reduce((t: number, v: any) => t + v.stock_qty, 0)} pcs in ready stock
          </p>
        </div>

        {/* Ready stock window, standard weights and order quantity pricing */}
        <div className="space-y-3">
          <label className="block text-xs font-bold tracking-wider text-[#766B60] uppercase">Ready Stock & Pricing</label>
          <ReadyStockTable
            rows={tableSizes}
            priceFor={r => piecePrice(r.std_weight_g, r.weight_g)}
            note={variants.length === 0 ? 'No ready stock rows yet: overall stock shown as 20 in pieces.' : 'Price per piece before quantity slabs, incl. 3% GST.'}
          />
          <WeightOptionsTable
            rows={weightOptions}
            columns={data.weight_columns || []}
            showInternal={!isRep}
            pricePerPiece={r => piecePrice(r.std_weight_g, r.std_weight_g)}
          />
          <OrderQtyTable
            rows={tiers.map((t: any) => ({ min_qty: t.min_qty, max_qty: t.max_qty, qty_unit: t.qty_unit, making: tierMaking(t), order_type: t.order_type }))}
          />
        </div>

        {/* 4 KPI Cards matching Screenshot Image 16 */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[#E8DCCB]/50 border border-[#D2BFA7] rounded-2xl p-4 shadow-card">
            <span className="block text-[10px] font-bold tracking-wider text-[#766B60] uppercase">
              ORDERS
            </span>
            <span className="text-2xl font-bold text-[#2F2923]">
              {kpis.orders_count || 0}
            </span>
            <span className="block text-xs text-[#766B60]">
              {kpis.customers_count || 0} customers
            </span>
          </div>

          <div className="bg-[#E8DCCB]/50 border border-[#D2BFA7] rounded-2xl p-4 shadow-card">
            <span className="block text-[10px] font-bold tracking-wider text-[#766B60] uppercase">
              ORDERED
            </span>
            <span className="text-2xl font-bold text-[#2F2923]">
              {kpis.ordered_pieces || 0} pcs
            </span>
            <span className="block text-xs text-[#766B60]">
              {(kpis.expected_weight || 0).toFixed(2)}g expected
            </span>
          </div>

          <div className="bg-[#E8DCCB]/50 border border-[#D2BFA7] rounded-2xl p-4 shadow-card">
            <span className="block text-[10px] font-bold tracking-wider text-[#766B60] uppercase">
              DELIVERED
            </span>
            <span className="text-2xl font-bold text-[#2F2923]">
              {kpis.delivered_pieces || 0} pcs
            </span>
            <span className="block text-xs text-[#766B60]">
              {(kpis.delivered_weight || 0).toFixed(2)}g actual
            </span>
          </div>

          <div className="bg-[#E8DCCB]/50 border border-[#D2BFA7] rounded-2xl p-4 shadow-card">
            <span className="block text-[10px] font-bold tracking-wider text-[#766B60] uppercase">
              REMAINING
            </span>
            <span className="text-2xl font-bold text-[#2F2923]">
              {kpis.remaining_pieces || 0} pcs
            </span>
            <span className="block text-xs text-[#766B60]">
              {(kpis.remaining_est_weight || 0).toFixed(2)}g est.
            </span>
          </div>
        </div>

        {/* Status Filter Pills matching Screenshot Image 16 */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          {[
            { key: 'All', label: `All (${kpis.orders_count || 0})` },
            { key: 'OPEN', label: '• Open' },
            { key: 'IN_PROGRESS', label: '• In Progress' },
            { key: 'CLOSED', label: '• Closed' }
          ].map((pill) => {
            const isActive = statusFilter === pill.key;
            return (
              <button
                key={pill.key}
                onClick={() => setStatusFilter(pill.key as any)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-[#6B5744] text-[#FFFCF7]'
                    : 'bg-[#FFFCF7] border border-[#D2BFA7] text-[#2F2923]'
                }`}
              >
                {pill.label}
              </button>
            );
          })}
        </div>

        {/* View Tabs & Action Buttons Bar matching Screenshot Image 16 */}
        <div className="flex items-center justify-between gap-2">
          {/* Sub Tabs: [Orders] [Monthly] [Regions] */}
          <div className="flex-1 bg-[#E8DCCB]/60 p-1 rounded-2xl flex">
            {['Orders', 'Monthly', 'Regions'].map((tab) => {
              const isSelected = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab as any)}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-xl transition-all ${
                    isSelected
                      ? 'bg-[#FFFCF7] text-[#2F2923] shadow-xs'
                      : 'text-[#766B60] hover:text-[#2F2923]'
                  }`}
                >
                  {tab}
                </button>
              );
            })}
          </div>

          {/* Action icon buttons: Bar chart & Filter slider buttons */}
          <button
            onClick={() => setSortSheetOpen(true)}
            className="w-10 h-10 bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl flex items-center justify-center text-[#2F2923] hover:bg-[#E8DCCB]/40 shadow-xs"
          >
            <BarChart3 size={18} />
          </button>
          <button
            onClick={() => setFilterSheetOpen(true)}
            className="w-10 h-10 bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl flex items-center justify-center text-[#2F2923] hover:bg-[#E8DCCB]/40 shadow-xs"
          >
            <SlidersHorizontal size={18} />
          </button>
        </div>

        {/* History Order Cards List matching Screenshot Image 15 */}
        <div className="space-y-3">
          {filteredHistory.map((item: any, idx: number) => (
            <div
              key={idx}
              onClick={() => onSelectOrder && onSelectOrder(item.order_id)}
              className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-4 shadow-card hover:border-[#6B5744] cursor-pointer transition-colors"
            >
              {/* Card Header: Order # and Status Badge */}
              <div className="flex items-center justify-between mb-1">
                <span className="text-xl font-bold text-[#2F2923]">
                  {item.order_number}
                </span>
                {item.status === 'IN_PROGRESS' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FBE8DB] text-[#D97732]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#D97732]"></span>
                    In Progress
                  </span>
                )}
                {item.status === 'OPEN' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FBE9E9] text-[#C94C4C]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#C94C4C]"></span>
                    Open
                  </span>
                )}
                {item.status === 'CLOSED' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#E3EEE6] text-[#4F7D5B]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#4F7D5B]"></span>
                    Closed
                  </span>
                )}
              </div>

              <p className="text-xs text-[#766B60] mb-2">{item.order_date}</p>

              <p className="font-bold text-sm text-[#2F2923]">
                {item.company_name}
              </p>
              <p className="text-xs text-[#766B60]">
                {item.poc_name} · {item.customer_phone}
              </p>
              <p className="text-xs text-[#766B60] mb-3">
                {item.customer_city} · {item.customer_zone}
              </p>

              <p className="text-xs font-medium text-[#766B60] mb-2">
                {product.name} · {product.sku}
              </p>

              {/* Size Table matching Screenshot Image 15 */}
              <div className="overflow-x-auto mb-3">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#E8DCCB] text-[#766B60] font-semibold">
                      <th className="pb-1">SIZE</th>
                      <th className="pb-1 text-center">ORDERED</th>
                      <th className="pb-1 text-center">DELIVERED</th>
                      <th className="pb-1 text-right">REMAINING</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="text-[#2F2923]">
                      <td className="py-2 font-medium">{item.size_inches} in</td>
                      <td className="py-2 text-center">{item.requested_pieces}</td>
                      <td className="py-2 text-center">{item.delivered_pieces}</td>
                      <td className="py-2 text-right font-medium">{item.remaining_pieces}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Summary line matching Screenshot Image 15 */}
              <div className="grid grid-cols-3 gap-1 pt-2 border-t border-[#E8DCCB] text-[11px]">
                <div>
                  <span className="block text-[#766B60] font-semibold">ORDERED</span>
                  <span className="font-bold text-[#2F2923]">{item.requested_pieces} pcs</span>
                  <span className="block text-[10px] text-[#766B60]">{(item.expected_weight || 0).toFixed(2)}g exp.</span>
                </div>
                <div>
                  <span className="block text-[#766B60] font-semibold">DELIVERED</span>
                  <span className="font-bold text-[#2F2923]">{item.delivered_pieces} pcs</span>
                  <span className="block text-[10px] text-[#766B60]">{(item.actual_delivered_weight || 0).toFixed(2)}g actual</span>
                </div>
                <div>
                  <span className="block text-[#766B60] font-semibold">REMAINING</span>
                  <span className="font-bold text-[#2F2923]">{item.remaining_pieces} pcs</span>
                  <span className="block text-[10px] text-[#766B60]">
                    {Math.max(0, (item.expected_weight || 0) - (item.actual_delivered_weight || 0)).toFixed(2)}g est.
                  </span>
                </div>
              </div>

              {item.last_delivery_date && (
                <p className="text-[11px] text-[#766B60] mt-2 pt-2 border-t border-[#E8DCCB]/50">
                  Last delivery: {item.last_delivery_date}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* SORT HISTORY BOTTOM SHEET matching Screenshot Image 11 */}
      {sortSheetOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex flex-col justify-end">
          <div className="bg-[#FFFCF7] rounded-t-3xl border-t border-[#D2BFA7] max-h-[85vh] flex flex-col max-w-lg mx-auto w-full shadow-sheet p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-[#2F2923]">Sort History</h3>
              <button onClick={() => setSortSheetOpen(false)} className="text-[#2F2923]">
                <X size={20} />
              </button>
            </div>

            <div className="divide-y divide-[#E8DCCB]">
              {[
                'Newest order first',
                'Oldest order first',
                'Highest quantity ordered',
                'Lowest quantity ordered',
                'Highest remaining quantity'
              ].map((opt) => (
                <button
                  key={opt}
                  onClick={() => {
                    setSortBy(opt);
                    setSortSheetOpen(false);
                  }}
                  className="w-full py-3.5 flex items-center justify-between text-left text-sm font-medium text-[#2F2923] hover:bg-[#F5F0E8] px-2 rounded-lg"
                >
                  <span>{opt}</span>
                  {sortBy === opt && <Check size={18} className="text-[#6B5744]" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* FILTER HISTORY BOTTOM SHEET matching Screenshot Image 14 */}
      {filterSheetOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex flex-col justify-end">
          <div className="bg-[#FFFCF7] rounded-t-3xl border-t border-[#D2BFA7] max-h-[85vh] flex flex-col max-w-lg mx-auto w-full shadow-sheet p-5 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-[#2F2923]">Filter History</h3>
              <button onClick={() => setFilterSheetOpen(false)} className="text-[#2F2923]">
                <X size={20} />
              </button>
            </div>

            {/* DATE RANGE pills matching Image 14 */}
            <div className="mb-4">
              <label className="block text-xs font-bold text-[#766B60] uppercase mb-2">
                DATE RANGE
              </label>
              <div className="flex flex-wrap gap-2">
                {['All time', 'This month', 'Last 3 months', 'This year'].map((d) => (
                  <button
                    key={d}
                    className="px-4 py-1.5 rounded-full text-xs font-semibold bg-[#6B5744] text-[#FFFCF7]"
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            {/* SIZE (INCHES) pills matching Image 14 */}
            <div className="mb-6">
              <label className="block text-xs font-bold text-[#766B60] uppercase mb-2">
                SIZE (INCHES)
              </label>
              <div className="flex flex-wrap gap-2">
                {['Any', '18 in', '20 in', '22 in'].map((sz) => (
                  <button
                    key={sz}
                    className="px-4 py-1.5 rounded-full text-xs font-semibold bg-[#FFFCF7] border border-[#D2BFA7] text-[#2F2923]"
                  >
                    {sz}
                  </button>
                ))}
              </div>
            </div>

            {/* Action buttons matching Image 14 */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setFilterSheetOpen(false)}
                className="flex-1 py-3 bg-[#E8DCCB] text-[#2F2923] font-semibold rounded-2xl"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => setFilterSheetOpen(false)}
                className="flex-1 py-3 bg-[#6B5744] text-white font-semibold rounded-2xl"
              >
                Show Results
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
