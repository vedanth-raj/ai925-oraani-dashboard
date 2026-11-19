import React, { useEffect, useState } from 'react';
import { 
  ArrowLeft, ChevronRight, MapPin, Phone, Building2, Package, Calendar,
  Edit3, Trash2, AlertTriangle, Lock, ExternalLink, MessageCircle, Image as ImageIcon, X
} from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { formatINR } from '../pricing';
import { PaymentStatusBadge } from '../components/DummyPaymentModal';
import { CustomerCredentialsCard } from '../components/CustomerCredentialsCard';
import { CustomerPortalCard } from '../components/CustomerPortalCard';

interface CustomerDetailsScreenProps {
  customerId: string;
  onBack: () => void;
  onSelectOrder: (orderId: string) => void;
  onNewOrderForCustomer?: (customerId: string) => void;
  onEditCustomer?: (customerId: string) => void;
}

export const CustomerDetailsScreen: React.FC<CustomerDetailsScreenProps> = ({
  customerId,
  onBack,
  onSelectOrder,
  onNewOrderForCustomer,
  onEditCustomer,
}) => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const isAnyAdmin = isAdmin || user?.role === 'BUSINESS_ADMIN';

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const fetchCustomerDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getCustomer(customerId);
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load customer details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomerDetails();
  }, [customerId]);

  const getInitials = (name: string) => {
    if (!name) return 'C';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const getStatusBadge = (status: string) => {
    if (status === 'IN_PROGRESS') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#FBE8DB] text-[#D97732]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#D97732]"></span>
          In Progress
        </span>
      );
    }
    if (status === 'CLOSED') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#E3EEE6] text-[#4F7D5B]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#4F7D5B]"></span>
          Closed
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#FBE9E9] text-[#C94C4C]">
        <span className="w-1.5 h-1.5 rounded-full bg-[#C94C4C]"></span>
        Open
      </span>
    );
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-3 border-[#6B5744] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-[#C94C4C] mb-3">{error || 'Customer not found'}</p>
        <button
          onClick={onBack}
          className="px-4 py-2 bg-[#6B5744] text-[#FFFCF7] text-xs font-semibold rounded-lg"
        >
          Go Back
        </button>
      </div>
    );
  }

  const { customer, summary, orders = [] } = data;
  const initials = getInitials(customer.poc_name);

  const repModificationsUsed = (customer.rep_edit_count || 0) >= 1;
  const isCreatorRep = customer.created_by_id === user?.id;
  const isRepBlocked = !isAdmin && (!isCreatorRep && customer.created_by_id);
  const isRepLocked = !isAdmin && repModificationsUsed;
  const canEdit = isAdmin || (!isRepBlocked && !isRepLocked);

  const handleDeleteCustomer = async () => {
    try {
      setDeleting(true);
      await api.deleteCustomer(customer.id);
      onBack();
    } catch (err: any) {
      alert(err.message || 'Failed to delete customer');
      setDeleting(false);
    }
  };

  const handleWhatsApp = () => {
    const rawPhone = customer.phone || customer.alternate_phone;
    if (!rawPhone) {
      alert('No phone number recorded for WhatsApp');
      return;
    }
    let clean = rawPhone.replace(/\D/g, '');
    if (clean.length === 10) clean = '91' + clean;
    const brandName = customer.brand === 'ORAANI' ? 'Oraani' : 'AI 925';
    const msg = encodeURIComponent(`Hello ${customer.poc_name} (${customer.company_name}), greetings from ${brandName}!`);
    window.open(`https://wa.me/${clean}?text=${msg}`, '_blank');
  };

  return (
    <div className="pb-24 pt-4 px-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-10 h-10 rounded-full bg-[#FFFCF7] border border-[#D2BFA7] flex items-center justify-center text-[#2F2923] hover:bg-[#E8DCCB] transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-[#2F2923] leading-tight">Customer Details</h1>
            <p className="text-xs text-[#766B60]">Profile & order history</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* WhatsApp Button */}
          {(customer.phone || customer.alternate_phone) && (
            <button
              onClick={handleWhatsApp}
              title="Message on WhatsApp"
              className="w-9 h-9 rounded-xl bg-[#25D366]/15 border border-[#25D366]/40 text-[#128C7E] flex items-center justify-center hover:bg-[#25D366]/25 transition-all active:scale-95 cursor-pointer"
            >
              <MessageCircle size={18} />
            </button>
          )}

          {/* Modify Customer Button */}
          {onEditCustomer && (
            <button
              onClick={() => {
                if (canEdit) {
                  onEditCustomer(customer.id);
                } else {
                  alert(
                    isRepLocked
                      ? 'Modification locked: You have already used your 1 modification for this customer.'
                      : 'Modification restricted: You can only modify customers you added.'
                  );
                }
              }}
              title={
                canEdit 
                  ? (isAdmin ? 'Modify Customer' : 'Modify Customer (1 modification allowed)') 
                  : (isRepLocked ? 'Modification locked (Already modified once)' : 'Not customer creator')
              }
              className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-all ${
                canEdit
                  ? 'bg-[#FFFCF7] border-[#D2BFA7] text-[#6B5744] hover:bg-[#E8DCCB] active:scale-95'
                  : 'bg-[#F5F0E8] border-[#D2BFA7]/50 text-[#766B60]/60 cursor-not-allowed'
              }`}
            >
              {canEdit ? <Edit3 size={17} /> : <Lock size={15} />}
            </button>
          )}

          {/* Delete Customer Button: STRICTLY ADMIN */}
          {isAdmin && (
            <button
              onClick={() => setConfirmDeleteOpen(true)}
              title="Delete Customer"
              className="w-9 h-9 rounded-xl bg-[#FBE9E9] border border-[#C94C4C]/30 flex items-center justify-center text-[#C94C4C] hover:bg-[#C94C4C] hover:text-white transition-all active:scale-95"
            >
              <Trash2 size={17} />
            </button>
          )}

          {onNewOrderForCustomer && (
            <button
              onClick={() => onNewOrderForCustomer(customer.id)}
              className="px-3 py-2 rounded-xl bg-[#6B5744] text-[#FFFCF7] text-xs font-semibold shadow-xs hover:bg-[#584534] active:scale-95 transition-all"
            >
              + New Order
            </button>
          )}
        </div>
      </div>

      {/* Customer Summary Card */}
      <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl p-4 shadow-xs mb-4">
        <div className="flex items-start gap-3.5">
          <div className="w-14 h-14 rounded-full bg-[#E8DCCB] text-[#6B5744] font-bold text-lg flex items-center justify-center shrink-0 border border-[#D2BFA7]">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-[#2F2923] leading-snug truncate">
                {customer.poc_name}
              </h2>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  customer.brand === 'ORAANI' ? 'bg-[#E8DCCB] text-[#6B5744] border border-[#B49A7A]' : 'bg-[#2F2923] text-[#F5F0E8]'
                }`}>
                  {customer.brand === 'ORAANI' ? 'Oraani' : 'AI 925'}
                </span>
                {customer.category && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#6B5744]/10 text-[#6B5744] border border-[#6B5744]/20 uppercase">
                    {customer.category}
                  </span>
                )}
              </div>
            </div>

            <p className="text-sm text-[#766B60] font-semibold truncate flex items-center gap-1.5 mt-0.5">
              <Building2 size={13} className="shrink-0 text-[#B49A7A]" />
              <span>{customer.company_name}</span>
            </p>

            <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-[#766B60]">
              {(customer.city || customer.state || customer.country) && (
                <span className="flex items-center gap-1 bg-[#F5F0E8] px-2 py-0.5 rounded-md text-[11px] font-medium text-[#2F2923]">
                  <MapPin size={11} className="text-[#6B5744]" />
                  <span>
                    {[customer.city, customer.state, customer.country && customer.country !== 'India' ? customer.country : null]
                      .filter(Boolean)
                      .join(', ')}
                  </span>
                  {customer.zone && (
                    <span className="font-bold text-[#6B5744]">({customer.zone})</span>
                  )}
                </span>
              )}

              {customer.phone && (
                <a
                  href={`tel:${customer.phone}`}
                  className="flex items-center gap-1 text-[#6B5744] bg-[#F5F0E8] px-2 py-0.5 rounded-md text-[11px] font-medium hover:underline"
                >
                  <Phone size={11} />
                  <span>Main: {customer.phone}</span>
                </a>
              )}

              {customer.alternate_phone && (
                <a
                  href={`tel:${customer.alternate_phone}`}
                  className="flex items-center gap-1 text-[#6B5744] bg-[#F5F0E8] px-2 py-0.5 rounded-md text-[11px] font-medium hover:underline"
                >
                  <Phone size={11} />
                  <span>Alt: {customer.alternate_phone}</span>
                </a>
              )}

              {customer.gstin && (
                <span className="flex items-center gap-1 bg-[#E3EEE6] text-[#4F7D5B] border border-[#4F7D5B]/30 px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold">
                  <span>GSTIN: {customer.gstin}</span>
                </span>
              )}
            </div>

            {/* Additional Numbers if any */}
            {(() => {
              let extras: string[] = [];
              if (customer.additional_phones) {
                try {
                  const parsed = JSON.parse(customer.additional_phones);
                  if (Array.isArray(parsed)) extras = parsed;
                } catch (_) {}
              }
              if (extras.length === 0) return null;
              return (
                <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-2 border-t border-[#E8DCCB]">
                  <span className="text-[10px] font-bold text-[#766B60] uppercase">Other contacts:</span>
                  {extras.map((num, i) => (
                    <a
                      key={i}
                      href={`tel:${num}`}
                      className="text-[11px] text-[#6B5744] bg-[#F5F0E8] px-2 py-0.5 rounded text-xs hover:underline"
                    >
                      {num}
                    </a>
                  ))}
                </div>
              );
            })()}

            {customer.address && (
              <p className="text-xs text-[#766B60] mt-2 border-t border-[#E8DCCB] pt-2">
                <span className="font-semibold text-[#2F2923]">Address: </span>
                {customer.address}
                {customer.pincode ? ` - ${customer.pincode}` : ''}
              </p>
            )}
          </div>
        </div>

        {/* Customer Geolocation & Google Maps Link */}
        {customer.latitude !== null && customer.latitude !== undefined && customer.longitude !== null && (
          <div className="mt-3 pt-3 border-t border-[#E8DCCB] flex items-center justify-between bg-[#F5F0E8]/50 p-2.5 rounded-lg">
            <div className="flex items-center gap-1.5 text-xs text-[#2F2923]">
              <MapPin size={14} className="text-[#6B5744]" />
              <span>
                Location: <strong>{Number(customer.latitude).toFixed(5)}, {Number(customer.longitude).toFixed(5)}</strong>
              </span>
            </div>
            <a
              href={`https://www.google.com/maps?q=${customer.latitude},${customer.longitude}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-bold text-[#6B5744] hover:underline bg-[#FFFCF7] px-2 py-1 rounded border border-[#D2BFA7]"
            >
              <span>Open in Google Maps</span>
              <ExternalLink size={12} />
            </a>
          </div>
        )}

        {/* Visiting Card Thumbnail */}
        {customer.visiting_card_path && (
          <div className="mt-3 pt-3 border-t border-[#E8DCCB]">
            <p className="text-[11px] font-bold text-[#766B60] uppercase mb-1.5 flex items-center gap-1">
              <ImageIcon size={12} />
              <span>Visiting Card</span>
            </p>
            <div
              onClick={() => setPreviewImage(customer.visiting_card_path)}
              className="relative w-40 h-24 rounded-lg overflow-hidden border border-[#D2BFA7] cursor-pointer group shadow-xs"
            >
              <img
                src={customer.visiting_card_path}
                alt={`${customer.company_name} Visiting Card`}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
              />
              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-[11px] font-semibold">
                Click to expand
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Customer app: presence, last location and which sections the customer may see (both administrators) */}
      {isAnyAdmin && (
        <div className="mb-4">
          <CustomerPortalCard customerId={customerId} />
        </div>
      )}

      {/* Portal sign-in details: System Administrator only */}
      {isAdmin && (
        <div className="mb-4">
          <CustomerCredentialsCard customerId={customerId} />
        </div>
      )}

      {/* Metric Chips Grid (TOTAL, OPEN, IN PROGRESS, CLOSED / ORDERED, DELIVERED, VALUE) */}
      <div className="grid grid-cols-4 gap-2 mb-2">
        <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl p-2.5 text-center">
          <p className="text-[10px] font-bold text-[#766B60] uppercase tracking-wider">Total</p>
          <p className="text-sm font-bold text-[#2F2923] mt-0.5">{summary?.total || 0}</p>
        </div>
        <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl p-2.5 text-center">
          <p className="text-[10px] font-bold text-[#C94C4C] uppercase tracking-wider">Open</p>
          <p className="text-sm font-bold text-[#C94C4C] mt-0.5">{summary?.open || 0}</p>
        </div>
        <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl p-2.5 text-center">
          <p className="text-[10px] font-bold text-[#D97732] uppercase tracking-wider truncate">In Prog.</p>
          <p className="text-sm font-bold text-[#D97732] mt-0.5">{summary?.in_progress || 0}</p>
        </div>
        <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl p-2.5 text-center">
          <p className="text-[10px] font-bold text-[#4F7D5B] uppercase tracking-wider">Closed</p>
          <p className="text-sm font-bold text-[#4F7D5B] mt-0.5">{summary?.closed || 0}</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-5">
        <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl p-2.5 text-center">
          <p className="text-[10px] font-bold text-[#6B5744] uppercase tracking-wider">Ordered</p>
          <p className="text-xs font-bold text-[#6B5744] mt-0.5 truncate">
            {Number(summary?.ordered_grams || 0).toFixed(1)}g
          </p>
        </div>
        <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl p-2.5 text-center">
          <p className="text-[10px] font-bold text-[#4F7D5B] uppercase tracking-wider">Delivered</p>
          <p className="text-xs font-bold text-[#4F7D5B] mt-0.5 truncate">
            {Number(summary?.delivered_grams || 0).toFixed(1)}g
          </p>
        </div>
        <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl p-2.5 text-center">
          <p className="text-[10px] font-bold text-[#766B60] uppercase tracking-wider">Paid / Value</p>
          <p className="text-xs font-bold text-[#2F2923] mt-0.5 truncate">
            {formatINR(summary?.total_paid || 0, 0)} / {formatINR(summary?.total_value || 0, 0)}
          </p>
        </div>
      </div>

      {/* Order History List */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-sm font-bold text-[#2F2923] uppercase tracking-wider">
            Order History ({orders.length})
          </h3>
        </div>

        {orders.length === 0 ? (
          <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl p-6 text-center">
            <Package className="mx-auto text-[#B49A7A] mb-2 opacity-50" size={32} />
            <p className="text-xs font-semibold text-[#2F2923]">No orders for this customer yet</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {orders.map((o: any) => {
              const deliveredPcs = Number(o.delivered_pieces || 0);
              const totalPcs = Number(o.total_pieces || 0);
              const deliveredG = Number(o.delivered_weight || 0);
              const expectedG = Number(o.expected_weight || 0);

              return (
                <div
                  key={o.id}
                  onClick={() => onSelectOrder(o.id)}
                  className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl p-3 shadow-xs hover:border-[#B49A7A] active:bg-[#F5F0E8] transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-mono font-bold text-sm text-[#2F2923]">
                      {String(o.order_number).startsWith('#') ? o.order_number : `#${o.order_number}`}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {o.total_amount > 0 && <PaymentStatusBadge status={o.payment_status} small />}
                      {getStatusBadge(o.status)}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-[#766B60]">
                    <div className="flex items-center gap-1 text-[11px]">
                      <Calendar size={12} className="text-[#B49A7A]" />
                      <span>{o.order_date ? o.order_date.substring(0, 10) : ''}</span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="font-medium">
                        {deliveredPcs}/{totalPcs} pcs
                      </span>
                      <span className="font-bold text-[#6B5744]">
                        {deliveredG > 0 ? `${deliveredG.toFixed(1)} / ` : ''}
                        {expectedG.toFixed(1)}g
                      </span>
                      <ChevronRight size={16} className="text-[#B49A7A]" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Lightbox Image Preview Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-xl w-full max-h-[90vh] flex flex-col items-center">
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute -top-12 right-0 w-10 h-10 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/40 cursor-pointer"
            >
              <X size={20} />
            </button>
            <img
              src={previewImage}
              alt="Preview"
              className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl bg-[#FFFCF7]"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}

      {/* Delete Customer Confirmation Modal (Admin Only) */}
      {confirmDeleteOpen && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => !deleting && setConfirmDeleteOpen(false)}
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
                Delete Customer Account?
              </h3>
              <p className="text-xs text-[#766B60] leading-relaxed">
                Are you sure you want to delete{' '}
                <span className="font-semibold text-[#2F2923]">{customer.poc_name}</span> ({customer.company_name})?
                Existing order history will be preserved safely.
              </p>
            </div>

            <div className="space-y-2 pt-2">
              <button
                disabled={deleting}
                onClick={handleDeleteCustomer}
                className="w-full py-3 bg-[#C94C4C] hover:bg-[#B33F3F] active:scale-[0.99] disabled:opacity-50 text-white font-semibold rounded-2xl transition-all shadow-sm flex items-center justify-center gap-2"
              >
                {deleting ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <>
                    <Trash2 size={16} />
                    <span>Confirm Delete</span>
                  </>
                )}
              </button>
              <button
                disabled={deleting}
                onClick={() => setConfirmDeleteOpen(false)}
                className="w-full py-2.5 bg-[#FFFCF7] border border-[#D2BFA7] text-[#2F2923] text-sm font-semibold rounded-2xl hover:bg-[#E8DCCB]/30 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
