import React, { useEffect, useState, useRef } from 'react';
import { Plus, Search, SlidersHorizontal, Edit3, Trash2, X, AlertTriangle, PackagePlus } from 'lucide-react';
import { AddInventorySheet } from '../components/AddInventorySheet';
import { BulkAddInventoryModal } from '../components/BulkAddInventoryModal';
import { api } from '../api';
import { useAuth } from '../auth';
import { formatINR } from '../pricing';

interface ProductsScreenProps {
  onNewProduct: () => void;
  onSelectProduct: (productId: string) => void;
  onEditProduct?: (productId: string) => void;
}

export const ProductsScreen: React.FC<ProductsScreenProps> = ({
  onNewProduct,
  onSelectProduct,
  onEditProduct
}) => {
  const { user, isAdmin, isBusinessAdmin } = useAuth();
  const isRep = user?.role === 'SALES_REP';
  // Business Administrators can add and modify products; only the System Administrator can delete
  const canManage = isAdmin || isBusinessAdmin;
  const [silverRate, setSilverRate] = useState<number | null>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  // Filter Sheet State
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [productStatus, setProductStatus] = useState<'Active' | 'Inactive' | 'All'>('Active');
  const [orderStatus, setOrderStatus] = useState<'Any' | 'OPEN' | 'IN_PROGRESS' | 'CLOSED'>('Any');

  // Long-press Product Action Modal State (Admin only)
  const [selectedActionProduct, setSelectedActionProduct] = useState<any | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // "Inv" button: add ready stock to a product
  const [inventoryProduct, setInventoryProduct] = useState<any | null>(null);
  const [showBulkInventory, setShowBulkInventory] = useState(false);
  const [inventoryNotice, setInventoryNotice] = useState<string | null>(null);

  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressTriggeredRef = useRef(false);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (selectedCategory !== 'All') params.category = selectedCategory;
      if (productStatus !== 'All') params.status = productStatus.toLowerCase();
      if (orderStatus !== 'Any') params.order_status = orderStatus;

      const res: any = await api.getProducts(params);
      setProducts(res.products || []);
      setSilverRate(res.silver_rate?.rate_per_gram ?? null);
    } catch (err) {
      console.error('Failed to fetch products:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api.getCategories().then(res => setCategories(res.categories || [])).catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProducts();
    }, 200);
    return () => clearTimeout(timer);
  }, [search, selectedCategory, productStatus, orderStatus]);

  // Long press event handlers for touch and mouse
  const handleTouchStart = (prod: any) => {
    if (!canManage) return;
    isLongPressTriggeredRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      isLongPressTriggeredRef.current = true;
      setSelectedActionProduct(prod);
    }, 550);
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleCardClick = (prod: any) => {
    if (isLongPressTriggeredRef.current) {
      isLongPressTriggeredRef.current = false;
      return;
    }
    onSelectProduct(prod.id);
  };

  const handleDeleteProduct = async () => {
    if (!selectedActionProduct) return;
    try {
      setDeleting(true);
      const res: any = await api.deleteProduct(selectedActionProduct.id);
      setConfirmDeleteOpen(false);
      setSelectedActionProduct(null);
      if (res?.archived) alert(res.message);
      fetchProducts();
    } catch (err: any) {
      alert(err.message || 'Failed to delete product');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="px-4 pt-4 pb-24 max-w-lg mx-auto select-none">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#2F2923]">
            Products
          </h1>
          {canManage && (
            <p className="text-[11px] text-[#766B60]">Long-press any product card to modify{isAdmin ? ' or delete' : ''}</p>
          )}
          {silverRate !== null && (
            <p className="text-[11px] font-semibold text-[#6B5744]">Silver today: {formatINR(silverRate)}/g · prices update automatically</p>
          )}
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowBulkInventory(true)}
              className="px-3 py-2 rounded-xl bg-[#FFFCF7] border border-[#6B5744] text-[#6B5744] hover:bg-[#6B5744] hover:text-white active:scale-95 text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
              title="Bulk Add Inventory for multiple products"
            >
              <PackagePlus size={16} />
              <span>Bulk Inventory</span>
            </button>
            <button
              onClick={onNewProduct}
              className="w-10 h-10 rounded-full bg-[#6B5744] hover:bg-[#5C4E43] active:scale-95 text-white flex items-center justify-center shadow-sm transition-transform cursor-pointer"
              title="Add New Product"
            >
              <Plus size={22} strokeWidth={2.4} />
            </button>
          </div>
        )}
      </div>

      {/* Search Input */}
      <div className="relative mb-3.5">
        <Search
          size={18}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#766B60]"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by product name or SKU"
          className="w-full pl-10 pr-4 py-2.5 bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl text-sm text-[#2F2923] placeholder-[#766B60] focus:outline-none focus:ring-1 focus:ring-[#6B5744]"
        />
      </div>

      {/* Filter Row: [Filters] button + Category Pills */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1 no-scrollbar">
        <button
          onClick={() => setFilterSheetOpen(true)}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-[#FFFCF7] border border-[#D2BFA7] text-[#2F2923] hover:bg-[#E8DCCB]/30 whitespace-nowrap cursor-pointer"
        >
          <SlidersHorizontal size={14} />
          <span>Filters</span>
        </button>

        <button
          onClick={() => setSelectedCategory('All')}
          className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
            selectedCategory === 'All'
              ? 'bg-[#6B5744] text-[#FFFCF7]'
              : 'bg-[#FFFCF7] border border-[#D2BFA7] text-[#2F2923] hover:bg-[#E8DCCB]/30'
          }`}
        >
          All
        </button>

        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setSelectedCategory(c.name)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              selectedCategory === c.name
                ? 'bg-[#6B5744] text-[#FFFCF7]'
                : 'bg-[#FFFCF7] border border-[#D2BFA7] text-[#2F2923] hover:bg-[#E8DCCB]/30'
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {/* Products Cards List */}
      {loading && products.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-7 h-7 border-2 border-[#6B5744] border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : products.length === 0 ? (
        <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-8 text-center mt-2">
          <p className="text-base font-semibold text-[#2F2923] mb-1">No products found</p>
          <p className="text-xs text-[#766B60] mb-4">Add your catalog items to get started</p>
          {canManage && (
            <button
              onClick={onNewProduct}
              className="px-4 py-2 bg-[#6B5744] text-white text-xs font-semibold rounded-xl cursor-pointer"
            >
              + Add Product
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {products.map((prod) => (
            <div
              key={prod.id}
              onClick={() => handleCardClick(prod)}
              onTouchStart={() => handleTouchStart(prod)}
              onTouchEnd={handleTouchEnd}
              onTouchCancel={handleTouchEnd}
              onMouseDown={() => handleTouchStart(prod)}
              onMouseUp={handleTouchEnd}
              onMouseLeave={handleTouchEnd}
              className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-4 shadow-card hover:border-[#6B5744]/60 active:scale-[0.99] transition-all cursor-pointer relative"
            >
              {/* Product Card with Square Thumbnail */}
              <div className="flex gap-3 mb-2">
                {prod.image_path ? (
                  <img
                    src={prod.image_path}
                    alt={prod.name}
                    className="w-16 h-16 aspect-square object-cover rounded-xl border border-[#D2BFA7] shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 aspect-square rounded-xl bg-[#E8DCCB]/60 border border-[#D2BFA7] flex items-center justify-center shrink-0 text-[#6B5744] font-bold text-xs uppercase">
                    AI925
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-base text-[#2F2923] truncate">
                        {prod.name}
                      </h3>
                      <p className="text-xs text-[#766B60] truncate">
                        {prod.sku} · {prod.category_name || 'Chains'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {canManage && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setInventoryProduct(prod); setInventoryNotice(null); }}
                          onMouseDown={(e) => e.stopPropagation()}
                          onTouchStart={(e) => e.stopPropagation()}
                          className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#6B5744] text-white tracking-wider uppercase"
                          title="Add inventory"
                        >
                          <PackagePlus size={12} /> Inv
                        </button>
                      )}
                      {prod.status === 'active' ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#E3EEE6] text-[#4F7D5B] tracking-wider uppercase">
                          ACTIVE
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#E8DCCB] text-[#766B60] tracking-wider uppercase">
                          INACTIVE
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Spec Tags (Strictly hide wire and endings for Sales Representatives) */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {!isRep && prod.wire_size && (
                  <span className="px-2.5 py-1 bg-[#E8DCCB]/60 rounded-md text-[11px] font-medium text-[#2F2923]">
                    Wire: {prod.wire_size}
                  </span>
                )}
                {!isRep && prod.endings && (
                  <span className="px-2.5 py-1 bg-[#E8DCCB]/60 rounded-md text-[11px] font-medium text-[#2F2923]">
                    Endings: {prod.endings}
                  </span>
                )}
                {prod.lock_type && (
                  <span className="px-2.5 py-1 bg-[#E8DCCB]/60 rounded-md text-[11px] font-medium text-[#2F2923]">
                    Lock: {prod.lock_type}
                  </span>
                )}
                <span className="px-2.5 py-1 bg-[#E8DCCB]/60 rounded-md text-[11px] font-medium text-[#2F2923]">
                  {prod.std_weight_per_20in}g / 20 in
                </span>
                {prod.variants?.length > 0 && (
                  <span className="px-2.5 py-1 bg-[#E3EEE6] rounded-md text-[11px] font-semibold text-[#4F7D5B]">
                    Ready: {prod.ready_stock} pcs · {prod.variants.length} sizes
                  </span>
                )}
              </div>

              {/* Live price from today's silver rate */}
              {prod.pricing && silverRate !== null && (
                <div className="flex items-center justify-between bg-[#F5F0E8] rounded-lg px-2.5 py-1.5 mb-3 text-[11px]">
                  <span className="text-[#766B60]">
                    Making {formatINR(prod.labour_per_gram || 0)}/g · incl. 3% GST
                  </span>
                  <span className="font-bold text-[#2F2923]">
                    {formatINR(prod.pricing.price_per_gram)}/g · {formatINR(prod.pricing.reference_piece_price, 0)}/pc
                  </span>
                </div>
              )}

              {/* Metrics Row */}
              <div className="grid grid-cols-4 gap-1 text-[11px] pt-2 border-t border-[#E8DCCB]">
                <div>
                  <span className="block text-[#766B60] font-semibold">ORDERS</span>
                  <span className="font-bold text-[#2F2923]">
                    {prod.total_orders_count || 0}
                  </span>
                </div>
                <div>
                  <span className="block text-[#766B60] font-semibold">ORDERED</span>
                  <span className="font-bold text-[#2F2923]">
                    {prod.total_ordered_pieces || 0}
                  </span>
                </div>
                <div>
                  <span className="block text-[#766B60] font-semibold">DELIVERED</span>
                  <span className="font-bold text-[#2F2923]">
                    {prod.total_delivered_pieces || 0}
                  </span>
                </div>
                <div>
                  <span className="block text-[#766B60] font-semibold">OUTSTANDING</span>
                  <span className="font-bold text-[#2F2923]">
                    {prod.total_outstanding_pieces || 0}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Bulk Inventory Modal (Requirement 11) */}
      {showBulkInventory && (
        <BulkAddInventoryModal
          onClose={() => setShowBulkInventory(false)}
          onSuccess={(message) => {
            setShowBulkInventory(false);
            setInventoryNotice(message);
            setTimeout(() => setInventoryNotice(null), 4000);
            fetchProducts();
          }}
        />
      )}

      {/* Long-Press Action Modal (System Administrator Only) */}
      {inventoryProduct && (
        <AddInventorySheet
          product={inventoryProduct}
          onClose={() => setInventoryProduct(null)}
          onSaved={(message) => { setInventoryProduct(null); setInventoryNotice(message); setTimeout(() => setInventoryNotice(null), 3500); fetchProducts(); }}
        />
      )}
      {inventoryNotice && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-[#2F2923] text-white text-xs font-semibold px-4 py-2.5 rounded-full shadow-lg" onClick={() => setInventoryNotice(null)} role="status">
          {inventoryNotice}
        </div>
      )}

      {selectedActionProduct && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-5 shadow-xl animate-in fade-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between mb-3 border-b border-[#E8DCCB] pb-3">
              <div>
                <h3 className="font-bold text-base text-[#2F2923]">{selectedActionProduct.name}</h3>
                <p className="text-xs text-[#766B60]">{selectedActionProduct.sku}</p>
              </div>
              <button
                onClick={() => setSelectedActionProduct(null)}
                className="p-1 text-[#766B60] hover:text-[#2F2923] rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-[#766B60] mb-4">{isAdmin ? 'Administrator' : 'Business Administrator'} Product Actions:</p>

            <div className="space-y-2">
              <button
                onClick={() => {
                  const pId = selectedActionProduct.id;
                  setSelectedActionProduct(null);
                  if (onEditProduct) {
                    onEditProduct(pId);
                  }
                }}
                className="w-full flex items-center gap-3 px-4 py-3 bg-[#F5F0E8] border border-[#D2BFA7] rounded-xl text-sm font-semibold text-[#2F2923] hover:bg-[#E8DCCB] transition-colors cursor-pointer"
              >
                <Edit3 size={18} className="text-[#6B5744]" />
                <span>Modify Product</span>
              </button>

              {isAdmin && (
                <button
                  onClick={() => setConfirmDeleteOpen(true)}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-[#FBE9E9] border border-[#C94C4C]/25 rounded-xl text-sm font-semibold text-[#C94C4C] hover:bg-[#F8D7D7] transition-colors cursor-pointer"
                >
                  <Trash2 size={18} />
                  <span>Delete Product</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Filter Bottom Sheet */}
      {filterSheetOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-lg bg-[#FFFCF7] border-t sm:border border-[#D2BFA7] rounded-t-3xl sm:rounded-2xl p-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#D2BFA7] mb-4">
              <div className="flex items-center gap-2">
                <SlidersHorizontal size={18} className="text-[#6B5744]" />
                <h3 className="font-bold text-base text-[#2F2923]">Filter Products</h3>
              </div>
              <button
                onClick={() => setFilterSheetOpen(false)}
                className="w-8 h-8 rounded-full bg-[#F5F0E8] border border-[#D2BFA7] flex items-center justify-center text-[#766B60] hover:text-[#2F2923] cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#766B60] mb-2">
                  Product Availability
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['Active', 'Inactive', 'All'] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setProductStatus(s)}
                      className={`py-2 px-3 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
                        productStatus === s
                          ? 'bg-[#6B5744] text-white border-[#6B5744]'
                          : 'bg-[#F5F0E8] text-[#2F2923] border-[#D2BFA7]'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#766B60] mb-2">
                  Order Status Link
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(['Any', 'OPEN', 'IN_PROGRESS', 'CLOSED'] as const).map((os) => (
                    <button
                      key={os}
                      onClick={() => setOrderStatus(os)}
                      className={`py-2 px-3 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
                        orderStatus === os
                          ? 'bg-[#6B5744] text-white border-[#6B5744]'
                          : 'bg-[#F5F0E8] text-[#2F2923] border-[#D2BFA7]'
                      }`}
                    >
                      {os === 'Any' ? 'Any Orders' : os.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 flex gap-2">
              <button
                onClick={() => {
                  setProductStatus('Active');
                  setOrderStatus('Any');
                  setSelectedCategory('All');
                  setFilterSheetOpen(false);
                }}
                className="flex-1 py-2.5 bg-[#F5F0E8] border border-[#D2BFA7] text-[#766B60] text-xs font-semibold rounded-xl cursor-pointer"
              >
                Reset All
              </button>
              <button
                onClick={() => setFilterSheetOpen(false)}
                className="flex-1 py-2.5 bg-[#6B5744] text-white text-xs font-semibold rounded-xl hover:bg-[#5C4E43] cursor-pointer"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDeleteOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-5 shadow-xl">
            <div className="w-12 h-12 rounded-full bg-[#FBE9E9] text-[#C94C4C] flex items-center justify-center mx-auto mb-3">
              <AlertTriangle size={24} />
            </div>
            <h3 className="text-base font-bold text-[#2F2923] text-center mb-1">Delete Product?</h3>
            <p className="text-xs text-[#766B60] text-center mb-4 leading-relaxed">
              Are you sure you want to delete <strong>{selectedActionProduct?.name}</strong>? If it has historical order records, it will be safely archived to protect inventory ledger history.
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
    </div>
  );
};
