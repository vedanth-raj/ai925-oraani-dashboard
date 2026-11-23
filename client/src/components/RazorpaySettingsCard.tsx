import React, { useEffect, useState } from 'react';
import { CreditCard, Eye, EyeOff, Loader2, CheckCircle2, AlertTriangle, ExternalLink, ShieldCheck } from 'lucide-react';
import { api } from '../api';

export const RazorpaySettingsCard: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [keyId, setKeyId] = useState('');
  const [keySecret, setKeySecret] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [hasSecret, setHasSecret] = useState(false);
  const [isTestMode, setIsTestMode] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getRazorpaySettings();
      setKeyId(res.key_id || '');
      setHasSecret(Boolean(res.has_secret));
      setWebhookSecret(res.webhook_secret || '');
      setIsActive(Boolean(res.is_active));
      setIsTestMode(Boolean(res.is_test_mode));
      setIsConfigured(Boolean(res.is_configured));
    } catch (err: any) {
      setError(err.message || 'Could not load Razorpay settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const res = await api.saveRazorpaySettings({
        key_id: keyId,
        ...(keySecret ? { key_secret: keySecret } : {}),
        webhook_secret: webhookSecret,
        is_active: isActive
      });
      setMessage(res.message);
      setHasSecret(true);
      setKeySecret('');
      setIsConfigured(Boolean(keyId && (keySecret || hasSecret)));
      setIsTestMode(keyId.startsWith('rzp_test_'));
      setTimeout(() => setMessage(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Failed to save Razorpay settings');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full px-3 py-2 bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl text-xs text-[#2F2923] focus:outline-none focus:ring-1 focus:ring-[#6B5744]';
  const labelCls = 'block text-[10px] font-bold text-[#766B60] uppercase mb-1 tracking-wider';

  return (
    <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-5 shadow-card space-y-4">
      {/* Title & Brand Isolation Pill */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-[#4A3B32] text-white flex items-center justify-center">
            <CreditCard size={17} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm text-[#2F2923]">Razorpay Payment Gateway</h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-[#FBF0EA] text-[#8C4A28] border border-[#E9C5B2]">
                Oraani Only
              </span>
            </div>
            <p className="text-[11px] text-[#766B60]">Online checkout for Oraani silver orders (UPI, Cards, NetBanking)</p>
          </div>
        </div>
        <a
          href="https://dashboard.razorpay.com/#/app/keys"
          target="_blank"
          rel="noreferrer"
          className="text-[11px] font-bold text-[#4A3B32] flex items-center gap-1 hover:underline"
        >
          <span>Razorpay Keys</span>
          <ExternalLink size={12} />
        </a>
      </div>

      {loading ? (
        <div className="py-6 flex justify-center">
          <Loader2 className="animate-spin text-[#4A3B32]" size={20} />
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-3.5">
          {/* Status Banner */}
          <div className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
            isConfigured && isActive
              ? 'bg-[#E3EEE6] border-[#4F7D5B]/30 text-[#2A5235]'
              : 'bg-[#FBE8DB] border-[#D97732]/30 text-[#8C4A28]'
          }`}>
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} />
              <div>
                <p className="font-bold">
                  {isConfigured && isActive
                    ? `Gateway Live (${isTestMode ? 'Test Mode' : 'Production Live'})`
                    : !isConfigured
                    ? 'Gateway Needs Keys'
                    : 'Gateway Paused'}
                </p>
                <p className="text-[10px] opacity-80">
                  {isConfigured && isActive
                    ? 'Oraani customers will be prompted to pay via Razorpay at checkout.'
                    : 'Add your Key ID and Secret below to activate online payments.'}
                </p>
              </div>
            </div>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={e => setIsActive(e.target.checked)}
                className="w-4 h-4 rounded border-[#D2BFA7] text-[#4A3B32] accent-[#4A3B32]"
              />
              <span className="text-[11px] font-bold">Enabled</span>
            </label>
          </div>

          {/* Key ID Field */}
          <div>
            <label className={labelCls}>Razorpay Key ID</label>
            <input
              type="text"
              value={keyId}
              onChange={e => setKeyId(e.target.value)}
              placeholder="rzp_test_... or rzp_live_..."
              className={inputCls}
            />
            <p className="text-[10px] text-[#766B60] mt-1">Found in your Razorpay Dashboard → Account & Settings → API Keys.</p>
          </div>

          {/* Key Secret Field */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className={labelCls}>Razorpay Key Secret</label>
              {hasSecret && <span className="text-[10px] text-[#4F7D5B] font-bold">✓ Secret Saved</span>}
            </div>
            <div className="relative">
              <input
                type={showSecret ? 'text' : 'password'}
                value={keySecret}
                onChange={e => setKeySecret(e.target.value)}
                placeholder={hasSecret ? '•••••••••••••••••••••••• (Leave blank to keep saved secret)' : 'Paste Key Secret here'}
                className={`${inputCls} pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#766B60] hover:text-[#2F2923]"
              >
                {showSecret ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {/* Webhook Secret Field (Optional) */}
          <div>
            <label className={labelCls}>Webhook Secret (Optional)</label>
            <input
              type="text"
              value={webhookSecret}
              onChange={e => setWebhookSecret(e.target.value)}
              placeholder="Enter webhook secret from Razorpay Webhook settings"
              className={inputCls}
            />
            <p className="text-[10px] text-[#766B60] mt-1">
              Webhook URL for your dashboard: <code className="bg-[#F5F0E8] px-1 py-0.5 rounded text-[10px]">https://app.oraani.in/api/portal/razorpay/webhook</code>
            </p>
          </div>

          {message && (
            <div className="p-2.5 bg-[#E3EEE6] border border-[#4F7D5B]/30 rounded-xl text-xs text-[#2A5235] font-semibold flex items-center gap-1.5">
              <CheckCircle2 size={14} />
              <span>{message}</span>
            </div>
          )}

          {error && (
            <div className="p-2.5 bg-[#FBE9E9] border border-[#C94C4C]/30 rounded-xl text-xs text-[#C94C4C] font-semibold flex items-center gap-1.5">
              <AlertTriangle size={14} />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full py-3 bg-[#4A3B32] hover:bg-[#382B24] active:bg-[#2C211B] text-white font-bold rounded-xl text-xs shadow-sm flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
          >
            {saving && <Loader2 size={15} className="animate-spin" />}
            Save Oraani Razorpay Settings
          </button>
        </form>
      )}
    </div>
  );
};
