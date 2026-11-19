import React, { useState } from 'react';
import { X, CreditCard, Smartphone, Landmark, Banknote, Loader2, CheckCircle2, ShieldCheck } from 'lucide-react';
import { formatINR } from '../pricing';
import type { PaymentOptions, PaymentPlan } from '../api';

export type PaymentMethod = 'UPI' | 'CARD' | 'NET_BANKING' | 'CASH';

interface DummyPaymentModalProps {
  orderNumber: string;
  amountDue: number;
  allowCash?: boolean; // staff can record cash; customers pay online
  allowPartial?: boolean;
  // On Order purchases not yet paid: choose a 20% advance or full payment with a small discount
  options?: PaymentOptions | null;
  onPay: (method: PaymentMethod, amount: number, plan?: PaymentPlan) => Promise<void>;
  onClose: () => void;
}

// Discount percentages like 0.025 keep their digits; whole numbers stay short
const pctLabel = (n: number) => `${parseFloat(n.toFixed(4))}%`;

const METHODS: { key: PaymentMethod; label: string; icon: React.ElementType }[] = [
  { key: 'UPI', label: 'UPI', icon: Smartphone },
  { key: 'CARD', label: 'Card', icon: CreditCard },
  { key: 'NET_BANKING', label: 'Net Banking', icon: Landmark },
  { key: 'CASH', label: 'Cash', icon: Banknote }
];

