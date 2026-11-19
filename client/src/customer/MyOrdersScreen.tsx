import React, { useEffect, useState } from 'react';
import { ArrowLeft, ChevronRight, Loader2, Package, Camera, X, ChevronLeft } from 'lucide-react';
import { portalApi, type OrderImage } from '../api';
import { PriceBreakdown } from '../components/PriceBreakdown';
import { DummyPaymentModal, PaymentStatusBadge } from '../components/DummyPaymentModal';
import { formatINR, round2 } from '../pricing';

const statusLabel: Record<string, { text: string; cls: string }> = {
  OPEN: { text: 'Received', cls: 'bg-[#FBE8DB] text-[#D97732]' },
  IN_PROGRESS: { text: 'Partly delivered', cls: 'bg-[#FBE8DB] text-[#D97732]' },
  CLOSED: { text: 'Completed', cls: 'bg-[#E3EEE6] text-[#4F7D5B]' }
};

export const MyOrdersScreen: React.FC = () => {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    portalApi.getOrders().then(res => setOrders(res.orders)).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(load, []);

  if (selected) {
    return <OrderDetail orderId={selected} onBack={() => { setSelected(null); load(); }} />;
  }

  return (
    <div className="px-4 pt-4 pb-24">
      <h1 className="text-2xl font-bold text-[#2F2923] mb-4">My Orders</h1>
      {loading && orders.length === 0 ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-[#6B5744]" /></div>
      ) : orders.length === 0 ? (
        <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-8 text-center">
          <Package size={32} className="mx-auto text-[#B49A7A] mb-2" />
          <p className="text-sm font-semibold text-[#2F2923]">No orders yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map(o => {
            const st = statusLabel[o.status] || statusLabel.OPEN;
            return (
              <button key={o.id} onClick={() => setSelected(o.id)} className="w-full text-left bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-4 shadow-card">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-base font-bold text-[#2F2923]">{o.order_number}</span>
                  <div className="flex items-center gap-1.5">
                    {o.total_amount > 0 && <PaymentStatusBadge status={o.payment_status} small />}
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${st.cls}`}>{st.text}</span>
                  </div>
                </div>
                <p className="text-[11px] text-[#766B60]">
                  {o.order_type === 'ON_ORDER' ? 'On Order Purchase' : o.order_type === 'READY_STOCK' ? 'Ready Stock' : 'Placed by our team'} · {o.order_date}
                </p>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#E8DCCB] text-xs">
                  <span className="text-[#766B60] flex items-center gap-1.5">
                    {o.delivered_pieces}/{o.total_pieces} pcs delivered · {Number(o.expected_weight).toFixed(2)} g
                    {o.image_count > 0 && <span className="flex items-center gap-0.5 text-[#6B5744] font-semibold"><Camera size={12} /> {o.image_count}</span>}
                  </span>
                  <span className="font-bold text-[#2F2923] flex items-center gap-1">{o.total_amount > 0 ? formatINR(o.total_amount, 0) : ''} <ChevronRight size={14} /></span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

const OrderDetail: React.FC<{ orderId: string; onBack: () => void }> = ({ orderId, onBack }) => {
  const [data, setData] = useState<any>(null);
  const [payOpen, setPayOpen] = useState(false);

  const load = () => portalApi.getOrder(orderId).then(setData).catch(() => {});
  useEffect(() => { load(); }, [orderId]);

  if (!data) return <div className="flex justify-center py-24"><Loader2 className="animate-spin text-[#6B5744]" /></div>;
  const { order, items, payments, images, payment_options } = data;
  const due = round2((order.total_amount || 0) - (order.paid_amount || 0));
  // Order total = goods + delivery − full-payment discount
  const delivery = Number(order.delivery_charge) || 0;
  const discount = Number(order.discount_amount) || 0;
  const goodsTotal = round2(order.total_amount - delivery + discount);
  const extras = [
    ...(delivery > 0 ? [{ label: 'Delivery charges', amount: delivery }] : []),
    ...(discount > 0 ? [{ label: 'Full payment discount', amount: -discount }] : [])
  ];
  const labours = Array.from(new Set(items.map((i: any) => i.labour_per_gram)));

  return (
    <div className="px-4 pt-4 pb-24 space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="w-10 h-10 rounded-full bg-[#FFFCF7] border border-[#D2BFA7] flex items-center justify-center" aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-[#2F2923]">Order {order.order_number}</h1>
          <p className="text-xs text-[#766B60]">{order.operational_status} · {order.order_date}</p>
        </div>
      </div>

      <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl divide-y divide-[#E8DCCB] shadow-card">
        {items.map((it: any) => (
          <div key={it.id} className="p-3 flex items-center justify-between text-xs">
            <div>
              <p className="font-bold text-sm text-[#2F2923]">{it.product_name}</p>
              <p className="text-[#766B60]">{it.std_weight_g ? `Std ${it.std_weight_g} g · ` : ''}{it.size_inches}" · {it.requested_pieces} pcs · {Number(it.expected_weight).toFixed(2)} g{it.delivered_pieces ? ` · ${it.delivered_pieces} delivered` : ''}</p>
            </div>
            {it.line_amount > 0 && <span className="font-bold text-[#2F2923]">{formatINR(it.line_amount, 0)}</span>}
          </div>
        ))}
      </div>

      <OrderPhotos images={images || []} />

      {order.total_amount > 0 && (
        <PriceBreakdown
          title="Order Value"
          breakdown={{
            weight_g: order.expected_weight,
            silver_amount: order.silver_amount,
            labour_amount: order.labour_amount,
            subtotal: round2(order.silver_amount + order.labour_amount),
            gst_amount: order.gst_amount,
            total: goodsTotal
          }}
          extras={extras}
          silverRate={order.silver_rate}
          labourPerGram={labours.length === 1 ? Number(labours[0]) : null}
          rateDate={order.created_at}
          note="Locked at the silver rate on your order date."
        />
      )}

      <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-4 shadow-card">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-bold text-[#2F2923] uppercase tracking-wider">Payment</p>
          <PaymentStatusBadge status={order.payment_status} />
        </div>
        {payments.map((p: any) => (
          <p key={p.id} className="text-xs text-[#766B60] flex justify-between py-1">
            <span>{p.method.replace('_', ' ')} · {p.gateway_ref}</span>
            <span className="font-semibold text-[#4F7D5B]">{formatINR(p.amount)}</span>
          </p>
        ))}
        {order.payment_plan === 'ADVANCE' && due > 0 && (
          <p className="text-[11px] text-[#766B60] py-1">Advance paid. Balance due: {formatINR(due)}</p>
        )}
        {due > 0 ? (
          <button onClick={() => setPayOpen(true)} className="w-full mt-2 py-3 bg-[#4F7D5B] text-white font-bold rounded-xl">
            {payment_options?.choices ? `Pay advance or in full · ${formatINR(due)}` : `Pay ${formatINR(due)}`}
          </button>
        ) : order.total_amount > 0 ? (
          <p className="text-xs font-semibold text-[#4F7D5B]">Fully paid. Thank you!</p>
        ) : null}
      </div>

      {payOpen && (
        <DummyPaymentModal
          orderNumber={order.order_number}
          amountDue={due}
          options={payment_options}
          onPay={async (method, _amount, plan) => { await portalApi.pay(order.id, method, plan); }}
          onClose={() => { setPayOpen(false); load(); }}
        />
      )}
    </div>
  );
};

const PHOTO_TYPES: { key: OrderImage['image_type']; label: string }[] = [
  { key: 'bill', label: 'Bill' },
  { key: 'package', label: 'Package' },
  { key: 'shipment', label: 'Shipment' }
];

// Bill, package and shipment photos uploaded by our team, with a full-screen viewer
const OrderPhotos: React.FC<{ images: OrderImage[] }> = ({ images }) => {
  const [viewing, setViewing] = useState<number | null>(null);
  const ordered = PHOTO_TYPES.flatMap(t => images.filter(i => i.image_type === t.key));

  return (
    <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-4 shadow-card">
      <p className="text-sm font-bold text-[#2F2923] uppercase tracking-wider flex items-center gap-1.5 mb-3">
        <Camera size={16} /> Bill, Package & Shipment
      </p>
      <div className="space-y-3">
        {PHOTO_TYPES.map(t => {
          const list = images.filter(i => i.image_type === t.key);
          return (
            <div key={t.key}>
              <p className="text-[11px] font-bold text-[#766B60] uppercase mb-1.5">{t.label} {list.length > 0 && `(${list.length})`}</p>
              {list.length === 0 ? (
                <p className="text-[11px] text-[#766B60] italic">Not uploaded yet</p>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {list.map(img => (
                    <button
                      key={img.id}
                      onClick={() => setViewing(ordered.indexOf(img))}
                      className="aspect-square rounded-xl overflow-hidden border border-[#D2BFA7] bg-white"
                      aria-label={`Open ${t.label.toLowerCase()} photo`}
                    >
                      <img src={img.file_path} alt={`${t.label} photo`} loading="lazy" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {viewing !== null && ordered[viewing] && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col" onClick={() => setViewing(null)}>
          <div className="flex items-center justify-between px-4 py-3 text-white">
            <span className="text-sm font-semibold">
              {PHOTO_TYPES.find(t => t.key === ordered[viewing].image_type)?.label} · {viewing + 1} / {ordered.length}
            </span>
            <button onClick={() => setViewing(null)} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center" aria-label="Close">
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center px-2 relative" onClick={e => e.stopPropagation()}>
            {viewing > 0 && (
              <button onClick={() => setViewing(viewing - 1)} className="absolute left-2 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center" aria-label="Previous photo">
                <ChevronLeft size={22} />
              </button>
            )}
            <img src={ordered[viewing].file_path} alt="Order photo" className="max-w-full max-h-[80vh] object-contain rounded-lg" />
            {viewing < ordered.length - 1 && (
              <button onClick={() => setViewing(viewing + 1)} className="absolute right-2 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center" aria-label="Next photo">
                <ChevronRight size={22} />
              </button>
            )}
          </div>
          {ordered[viewing].caption && <p className="text-center text-xs text-white/80 px-4 pb-6">{ordered[viewing].caption}</p>}
        </div>
      )}
    </div>
  );
};
