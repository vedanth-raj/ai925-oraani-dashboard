import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, PackageCheck, Hammer, Search, ChevronRight, Loader2, PhoneCall } from 'lucide-react';
import { portalApi, type CatalogProduct, type CustomerAccount, type SilverRate } from '../api';
import { formatINR, formatGrams, sameNum } from '../pricing';
import { rateDateLabel } from '../components/PriceBreakdown';
import { type PurchaseMode, MODE_LABEL } from './cart';
import {
  FilterButton, FilterSheet, ActiveFilters, NO_FILTERS, activeFilterCount, singleSize, weightActive, type CatalogFilterState
} from './CatalogFilters';

export const ShopHome: React.FC<{ account: CustomerAccount; onChoose: (mode: PurchaseMode) => void; onBookCall: () => void }> = ({ account, onChoose, onBookCall }) => {
  const [rate, setRate] = useState<SilverRate | null>(null);
  const showReady = account.can_view_ready !== false;
  const showOrder = account.can_view_order !== false;

  useEffect(() => {
    if (!showReady && !showOrder) return;
    portalApi.getProducts({ mode: showReady ? 'ready' : 'order' }).then(res => setRate(res.silver_rate)).catch(() => {});
  }, [showReady, showOrder]);

  return (
    <div className="px-4 pt-5 pb-24">
      <p className="text-xs font-semibold text-[#766B60]">Welcome,</p>
      <h1 className="text-2xl font-bold text-[#2F2923] mb-4">{account.full_name}</h1>

      <div className="bg-[#2F2923] text-[#F5F0E8] rounded-2xl p-4 mb-5 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#D2BFA7]">Silver rate · {rateDateLabel(rate?.updated_at)}</p>
          <p className="text-2xl font-bold">{rate?.rate_per_gram ? formatINR(rate.rate_per_gram) : '—'}<span className="text-sm font-semibold text-[#D2BFA7]"> /g</span></p>
        </div>
        <p className="text-[10px] text-[#D2BFA7] text-right max-w-[120px]">Prices update automatically with the market</p>
      </div>

      <p className="text-[11px] font-bold text-[#766B60] uppercase tracking-wider mb-3">How would you like to buy?</p>
      <div className="space-y-3">
        {!showReady && !showOrder && (
          <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-4 text-xs text-[#766B60]">
            Buying is not open on your account yet. Please contact the seller, or book a call below.
          </div>
        )}
        {showReady && (
        <button
          onClick={() => onChoose('READY_STOCK')}
          className="w-full text-left bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-5 shadow-card hover:border-[#6B5744] active:scale-[0.99] transition-all flex items-center gap-4"
        >
          <div className="w-14 h-14 rounded-2xl bg-[#E3EEE6] text-[#4F7D5B] flex items-center justify-center shrink-0">
            <PackageCheck size={28} />
          </div>
          <div className="flex-1">
            <p className="text-lg font-bold text-[#2F2923]">Ready Stock</p>
            <p className="text-xs text-[#766B60]">Pieces available now, dispatched from our inventory.</p>
          </div>
          <ChevronRight className="text-[#B49A7A]" />
        </button>
        )}
        {showOrder && (
        <button
          onClick={() => onChoose('ON_ORDER')}
          className="w-full text-left bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-5 shadow-card hover:border-[#6B5744] active:scale-[0.99] transition-all flex items-center gap-4"
        >
          <div className="w-14 h-14 rounded-2xl bg-[#EFE8F7] text-[#6A4C93] flex items-center justify-center shrink-0">
            <Hammer size={28} />
          </div>
          <div className="flex-1">
            <p className="text-lg font-bold text-[#2F2923]">On Order Purchase</p>
            <p className="text-xs text-[#766B60]">Any size, made for you. Your request goes to our administrator.</p>
          </div>
          <ChevronRight className="text-[#B49A7A]" />
        </button>
        )}
        <button
          onClick={onBookCall}
          className="w-full text-left bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-5 shadow-card hover:border-[#6B5744] active:scale-[0.99] transition-all flex items-center gap-4"
        >
          <div className="w-14 h-14 rounded-2xl bg-[#FBE8DB] text-[#D97732] flex items-center justify-center shrink-0">
            <PhoneCall size={28} />
          </div>
          <div className="flex-1">
            <p className="text-lg font-bold text-[#2F2923]">Book a Call</p>
            <p className="text-xs text-[#766B60]">Get a customised order. Our team calls you to discuss your design.</p>
          </div>
          <ChevronRight className="text-[#B49A7A]" />
        </button>
      </div>
    </div>
  );
};

// Standard weights (g per piece) a product is offered in for a purchase type
function productWeights(p: CatalogProduct, mode: PurchaseMode): number[] {
  const list = mode === 'READY_STOCK'
    ? p.sizes.filter(s => s.stock_qty > 0).map(s => s.std_weight_g)
    : [...p.weight_options.map(o => o.std_weight_g), ...p.sizes.map(s => s.std_weight_g)];
  return list.filter((w, i) => w > 0 && list.findIndex(x => sameNum(x, w)) === i).sort((a, b) => a - b);
}

// Ready stock sizes across the listed products with the pieces on the shelf for each, smallest first
function readySizeTotals(products: CatalogProduct[]): { size: number; pieces: number }[] {
  const totals: { size: number; pieces: number }[] = [];
  for (const p of products) {
    for (const s of p.sizes) {
      if (s.stock_qty <= 0) continue;
      const hit = totals.find(t => sameNum(t.size, s.size_inches));
      if (hit) hit.pieces += s.stock_qty;
      else totals.push({ size: s.size_inches, pieces: s.stock_qty });
    }
  }
  return totals.sort((a, b) => a.size - b.size);
}

interface CatalogScreenProps {
  mode: PurchaseMode;
  onBack: () => void;
  onSelectProduct: (id: string, size?: number) => void;
}

export const CatalogScreen: React.FC<CatalogScreenProps> = ({ mode, onBack, onSelectProduct }) => {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [category, setCategory] = useState('All');
  const [filters, setFilters] = useState<CatalogFilterState>(NO_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true);
      portalApi.getProducts({ mode: mode === 'READY_STOCK' ? 'ready' : 'order', search, category })
        .then(res => {
          setProducts(res.products);
          setCategories(res.categories);
          setError(null);
        })
        .catch(err => setError(err.message || 'Failed to load products'))
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(t);
  }, [mode, search, category]);

  const isReady = mode === 'READY_STOCK';
  const sizes = useMemo(() => (isReady ? readySizeTotals(products) : []), [products, isReady]);
  const pickedSize = singleSize(filters);

  // Ready Stock: a product shows when one in-stock row fits both the weight and the size range.
  // On Order: only the weight narrows the list (any size can be made).
  const shown = useMemo(() => {
    const [wLo, wHi] = filters.weight;
    const inWeight = (w: number) => w >= wLo - 0.0001 && w <= wHi + 0.0001;
    const inSize = (v: number) => !filters.size || (v >= filters.size[0] - 0.0001 && v <= filters.size[1] + 0.0001);
    if (isReady) {
      if (!weightActive(filters) && !filters.size) return products;
      return products.filter(p => p.sizes.some(s => s.stock_qty > 0 && inWeight(s.std_weight_g) && inSize(s.size_inches)));
    }
    return weightActive(filters) ? products.filter(p => productWeights(p, mode).some(inWeight)) : products;
  }, [products, mode, isReady, filters]);

  return (
    <div className="px-4 pt-4 pb-24">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} className="w-10 h-10 rounded-full bg-[#FFFCF7] border border-[#D2BFA7] flex items-center justify-center" aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-[#2F2923]">{MODE_LABEL[mode]}</h1>
          <p className="text-xs text-[#766B60]">{mode === 'READY_STOCK' ? 'In stock now' : 'Any size, made to order'}</p>
        </div>
      </div>

      <div className="flex gap-2 mb-3">
        <div className="relative flex-1 min-w-0">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#766B60]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or SKU"
            aria-label="Search products"
            className="w-full h-[42px] pl-10 pr-4 bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl text-sm text-[#2F2923] placeholder-[#766B60] focus:outline-none focus:ring-1 focus:ring-[#6B5744]"
          />
        </div>
        <FilterButton count={activeFilterCount(filters)} onClick={() => setFilterOpen(true)} />
      </div>
      <ActiveFilters value={filters} onChange={setFilters} />
      <div className="flex gap-2 overflow-x-auto pb-1 mb-4 no-scrollbar">
        {['All', ...categories].map(c => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap ${
              category === c ? 'bg-[#6B5744] text-white' : 'bg-[#FFFCF7] border border-[#D2BFA7] text-[#2F2923]'
            }`}
          >
            {c}
          </button>
        ))}
      </div>


      {error && <p className="text-xs text-[#C94C4C] mb-3">{error}</p>}
      {loading && products.length === 0 ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-[#6B5744]" /></div>
      ) : shown.length === 0 ? (
        <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-6 text-center">
          <p className="text-sm font-semibold text-[#2F2923]">No products found</p>
          <p className="text-xs text-[#766B60] mt-1">
            {mode === 'READY_STOCK' ? 'Nothing matches in ready stock. Try On Order Purchase for any size.' : 'Try a different search.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {shown.map(p => (
            <button
              key={p.id}
              onClick={() => onSelectProduct(p.id, pickedSize)}
              className="text-left bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl overflow-hidden shadow-card hover:border-[#6B5744] active:scale-[0.99] transition-all"
            >
              {p.image_path ? (
                <img src={p.image_path} alt={p.name} className="w-full aspect-square object-cover bg-white" />
              ) : (
                <div className="w-full aspect-square bg-[#E8DCCB]/60 flex items-center justify-center text-[#6B5744] font-bold">AI925</div>
              )}
              <div className="p-2.5">
                <p className="text-sm font-bold text-[#2F2923] leading-snug line-clamp-2">{p.name}</p>
                {productWeights(p, mode).length > 0 && (
                  <p className="text-[10px] font-semibold text-[#6B5744] truncate">{productWeights(p, mode).map(w => formatGrams(w)).join(' · ')}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      <FilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        value={filters}
        onChange={setFilters}
        readySizes={isReady ? sizes : null}
        resultCount={shown.length}
      />
    </div>
  );
};
