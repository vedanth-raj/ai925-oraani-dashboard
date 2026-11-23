import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Minus, Plus, ShoppingBag, Send, CheckCircle2, Loader2, PackageX, Trash2, AlertCircle, Scale } from 'lucide-react';
import { portalApi, type CatalogProduct, type SilverRate } from '../api';
import { useCustomerSession } from './customerSession';
import { PriceBreakdown } from '../components/PriceBreakdown';
import { ImageCarousel } from '../components/ImageCarousel';
import { SlabPriceStrip, WeightSlabStrip } from '../components/ProductTables';
import {
  makingFor, priceBreakdown, unitWeightFor, perGramAllIn, baseMakingFor, tiersForMode, sameNum, round2, addBreakdowns, weightSlabsFor,
  STANDARD_INCHES, MIN_ORDER_INCHES, MAX_ORDER_INCHES, formatINR, formatGrams, applyStatePremium
} from '../pricing';
import { type CartLine, type PurchaseMode, MODE_LABEL, productQty, productGrams, stdGrams, sameLine } from './cart';

interface ProductScreenProps {
  productId: string;
  mode: PurchaseMode;
  cartLines: CartLine[];
  onBack: () => void;
  onAddToCart: (lines: CartLine[]) => void;
  onSwitchMode: (mode: PurchaseMode) => void;
  onGoToCart: () => void;
  initialSize?: number; // size picked in the Ready Stock size filter
  canBuyOnOrder?: boolean; // false when an administrator has closed On Order for this customer
}

// One line in the Pieces Container: standard weight × size × pieces
interface Row {
  std: number;
  size: number;
  pieces: number;
}

// Prices refresh on their own so a silver rate change reaches an open page
const RATE_REFRESH_MS = 60_000;

// Standard weights a customer can pick: in-stock ready rows for Ready Stock; every saved weight for On Order
function weightChoices(product: CatalogProduct, mode: PurchaseMode): number[] {
  const set: number[] = [];
  const add = (w: number) => { if (w > 0 && !set.some(x => sameNum(x, w))) set.push(w); };
  if (mode === 'READY_STOCK') {
    product.sizes.filter(s => s.stock_qty > 0).forEach(s => add(s.std_weight_g));
  } else {
    product.weight_options.forEach(o => add(o.std_weight_g));
    product.sizes.forEach(s => add(s.std_weight_g));
  }
  return set.sort((a, b) => a - b);
}

// Sizes offered (for one weight, or the whole product): in-stock ready rows, or for On Order the standard inches plus listed sizes
function sizeChoices(product: CatalogProduct, mode: PurchaseMode, std?: number, keep?: number): number[] {
  const rows = std !== undefined ? product.sizes.filter(s => sameNum(s.std_weight_g, std)) : product.sizes;
  const list = mode === 'READY_STOCK'
    ? rows.filter(s => s.stock_qty > 0).map(s => s.size_inches)
    : [...STANDARD_INCHES, ...rows.map(s => s.size_inches)];
  if (keep !== undefined) list.push(keep);
  return list.filter((v, i) => list.findIndex(x => sameNum(x, v)) === i).sort((a, b) => a - b);
}

