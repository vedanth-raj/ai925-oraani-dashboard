import React, { useState, useEffect } from 'react';
import { X, ShieldCheck, Loader2, CheckCircle2, Smartphone, CreditCard, Landmark, AlertCircle, Sparkles } from 'lucide-react';
import { formatINR } from '../pricing';
import { portalApi, type PaymentOptions, type PaymentPlan } from '../api';
import { getBrandConfig } from '../brand';

interface OraaniRazorpayModalProps {
  orderId: string;
  orderNumber: string;
  amountDue: number;
  options?: PaymentOptions | null;
  onSuccess: () => void;
  onClose: () => void;
}

// Helper to inject a script element
function injectScript(src: string): Promise<boolean> {
  return new Promise(resolve => {
    try {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.head.appendChild(s);
    } catch {
      resolve(false);
    }
  });
}

// Dynamically ensure Razorpay SDK script is loaded and ready
async function loadRazorpayScript(): Promise<boolean> {
  if (typeof window !== 'undefined' && (window as any).Razorpay) {
    return true;
  }

  // 1. If script is already in DOM, poll for window.Razorpay
  const existing = typeof document !== 'undefined'
    ? document.querySelector('script[src*="razorpay"]')
    : null;

  if (existing) {
    for (let i = 0; i < 20; i++) {
      if ((window as any).Razorpay) return true;
      await new Promise(r => setTimeout(r, 150));
    }
  }

  // 2. Try loading self-hosted first (same-origin, cannot be blocked by DNS/ad-blockers)
  const localOk = await injectScript('/razorpay-checkout.js');
  if (localOk && (window as any).Razorpay) {
    return true;
  }

  // 3. Fallback to official CDN
  const cdnOk = await injectScript('https://checkout.razorpay.com/v1/checkout.js');
  if (cdnOk && (window as any).Razorpay) {
    return true;
  }

  return Boolean(typeof window !== 'undefined' && (window as any).Razorpay);
}