// Test-mode gateway: no money moves. Every payment succeeds after a short simulated authorisation.
export const DummyPaymentModal: React.FC<DummyPaymentModalProps> = ({ orderNumber, amountDue, allowCash = false, allowPartial = false, options, onPay, onClose }) => {
  const [method, setMethod] = useState<PaymentMethod>('UPI');
  const [amount, setAmount] = useState(String(amountDue.toFixed(2)));
  const [stage, setStage] = useState<'choose' | 'processing' | 'done'>('choose');
  const [error, setError] = useState<string | null>(null);
  const hasPlans = Boolean(options && options.choices && options.advance && options.full);
  const [plan, setPlan] = useState<PaymentPlan>('ADVANCE');

  const payAmount = hasPlans
    ? (plan === 'ADVANCE' ? options!.advance!.amount : options!.full!.amount)
    : allowPartial ? parseFloat(amount) || 0 : amountDue;

  const handlePay = async () => {
    if (!(payAmount > 0)) {
      setError('Enter an amount greater than zero');
      return;
    }
    setError(null);
    setStage('processing');
    await new Promise(r => setTimeout(r, 1200));
    try {
      await onPay(method, payAmount, hasPlans ? plan : undefined);
      setStage('done');
    } catch (err: any) {
      setError(err.message || 'Payment failed');
      setStage('choose');
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-md bg-[#FFFCF7] border border-[#D2BFA7] rounded-t-3xl sm:rounded-2xl p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-[#4F7D5B]" />
            <h3 className="font-bold text-base text-[#2F2923]">Secure Payment</h3>
            <span className="text-[9px] font-bold uppercase tracking-wider bg-[#FBE8DB] text-[#D97732] px-2 py-0.5 rounded-full">Test mode</span>
          </div>
          {stage !== 'processing' && (
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-[#F5F0E8] border border-[#D2BFA7] flex items-center justify-center text-[#766B60]">
              <X size={16} />
            </button>
          )}
        </div>

        {stage === 'done' ? (
          <div className="text-center py-6">
            <CheckCircle2 size={48} className="mx-auto text-[#4F7D5B] mb-2" />
            <p className="text-lg font-bold text-[#2F2923]">Payment successful</p>
            <p className="text-xs text-[#766B60] mt-1">{formatINR(payAmount)} received for order {orderNumber}</p>
            <button onClick={onClose} className="mt-5 w-full py-3 bg-[#6B5744] text-white font-semibold rounded-xl">
              Done
            </button>
          </div>
        ) : stage === 'processing' ? (
          <div className="text-center py-10">
            <Loader2 size={36} className="mx-auto animate-spin text-[#6B5744] mb-3" />
            <p className="text-sm font-semibold text-[#2F2923]">Authorising {formatINR(payAmount)}…</p>
            <p className="text-[11px] text-[#766B60] mt-1">Please don't close this window</p>
          </div>
        ) : (
          <>
            <div className="bg-[#F5F0E8] border border-[#E8DCCB] rounded-xl p-3 mb-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#766B60]">Order {orderNumber}</p>
                <p className="text-xs text-[#766B60]">Amount due</p>
              </div>
              <p className="text-xl font-extrabold text-[#2F2923]">{formatINR(amountDue)}</p>
            </div>

            {hasPlans && (
              <>
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#766B60] mb-2">How much to pay now</p>
                <div className="space-y-2 mb-4">
                  <button
                    type="button"
                    onClick={() => setPlan('ADVANCE')}
                    className={`w-full text-left rounded-xl border p-3 transition-all ${plan === 'ADVANCE' ? 'border-[#6B5744] bg-[#E8DCCB]/50 ring-1 ring-[#6B5744]' : 'border-[#D2BFA7] bg-[#FFFCF7]'}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-[#2F2923]">{pctLabel(options!.advance!.pct)} advance</span>
                      <span className="text-base font-extrabold text-[#2F2923]">{formatINR(options!.advance!.amount)}</span>
                    </div>
                    <p className="text-[11px] text-[#766B60] mt-0.5">Pay the balance of {formatINR(amountDue - options!.advance!.amount)} later.</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlan('FULL')}
                    className={`w-full text-left rounded-xl border p-3 transition-all ${plan === 'FULL' ? 'border-[#4F7D5B] bg-[#E3EEE6]/60 ring-1 ring-[#4F7D5B]' : 'border-[#D2BFA7] bg-[#FFFCF7]'}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-[#2F2923]">Full payment</span>
                      <span className="text-base font-extrabold text-[#2F2923]">{formatINR(options!.full!.amount)}</span>
                    </div>
                    <p className="text-[11px] font-semibold text-[#4F7D5B] mt-0.5">
                      Get {pctLabel(options!.full!.discount_pct)} off · you save {formatINR(options!.full!.discount)}
                    </p>
                  </button>
                </div>
              </>
            )}

            <p className="text-[11px] font-bold uppercase tracking-wider text-[#766B60] mb-2">Pay with</p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {METHODS.filter(m => allowCash || m.key !== 'CASH').map(m => {
                const Icon = m.icon;
                const active = method === m.key;
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setMethod(m.key)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                      active ? 'bg-[#6B5744] text-white border-[#6B5744]' : 'bg-[#FFFCF7] text-[#2F2923] border-[#D2BFA7]'
                    }`}
                  >
                    <Icon size={16} />
                    {m.label}
                  </button>
                );
              })}
            </div>

            {allowPartial && !hasPlans && (
              <div className="mb-4">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[#766B60] mb-1.5">Amount (₹)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="w-full px-4 py-2.5 bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl text-sm text-[#2F2923] focus:outline-none focus:ring-1 focus:ring-[#6B5744]"
                />
              </div>
            )}

            {error && <p className="mb-3 text-xs text-[#C94C4C] font-medium">{error}</p>}

            <button
              type="button"
              onClick={handlePay}
              className="w-full py-3.5 bg-[#4F7D5B] hover:bg-[#426B4D] text-white font-bold rounded-xl shadow-sm"
            >
              Pay {formatINR(payAmount)}
            </button>
            <p className="text-[10px] text-center text-[#766B60] mt-2">Dummy gateway for testing — no real money is charged.</p>
          </>
        )}
      </div>
    </div>
  );
};

export const PaymentStatusBadge: React.FC<{ status?: string | null; small?: boolean }> = ({ status, small }) => {
  const s = status || 'UNPAID';
  const style = s === 'PAID'
    ? 'bg-[#E3EEE6] text-[#4F7D5B] border-[#4F7D5B]/30'
    : s === 'PARTIAL'
      ? 'bg-[#FBE8DB] text-[#D97732] border-[#D97732]/30'
      : 'bg-[#F5F0E8] text-[#766B60] border-[#D2BFA7]';
  return (
    <span className={`inline-flex items-center rounded-full border font-bold uppercase tracking-wider ${small ? 'text-[9px] px-1.5 py-0.5' : 'text-[10px] px-2 py-0.5'} ${style}`}>
      {s === 'PAID' ? 'Paid' : s === 'PARTIAL' ? 'Part paid' : 'Unpaid'}
    </span>
  );
};
