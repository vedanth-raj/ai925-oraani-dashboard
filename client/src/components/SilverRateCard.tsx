import React, { useEffect, useState } from 'react';
import { RefreshCw, Pencil, Check, X, Radio, Hand } from 'lucide-react';
import { api, type SilverRate } from '../api';
import { formatINR } from '../pricing';

interface SilverRateCardProps {
  canManage: boolean;
  showSettings?: boolean; // premium % and history (Settings screen)
}

function timeAgo(iso?: string | null): string {
  if (!iso) return '';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export const SilverRateCard: React.FC<SilverRateCardProps> = ({ canManage, showSettings = false }) => {
  const [rate, setRate] = useState<SilverRate | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [premium, setPremium] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const load = async () => {
    try {
      const res = await api.getSilverRate();
      setRate(res.silver_rate);
      setHistory(res.history || []);
      setPremium(String(res.silver_rate.premium_pct ?? 0));
    } catch (err: any) {
      setMessage({ text: err.message || 'Could not load silver rate', error: true });
    }
  };

  useEffect(() => {
    load();
  }, []);

  const run = async (fn: () => Promise<any>, ok: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fn();
      if (res?.refresh_error) {
        setMessage({ text: `Saved, but live rate unavailable: ${res.refresh_error}`, error: true });
      } else {
        setMessage({ text: ok });
      }
      await load();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed', error: true });
    } finally {
      setBusy(false);
    }
  };

  const saveManual = () => {
    const value = parseFloat(draft);
    if (!(value > 0)) {
      setMessage({ text: 'Enter a rate greater than zero', error: true });
      return;
    }
    run(() => api.setSilverRate(value), 'Rate updated for all products').then(() => setEditing(false));
  };

  const isLive = rate?.mode === 'auto';

  return (
    <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold tracking-wider text-[#766B60] uppercase">Silver rate today</p>
          {editing ? (
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-lg font-bold text-[#2F2923]">₹</span>
              <input
                type="number"
                step="0.01"
                min="0"
                autoFocus
                value={draft}
                onChange={e => setDraft(e.target.value)}
                className="w-28 px-2 py-1 bg-[#F5F0E8] border border-[#D2BFA7] rounded-lg text-lg font-bold text-[#2F2923] focus:outline-none focus:ring-1 focus:ring-[#6B5744]"
              />
              <span className="text-sm text-[#766B60]">/g</span>
              <button disabled={busy} onClick={saveManual} className="w-8 h-8 rounded-lg bg-[#6B5744] text-white flex items-center justify-center" title="Save rate">
                <Check size={16} />
              </button>
              <button onClick={() => setEditing(false)} className="w-8 h-8 rounded-lg bg-[#F5F0E8] border border-[#D2BFA7] text-[#766B60] flex items-center justify-center" title="Cancel">
                <X size={16} />
              </button>
            </div>
          ) : (
            <p className="text-2xl font-bold text-[#2F2923] mt-0.5">
              {rate?.rate_per_gram ? `${formatINR(rate.rate_per_gram)}` : '—'}
              <span className="text-sm font-semibold text-[#766B60]"> /g</span>
            </p>
          )}
          <p className="text-[11px] text-[#766B60] mt-0.5 flex items-center gap-1">
            {isLive ? <Radio size={11} className="text-[#4F7D5B]" /> : <Hand size={11} className="text-[#D97732]" />}
            <span>
              {isLive ? 'Live market rate, auto-updated hourly' : `Manual rate${rate?.set_by_name ? ` by ${rate.set_by_name}` : ''}`}
              {rate?.updated_at ? ` · ${timeAgo(rate.updated_at)}` : ''}
            </span>
          </p>
        </div>

        {canManage && !editing && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => {
                setDraft(rate?.rate_per_gram ? String(rate.rate_per_gram) : '');
                setEditing(true);
              }}
              title="Set rate manually"
              className="w-9 h-9 rounded-xl bg-[#F5F0E8] border border-[#D2BFA7] text-[#6B5744] flex items-center justify-center"
            >
              <Pencil size={15} />
            </button>
            <button
              disabled={busy}
              onClick={() => run(() => api.refreshSilverRate(), 'Live rate fetched — automatic updates on')}
              title="Fetch live rate now"
              className="w-9 h-9 rounded-xl bg-[#F5F0E8] border border-[#D2BFA7] text-[#6B5744] flex items-center justify-center"
            >
              <RefreshCw size={15} className={busy ? 'animate-spin' : ''} />
            </button>
          </div>
        )}
      </div>

      {message && (
        <p className={`text-[11px] mt-2 font-medium ${message.error ? 'text-[#C94C4C]' : 'text-[#4F7D5B]'}`}>{message.text}</p>
      )}
      {!message && rate?.last_error && isLive && (
        <p className="text-[11px] mt-2 text-[#D97732]">Last live update failed ({rate.last_error}); showing the previous rate.</p>
      )}

      {showSettings && canManage && (
        <div className="mt-3 pt-3 border-t border-[#E8DCCB] space-y-3">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[#766B60] mb-1">Market premium over international spot (%)</label>
            <div className="flex gap-2">
              <input
                type="number"
                step="0.1"
                value={premium}
                onChange={e => setPremium(e.target.value)}
                className="flex-1 px-3 py-2 bg-[#F5F0E8] border border-[#D2BFA7] rounded-xl text-sm text-[#2F2923] focus:outline-none focus:ring-1 focus:ring-[#6B5744]"
              />
              <button
                disabled={busy}
                onClick={() => run(() => api.updateSilverRateSettings({ premium_pct: parseFloat(premium) || 0, mode: 'auto' }), 'Premium saved and live rate refreshed')}
                className="px-4 py-2 bg-[#6B5744] text-white text-xs font-semibold rounded-xl"
              >
                Save & use live
              </button>
            </div>
            <p className="text-[10px] text-[#766B60] mt-1">
              Live rate = international silver (USD/oz) × USD→INR ÷ 31.1035 g, plus this premium for import duty / local market.
              {rate?.usd_per_oz ? ` Last spot: $${rate.usd_per_oz.toFixed(2)}/oz at ₹${rate.usd_inr?.toFixed(2)}/$.` : ''}
            </p>
          </div>

          {history.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#766B60] mb-1">Recent rates</p>
              <div className="max-h-40 overflow-y-auto divide-y divide-[#E8DCCB] text-xs">
                {history.map((h, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5">
                    <span className="text-[#766B60]">{new Date(h.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    <span className="text-[#766B60]">{h.source === 'live' ? 'Live' : `Manual${h.set_by_name ? ` · ${h.set_by_name}` : ''}`}</span>
                    <span className="font-semibold text-[#2F2923]">{formatINR(h.rate_per_gram)}/g</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
