import React, { useEffect, useState } from 'react';
import { 
  ArrowLeft, Truck, Check, Trash2, X, Upload, 
  Edit3, AlertTriangle, Loader2, Share2, ZoomIn, FileText, Package 
} from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { formatINR, round2 } from '../pricing';
import { PriceBreakdown } from '../components/PriceBreakdown';
import { DummyPaymentModal, PaymentStatusBadge } from '../components/DummyPaymentModal';
import { OrderTypeBadge } from './OrdersScreen';

interface OrderDetailsScreenProps {
  orderId: string;
  onBack: () => void;
  onRefreshOrders?: () => void;
  onEditOrder?: (orderId: string) => void;
  onOrderDeleted?: () => void;
}

export const OrderDetailsScreen: React.FC<OrderDetailsScreenProps> = ({
  orderId,
  onBack,
  onRefreshOrders,
  onEditOrder,
  onOrderDeleted
}) => {
  const { isAdmin } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Delivery Modal State
  const [deliverySheetOpen, setDeliverySheetOpen] = useState(false);
  const [deliveryNote, setDeliveryNote] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().split('T')[0]);
  const [courierName, setCourierName] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [itemDeliveries, setItemDeliveries] = useState<Record<string, { pieces: string; weight: string }>>({});
  const [submittingDelivery, setSubmittingDelivery] = useState(false);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);

  // 3-Sequence Image Upload State (shipment, package, bill) & Lightbox Zoom Preview
  const [uploadingType, setUploadingType] = useState<'shipment' | 'package' | 'bill' | null>(null);
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string; type: string } | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);

  const fetchOrderDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getOrder(orderId);
      setData(res);

      // Initialize delivery input form defaults for remaining items
      const initialMap: Record<string, { pieces: string; weight: string }> = {};
      res.items?.forEach((it: any) => {
        const remainingPcs = it.requested_pieces - it.delivered_pieces;
        if (remainingPcs > 0) {
          const itemStd = it.std_weight_g ?? it.std_weight_per_20in;
          const unitExpWeight = it.unit_weight || (it.expected_weight && it.requested_pieces ? (it.expected_weight / it.requested_pieces) : (it.size_inches && itemStd ? (it.size_inches / 20.0) * itemStd : 0));
          initialMap[it.id] = {
            pieces: String(remainingPcs),
            weight: (remainingPcs * unitExpWeight).toFixed(2)
          };
        }
      });
      setItemDeliveries(initialMap);
    } catch (err: any) {
      setError(err.message || 'Failed to load order');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrderDetails();
  }, [orderId]);

  const handleRecordDelivery = async () => {
    const itemsToDeliver: any[] = [];
    Object.entries(itemDeliveries).forEach(([order_item_id, values]) => {
      const pcs = parseInt(values.pieces, 10) || 0;
      const wt = parseFloat(values.weight) || 0;
      if (pcs > 0) {
        itemsToDeliver.push({
          order_item_id,
          delivered_pieces: pcs,
          actual_weight_g: wt
        });
      }
    });

    if (itemsToDeliver.length === 0) {
      setDeliveryError('Please enter pieces to deliver for at least one item');
      return;
    }

    setSubmittingDelivery(true);
    setDeliveryError(null);

    try {
      await api.recordDelivery(orderId, {
        delivery_date: deliveryDate,
        courier_name: courierName,
        tracking_number: trackingNumber,
        notes: deliveryNote,
        items: itemsToDeliver
      });

      setDeliverySheetOpen(false);
      setDeliveryNote('');
      fetchOrderDetails();
      if (onRefreshOrders) onRefreshOrders();
    } catch (err: any) {
      setDeliveryError(err.message || 'Failed to record delivery');
    } finally {
      setSubmittingDelivery(false);
    }
  };

  const handleCloseOrder = async () => {
    if (!window.confirm('Are you sure you want to mark this order as CLOSED?')) {
      return;
    }
    try {
      await api.closeOrder(orderId);
      fetchOrderDetails();
      if (onRefreshOrders) onRefreshOrders();
    } catch (err: any) {
      alert(err.message || 'Failed to close order');
    }
  };

  const handleUploadSequence = async (type: 'shipment' | 'package' | 'bill', file: File) => {
    if (!file) return;

    const captions = {
      shipment: '1. Shipment Dispatch Proof',
      package: '2. Final Package Inspection',
      bill: '3. Official Bill / Tax Invoice'
    };

    const formData = new FormData();
    formData.append('image', file);
    formData.append('image_type', type);
    formData.append('caption', captions[type]);

    setUploadingType(type);
    try {
      await api.uploadOrderImage(orderId, formData);
      fetchOrderDetails();
    } catch (err: any) {
      alert(err.message || `Failed to upload ${type} image`);
    } finally {
      setUploadingType(null);
    }
  };

  const handleSendWhatsApp = () => {
    if (!data || !data.order) {
      alert('Order details are not loaded yet.');
      return;
    }
    const orderObj = data.order;
    const itemsList = data.items || [];

    const rawPhone = orderObj.customer_phone || '';
    const cleanPhone = rawPhone.replace(/\D/g, '');
    if (!cleanPhone) {
      alert('This customer does not have a valid mobile phone number for WhatsApp.');
      return;
    }

    const formatWeight = (val: any) => {
      const n = parseFloat(String(val || 0));
      if (isNaN(n)) return '0';
      return parseFloat(n.toFixed(2)).toString();
    };

    // Group items by product
    const productGroups = itemsList.reduce((acc: any, it: any) => {
      const key = it.product_id || it.product_name || 'Product';
      if (!acc[key]) {
        acc[key] = {
          product_name: it.product_name || 'Product',
          items: []
        };
      }
      acc[key].items.push(it);
      return acc;
    }, {});

    const productDetailsText = Object.values(productGroups).map((group: any) => {
      const itemBlocks = group.items.map((it: any) => {
        const pcs = Number(it.requested_pieces) || 0;
        const expWt = Number(it.expected_weight) || 0;
        const wtPerPc = pcs > 0 ? (expWt / pcs) : 0;
        return `• Size: ${it.size_inches || '-'} inch | Wt. / pc : ${formatWeight(wtPerPc)} g\n• Qty: ${pcs} pcs | Wt. : ${formatWeight(expWt)} g`;
      }).join('\n\n');

      return `${group.product_name}\n${itemBlocks}`;
    }).join('\n\n');

    const totalQty = orderObj.total_pieces ?? itemsList.reduce((sum: number, it: any) => sum + (Number(it.requested_pieces) || 0), 0);
    const totalWeight = orderObj.expected_weight ?? itemsList.reduce((sum: number, it: any) => sum + (Number(it.expected_weight) || 0), 0);

    const isOraani = orderObj.brand === 'ORAANI';
    const brandName = isOraani ? 'Oraani' : 'AI925';
    const companyName = isOraani ? 'Oraani Silver' : 'Aryan International';

    const msg = [
      `*Dear Customer,*`,
      ``,
      `Thank you for placing your order with ${brandName}! ✨`,
      ``,
      `*Order No.:* ${orderObj.order_number}`,
      ``,
      `*Product Details:*`,
      ``,
      productDetailsText,
      ``,
      `*Order Summary*`,
      `• *Total Quantity:* ${totalQty} pieces`,
      `• *Total Net Weight:* ${formatWeight(totalWeight)} grams`,
      ``,
      `Thank you for your trust in ${brandName}. We look forward to serving you!`,
      ``,
      `Regards,`,
      `${companyName}`,
      `+91 7060909698`
    ].join('\n');

    const phoneWithCountry = cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone;
    window.open(`https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const handleDeleteImage = async (imageId: string) => {
    if (!window.confirm('Remove this shipment image?')) return;
    try {
      await api.deleteShipmentImage(orderId, imageId);
      fetchOrderDetails();
    } catch (err: any) {
      alert(err.message || 'Failed to delete image');
    }
  };

  const handleDeleteOrder = async () => {
    setDeleting(true);
    try {
      await api.deleteOrder(orderId);
      if (onRefreshOrders) onRefreshOrders();
      if (onOrderDeleted) {
        onOrderDeleted();
      } else {
        onBack();
      }
    } catch (err: any) {
      alert(err.message || 'Failed to delete order');
      setDeleting(false);
      setDeleteConfirmOpen(false);
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
        <p className="text-sm text-[#C94C4C] mb-3">{error || 'Order not found'}</p>
        <button
          onClick={onBack}
          className="px-4 py-2 bg-[#6B5744] text-white rounded-xl text-sm font-medium"
        >
          Back to Orders
        </button>
      </div>
    );
  }

  const { order, items, deliveries, images } = data;
  const payments: any[] = data.payments || [];
  const amountDue = round2((order.total_amount || 0) - (order.paid_amount || 0));
  const labourRates = Array.from(new Set(items.map((i: any) => i.labour_per_gram).filter((v: any) => v !== null && v !== undefined)));
  const progressPercent = order.total_pieces > 0
    ? Math.min(100, Math.round((order.delivered_pieces / order.total_pieces) * 100))
    : 0;

  // Group items by product and standard weight
  const productGroups = items.reduce((acc: any, item: any) => {
    const stdWeight = item.std_weight_g ?? item.std_weight_per_20in;
    const groupKey = `${item.product_id}_${stdWeight || 'default'}`;
    if (!acc[groupKey]) {
      acc[groupKey] = {
        product_name: item.product_name,
        product_sku: item.product_sku,
        category_name: item.category_name,
        std_weight_g: stdWeight,
        items: []
      };
    }
    acc[groupKey].items.push(item);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-[#F5F0E8] pb-36 max-w-lg mx-auto">
      {/* Top Header matching Screenshot Image 27 */}
      <div className="sticky top-0 z-20 bg-[#F5F0E8]/95 backdrop-blur-xs px-4 py-3 border-b border-[#D2BFA7]/40 flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-base font-semibold text-[#2F2923] hover:text-[#6B5744]"
        >
          <ArrowLeft size={20} />
          <div className="flex items-center gap-2 flex-wrap">
            <span>Order {order.order_number}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
              order.brand === 'ORAANI' ? 'bg-[#E8DCCB] text-[#6B5744] border border-[#B49A7A]' : 'bg-[#2F2923] text-[#F5F0E8]'
            }`}>
              {order.brand === 'ORAANI' ? 'Oraani' : 'AI 925'}
            </span>
            {isAdmin && (order.creator_role === 'SALES_REP' || (Boolean(order.sales_rep_name) && order.creator_role !== 'ADMIN')) && (
              <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#EBF2FA] text-[#1E5D88] border border-[#BDD6EE]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#1E5D88]"></span>
                Made by Sales Representative: {order.creator_role === 'SALES_REP' ? (order.creator_name || order.sales_rep_name) : (order.sales_rep_name || order.creator_name)}
              </span>
            )}
          </div>
        </button>

        <div className="flex items-center gap-2">
          {order.status === 'IN_PROGRESS' && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FBE8DB] text-[#D97732]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#D97732]"></span>
              In Progress
            </span>
          )}
          {order.status === 'CLOSED' && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#E3EEE6] text-[#4F7D5B]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#4F7D5B]"></span>
              Closed
            </span>
          )}
          {order.status === 'OPEN' && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FBE9E9] text-[#C94C4C]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#C94C4C]"></span>
              Open
            </span>
          )}

          {/* Modify Order Button (Available to both Admin and Sales Rep) */}
          {onEditOrder && (
            <button
              onClick={() => onEditOrder(orderId)}
              title="Modify Order"
              className="p-1.5 text-[#6B5744] hover:bg-[#E8DCCB]/60 rounded-lg transition-colors"
            >
              <Edit3 size={18} />
            </button>
          )}

          {/* Delete Order Button (Admin Only) */}
          {isAdmin && (
            <button
              onClick={() => setDeleteConfirmOpen(true)}
              title="Delete Order (Admin Only)"
              className="p-1.5 text-[#C94C4C] hover:bg-[#FBE9E9] rounded-lg transition-colors"
            >
              <Trash2 size={18} />
            </button>
          )}
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4">
        {/* Main Customer & Order Card matching Screenshot Image 27 */}
        <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-5 shadow-card">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-3xl font-extrabold text-[#2F2923]">
                {order.order_number}
              </span>
              {isAdmin && (order.creator_role === 'SALES_REP' || (Boolean(order.sales_rep_name) && order.creator_role !== 'ADMIN')) && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#EBF2FA] text-[#1E5D88] border border-[#BDD6EE]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#1E5D88]"></span>
                  Made by Sales Representative: {order.creator_role === 'SALES_REP' ? (order.creator_name || order.sales_rep_name) : (order.sales_rep_name || order.creator_name)}
                </span>
              )}
            </div>
            <span className="text-xs font-medium text-[#766B60]">
              {order.order_date}
            </span>
          </div>

          {(order.order_type === 'READY_STOCK' || order.order_type === 'ON_ORDER') && (
            <div className="mb-1"><OrderTypeBadge type={order.order_type} /></div>
          )}
          <h2 className="text-base font-bold text-[#2F2923] mt-1">
            {order.customer_company_name}
          </h2>
          <p className="text-xs text-[#766B60] mt-0.5">
            {order.customer_poc_name} · {order.customer_phone}
          </p>
          <p className="text-xs text-[#766B60] mb-3">
            {order.customer_city} · {order.customer_state} · {order.customer_zone}
          </p>

          {/* Direct WhatsApp Share Context Button */}
          <button
            onClick={handleSendWhatsApp}
            className="w-full mb-4 py-2.5 px-4 bg-[#25D366] hover:bg-[#20BA5A] active:scale-[0.99] text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer"
          >
            <Share2 size={15} />
            <span>Send Order Summary on WhatsApp</span>
          </button>

          {/* Delivery Progress Bar matching Screenshot Image 27 */}
          <div className="w-full bg-[#E8DCCB] h-2 rounded-full overflow-hidden mb-4">
            <div
              style={{ width: `${progressPercent}%` }}
              className="bg-[#6B5744] h-full transition-all duration-300 rounded-full"
            />
          </div>

          {/* 4 Summary Metrics Grid matching Screenshot Image 27 */}
          <div className="grid grid-cols-4 gap-1 text-[11px] pt-1 border-t border-[#E8DCCB]/60">
            <div>
              <span className="block text-[#766B60] font-semibold">PIECES</span>
              <span className="font-bold text-[#2F2923] text-sm">
                {order.delivered_pieces}/{order.total_pieces}
              </span>
            </div>
            <div>
              <span className="block text-[#766B60] font-semibold">EXPECTED</span>
              <span className="font-bold text-[#2F2923] text-sm">
                {(order.expected_weight || 0).toFixed(2)}g
              </span>
            </div>
            <div>
              <span className="block text-[#766B60] font-semibold">DELIVERED</span>
              <span className="font-bold text-[#2F2923] text-sm">
                {(order.delivered_weight || 0).toFixed(2)}g
              </span>
            </div>
            <div>
              <span className="block text-[#766B60] font-semibold">ADVANCE</span>
              <span className="font-bold text-[#2F2923] text-sm">
                ₹{order.advance_amount || 0}
              </span>
            </div>
          </div>
        </div>

        {/* PRICE & PAYMENT (silver rate locked at order time) */}
        {order.total_amount > 0 ? (
          <div className="space-y-3">
            <PriceBreakdown
              title="Order Value"
              breakdown={{
                weight_g: order.expected_weight || 0,
                silver_amount: order.silver_amount || 0,
                labour_amount: order.labour_amount || 0,
                subtotal: round2((order.silver_amount || 0) + (order.labour_amount || 0)),
                gst_amount: order.gst_amount || 0,
                total: order.total_amount || 0
              }}
              silverRate={order.silver_rate ?? null}
              labourPerGram={labourRates.length === 1 ? Number(labourRates[0]) : null}
              rateDate={order.created_at}
              note="Priced at the silver rate on the order date: silver + making charges per gram, 3% GST on the whole."
            />

            <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-4 shadow-card">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-[#2F2923] uppercase tracking-wider">Payment</h3>
                <PaymentStatusBadge status={order.payment_status} />
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs mb-3">
                <div className="bg-[#F5F0E8] rounded-xl p-2">
                  <p className="text-[10px] font-bold text-[#766B60] uppercase">Total</p>
                  <p className="font-bold text-[#2F2923]">{formatINR(order.total_amount)}</p>
                </div>
                <div className="bg-[#E3EEE6] rounded-xl p-2">
                  <p className="text-[10px] font-bold text-[#4F7D5B] uppercase">Paid</p>
                  <p className="font-bold text-[#4F7D5B]">{formatINR(order.paid_amount || 0)}</p>
                </div>
                <div className="bg-[#FBE9E9] rounded-xl p-2">
                  <p className="text-[10px] font-bold text-[#C94C4C] uppercase">Due</p>
                  <p className="font-bold text-[#C94C4C]">{formatINR(Math.max(0, amountDue))}</p>
                </div>
              </div>
              {payments.length > 0 && (
                <div className="divide-y divide-[#E8DCCB] text-xs mb-3">
                  {payments.map((pmt: any) => (
                    <div key={pmt.id} className="flex items-center justify-between py-1.5">
                      <div>
                        <p className="font-semibold text-[#2F2923]">{pmt.method.replace('_', ' ')} · {pmt.gateway_ref}</p>
                        <p className="text-[10px] text-[#766B60]">
                          {new Date(pmt.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          {' · '}{pmt.paid_by_type === 'CUSTOMER' ? `Paid online by ${pmt.customer_name || 'customer'}` : `Recorded by ${pmt.staff_name || 'staff'}`}
                        </p>
                      </div>
                      <span className="font-bold text-[#4F7D5B]">{formatINR(pmt.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
              {amountDue > 0 && (
                <button
                  onClick={() => setPaymentOpen(true)}
                  className="w-full py-2.5 bg-[#4F7D5B] hover:bg-[#426B4D] text-white text-xs font-bold rounded-xl"
                >
                  Collect Payment ({formatINR(amountDue)} due)
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-3 text-[11px] text-[#766B60]">
            This order was created before pricing was enabled, so it has no price. Modify and save it to price it at today's silver rate.
          </div>
        )}

        {/* PRODUCTS & SIZES Section matching Screenshot Image 27 */}
        <div>
          <label className="block text-xs font-bold tracking-wider text-[#766B60] uppercase mb-2">
            PRODUCTS & SIZES
          </label>

          <div className="space-y-3">
            {Object.values(productGroups).map((group: any, idx: number) => {
              const groupRequested = group.items.reduce((s: number, i: any) => s + i.requested_pieces, 0);
              const groupDelivered = group.items.reduce((s: number, i: any) => s + i.delivered_pieces, 0);
              const groupExpWeight = group.items.reduce((s: number, i: any) => s + i.expected_weight, 0);
              const groupDelWeight = group.items.reduce((s: number, i: any) => s + i.delivered_weight, 0);

              return (
                <div
                  key={idx}
                  className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-4 shadow-card"
                >
                  <h3 className="font-bold text-base text-[#2F2923]">
                    {group.product_name}
                  </h3>
                  <p className="text-xs text-[#766B60] mb-3">
                    {group.product_sku} · {group.category_name || 'Chains'}{group.std_weight_g ? ` · Std ${group.std_weight_g}g/20in` : ''}
                  </p>

                  {/* Size Table matching Screenshot 27 */}
                  <div className="overflow-x-auto mb-3">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-[#E8DCCB] text-[#766B60] font-semibold">
                          <th className="pb-1.5">SIZE</th>
                          <th className="pb-1.5 text-center">ORDERED</th>
                          <th className="pb-1.5 text-center">DELIVERED</th>
                          <th className="pb-1.5 text-right">EXP g</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E8DCCB]/40">
                        {group.items.map((row: any) => (
                          <tr key={row.id} className="text-[#2F2923]">
                            <td className="py-2 font-medium">{row.size_inches} in</td>
                            <td className="py-2 text-center">{row.requested_pieces} pcs</td>
                            <td className="py-2 text-center font-medium">
                              {row.delivered_pieces} pcs
                            </td>
                            <td className="py-2 text-right font-medium">
                              {row.expected_weight.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Group Summary Row matching Screenshot 27 */}
                  <div className="flex items-center justify-between pt-2 border-t border-[#E8DCCB] text-xs font-semibold text-[#766B60]">
                    <span>Total: {groupRequested} pcs · {groupExpWeight.toFixed(2)}g</span>
                    <span>Delivered: {groupDelivered} pcs · {groupDelWeight.toFixed(2)}g</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* DELIVERY HISTORY Section matching Screenshot Image 23 */}
        <div>
          <label className="block text-xs font-bold tracking-wider text-[#766B60] uppercase mb-2">
            DELIVERY HISTORY
          </label>

          {deliveries && deliveries.length > 0 ? (
            <div className="space-y-3">
              {deliveries.map((del: any) => (
                <div
                  key={del.id}
                  className="bg-[#E8DCCB]/50 border border-[#D2BFA7] rounded-2xl p-4 shadow-card"
                >
                  <p className="font-bold text-sm text-[#2F2923] mb-2">
                    Delivery {del.delivery_number} · {del.delivery_date}
                  </p>
                  <div className="space-y-1 text-xs text-[#2F2923]">
                    {del.items?.map((dItem: any, i: number) => (
                      <p key={i}>
                        {dItem.delivered_pieces} pcs @ {dItem.size_inches} in · {dItem.actual_weight_g.toFixed(2)}g
                      </p>
                    ))}
                  </div>
                  {del.courier_name && (
                    <p className="text-[11px] text-[#766B60] mt-2 pt-2 border-t border-[#D2BFA7]/50">
                      Courier: {del.courier_name} {del.tracking_number ? `(${del.tracking_number})` : ''}
                    </p>
                  )}
                  {del.notes && (
                    <p className="text-[11px] text-[#766B60] italic mt-1">
                      Note: {del.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-4 text-center text-xs text-[#766B60]">
              No deliveries recorded yet. Click "Add Delivery" below to record partial or full dispatch.
            </div>
          )}
        </div>

        {/* THREE SEQUENTIAL UPLOAD SECTIONS: 1. Shipment, 2. Final Package, 3. Bill */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold tracking-wider text-[#766B60] uppercase">
              ORDER PHOTOS & DOCUMENTS (3 SEQUENTIAL STEPS)
            </label>
            <span className="text-[10px] text-[#766B60]">Saved with Order {order.order_number}</span>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {/* 1. Shipment Image */}
            <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl p-3 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-[#E8DCCB] text-[#6B5744] font-bold text-xs flex items-center justify-center">1</div>
                  <span className="text-xs font-bold text-[#2F2923]">Shipment Image Upload</span>
                </div>
                <span className="text-[10px] text-[#766B60] font-mono">uploads/shipments/</span>
              </div>
              <label className="flex items-center justify-center gap-2 py-2.5 px-3 border border-dashed border-[#D2BFA7] hover:border-[#6B5744] bg-[#F5F0E8]/50 hover:bg-[#F5F0E8] rounded-lg cursor-pointer transition-colors text-xs font-semibold text-[#6B5744]">
                <input
                  type="file"
                  accept="image/*"
                  disabled={uploadingType !== null}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUploadSequence('shipment', f);
                  }}
                  className="hidden"
                />
                {uploadingType === 'shipment' ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                <span>{uploadingType === 'shipment' ? 'Uploading Shipment Image...' : '+ Upload Shipment Photo'}</span>
              </label>
            </div>

            {/* 2. Final Package Upload */}
            <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl p-3 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-[#E8DCCB] text-[#6B5744] font-bold text-xs flex items-center justify-center">2</div>
                  <span className="text-xs font-bold text-[#2F2923]">Final Package Upload</span>
                </div>
                <span className="text-[10px] text-[#766B60] font-mono">uploads/packages/</span>
              </div>
              <label className="flex items-center justify-center gap-2 py-2.5 px-3 border border-dashed border-[#D2BFA7] hover:border-[#6B5744] bg-[#F5F0E8]/50 hover:bg-[#F5F0E8] rounded-lg cursor-pointer transition-colors text-xs font-semibold text-[#6B5744]">
                <input
                  type="file"
                  accept="image/*"
                  disabled={uploadingType !== null}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUploadSequence('package', f);
                  }}
                  className="hidden"
                />
                {uploadingType === 'package' ? <Loader2 size={16} className="animate-spin" /> : <Package size={16} />}
                <span>{uploadingType === 'package' ? 'Uploading Package Photo...' : '+ Upload Final Package Photo'}</span>
              </label>
            </div>

            {/* 3. Bill Upload */}
            <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl p-3 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-[#E8DCCB] text-[#6B5744] font-bold text-xs flex items-center justify-center">3</div>
                  <span className="text-xs font-bold text-[#2F2923]">Bill Upload</span>
                </div>
                <span className="text-[10px] text-[#766B60] font-mono">uploads/bills/</span>
              </div>
              <label className="flex items-center justify-center gap-2 py-2.5 px-3 border border-dashed border-[#D2BFA7] hover:border-[#6B5744] bg-[#F5F0E8]/50 hover:bg-[#F5F0E8] rounded-lg cursor-pointer transition-colors text-xs font-semibold text-[#6B5744]">
                <input
                  type="file"
                  accept="image/*"
                  disabled={uploadingType !== null}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUploadSequence('bill', f);
                  }}
                  className="hidden"
                />
                {uploadingType === 'bill' ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                <span>{uploadingType === 'bill' ? 'Uploading Bill / Invoice...' : '+ Upload Bill / Invoice Photo'}</span>
              </label>
            </div>
          </div>

          {/* Uploaded Photos Gallery with Lightbox Click to Preview in Large */}
          {images && images.length > 0 && (
            <div className="pt-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-[#2F2923]">Uploaded Images ({images.length})</span>
                <span className="text-[10px] text-[#766B60] italic">Tap image to view in large</span>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                {images.map((img: any) => {
                  const typeLabel = img.image_type || (img.caption?.toLowerCase().includes('package') ? 'package' : img.caption?.toLowerCase().includes('bill') ? 'bill' : 'shipment');
                  const badgeColor = typeLabel === 'package' ? 'bg-[#E3EEE6] text-[#4F7D5B]' : typeLabel === 'bill' ? 'bg-[#FBE8DB] text-[#D97732]' : 'bg-[#EBF2FA] text-[#1E5D88]';

                  return (
                    <div
                      key={img.id}
                      className="group relative bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl overflow-hidden shadow-card transition-all"
                    >
                      <div
                        onClick={() => setPreviewImage({ url: img.file_path, title: img.caption || img.original_filename, type: typeLabel })}
                        className="cursor-pointer relative overflow-hidden h-32 bg-[#2F2923]/5"
                      >
                        <img
                          src={img.file_path}
                          alt={img.original_filename}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="px-2 py-1 bg-black/70 text-white rounded-lg text-[10px] font-bold flex items-center gap-1">
                            <ZoomIn size={12} /> View Large
                          </span>
                        </div>
                        <span className={`absolute top-1.5 left-1.5 px-2 py-0.5 rounded-md text-[9px] font-bold uppercase ${badgeColor} shadow-xs`}>
                          {typeLabel}
                        </span>
                      </div>

                      <div className="p-2 flex items-center justify-between bg-white">
                        <span className="text-[10px] text-[#2F2923] truncate font-medium flex-1 mr-1" title={img.caption || img.original_filename}>
                          {img.caption || img.original_filename}
                        </span>
                        <button
                          onClick={() => handleDeleteImage(img.id)}
                          className="text-[#C94C4C] hover:bg-[#FBE9E9] p-1 rounded cursor-pointer shrink-0"
                          title="Delete image"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Action Bar matching Screenshot Image 23, 27 */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-[#F5F0E8] border-t border-[#D2BFA7] p-4 max-w-lg mx-auto flex items-center gap-3">
        {/* Add Delivery Button matching Screenshot Image 23 */}
        <button
          type="button"
          onClick={() => setDeliverySheetOpen(true)}
          disabled={order.status === 'CLOSED'}
          className="flex-1 py-3.5 bg-[#6B5744] hover:bg-[#5C4E43] active:scale-[0.99] disabled:opacity-50 text-white font-semibold rounded-2xl flex items-center justify-center gap-2 shadow-sm transition-all"
        >
          <Truck size={18} />
          <span>Add Delivery</span>
        </button>

        {/* Close Button matching Screenshot Image 23 */}
        <button
          type="button"
          onClick={handleCloseOrder}
          disabled={order.status === 'CLOSED'}
          className="w-32 py-3.5 bg-[#E8DCCB] hover:bg-[#D5C9BC] active:scale-[0.99] disabled:opacity-50 text-[#2F2923] font-semibold rounded-2xl flex items-center justify-center gap-1.5 transition-all"
        >
          <Check size={18} />
          <span>Close</span>
        </button>
      </div>

      {/* RECORD DELIVERY BOTTOM SHEET MODAL matching Screenshot Image 30 */}
      {deliverySheetOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex flex-col justify-end">
          <div className="bg-[#FFFCF7] rounded-t-3xl border-t border-[#D2BFA7] max-h-[85vh] flex flex-col max-w-lg mx-auto w-full shadow-sheet">
            <div className="p-4 border-b border-[#E8DCCB] flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-[#2F2923]">Record Delivery</h3>
                <p className="text-xs text-[#766B60]">
                  Enter delivered pieces & actual weight per size.
                </p>
              </div>
              <button onClick={() => setDeliverySheetOpen(false)} className="text-[#2F2923] p-1">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {deliveryError && (
                <div className="p-3 bg-[#FBE9E9] border border-[#C94C4C]/20 rounded-xl text-sm text-[#C94C4C]">
                  {deliveryError}
                </div>
              )}

              {/* Delivery items inputs matching Screenshot Image 30 */}
              {items
                .filter((item: any) => item.requested_pieces - item.delivered_pieces > 0)
                .map((item: any) => {
                  const remainingPcs = item.requested_pieces - item.delivered_pieces;
                  const itemStd = item.std_weight_g ?? item.std_weight_per_20in;
                  const unitWeight = item.unit_weight || (item.expected_weight && item.requested_pieces ? (item.expected_weight / item.requested_pieces) : (item.size_inches && itemStd ? (item.size_inches / 20.0) * itemStd : 0));

                  return (
                    <div key={item.id} className="space-y-1.5">
                      <p className="text-sm font-bold text-[#2F2923]">
                        {item.product_name} {item.std_weight_g ? `(Std ${item.std_weight_g}g)` : ''} — {item.size_inches} in
                      </p>
                      <p className="text-xs text-[#766B60]">
                        Remaining: {remainingPcs} pcs · Expected unit {unitWeight.toFixed(3)}g
                      </p>

                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          max={remainingPcs}
                          placeholder="Pieces"
                          value={itemDeliveries[item.id]?.pieces || ''}
                          onChange={(e) => {
                            const pcs = e.target.value;
                            const pcsNum = parseInt(pcs, 10) || 0;
                            setItemDeliveries({
                              ...itemDeliveries,
                              [item.id]: {
                                pieces: pcs,
                                weight: (pcsNum * unitWeight).toFixed(2)
                              }
                            });
                          }}
                          className="flex-1 px-3 py-2.5 bg-[#E8DCCB]/40 border border-[#D2BFA7] rounded-xl text-sm font-medium text-[#2F2923]"
                        />
                        <input
                          type="number"
                          step="any"
                          placeholder="Weight (g)"
                          value={itemDeliveries[item.id]?.weight || ''}
                          onChange={(e) => {
                            setItemDeliveries({
                              ...itemDeliveries,
                              [item.id]: {
                                ...(itemDeliveries[item.id] || { pieces: '0' }),
                                weight: e.target.value
                              }
                            });
                          }}
                          className="flex-1 px-3 py-2.5 bg-[#E8DCCB]/40 border border-[#D2BFA7] rounded-xl text-sm font-medium text-[#2F2923]"
                        />
                      </div>
                    </div>
                  );
                })}

              {/* Delivery Note matching Screenshot Image 30 */}
              <div>
                <label className="block text-xs font-bold text-[#766B60] uppercase mb-1">
                  Delivery Note
                </label>
                <input
                  type="text"
                  value={deliveryNote}
                  onChange={(e) => setDeliveryNote(e.target.value)}
                  placeholder="e.g. Dispatched parcel 1 with courier receipt"
                  className="w-full px-3 py-2.5 bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl text-sm"
                />
              </div>

              {/* Delivery Date & Courier info */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-bold text-[#766B60] uppercase mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    className="w-full px-2 py-2 bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#766B60] uppercase mb-1">
                    Courier
                  </label>
                  <input
                    type="text"
                    value={courierName}
                    onChange={(e) => setCourierName(e.target.value)}
                    placeholder="e.g. Bluedart"
                    className="w-full px-3 py-2 bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#766B60] uppercase mb-1">
                    Tracking #
                  </label>
                  <input
                    type="text"
                    value={trackingNumber}
                    onChange={(e) => setTrackingNumber(e.target.value)}
                    placeholder="e.g. BD948192"
                    className="w-full px-3 py-2 bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl text-xs"
                  />
                </div>
              </div>

              {/* Save Delivery Button matching Screenshot Image 30 */}
              <button
                type="button"
                disabled={submittingDelivery}
                onClick={handleRecordDelivery}
                className="w-full py-3.5 bg-[#6B5744] hover:bg-[#5C4E43] active:scale-[0.99] disabled:opacity-50 text-white font-semibold rounded-2xl shadow-sm transition-all mt-4"
              >
                {submittingDelivery ? 'Saving Delivery...' : 'Save Delivery'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal (Admin Only) */}
      {deleteConfirmOpen && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => !deleting && setDeleteConfirmOpen(false)}
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
                Delete Order {order.order_number}?
              </h3>
              <p className="text-xs text-[#766B60] leading-relaxed">
                Are you sure you want to permanently delete this order for{' '}
                <span className="font-semibold text-[#2F2923]">{order.customer_company_name}</span>?
                Any allocated inventory ({order.total_pieces} pcs) will be restored back to stock.
              </p>
            </div>

            <div className="space-y-2 pt-2">
              <button
                disabled={deleting}
                onClick={handleDeleteOrder}
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
                onClick={() => setDeleteConfirmOpen(false)}
                className="w-full py-2.5 bg-[#FFFCF7] border border-[#D2BFA7] text-[#2F2923] text-sm font-semibold rounded-2xl hover:bg-[#E8DCCB]/30 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Modal for Large Image Preview */}
      {previewImage && (
        <div 
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-2xl w-full flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-full flex items-center justify-between text-white pb-3 px-1">
              <span className="text-sm font-bold capitalize">{previewImage.title} ({previewImage.type})</span>
              <button
                onClick={() => setPreviewImage(null)}
                className="w-8 h-8 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/40 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            <img
              src={previewImage.url}
              alt={previewImage.title}
              className="max-w-full max-h-[80vh] object-contain rounded-2xl shadow-2xl bg-[#FFFCF7]"
            />
          </div>
        </div>
      )}
      {paymentOpen && (
        <DummyPaymentModal
          orderNumber={order.order_number}
          amountDue={Math.max(0, amountDue)}
          allowCash
          allowPartial
          onPay={async (method, amount) => {
            await api.collectOrderPayment(orderId, { method, amount });
          }}
          onClose={() => {
            setPaymentOpen(false);
            fetchOrderDetails();
          }}
        />
      )}
    </div>
  );
};