export const OraaniRazorpayModal: React.FC<OraaniRazorpayModalProps> = ({
  orderId,
  orderNumber,
  amountDue,
  options,
  onSuccess,
  onClose
}) => {
  const brandConfig = getBrandConfig('ORAANI');
  const cleanOrderNumber = String(orderNumber || '').replace(/^#+/, '');
  const hasPlans = Boolean(options && options.choices && options.advance && options.full);
  const [plan, setPlan] = useState<PaymentPlan>('ADVANCE');
  const [stage, setStage] = useState<'choose' | 'loading' | 'done'>('choose');
  const [error, setError] = useState<string | null>(null);

  // Pre-fetch Razorpay SDK immediately when modal opens
  useEffect(() => {
    loadRazorpayScript().catch(() => {});
  }, []);

  const payableAmount = hasPlans
    ? (plan === 'ADVANCE' ? options!.advance!.amount : options!.full!.amount)
    : amountDue;

  const handlePay = async () => {
    setError(null);
    setStage('loading');

    try {
      // 1. Create order on backend (strictly Oraani)
      const rzpOrder = await portalApi.createRazorpayOrder(orderId, hasPlans ? plan : undefined);

      // 2. If sandbox/simulated fallback (keys not yet set in production)
      if (rzpOrder.is_simulated) {
        // Complete via simulation verify
        await portalApi.verifyRazorpayPayment(orderId, {
          razorpay_order_id: rzpOrder.razorpay_order_id,
          razorpay_payment_id: 'pay_sim_' + Date.now().toString(36),
          razorpay_signature: 'valid_simulated_sig',
          plan: hasPlans ? plan : undefined
        });
        setStage('done');
        return;
      }

      // 3. Load Razorpay Checkout JS (multi-tier loader)
      const loaded = await loadRazorpayScript();
      if (!loaded) {
        throw new Error('Could not load Razorpay checkout SDK. Please disable content/ad blockers or check your internet connection.');
      }

      // 4. Launch official Razorpay standard checkout
      const rzpOptions = {
        key: rzpOrder.key_id,
        amount: rzpOrder.amount, // in paise
        currency: rzpOrder.currency || 'INR',
        name: brandConfig.displayName || 'Oraani',
        description: `Order #${cleanOrderNumber}`,
        image: brandConfig.logoUrl || '/oraani-logo.svg',
        order_id: rzpOrder.razorpay_order_id,
        prefill: {
          name: rzpOrder.customer?.name || '',
          contact: rzpOrder.customer?.phone || '',
          email: rzpOrder.customer?.email || ''
        },
        notes: {
          order_id: orderId,
          order_number: cleanOrderNumber,
          brand: 'ORAANI'
        },
        theme: {
          color: '#4A3B32' // Oraani signature luxury brown
        },
        handler: async (response: any) => {
          try {
            setStage('loading');
            await portalApi.verifyRazorpayPayment(orderId, {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              plan: hasPlans ? plan : undefined
            });
            setStage('done');
          } catch (verifyErr: any) {
            setError(verifyErr.message || 'Payment signature verification failed.');
            setStage('choose');
          }
        },
        modal: {
          ondismiss: () => {
            setStage('choose');
          }
        }
      };

      const razorpayInstance = new (window as any).Razorpay(rzpOptions);
      razorpayInstance.on('payment.failed', (resp: any) => {
        const desc = resp.error?.description || 'Payment was unsuccessful or cancelled.';
        setError(desc);
        setStage('choose');
      });
      razorpayInstance.open();
    } catch (err: any) {
      setError(err.message || 'Failed to initiate payment.');
      setStage('choose');
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-5 shadow-2xl max-h-[88vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-[#4A3B32] text-[#E8DCCB] flex items-center justify-center">
              <ShieldCheck size={16} />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="font-bold text-base text-[#2F2923]">Oraani Secure Payment</h3>
                <span className="text-[9px] font-bold uppercase tracking-wider bg-[#E8DCCB] text-[#4A3B32] px-2 py-0.5 rounded-full border border-[#D2BFA7]">
                  Razorpay
                </span>
              </div>
              <p className="text-[10px] text-[#766B60]">Official Payment Gateway for Oraani</p>
            </div>
          </div>
          {stage !== 'loading' && (
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-[#F5F0E8] border border-[#D2BFA7] flex items-center justify-center text-[#766B60] hover:text-[#2F2923]"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {stage === 'done' ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 rounded-full bg-[#E3EEE6] text-[#4F7D5B] flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 size={36} />
            </div>
            <h4 className="text-xl font-bold text-[#2F2923]">Payment Successful!</h4>
            <p className="text-xs text-[#766B60] mt-1.5">
              {formatINR(payableAmount)} received for order <strong>#{cleanOrderNumber}</strong>.
            </p>
            <p className="text-[11px] text-[#4F7D5B] font-semibold mt-1">
              Verified by Oraani & Razorpay
            </p>
            <button
              onClick={() => {
                onClose();
                onSuccess();
              }}
              className="mt-6 w-full py-3.5 bg-[#4A3B32] hover:bg-[#382B24] active:bg-[#2C211B] text-[#FFFCF7] font-bold rounded-xl shadow-md transition-all cursor-pointer"
            >
              View My Orders
            </button>
          </div>
        ) : stage === 'loading' ? (
          <div className="text-center py-10">
            <Loader2 size={38} className="mx-auto animate-spin text-[#4A3B32] mb-3" />
            <p className="text-sm font-semibold text-[#2F2923]">Connecting to Razorpay…</p>
            <p className="text-[11px] text-[#766B60] mt-1">Opening secure UPI, Card & NetBanking window</p>
          </div>
        ) : (
          <>
            {/* Order Amount Card */}
            <div className="bg-[#F5F0E8] border border-[#E8DCCB] rounded-xl p-3.5 mb-3 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#766B60]">Order #{cleanOrderNumber}</p>
                <p className="text-xs font-semibold text-[#2F2923]">Total Amount Due</p>
              </div>
              <p className="text-xl font-extrabold text-[#2F2923]">{formatINR(amountDue)}</p>
            </div>

            {/* Payment Plans for On-Order */}
            {hasPlans && (
              <div className="mb-3 space-y-1.5">
                <p className="text-[10px] font-bold text-[#766B60] uppercase tracking-wider">Choose payment amount</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPlan('ADVANCE')}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      plan === 'ADVANCE'
                        ? 'bg-[#EFE8F7] border-[#8C4A28] shadow-xs'
                        : 'bg-[#FFFCF7] border-[#D2BFA7]'
                    }`}
                  >
                    <p className="text-[10px] font-bold uppercase text-[#8C4A28]">20% Advance</p>
                    <p className="text-sm font-extrabold text-[#2F2923] mt-0.5">{formatINR(options!.advance!.amount)}</p>
                    <p className="text-[10px] text-[#766B60] mt-0.5">Balance when ready</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPlan('FULL')}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      plan === 'FULL'
                        ? 'bg-[#E3EEE6] border-[#4F7D5B] shadow-xs'
                        : 'bg-[#FFFCF7] border-[#D2BFA7]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-bold uppercase text-[#4F7D5B]">Pay in full</p>
                      <span className="text-[9px] font-bold text-[#4F7D5B] bg-white px-1.5 py-0.5 rounded">
                        Save {formatINR(options!.full!.discount)}
                      </span>
                    </div>
                    <p className="text-sm font-extrabold text-[#2F2923] mt-0.5">{formatINR(options!.full!.amount)}</p>
                    <p className="text-[10px] text-[#766B60] mt-0.5">Instant full discount</p>
                  </button>
                </div>
              </div>
            )}

            {/* Payment Methods Supported */}
            <div className="bg-[#FFFCF7] border border-[#E8DCCB] rounded-xl p-3 mb-4 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#766B60]">Supported Payment Methods</p>
              <div className="grid grid-cols-3 gap-1.5 text-center">
                <div className="bg-[#F5F0E8] p-2 rounded-lg flex flex-col items-center">
                  <Smartphone size={16} className="text-[#4A3B32] mb-1" />
                  <span className="text-[10px] font-bold text-[#2F2923]">UPI / QR</span>
                  <span className="text-[9px] text-[#766B60]">GPay, PhonePe, Paytm</span>
                </div>
                <div className="bg-[#F5F0E8] p-2 rounded-lg flex flex-col items-center">
                  <CreditCard size={16} className="text-[#4A3B32] mb-1" />
                  <span className="text-[10px] font-bold text-[#2F2923]">Cards</span>
                  <span className="text-[9px] text-[#766B60]">Visa, Master, RuPay</span>
                </div>
                <div className="bg-[#F5F0E8] p-2 rounded-lg flex flex-col items-center">
                  <Landmark size={16} className="text-[#4A3B32] mb-1" />
                  <span className="text-[10px] font-bold text-[#2F2923]">NetBanking</span>
                  <span className="text-[9px] text-[#766B60]">50+ Indian banks</span>
                </div>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-[#FBE9E9] border border-[#C94C4C]/30 rounded-xl text-xs text-[#C94C4C] font-medium mb-3 flex items-start gap-1.5">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Pay Button */}
            <button
              onClick={handlePay}
              className="w-full py-3.5 bg-[#4A3B32] hover:bg-[#382B24] active:bg-[#2C211B] text-[#FFFCF7] font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 text-sm cursor-pointer"
            >
              <Sparkles size={16} /> Pay via Razorpay · {formatINR(payableAmount)}
            </button>
            <p className="text-[10px] text-center text-[#766B60] mt-2">
              🔒 100% Secure 256-bit encrypted checkout powered by Razorpay
            </p>
          </>
        )}
      </div>
    </div>
  );
};
