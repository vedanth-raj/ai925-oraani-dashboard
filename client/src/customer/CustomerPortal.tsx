import React, { useEffect, useState } from 'react';
import { Store, ShoppingBag, Package, User, Clock, CheckCircle2, XCircle, RefreshCw, LogOut, IdCard, Phone, Mail, MapPin, Pencil, PhoneCall, ShieldAlert } from 'lucide-react';
import { portalApi } from '../api';
import { useCustomerSession } from './customerSession';
import { getBrandConfig, getActiveBrand } from '../brand';
import { ShopHome, CatalogScreen } from './ShopScreens';
import { ProductScreen } from './ProductScreen';
import { CartScreen } from './CartScreen';
import { MyOrdersScreen } from './MyOrdersScreen';
import { BookCallScreen } from './BookCallScreen';
import { EditProfileSheet } from './EditProfileSheet';
import { type Carts, type CartLine, type PurchaseMode, EMPTY_CARTS, addLine, loadCarts, saveCarts } from './cart';

type PortalTab = 'shop' | 'cart' | 'orders' | 'account';
type ShopView = { type: 'home' } | { type: 'call' } | { type: 'catalog'; mode: PurchaseMode } | { type: 'product'; mode: PurchaseMode; productId: string; size?: number };

function VerificationScreen() {
  const { account, refresh, signOut } = useCustomerSession();
  const [checking, setChecking] = useState(false);
  const brandConfig = getBrandConfig(account?.brand || getActiveBrand());

  // Check every 30 s so the portal opens as soon as an administrator approves
  useEffect(() => {
    const timer = setInterval(() => { refresh(); }, 30000);
    return () => clearInterval(timer);
  }, [refresh]);

  if (!account) return null;
  const rejected = account.status === 'REJECTED';
  const steps = [
    { label: 'Administrator review', done: Boolean(account.biz_approved_at || account.sys_approved_at) }
  ];

  return (
    <div className="min-h-screen bg-[#F5F0E8] max-w-lg mx-auto px-5 py-10 flex flex-col screenshot-protected">
      <img src={brandConfig.logoUrl} alt={brandConfig.displayName} className="h-12 w-auto object-contain mx-auto mb-8" />
      <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-3xl p-6 text-center shadow-sm">
        <div className={`w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-4 ${rejected ? 'bg-[#FBE9E9] text-[#C94C4C]' : 'bg-[#FBE8DB] text-[#D97732]'}`}>
          {rejected ? <XCircle size={32} /> : <Clock size={32} />}
        </div>
        {rejected ? (
          <>
            <h1 className="text-xl font-bold text-[#2F2923] mb-2">We couldn't verify your profile</h1>
            <p className="text-sm text-[#766B60]">{account.rejected_reason || 'Please contact us for details.'}</p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold text-[#2F2923] mb-2">Your profile is under verification.</h1>
            <p className="text-sm text-[#766B60]">Once it's verified you will be informed.</p>
          </>
        )}

        {!rejected && (
          <div className="mt-6 space-y-2 text-left">
            {steps.map(s => (
              <div key={s.label} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 border ${s.done ? 'bg-[#E3EEE6] border-[#4F7D5B]/30' : 'bg-[#F5F0E8] border-[#E8DCCB]'}`}>
                {s.done ? <CheckCircle2 size={18} className="text-[#4F7D5B]" /> : <Clock size={18} className="text-[#766B60]" />}
                <span className={`text-sm font-semibold ${s.done ? 'text-[#4F7D5B]' : 'text-[#766B60]'}`}>{s.label}</span>
                <span className="ml-auto text-[11px] font-bold uppercase text-[#766B60]">{s.done ? 'Approved' : 'Pending'}</span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 text-left text-xs text-[#766B60] bg-[#F5F0E8] rounded-xl p-3 space-y-0.5">
          <p className="font-bold text-[#2F2923]">{account.full_name}{account.company_name ? ` · ${account.company_name}` : ''}</p>
          <p>{account.phone} · {account.email}</p>
          <p>{account.address}</p>
        </div>

        <button
          onClick={async () => { setChecking(true); await refresh(); setChecking(false); }}
          className="mt-5 w-full py-3 bg-[#6B5744] text-white font-bold rounded-xl flex items-center justify-center gap-2"
        >
          <RefreshCw size={16} className={checking ? 'animate-spin' : ''} /> Check status
        </button>
      </div>
      <button onClick={signOut} className="mt-6 mx-auto text-xs font-semibold text-[#766B60] flex items-center gap-1.5">
        <LogOut size={14} /> Sign out
      </button>
    </div>
  );
}

const FIELD_LABEL: Record<string, string> = {
  full_name: 'Name', company_name: 'Company', phone: 'Mobile', email: 'Email', address: 'Address', pin_code: 'PIN code'
};

function AccountScreen({ onBookCall }: { onBookCall: () => void }) {
  const { account, signOut, refresh } = useCustomerSession();
  const [requests, setRequests] = useState<any[]>([]);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    portalApi.getStockRequests().then(res => setRequests(res.requests)).catch(() => {});
  }, []);

  if (!account) return null;
  const change = account.change_request;
  const pending = change && change.status === 'PENDING' ? change : null;
  return (
    <div className="px-4 pt-4 pb-24 space-y-4">
      <h1 className="text-2xl font-bold text-[#2F2923]">Account</h1>
      {notice && <p className="text-xs font-semibold text-[#4F7D5B] bg-[#E3EEE6] rounded-xl px-3 py-2">{notice}</p>}
      <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-4 shadow-card">
        <div className="flex items-center gap-2 mb-2">
          <p className="text-lg font-bold text-[#2F2923]">{account.full_name}</p>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-[#E3EEE6] text-[#4F7D5B]">Verified</span>
          {account.account_type && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-[#F5F0E8] text-[#6B5744] border border-[#D2BFA7]">{account.account_type}</span>
          )}
          {!pending && (
            <button onClick={() => { setEditing(true); setNotice(null); }} className="ml-auto flex items-center gap-1 text-xs font-bold text-[#6B5744] px-2 py-1 rounded-lg hover:bg-[#E8DCCB]/60">
              <Pencil size={13} /> Edit
            </button>
          )}
        </div>
        {account.company_name && <p className="text-sm font-semibold text-[#766B60] mb-2">{account.company_name}</p>}
        <div className="space-y-1 text-xs text-[#766B60]">
          <p className="flex items-center gap-1.5"><Phone size={12} />{account.phone}</p>
          <p className="flex items-center gap-1.5"><Mail size={12} />{account.email}</p>
          <p className="flex items-start gap-1.5"><MapPin size={12} className="mt-0.5" />{account.address}{account.pin_code ? ` · ${account.pin_code}` : ''}</p>
        </div>
        {pending && (
          <div className="mt-3 pt-3 border-t border-[#E8DCCB] text-xs">
            <p className="font-bold text-[#D97732] flex items-center gap-1.5"><Clock size={13} /> Change waiting for approval</p>
            <ul className="mt-1 text-[#766B60] space-y-0.5">
              {Object.entries(pending.changes).map(([k, v]) => <li key={k}>{FIELD_LABEL[k] || k}: <span className="text-[#2F2923] font-semibold">{v || '—'}</span></li>)}
              {pending.changes_password && <li>Password: <span className="text-[#2F2923] font-semibold">new password</span></li>}
            </ul>
            <button
              onClick={async () => { await portalApi.withdrawProfileChange().catch(() => {}); await refresh(); }}
              className="mt-2 text-[11px] font-bold text-[#C94C4C]"
            >
              Withdraw this change
            </button>
          </div>
        )}
        {change && change.status === 'REJECTED' && (
          <p className="mt-3 pt-3 border-t border-[#E8DCCB] text-xs text-[#C94C4C]">
            Your last change was not approved{change.rejected_reason ? `: ${change.rejected_reason}` : ''}.
          </p>
        )}
        {account.id_card_path && (
          <div className="mt-3 pt-3 border-t border-[#E8DCCB]">
            <p className="text-[10px] font-bold uppercase text-[#766B60] flex items-center gap-1 mb-1"><IdCard size={12} /> GST / ID Card</p>
            <img src={account.id_card_path} alt="GST / ID card" className="w-32 h-20 object-cover rounded-lg border border-[#D2BFA7]" />
          </div>
        )}
      </div>

      <div>
        <p className="text-[11px] font-bold text-[#766B60] uppercase tracking-wider mb-2">My requests to sellers</p>
        {requests.length === 0 ? (
          <p className="text-xs text-[#766B60] bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl p-3">No requests yet. Use “Request Sellers” on a product when a size is not in ready stock.</p>
        ) : (
          <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl divide-y divide-[#E8DCCB]">
            {requests.map(r => (
              <div key={r.id} className="p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#2F2923]">{r.product_name}{r.size_inches ? ` · ${r.size_inches}"` : ''} × {r.quantity}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${r.status === 'CLOSED' ? 'bg-[#E3EEE6] text-[#4F7D5B]' : 'bg-[#FBE8DB] text-[#D97732]'}`}>
                    {r.status === 'CLOSED' ? 'Closed' : r.status === 'IN_PROGRESS' ? 'In progress' : 'Sent'}
                  </span>
                </div>
                {r.admin_notes && <p className="text-[#6B5744] mt-1">Seller: {r.admin_notes}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      <button onClick={onBookCall} className="w-full bg-[#FFFCF7] border border-[#D2BFA7] text-[#2F2923] py-3 rounded-full font-bold text-sm flex items-center justify-center gap-2">
        <PhoneCall size={16} /> Book a call for a customised order
      </button>

      <button onClick={signOut} className="w-full bg-[#FFFCF7] border border-[#C94C4C]/40 text-[#C94C4C] py-3 rounded-full font-bold text-sm flex items-center justify-center gap-2">
        <LogOut size={16} /> Sign Out
      </button>

      {editing && (
        <EditProfileSheet
          account={account}
          onClose={() => setEditing(false)}
          onSent={async (_acc, message) => { setEditing(false); setNotice(message); await refresh(); }}
        />
      )}
    </div>
  );
}

export const CustomerPortal: React.FC = () => {
  const { account } = useCustomerSession();
  const [tab, setTab] = useState<PortalTab>('shop');
  const [shopView, setShopView] = useState<ShopView>({ type: 'home' });
  const [carts, setCarts] = useState<Carts>(EMPTY_CARTS);
  const [cartMode, setCartMode] = useState<PurchaseMode>('READY_STOCK');
  const [screenshotBlocked, setScreenshotBlocked] = useState(false);

  const brandConfig = getBrandConfig(account?.brand || getActiveBrand());

  // Screenshot restriction & copyright protection (Requirement 9)
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    const triggerWarning = () => {
      setScreenshotBlocked(true);
      try {
        navigator.clipboard?.writeText?.('Screenshots and content copying are restricted on this portal.');
      } catch {}
      setTimeout(() => setScreenshotBlocked(false), 3500);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Block PrintScreen
      if (e.key === 'PrintScreen') {
        e.preventDefault();
        triggerWarning();
        return;
      }
      // Block Ctrl+P (Print), Ctrl+S (Save), Ctrl+U (Source)
      if ((e.ctrlKey || e.metaKey) && ['p', 's', 'u'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        triggerWarning();
        return;
      }
      // Block DevTools shortcuts (F12, Ctrl+Shift+I, Ctrl+Shift+C, Ctrl+Shift+J)
      if (e.key === 'F12' || ((e.ctrlKey || e.metaKey) && e.shiftKey && ['i', 'c', 'j', 's'].includes(e.key.toLowerCase()))) {
        e.preventDefault();
        triggerWarning();
        return;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen') {
        triggerWarning();
      }
    };

    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useEffect(() => {
    if (account?.id) setCarts(loadCarts(account.id));
  }, [account?.id]);

  if (!account) return null;
  if (account.status !== 'APPROVED') return <VerificationScreen />;

  const updateCart = (mode: PurchaseMode, lines: CartLine[]) => {
    setCarts(prev => {
      const next = { ...prev, [mode]: lines };
      saveCarts(account.id, next);
      return next;
    });
  };

  const goTab = (t: PortalTab) => {
    setTab(t);
    window.scrollTo({ top: 0 });
  };

  const cartCount = carts.READY_STOCK.length + carts.ON_ORDER.length;

  const renderShop = () => {
    if (shopView.type === 'catalog') {
      return (
        <CatalogScreen
          mode={shopView.mode}
          onBack={() => setShopView({ type: 'home' })}
          onSelectProduct={(productId, size) => { setShopView({ type: 'product', mode: shopView.mode, productId, size }); window.scrollTo({ top: 0 }); }}
        />
      );
    }
    if (shopView.type === 'call') {
      return <BookCallScreen account={account} onBack={() => setShopView({ type: 'home' })} />;
    }
    if (shopView.type === 'product') {
      const mode = shopView.mode;
      return (
        <ProductScreen
          key={`${shopView.productId}-${mode}`}
          productId={shopView.productId}
          mode={mode}
          initialSize={shopView.size}
          canBuyOnOrder={account.can_view_order !== false}
          cartLines={carts[mode]}
          onBack={() => setShopView({ type: 'catalog', mode })}
          onAddToCart={(lines) => updateCart(mode, lines.reduce((acc, line) => addLine(acc, line), carts[mode]))}
          onSwitchMode={(m) => setShopView({ type: 'product', mode: m, productId: shopView.productId })}
          onGoToCart={() => { setCartMode(mode); goTab('cart'); }}
        />
      );
    }
    return <ShopHome account={account} onChoose={(mode) => setShopView({ type: 'catalog', mode })} onBookCall={() => setShopView({ type: 'call' })} />;
  };

  const tabs: { key: PortalTab; label: string; icon: React.ElementType }[] = [
    { key: 'shop', label: 'Shop', icon: Store },
    { key: 'cart', label: 'Cart', icon: ShoppingBag },
    { key: 'orders', label: 'Orders', icon: Package },
    { key: 'account', label: 'Account', icon: User }
  ];

  return (
    <div className="min-h-screen bg-[#E8DCCB]/30 flex justify-center screenshot-protected select-none">
      <div className="w-full max-w-lg min-h-screen bg-[#F5F0E8] text-[#2F2923] font-sans antialiased relative shadow-md overflow-hidden">
        {/* Anti-screenshot Watermark */}
        <div className="pointer-events-none fixed inset-0 z-30 flex flex-col justify-around opacity-[0.035] select-none overflow-hidden max-w-lg mx-auto" aria-hidden="true">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="text-center font-mono text-[13px] tracking-widest text-[#2F2923] transform -rotate-12 whitespace-nowrap">
              {brandConfig.displayName} · {account.full_name} · {account.phone} · Confidential
            </div>
          ))}
        </div>

        {/* Screenshot Blocked Notification Toast */}
        {screenshotBlocked && (
          <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-[#2F2923] text-white px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-2 text-xs font-semibold animate-bounce max-w-[90%]">
            <ShieldAlert size={16} className="text-[#D97732] shrink-0" />
            <span>Screenshots and screen capture are restricted for security reasons.</span>
          </div>
        )}

        <main className="pb-16 relative z-10">
          {tab === 'shop' && renderShop()}
          {tab === 'cart' && (
            <CartScreen
              carts={carts}
              initialMode={cartMode}
              onChange={updateCart}
              onShop={(mode) => { setShopView({ type: 'catalog', mode }); goTab('shop'); }}
              onOrderPlaced={() => goTab('orders')}
            />
          )}
          {tab === 'orders' && <MyOrdersScreen />}
          {tab === 'account' && <AccountScreen onBookCall={() => { setShopView({ type: 'call' }); goTab('shop'); }} />}
        </main>

        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 z-40 bg-[#FFFCF7] border-t border-[#D2BFA7] safe-bottom w-full max-w-lg">
          <div className="flex items-center justify-around h-16">
            {tabs.map(t => {
              const Icon = t.icon;
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => {
                    if (t.key === 'shop' && tab === 'shop') setShopView({ type: 'home' });
                    goTab(t.key);
                  }}
                  className="relative flex-1 flex flex-col items-center justify-center py-1"
                >
                  <Icon size={22} strokeWidth={active ? 2.4 : 1.8} className={active ? 'text-[#6B5744]' : 'text-[#766B60]'} />
                  <span style={{ fontSize: '11px' }} className={`mt-1 font-semibold ${active ? 'text-[#6B5744]' : 'text-[#766B60]'}`}>{t.label}</span>
                  {t.key === 'cart' && cartCount > 0 && (
                    <span className="absolute top-0 right-[calc(50%-20px)] min-w-[18px] h-[18px] px-1 rounded-full bg-[#C94C4C] text-white text-[10px] font-bold flex items-center justify-center">
                      {cartCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
};
