import React, { useEffect, useMemo, useState } from 'react';
import { Minus, Plus, Trash2, ShoppingBag, AlertTriangle, Loader2 } from 'lucide-react';
import { portalApi, type CatalogProduct, type DeliveryQuote, type PaymentOptions, type SilverRate, type WeightSlabDiscount } from '../api';
import { PriceBreakdown } from '../components/PriceBreakdown';
import { DummyPaymentModal } from '../components/DummyPaymentModal';
import { formatINR, round2, MIN_ORDER_GRAMS } from '../pricing';
import { type Carts, type CartLine, type PurchaseMode, MODE_LABEL, priceCart } from './cart';
import { useCustomerSession } from './customerSession';

interface CartScreenProps {
  carts: Carts;
  initialMode: PurchaseMode;
  onChange: (mode: PurchaseMode, lines: CartLine[]) => void;
  onShop: (mode: PurchaseMode) => void;
  onOrderPlaced: () => void;
}

export const CartScreen: React.FC<CartScreenProps> = ({ carts, initialMode, onChange, onShop, onOrderPlaced }) => {
  const { account } = useCustomerSession();
  const statePremiumPct = account?.state_premium_pct || 0;
  const [mode, setMode] = useState<PurchaseMode>(carts[initialMode].length > 0 || carts.ON_ORDER.length === 0 ? initialMode : 'ON_ORDER');
  const [products, setProducts] = useState<Record<string, CatalogProduct>>({});
  const [slabDiscounts, setSlabDiscounts] = useState<WeightSlabDiscount[]>([]);
  const [rate, setRate] = useState<SilverRate | null>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState('');
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placedOrder, setPlacedOrder] = useState<{ order: any; options: PaymentOptions } | null>(null);
  const [delivery, setDelivery] = useState<DeliveryQuote | null>(null);

  // Re-read products when the cart opens and every minute, so prices follow the silver rate and live stock
  useEffect(() => {
    const load = () => portalApi.getProducts({ mode: 'order' })
      .then(res => {
        const map: Record<string, CatalogProduct> = {};
        res.products.forEach(p => { map[p.id] = p; });
        setProducts(map);
        setRate(res.silver_rate);
        if (res.weight_slab_discounts) {
          setSlabDiscounts(res.weight_slab_discounts);
        }
      })
      .catch(err => setError(err.message || 'Failed to load prices'))
      .finally(() => setLoading(false));
    load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, []);

  const lines = carts[mode];
  const silverRate = rate?.rate_per_gram ?? 0;
  const priced = useMemo(() => priceCart(lines, products, silverRate, mode, statePremiumPct, slabDiscounts), [lines, products, silverRate, mode, statePremiumPct, slabDiscounts]);
  const goodsTotal = priced.total.total;

  // Delivery charge for the customer's PIN code at this order value (the server charges the same at checkout)
  useEffect(() => {
    if (lines.length === 0) {
      setDelivery(null);
      return;
    }
    const t = setTimeout(() => {
      portalApi.deliveryQuote(goodsTotal).then(res => setDelivery(res.delivery)).catch(() => setDelivery(null));
    }, 300);
    return () => clearTimeout(t);
  }, [goodsTotal, lines.length]);
  const deliveryCharge = delivery ? delivery.charge : 0;
  const payable = round2(goodsTotal + deliveryCharge);

  const setPieces = (idx: number, pieces: number) => {
    onChange(mode, lines.map((l, i) => (i === idx ? { ...l, pieces: Math.max(1, pieces) } : l)));
  };
  const remove = (idx: number) => onChange(mode, lines.filter((_, i) => i !== idx));

  const checkout = async () => {
    setPlacing(true);
    setError(null);
    try {
      const res = await portalApi.checkout({
        mode,
        items: lines.map(l => ({ product_id: l.product_id, std_weight_g: l.std_weight_g ?? 0, size_inches: l.size_inches, pieces: l.pieces })),
        notes
      });
      onChange(mode, []);
      setNotes('');
      setPlacedOrder({ order: res.order, options: res.payment_options });
    } catch (err: any) {
      setError(err.message || 'Checkout failed');
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div className="px-4 pt-4 pb-44">
      <h1 className="text-2xl font-bold text-[#2F2923] mb-3">Cart</h1>

      <div className="grid grid-cols-2 gap-1.5 bg-[#E8DCCB]/60 p-1 rounded-2xl mb-4">
        {(['READY_STOCK', 'ON_ORDER'] as PurchaseMode[]).map(m => (
          <button
            key={m}
            onClick={() => { setMode(m); setError(null); }}
            className={`py-2 rounded-xl text-xs font-bold ${mode === m ? 'bg-[#FFFCF7] text-[#2F2923] shadow-xs' : 'text-[#766B60]'}`}
          >
            {MODE_LABEL[m]} ({carts[m].reduce((s, l) => s + l.pieces, 0)})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-[#6B5744]" /></div>
      ) : lines.length === 0 ? (
        <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-8 text-center">
          <ShoppingBag size={32} className="mx-auto text-[#B49A7A] mb-2" />
          <p className="text-sm font-semibold text-[#2F2923]">Your {MODE_LABEL[mode]} cart is empty</p>
          <button onClick={() => onShop(mode)} className="mt-4 px-4 py-2 bg-[#6B5744] text-white text-xs font-semibold rounded-xl">
            Browse {MODE_LABEL[mode]}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {priced.rows.map((r, idx) => (
            <div key={`${r.line.product_id}-${r.line.std_weight_g ?? ''}-${r.line.size_inches}`} className={`bg-[#FFFCF7] border rounded-2xl p-3 shadow-card ${r.stockShort || !r.product ? 'border-[#C94C4C]/40' : 'border-[#D2BFA7]'}`}>
              <div className="flex gap-3">
                {r.line.image_path ? (
                  <img src={r.line.image_path} alt={r.line.name} className="w-16 h-16 rounded-xl object-cover border border-[#D2BFA7] bg-white" />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-[#E8DCCB]/60 flex items-center justify-center text-[10px] font-bold text-[#6B5744]">AI925</div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#2F2923] truncate">{r.line.name}</p>
                      <p className="text-[11px] text-[#766B60]">{r.line.std_weight_g ? `Std ${r.line.std_weight_g} g · ` : ''}{r.line.size_inches}" · {parseFloat(r.unitWeight.toFixed(3))} g each</p>
                    </div>
                    <button onClick={() => remove(idx)} className="p-1 text-[#C94C4C]" aria-label="Remove">
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => setPieces(idx, r.line.pieces - 1)} className="w-7 h-7 rounded-lg bg-[#F5F0E8] border border-[#D2BFA7] flex items-center justify-center" aria-label="Decrease"><Minus size={14} /></button>
                      <span className="w-8 text-center text-sm font-bold">{r.line.pieces}</span>
                      <button onClick={() => setPieces(idx, r.line.pieces + 1)} className="w-7 h-7 rounded-lg bg-[#F5F0E8] border border-[#D2BFA7] flex items-center justify-center" aria-label="Increase"><Plus size={14} /></button>
                    </div>
                    <span className="text-sm font-bold text-[#2F2923]">{formatINR(r.breakdown.total)}</span>
                  </div>
                </div>
              </div>
              {/* Per-line distribution */}
              <div className="grid grid-cols-4 gap-1 mt-2 pt-2 border-t border-[#E8DCCB] text-[10px] text-center">
                <div><p className="text-[#766B60]">Weight</p><p className="font-semibold text-[#2F2923]">{parseFloat(r.breakdown.weight_g.toFixed(3))} g</p></div>
                <div><p className="text-[#766B60]">Silver</p><p className="font-semibold text-[#2F2923]">{formatINR(r.breakdown.silver_amount, 0)}</p></div>
                <div><p className="text-[#766B60]">Making @{formatINR(r.labour, 0)}/g</p><p className="font-semibold text-[#2F2923]">{formatINR(r.breakdown.labour_amount, 0)}</p></div>
                <div><p className="text-[#766B60]">GST 3%</p><p className="font-semibold text-[#2F2923]">{formatINR(r.breakdown.gst_amount, 0)}</p></div>
              </div>
            </div>
          ))}

          <button onClick={() => onShop(mode)} className="w-full py-2.5 bg-[#E8DCCB]/50 border border-[#D2BFA7] rounded-xl text-xs font-bold text-[#2F2923]">
            + Add more from {MODE_LABEL[mode]}
          </button>

          {priced.matchedSlab && priced.activeSlabDiscount > 0 && (
            <div className="bg-[#E3EEE6] border border-[#4F7D5B]/30 rounded-xl p-3 text-xs text-[#2A5235] flex items-center justify-between">
              <div>
                <span className="font-bold">Weight Slab Discount:</span> {priced.matchedSlab.min_kg}{priced.matchedSlab.max_kg ? ` - ${priced.matchedSlab.max_kg}` : '+'} kg slab
                <p className="text-[10px] text-[#4F7D5B] mt-0.5">Applied to labour charges across your entire order</p>
              </div>
              <span className="font-bold text-sm bg-white/90 text-[#2A5235] px-2.5 py-1 rounded-lg border border-[#4F7D5B]/30 shadow-xs">
                −₹{priced.activeSlabDiscount}/g
              </span>
            </div>
          )}

          <PriceBreakdown
            title="Bill Summary"
            breakdown={priced.total}
            silverRate={rate?.rate_per_gram ?? null}
            labourPerGram={priced.labourUniform}
            rateDate={rate?.updated_at}
            extras={delivery ? [{ label: `Delivery charges${delivery.pin ? ` (PIN ${delivery.pin})` : ''}`, amount: delivery.charge }] : []}
          />
          {/* Minimum order weight: total silver in this cart must reach this purchase type's minimum before checkout */}
          <div className={`rounded-xl px-3 py-2 -mt-1 border ${priced.gramsShort > 0 ? 'bg-[#FBE9E9] border-[#C94C4C]/25' : 'bg-[#E3EEE6] border-[#4F7D5B]/25'}`}>
            <div className="flex items-center justify-between text-xs font-bold">
              <span className={priced.gramsShort > 0 ? 'text-[#C94C4C]' : 'text-[#4F7D5B]'}>Total silver weight</span>
              <span className="text-[#2F2923]">{parseFloat(priced.total.weight_g.toFixed(3))} g / min {MIN_ORDER_GRAMS[mode]} g</span>
            </div>
            <div className="h-1.5 mt-1.5 rounded-full bg-white/70 overflow-hidden">
              <div className={`h-full ${priced.gramsShort > 0 ? 'bg-[#C94C4C]' : 'bg-[#4F7D5B]'}`} style={{ width: `${Math.min(100, (priced.total.weight_g / MIN_ORDER_GRAMS[mode]) * 100)}%` }} />
            </div>
          </div>
          {delivery && !delivery.pin && (
            <p className="text-[11px] text-[#766B60] -mt-1">Add your PIN code under Account → Edit so delivery is charged for your area.</p>
          )}

          {mode === 'ON_ORDER' && (
            <p className="text-[11px] text-[#766B60] bg-[#EFE8F7] rounded-xl px-3 py-2">
              On Order requests go to our System Administrator for production planning. The amount is an estimate at today's silver rate. After placing it you can pay a 20% advance, or pay in full for a small discount.
            </p>
          )}

          <textarea
            rows={2}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Notes for the seller (optional)"
            className="w-full px-3 py-2 bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl text-sm text-[#2F2923]"
          />

          {priced.issues.length > 0 && (
            <div className="bg-[#FBE9E9] border border-[#C94C4C]/25 rounded-xl p-3 space-y-1">
              {priced.issues.map(i => (
                <p key={i} className="text-xs text-[#C94C4C] flex items-start gap-1.5"><AlertTriangle size={13} className="mt-0.5 shrink-0" />{i}</p>
              ))}
            </div>
          )}
          {error && <p className="text-xs text-[#C94C4C] font-medium">{error}</p>}
        </div>
      )}

      {lines.length > 0 && !loading && (
        <div className="fixed above-nav left-1/2 -translate-x-1/2 w-full max-w-lg z-30 px-4 pb-2">
          <button
            onClick={checkout}
            disabled={placing || priced.issues.length > 0 || !rate?.rate_per_gram}
            className="w-full py-3.5 bg-[#6B5744] hover:bg-[#584534] disabled:opacity-50 text-white font-bold rounded-2xl shadow-lg flex items-center justify-center gap-2"
          >
            {placing && <Loader2 size={16} className="animate-spin" />}
            {mode === 'ON_ORDER' ? 'Send On-Order Request' : 'Place Order'} · {formatINR(payable)}
          </button>
        </div>
      )}

      {placedOrder && (
        <DummyPaymentModal
          orderNumber={placedOrder.order.order_number}
          amountDue={placedOrder.order.total_amount}
          options={placedOrder.options}
          onPay={async (method, _amount, plan) => {
            await portalApi.pay(placedOrder.order.id, method, plan);
          }}
          onClose={() => {
            setPlacedOrder(null);
            onOrderPlaced();
          }}
        />
      )}
    </div>
  );
};