export const ProductScreen: React.FC<ProductScreenProps> = ({
  productId, mode, cartLines, onBack, onAddToCart, onSwitchMode, onGoToCart, initialSize, canBuyOnOrder = true
}) => {
  const { account } = useCustomerSession();
  const statePremiumPct = account?.state_premium_pct || 0;
  const [product, setProduct] = useState<CatalogProduct | null>(null);
  const [rate, setRate] = useState<SilverRate | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Section above: size first, then weight, then quantity
  const [stagedSize, setStagedSize] = useState<number>(20);
  const [stagedStd, setStagedStd] = useState<number>(20);
  const [stagingPieces, setStagingPieces] = useState('1');
  const [stagingWeight, setStagingWeight] = useState('');
  const [lastChanged, setLastChanged] = useState<'pieces' | 'weight'>('pieces');
  const [qtyError, setQtyError] = useState<string | null>(null);

  // Pieces Container: empty until the customer adds from the section above
  const [rows, setRows] = useState<Row[]>([]);
  const [rowInputs, setRowInputs] = useState<Record<number, string>>({});

  const [otherSize, setOtherSize] = useState<string | null>(null);
  const [otherSizeError, setOtherSizeError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const [showAddedModal, setShowAddedModal] = useState(false);

  const [requestOpen, setRequestOpen] = useState(false);
  const [requestQty, setRequestQty] = useState('1');
  const [requestNotes, setRequestNotes] = useState('');
  const [requestBusy, setRequestBusy] = useState(false);
  const [requestDone, setRequestDone] = useState<string | null>(null);

  useEffect(() => {
    portalApi.getProduct(productId, mode)
      .then(res => {
        const p = res.product;
        setProduct(p);
        setRate(res.silver_rate);
        // A size picked in the Ready Stock filter comes first, then a weight stocked in that size
        const picked = initialSize !== undefined && sizeChoices(p, mode).some(v => sameNum(v, initialSize)) ? initialSize : undefined;
        const weights = weightChoices(p, mode);
        const weightsForSize = picked === undefined ? [] : weights.filter(w => sizeChoices(p, mode, w).some(v => sameNum(v, picked)));
        const std = weightsForSize[0] ?? weights[0] ?? p.std_weight_per_20in ?? 20;
        const sizes = sizeChoices(p, mode, std);
        setStagedStd(std);
        const finalSize = picked ?? (sizes.some(v => sameNum(v, 20)) ? 20 : sizes[0] ?? 20);
        setStagedSize(finalSize);
        const initPw = unitWeightFor(p.sizes, p.std_weight_per_20in, finalSize, std);
        setStagingPieces('1');
        setStagingWeight(initPw > 0 ? parseFloat(initPw.toFixed(2)).toString() : '');
        setLastChanged('pieces');
        setRows([]);
        setRowInputs({});
      })
      .catch(err => setError(err.message || 'Failed to load product'));
  }, [productId, mode, initialSize]);

  // Keep the silver rate (and stock) current while the page is open
  useEffect(() => {
    const timer = setInterval(() => {
      portalApi.getProduct(productId, mode)
        .then(res => { setProduct(res.product); setRate(res.silver_rate); })
        .catch(() => {});
    }, RATE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [productId, mode]);

  const stds = useMemo(() => (product ? weightChoices(product, mode) : []), [product, mode]);

  if (error) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-[#C94C4C] mb-3">{error}</p>
        <button onClick={onBack} className="px-4 py-2 bg-[#6B5744] text-white rounded-xl text-sm">Back</button>
      </div>
    );
  }
  if (!product) {
    return <div className="flex justify-center py-24"><Loader2 className="animate-spin text-[#6B5744]" /></div>;
  }

  const isReady = mode === 'READY_STOCK';
  const silverRate = rate?.rate_per_gram ?? null;
  const rateNum = silverRate || 0;
  const pieceWeight = (std: number, size: number) => unitWeightFor(product.sizes, product.std_weight_per_20in, size, std);

  const inCartFor = (std: number, size: number) =>
    cartLines.filter(l => sameLine(l, { product_id: product.id, std_weight_g: std, size_inches: size })).reduce((s, l) => s + l.pieces, 0);
  const stockFor = (std: number, size: number) => {
    const row = product.sizes.find(s => sameNum(s.std_weight_g, std) && sameNum(s.size_inches, size));
    return row ? row.stock_qty : 0;
  };
  const inRowsFor = (std: number, size: number) =>
    rows.filter(r => sameNum(r.std, std) && sameNum(r.size, size)).reduce((s, r) => s + r.pieces, 0);
  // Ready stock the customer sees counts down as pieces go into the Pieces Container or the cart; the shelf
  // itself only changes once an order is checked out
  const leftFor = (std: number, size: number) => Math.max(0, stockFor(std, size) - inCartFor(std, size) - inRowsFor(std, size));
  const maxFor = (r: Row) => (isReady ? Math.max(0, stockFor(r.std, r.size) - inCartFor(r.std, r.size)) : 9999);

  const readyEmpty = isReady && stds.length === 0;
  const stagedLeft = leftFor(stagedStd, stagedSize);
  const stagedUnavailable = isReady && stagedLeft <= 0;

  // Making charge comes from the slab once these rows join the cart
  const rowGrams = (r: Row) => pieceWeight(r.std, r.size) * r.pieces;
  const newPieces = rows.reduce((s, r) => s + r.pieces, 0);
  const piecesAfter = productQty(cartLines, product.id) + newPieces;
  const gramsAfter = productGrams(cartLines, product) + rows.reduce((s, r) => s + rowGrams(r), 0);
  const stdGramsAfter = (std: number) =>
    stdGrams(cartLines, product, std) + rows.filter(r => sameNum(r.std, std)).reduce((s, r) => s + rowGrams(r), 0);

  const priced = rows.map((r, i) => {
    const unitWeight = pieceWeight(r.std, r.size);
    const { labour, mrp, tier, weightSlab } = makingFor(product, r.std, mode, piecesAfter, gramsAfter, stdGramsAfter(r.std), statePremiumPct);
    const short = isReady && r.pieces > maxFor(r);
    return { row: r, index: i, unitWeight, labour, mrp, tier, weightSlab, short, breakdown: priceBreakdown(unitWeight * r.pieces, rateNum, labour, 0) };
  });
  const total = addBreakdowns(priced.map(p => p.breakdown));
  const anyShort = priced.some(p => p.short);
  const labours = Array.from(new Set(priced.map(p => p.labour)));

  const syncWeightAndPieces = (std: number, size: number, currentLastChanged = lastChanged) => {
    const pw = unitWeightFor(product.sizes, product.std_weight_per_20in, size, std);
    if (pw <= 0) return;
    if (currentLastChanged === 'weight' && parseFloat(stagingWeight) > 0) {
      const targetW = parseFloat(stagingWeight);
      const calcPieces = Math.max(1, Math.round(targetW / pw));
      const cap = isReady ? Math.max(1, leftFor(std, size)) : 9999;
      setStagingPieces(String(Math.min(cap, calcPieces)));
    } else {
      const pcs = stagedQty();
      setStagingWeight(parseFloat((pcs * pw).toFixed(2)).toString());
    }
  };

  // Weight first: keep the size when that weight offers it (Ready Stock: with pieces left), else its first size
  const chooseWeight = (w: number) => {
    setStagedStd(w);
    setQtyError(null);
    const sizes = sizeChoices(product, mode, w);
    const keeps = sizes.some(v => sameNum(v, stagedSize)) && (!isReady || leftFor(w, stagedSize) > 0);
    const nextSize = keeps ? stagedSize : ((isReady ? sizes.find(v => leftFor(w, v) > 0) : undefined) ?? sizes[0] ?? 20);
    if (!keeps && sizes.length > 0) setStagedSize(nextSize);
    syncWeightAndPieces(w, nextSize);
  };

  const chooseSize = (inch: number) => {
    setStagedSize(inch);
    setQtyError(null);
    syncWeightAndPieces(stagedStd, inch);
  };

  const stagedQty = () => Math.max(1, parseInt(stagingPieces, 10) || 1);

  const updatePieces = (newPieces: number) => {
    const pw = pieceWeight(stagedStd, stagedSize);
    const cap = isReady ? Math.max(1, stagedLeft) : 9999;
    const bounded = Math.min(cap, Math.max(1, newPieces));
    setStagingPieces(String(bounded));
    setLastChanged('pieces');
    setQtyError(null);
    if (pw > 0) {
      setStagingWeight(parseFloat((bounded * pw).toFixed(2)).toString());
    }
  };

  const handlePiecesInput = (val: string) => {
    const pw = pieceWeight(stagedStd, stagedSize);
    const clean = val.replace(/\D/g, '');
    setStagingPieces(clean);
    setLastChanged('pieces');
    setQtyError(null);
    const n = parseInt(clean, 10);
    if (n > 0 && pw > 0) {
      setStagingWeight(parseFloat((n * pw).toFixed(2)).toString());
    }
  };

  const handlePiecesBlur = () => {
    const n = parseInt(stagingPieces, 10);
    if (!(n >= 1)) {
      updatePieces(1);
    }
  };

  const applyTargetWeight = (val: string | number) => {
    const pw = pieceWeight(stagedStd, stagedSize);
    const str = String(val);
    setStagingWeight(str);
    setLastChanged('weight');
    setQtyError(null);

    const num = parseFloat(str);
    if (num > 0 && pw > 0) {
      // Dual-input auto calculation: 200g / pieceWeight = quantity
      const calcPieces = Math.max(1, Math.round(num / pw));
      const cap = isReady ? Math.max(1, stagedLeft) : 9999;
      if (isReady && calcPieces > stagedLeft) {
        setQtyError(stagedLeft > 0 
          ? `Stock limit: only ${stagedLeft} pcs available in ${stagedSize}" (${formatGrams(stagedLeft * pw)})` 
          : `No pieces left in ${stagedSize}"`
        );
      }
      setStagingPieces(String(Math.min(cap, calcPieces)));
    }
  };

  const handleWeightInput = (val: string) => {
    const clean = val.replace(/[^0-9.]/g, '');
    applyTargetWeight(clean);
  };

  const handleWeightBlur = () => {
    const pw = pieceWeight(stagedStd, stagedSize);
    const num = parseFloat(stagingWeight);
    if (!(num > 0)) {
      const pcs = stagedQty();
      if (pw > 0) {
        setStagingWeight(parseFloat((pcs * pw).toFixed(2)).toString());
      }
    }
  };

  // Quantity box → Pieces Container (merges into an existing weight × size row)
  const addStagedToPieces = () => {
    const pcs = stagedQty();
    if (isReady && pcs > stagedLeft) {
      setQtyError(stagedLeft > 0 ? `Only ${stagedLeft} pcs left in ${stagedSize}"` : `No pieces left in ${stagedSize}"`);
      return;
    }
    const existing = rows.findIndex(r => sameNum(r.std, stagedStd) && sameNum(r.size, stagedSize));
    if (existing !== -1) {
      const next = rows[existing].pieces + pcs;
      setRows(rows.map((r, i) => (i === existing ? { ...r, pieces: next } : r)));
      setRowInputs(prev => ({ ...prev, [existing]: String(next) }));
    } else {
      setRows([...rows, { std: stagedStd, size: stagedSize, pieces: pcs }]);
      setRowInputs(prev => ({ ...prev, [rows.length]: String(pcs) }));
    }
    setStagingPieces('1');
    const pw = pieceWeight(stagedStd, stagedSize);
    if (pw > 0) {
      setStagingWeight(parseFloat((1 * pw).toFixed(2)).toString());
    }
    setLastChanged('pieces');
    setQtyError(null);
    setRequestDone(null);
  };

  const setRowPieces = (index: number, pieces: number) => {
    setRequestDone(null);
    setRows(rows.map((r, i) => (i === index ? { ...r, pieces } : r)));
  };

  const removeRow = (index: number) => {
    const next = rows.filter((_, i) => i !== index);
    setRows(next);
    setRowInputs(Object.fromEntries(next.map((r, i) => [i, String(r.pieces)])));
  };

  const applyOtherSize = () => {
    const v = Math.round(parseFloat(otherSize || '') * 10) / 10;
    if (!(v >= MIN_ORDER_INCHES && v <= MAX_ORDER_INCHES)) {
      setOtherSizeError(`Enter a size between ${MIN_ORDER_INCHES} and ${MAX_ORDER_INCHES} inches`);
      return;
    }
    setStagedSize(v);
    setOtherSize(null);
    setOtherSizeError(null);
    syncWeightAndPieces(stagedStd, v);
  };

  // Add to cart takes everything in the Pieces Container (or the quantity box when the container is empty), then empties it
  const stagedFits = !isReady || stagedQty() <= stagedLeft;
  const canAdd = !anyShort && silverRate !== null && (rows.length > 0 || (!stagedUnavailable && stagedFits));
  const handleAdd = () => {
    if (!canAdd) return;
    const items = rows.length > 0 ? rows : [{ std: stagedStd, size: stagedSize, pieces: stagedQty() }];

    // Requirement 7: Enforce MOQ in grams based on pricing slabs for On Order
    if (mode === 'ON_ORDER') {
      const distinctStds = Array.from(new Set(items.map(r => r.std)));
      for (const std of distinctStds) {
        const slabs = weightSlabsFor(product.weight_options, std, mode);
        if (slabs.length > 0) {
          const slabMoqG = slabs[0].min_g;
          const totalGramsForStd = items
            .filter(r => sameNum(r.std, std))
            .reduce((s, r) => s + pieceWeight(r.std, r.size) * r.pieces, 0);
          if (totalGramsForStd < slabMoqG) {
            setQtyError(`Minimum order weight for standard weight ${formatGrams(std)} is ${slabMoqG}g (Current: ${formatGrams(totalGramsForStd)}). Please increase pieces.`);
            return;
          }
        }
      }
    }

    onAddToCart(items.map(r => ({
      product_id: product.id,
      name: product.name,
      sku: product.sku,
      image_path: product.image_path,
      std_weight_g: r.std,
      size_inches: r.size,
      pieces: r.pieces
    })));
    setRows([]);
    setRowInputs({});
    setStagingPieces('1');
    setQtyError(null);
    setAdded(true);
    setShowAddedModal(true);
    setTimeout(() => setAdded(false), 2500);
  };

  const submitRequest = async () => {
    setRequestBusy(true);
    try {
      const res = await portalApi.requestStock({
        product_id: product.id,
        size_inches: stagedSize,
        quantity: parseInt(requestQty, 10) || 1,
        notes: [`Standard weight ${stagedStd} g`, requestNotes.trim()].filter(Boolean).join(' · ')
      });
      setRequestDone(res.message);
      setRequestOpen(false);
      setRequestNotes('');
    } catch (err: any) {
      alert(err.message || 'Could not send request');
    } finally {
      setRequestBusy(false);
    }
  };

  // Discount card: priced on what Add to cart would take (the container, or the quantity box while it is empty)
  const previewRows = rows.length > 0 ? rows : [{ std: stagedStd, size: stagedSize, pieces: stagedQty() }];
  const previewStdGrams = stdGrams(cartLines, product, stagedStd)
    + previewRows.filter(r => sameNum(r.std, stagedStd)).reduce((t, r) => t + rowGrams(r), 0);
  const previewMaking = makingFor(
    product, stagedStd, mode,
    productQty(cartLines, product.id) + previewRows.reduce((t, r) => t + r.pieces, 0),
    productGrams(cartLines, product) + previewRows.reduce((t, r) => t + rowGrams(r), 0),
    previewStdGrams,
    statePremiumPct
  );

  const cell = 'px-1.5 py-2.5';
  const boxCls = 'w-11 px-1 py-1.5 bg-[#FFFCF7] border border-[#D2BFA7] rounded-full text-xs font-semibold text-[#2F2923] text-center focus:outline-none focus:ring-1 focus:ring-[#6B5744]';
  const chipOn = 'bg-[#6B5744] text-white border-[#6B5744] shadow-xs';
  const chipOff = 'bg-[#FFFCF7] text-[#2F2923] border-[#D2BFA7] hover:border-[#6B5744]/60';
  const baseMaking = round2(applyStatePremium(baseMakingFor(product.labour_per_gram, product.weight_options, stagedStd), statePremiumPct));
  const currentWeightSlabs = weightSlabsFor(product.weight_options, stagedStd, mode);
  const displayedWeightSlabs = currentWeightSlabs.map(sl => ({
    ...sl,
    making: round2(applyStatePremium(sl.making, statePremiumPct))
  }));

  const displayedTiers = (tiersForMode(product.tiers, mode) || []).map(t => ({
    ...t,
    price_per_gram: round2(applyStatePremium(t.price_per_gram, statePremiumPct)),
    discount_price_per_gram: t.discount_price_per_gram !== null ? round2(applyStatePremium(t.discount_price_per_gram, statePremiumPct)) : null
  }));
  const stagedPieceWeight = pieceWeight(stagedStd, stagedSize);
  const stagedStdMoqGrams = (mode === 'ON_ORDER' && currentWeightSlabs.length > 0) ? currentWeightSlabs[0].min_g : 0;

  return (
    <div className="pb-48">
      <div className="sticky top-0 z-20 bg-[#F5F0E8]/95 backdrop-blur-xs px-4 py-3 border-b border-[#D2BFA7]/40 flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1.5 text-base font-semibold text-[#2F2923]">
          <ArrowLeft size={20} />
          <span className="truncate max-w-[220px]">{product.name}</span>
        </button>
        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-[#6B5744] text-white">{MODE_LABEL[mode]}</span>
      </div>

      <div className="px-4 pt-4 space-y-4">
        <ImageCarousel
          images={product.image_paths && product.image_paths.length > 0 ? product.image_paths : product.image_path ? [product.image_path] : []}
          video={product.video_path}
          alt={product.name}
        />
        <div>
          <h1 className="text-lg font-bold text-[#2F2923] leading-snug">{product.name}</h1>
          <p className="text-xs text-[#766B60]">{product.category_name || 'Chains'}</p>
          <p className="text-sm font-bold text-[#2F2923] mt-2">
            {formatINR(round2(perGramAllIn(rateNum, baseMaking)))}
            <span className="text-xs font-semibold text-[#766B60]">/g incl. GST</span>
          </p>
          <p className="text-[11px] text-[#766B60]">Making {formatINR(baseMaking)}/g at {formatGrams(stagedStd)}</p>
        </div>

        {product.description && product.description !== 'Imported via CSV' && (
          <p className="text-xs text-[#766B60]">{product.description}</p>
        )}

        {readyEmpty ? (
          <div className="bg-[#FFFCF7] border border-[#C94C4C]/30 rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <PackageX size={22} className="text-[#C94C4C] shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-bold text-[#2F2923]">Nothing in ready stock right now</p>
                <p className="text-xs text-[#766B60]">{canBuyOnOrder ? 'Buy it On Order in any size instead.' : 'Please check back later.'}</p>
              </div>
            </div>
            {canBuyOnOrder && (
              <button onClick={() => onSwitchMode('ON_ORDER')} className="mt-3 w-full py-2.5 bg-[#6B5744] text-white rounded-xl text-xs font-bold">Buy On Order</button>
            )}
          </div>
        ) : (
          <>
            {/* Standard weight (per 20-inch piece) */}
            <div>
              <p className="text-[11px] font-bold text-[#766B60] uppercase tracking-wider mb-2">Standard Weight (in 20 inch)</p>
              <div className="flex flex-wrap gap-2">
                {stds.map(w => {
                  const active = sameNum(w, stagedStd);
                  return (
                    <button
                      key={w}
                      onClick={() => chooseWeight(w)}
                      aria-pressed={active}
                      className={`min-w-[60px] px-3 py-2 rounded-xl text-xs font-bold border transition-all ${active ? chipOn : chipOff}`}
                    >
                      {formatGrams(w)}
                    </button>
                  );
                })}
              </div>

              {/* Thickness shown under the standard weight to the customers */}
              <div className="mt-2.5 flex items-center gap-2 text-xs bg-[#FFFCF7] border border-[#D2BFA7] px-3.5 py-1.5 rounded-xl w-fit shadow-xs">
                <span className="font-semibold text-[#766B60]">Thickness:</span>
                <span className="font-bold text-[#2F2923]">
                  {product.weight_options?.find(o => sameNum(o.std_weight_g, stagedStd))?.thickness || product.thickness || '2.0 mm'}
                </span>
              </div>
            </div>

            {/* Sizes of that weight: piece weight, and (Ready Stock) pieces left, counting down as pieces are added */}
            <div>
              <p className="text-[11px] font-bold text-[#766B60] uppercase tracking-wider mb-2">Select Size (inches)</p>
              <div className="flex flex-wrap gap-2">
                {sizeChoices(product, mode, stagedStd, stagedSize).map(inch => {
                  const active = sameNum(inch, stagedSize);
                  const left = isReady ? leftFor(stagedStd, inch) : 0;
                  return (
                    <button
                      key={inch}
                      onClick={() => chooseSize(inch)}
                      aria-pressed={active}
                      aria-label={`${inch} inch, ${formatGrams(pieceWeight(stagedStd, inch))}${isReady ? `, ${left} left` : ''}`}
                      className={`min-w-[76px] px-3 py-2 rounded-2xl border text-center transition-all ${
                        active ? chipOn : isReady && left <= 0 ? 'bg-[#F5F0E8] text-[#766B60]/70 border-dashed border-[#D2BFA7]' : chipOff
                      }`}
                    >
                      <span className="block text-sm font-bold leading-tight">{inch}"</span>
                      <span className="block text-xs font-bold leading-tight">{formatGrams(pieceWeight(stagedStd, inch))}</span>
                      {isReady && (
                        <span className={`block text-[10px] font-semibold ${active ? 'text-white/80' : left > 0 ? 'text-[#4F7D5B]' : 'text-[#C94C4C]'}`}>
                          {left > 0 ? `${left} left` : 'Nil'}
                        </span>
                      )}
                    </button>
                  );
                })}
                {mode === 'ON_ORDER' && otherSize === null && (
                  <button
                    onClick={() => { setOtherSize(''); setOtherSizeError(null); }}
                    className="min-w-[76px] px-3 py-2 rounded-2xl text-xs font-bold border border-dashed border-[#6B5744] text-[#6B5744] bg-[#FFFCF7]"
                  >
                    Other size
                  </button>
                )}
              </div>
              {mode === 'ON_ORDER' && otherSize !== null && (
                <div className="mt-3 flex items-center gap-2">
                  <input
                    autoFocus
                    type="number"
                    inputMode="decimal"
                    min={MIN_ORDER_INCHES}
                    max={MAX_ORDER_INCHES}
                    step="0.5"
                    value={otherSize}
                    onChange={e => { setOtherSize(e.target.value); setOtherSizeError(null); }}
                    onKeyDown={e => { if (e.key === 'Enter') applyOtherSize(); if (e.key === 'Escape') setOtherSize(null); }}
                    placeholder="e.g. 17"
                    aria-label="Size in inches"
                    className="w-24 px-3 py-2 bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl text-sm font-bold text-center focus:outline-none focus:ring-1 focus:ring-[#6B5744]"
                  />
                  <span className="text-xs text-[#766B60]">inches</span>
                  <button onClick={applyOtherSize} className="px-3 py-2 bg-[#6B5744] text-white rounded-xl text-xs font-bold">Use size</button>
                  <button onClick={() => { setOtherSize(null); setOtherSizeError(null); }} className="px-2 py-2 text-xs font-semibold text-[#766B60]">Cancel</button>
                </div>
              )}
              {otherSizeError && <p className="text-[11px] font-semibold text-[#C94C4C] mt-1">{otherSizeError}</p>}
            </div>

            {/* Quantity & Weight Dual Selection */}
            <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-3.5 shadow-card space-y-3">
              <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[#E8DCCB]/60">
                <div>
                  <div className="flex items-center gap-1.5">
                    <Scale size={16} className="text-[#6B5744]" />
                    <p className="text-base font-bold text-[#2F2923] leading-tight">Quantity & Weight</p>
                  </div>
                  <p className="text-[11px] text-[#766B60] mt-0.5">
                    1 pc = <strong>{formatGrams(stagedPieceWeight)}</strong> ({stagedSize}")
                    {isReady && <span className="ml-1 text-[#4F7D5B] font-semibold">· {stagedLeft} in stock</span>}
                  </p>
                </div>
                <button
                  onClick={addStagedToPieces}
                  disabled={stagedUnavailable}
                  className="shrink-0 px-3 py-2 bg-[#6B5744] hover:bg-[#584534] disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-all shadow-xs"
                >
                  <Plus size={14} /> Add Product
                </button>
              </div>

              {/* Dual Input: Pieces <-> Target Weight */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* 1. By Pieces */}
                <div className="bg-[#FAF7F2] border border-[#E8DCCB] rounded-xl p-2.5 flex items-center justify-between">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-[#766B60]">Quantity</label>
                    <span className="text-xs font-bold text-[#2F2923]">Pieces (pcs)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => updatePieces(stagedQty() - 1)}
                      className="w-8 h-8 shrink-0 rounded-full bg-[#FFFCF7] border border-[#D2BFA7] flex items-center justify-center text-[#2F2923] hover:bg-[#F5F0E8] transition-all"
                      aria-label="Decrease pieces"
                    >
                      <Minus size={15} />
                    </button>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={stagingPieces}
                      onChange={e => handlePiecesInput(e.target.value)}
                      onBlur={handlePiecesBlur}
                      className="w-14 h-8 text-center text-sm font-bold bg-[#FFFCF7] border border-[#D2BFA7] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#6B5744]"
                      aria-label="Pieces quantity"
                    />
                    <button
                      type="button"
                      onClick={() => updatePieces(stagedQty() + 1)}
                      className="w-8 h-8 shrink-0 rounded-full bg-[#FFFCF7] border border-[#D2BFA7] flex items-center justify-center text-[#2F2923] hover:bg-[#F5F0E8] transition-all"
                      aria-label="Increase pieces"
                    >
                      <Plus size={15} />
                    </button>
                  </div>
                </div>

                {/* 2. By Target Weight */}
                <div className="bg-[#FAF7F2] border border-[#E8DCCB] rounded-xl p-2.5 flex items-center justify-between">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-[#766B60]">Target Weight</label>
                    <span className="text-xs font-medium text-[#766B60]">Auto-sets pcs</span>
                  </div>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="e.g. 200"
                      value={stagingWeight}
                      onChange={e => handleWeightInput(e.target.value)}
                      onBlur={handleWeightBlur}
                      className="w-24 h-8 pr-6 pl-2 text-right text-sm font-bold bg-[#FFFCF7] border border-[#D2BFA7] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#6B5744]"
                      aria-label="Target weight in grams"
                    />
                    <span className="absolute right-2 text-xs font-bold text-[#766B60] pointer-events-none">g</span>
                  </div>
                </div>
              </div>

              {/* Quick Weight Presets & Calculation Summary */}
              <div className="flex items-center justify-between gap-2 pt-0.5 flex-wrap">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-semibold text-[#766B60]">Quick weight:</span>
                  {[50, 100, 200, 500, 1000].map(g => {
                    const isActive = sameNum(parseFloat(stagingWeight), g);
                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() => applyTargetWeight(g)}
                        className={`px-2 py-0.5 text-[11px] font-bold rounded-md border transition-all ${
                          isActive
                            ? 'bg-[#6B5744] text-white border-[#6B5744]'
                            : 'bg-[#FFFCF7] border-[#D2BFA7] text-[#6B5744] hover:bg-[#F5F0E8]'
                        }`}
                      >
                        {g >= 1000 ? `${g / 1000}kg` : `${g}g`}
                      </button>
                    );
                  })}
                </div>
                <div className="text-[11px] font-semibold text-[#6B5744] bg-[#F5F0E8] px-2.5 py-1 rounded-lg border border-[#D2BFA7]/40">
                  Total: <strong>{stagedQty()} pcs</strong> ≈ {formatGrams(stagedPieceWeight * stagedQty())}
                </div>
              </div>

              {mode === 'ON_ORDER' && stagedStdMoqGrams > 0 && (
                <div className="pt-2 border-t border-[#E8DCCB] flex items-center justify-between text-[11px] text-[#766B60]">
                  <span className="flex items-center gap-1 text-[#6B5744] font-semibold">
                    <AlertCircle size={13} className="text-[#B49A7A]" />
                    Slab MOQ: <strong>{stagedStdMoqGrams}g</strong> ({Math.ceil(stagedStdMoqGrams / (stagedPieceWeight || 1))} pcs in {stagedSize}")
                  </span>
                  <span className={`font-bold ${previewStdGrams >= stagedStdMoqGrams ? 'text-[#4F7D5B]' : 'text-[#C94C4C]'}`}>
                    Selected: {formatGrams(previewStdGrams)}
                  </span>
                </div>
              )}
              {qtyError && <p className="text-[11px] font-semibold text-[#C94C4C] mt-1">{qtyError}</p>}
            </div>

            {/* Get discount: the slab in force for what Add to cart would take */}
            {currentWeightSlabs.length > 0 ? (
              <WeightSlabStrip
                title={`Get discount- ${formatGrams(stagedStd)}`}
                slabs={displayedWeightSlabs}
                silverRate={silverRate}
                baseMaking={previewMaking.mrp}
                netGrams={previewStdGrams}
                activeSlab={previewMaking.weightSlab}
              />
            ) : (
              <SlabPriceStrip
                title={`Get discount- ${formatGrams(stagedStd)}`}
                tiers={displayedTiers}
                silverRate={silverRate}
                baseMaking={previewMaking.mrp}
                pieceWeight={stagedPieceWeight}
                activeTier={previewMaking.tier}
              />
            )}

            {stagedUnavailable && (
              <div className="bg-[#FFFCF7] border border-[#C94C4C]/30 rounded-2xl p-4">
                <div className="flex items-start gap-3">
                  <PackageX size={22} className="text-[#C94C4C] shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-bold text-[#2F2923]">{formatGrams(stagedPieceWeight)} ({stagedSize}") has no pieces left in ready stock</p>
                    <p className="text-xs text-[#766B60]">
                      {inCartFor(stagedStd, stagedSize) + inRowsFor(stagedStd, stagedSize) > 0 ? 'The rest are already in your Pieces Container or cart. ' : ''}
                      Ask the seller to arrange it{canBuyOnOrder ? ', or buy it On Order' : ''}.
                    </p>
                  </div>
                </div>
                {requestDone ? (
                  <p className="mt-3 text-xs font-semibold text-[#4F7D5B] flex items-center gap-1.5"><CheckCircle2 size={14} /> {requestDone}</p>
                ) : (
                  <div className={`grid ${canBuyOnOrder ? 'grid-cols-2' : 'grid-cols-1'} gap-2 mt-3`}>
                    <button onClick={() => setRequestOpen(true)} className="py-2.5 bg-[#6B5744] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5">
                      <Send size={14} /> Request Sellers
                    </button>
                    {canBuyOnOrder && (
                      <button onClick={() => onSwitchMode('ON_ORDER')} className="py-2.5 bg-[#FFFCF7] border border-[#D2BFA7] text-[#2F2923] rounded-xl text-xs font-bold">
                        Buy On Order
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Pieces Container: empty at first; filled only from the quantity box; emptied by Add to cart */}
        {!readyEmpty && (
          <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl shadow-card overflow-hidden">
            <div className="px-4 pt-4 pb-3 border-b border-[#E8DCCB]">
              <p className="text-base font-bold text-[#2F2923]">Pieces Container ({rows.length})</p>
              <p className="text-[11px] text-[#766B60]">{rows.length === 0 ? 'Empty initially · Add products from above' : 'Selected items in this configuration'}</p>
            </div>

            {rows.length === 0 ? (
              <p className="px-6 py-6 text-center text-xs text-[#766B60] leading-relaxed">
                Pieces container is currently empty. Select size and weight above, then tap <strong className="text-[#2F2923]">"Add Product"</strong> to build your order list.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#F5F0E8] text-[10px] uppercase text-[#766B60]">
                      <th className={`${cell} text-left font-bold whitespace-nowrap`}>Standard Wt.</th>
                      <th className={`${cell} text-left font-bold`}>Size</th>
                      <th className={`${cell} text-left font-bold`}>Pc.</th>
                      <th className={`${cell} text-left font-bold`}>Qty.</th>
                      <th className={`${cell} text-left font-bold`}>Making</th>
                      <th className={`${cell} text-right font-bold`}>Price</th>
                      <th className={cell}><span className="sr-only">Remove</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {priced.map(p => {
                      const r = p.row;
                      return (
                        <tr key={`${r.std}-${r.size}`} className="border-t border-[#E8DCCB] text-[#2F2923]">
                          <td className={`${cell} font-bold whitespace-nowrap`}>{formatGrams(r.std)}</td>
                          <td className={`${cell} font-semibold`}>{r.size}"</td>
                          <td className={cell}>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={rowInputs[p.index] ?? String(r.pieces)}
                              onChange={e => {
                                const val = e.target.value.replace(/\D/g, '');
                                setRowInputs(prev => ({ ...prev, [p.index]: val }));
                                const n = parseInt(val, 10);
                                if (n > 0) setRowPieces(p.index, n);
                              }}
                              onBlur={() => {
                                const n = Math.max(1, parseInt(rowInputs[p.index] || '0', 10) || 1);
                                setRowInputs(prev => ({ ...prev, [p.index]: String(n) }));
                                setRowPieces(p.index, n);
                              }}
                              className={`${boxCls} ${p.short ? 'border-[#C94C4C] text-[#C94C4C]' : ''}`}
                              aria-label={`Pieces of ${formatGrams(r.std)} at ${r.size} inch`}
                            />
                          </td>
                          <td className={`${cell} font-semibold whitespace-nowrap`}>{formatGrams(p.unitWeight * r.pieces)}</td>
                          <td className={`${cell} whitespace-nowrap`}>{formatINR(p.labour)}/g</td>
                          <td className={`${cell} text-right font-bold whitespace-nowrap`}>{silverRate ? formatINR(p.breakdown.total, 0) : '—'}</td>
                          <td className={`${cell} pl-0`}>
                            <button onClick={() => removeRow(p.index)} className="w-6 h-6 rounded-md text-[#C94C4C]/80 hover:bg-[#FBE9E9] flex items-center justify-center" aria-label="Remove row" title="Remove row">
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {anyShort && (
              <div className="px-4 py-3 border-t border-[#E8DCCB] space-y-1">
                {priced.filter(p => p.short).map(p => (
                  <p key={`${p.row.std}-${p.row.size}`} className="text-[11px] font-semibold text-[#C94C4C]">
                    {formatGrams(p.row.std)} × {p.row.size}": only {maxFor(p.row)} pcs available{inCartFor(p.row.std, p.row.size) > 0 ? ' (the rest are in your cart)' : ''}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {rows.length > 0 && (
          <PriceBreakdown
            breakdown={total}
            silverRate={silverRate}
            labourPerGram={labours.length === 1 ? labours[0] : null}
            rateDate={rate?.updated_at}
            title={`Price for ${newPieces} pc${newPieces === 1 ? '' : 's'}`}
            lines={priced.map(p => ({
              key: `${p.row.std}-${p.row.size}`,
              label: `${formatGrams(p.unitWeight)} (${p.row.size}") · ${p.row.pieces} pc${p.row.pieces === 1 ? '' : 's'}`,
              breakdown: p.breakdown,
              labour: p.labour
            }))}
          />
        )}
      </div>

      {/* Add to cart bar, kept above the bottom navigation */}
      {!readyEmpty && (
        <div className="fixed above-nav left-1/2 -translate-x-1/2 w-full max-w-lg z-30 px-4 pb-2">
          {added ? (
            <button onClick={onGoToCart} className="w-full py-3.5 bg-[#4F7D5B] text-white font-bold rounded-2xl shadow-lg flex items-center justify-center gap-2">
              <CheckCircle2 size={18} /> Added · View cart
            </button>
          ) : (
            <button
              onClick={handleAdd}
              disabled={!canAdd}
              className="w-full py-3.5 bg-[#6B5744] hover:bg-[#584534] disabled:opacity-50 text-white font-bold rounded-2xl shadow-lg flex items-center justify-center gap-2"
            >
              <ShoppingBag size={18} /> Add to cart · {formatINR(rows.length > 0 ? total.total : priceBreakdown(stagedPieceWeight * stagedQty(), rateNum, baseMaking).total)}
            </button>
          )}
        </div>
      )}

      {requestOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setRequestOpen(false)}>
          <div className="w-full max-w-md bg-[#FFFCF7] border border-[#D2BFA7] rounded-t-3xl sm:rounded-2xl p-5" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-base text-[#2F2923]">Request from seller</h3>
            <p className="text-xs text-[#766B60] mb-4">{product.name} · {formatGrams(stagedPieceWeight)} × {stagedSize}"</p>
            <label className="block text-[11px] font-bold text-[#766B60] uppercase mb-1" htmlFor="req-qty">Quantity (pcs)</label>
            <input id="req-qty" type="number" min="1" value={requestQty} onChange={e => setRequestQty(e.target.value)}
              className="w-full px-3 py-2.5 bg-[#F5F0E8] border border-[#D2BFA7] rounded-xl text-sm mb-3" />
            <label className="block text-[11px] font-bold text-[#766B60] uppercase mb-1" htmlFor="req-notes">Note (optional)</label>
            <textarea id="req-notes" rows={2} value={requestNotes} onChange={e => setRequestNotes(e.target.value)} placeholder="e.g. needed by next week"
              className="w-full px-3 py-2 bg-[#F5F0E8] border border-[#D2BFA7] rounded-xl text-sm mb-4" />
            <div className="flex gap-2">
              <button onClick={() => setRequestOpen(false)} className="flex-1 py-3 bg-[#F5F0E8] border border-[#D2BFA7] rounded-xl text-sm font-semibold">Cancel</button>
              <button disabled={requestBusy} onClick={submitRequest} className="flex-1 py-3 bg-[#6B5744] text-white rounded-xl text-sm font-bold flex items-center justify-center gap-1.5">
                {requestBusy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Send request
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Green Add-to-Cart Confirmation Pop-up Modal (Requirement 8) */}
      {showAddedModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#FFFCF7] border-2 border-[#4F7D5B] rounded-3xl p-6 text-center shadow-2xl">
            <div className="w-16 h-16 rounded-full bg-[#E3EEE6] text-[#4F7D5B] flex items-center justify-center mx-auto mb-4 border-2 border-[#4F7D5B]/30">
              <CheckCircle2 size={36} className="text-[#4F7D5B]" />
            </div>
            <div className="inline-block px-3 py-1 rounded-full bg-[#E3EEE6] text-[#4F7D5B] text-xs font-bold uppercase tracking-wider mb-2">
              Added to Cart
            </div>
            <h3 className="text-xl font-bold text-[#2F2923] mb-1">{product.name}</h3>
            <p className="text-xs text-[#766B60] mb-5">
              Successfully added to your <span className="font-semibold text-[#2F2923]">{MODE_LABEL[mode]}</span> cart.
            </p>
            <div className="space-y-2.5">
              <button
                onClick={() => { setShowAddedModal(false); onGoToCart(); }}
                className="w-full py-3.5 bg-[#4F7D5B] hover:bg-[#3f6449] text-white font-bold rounded-2xl shadow-md flex items-center justify-center gap-2 text-sm transition-all"
              >
                <ShoppingBag size={18} /> View Cart & Checkout
              </button>
              <button
                onClick={() => setShowAddedModal(false)}
                className="w-full py-3 bg-[#F5F0E8] hover:bg-[#E8DCCB] text-[#2F2923] font-bold rounded-2xl border border-[#D2BFA7] text-sm transition-all"
              >
                Continue Shopping
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
