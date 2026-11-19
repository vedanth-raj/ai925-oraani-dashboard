import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './auth';
import { BottomNav, type TabKey } from './components/BottomNav';
import type { RequestsTab } from './screens/RequestsScreen';
import { CustomerSessionProvider, useCustomerSession } from './customer/customerSession';
import { LandingScreen } from './customer/LandingScreen';
import { getBrandConfig, getActiveBrand } from './brand';

// Each screen is its own download, fetched the first time it opens: customers never load the admin screens,
// and staff only load the screens they use
const named = <T extends Record<string, any>, K extends keyof T>(load: () => Promise<T>, key: K) =>
  lazy(() => load().then(m => ({ default: m[key] })));
const LoginScreen = named(() => import('./screens/LoginScreen'), 'LoginScreen');
const DashboardScreen = named(() => import('./screens/DashboardScreen'), 'DashboardScreen');
const OrdersScreen = named(() => import('./screens/OrdersScreen'), 'OrdersScreen');
const NewOrderScreen = named(() => import('./screens/NewOrderScreen'), 'NewOrderScreen');
const OrderDetailsScreen = named(() => import('./screens/OrderDetailsScreen'), 'OrderDetailsScreen');
const ProductsScreen = named(() => import('./screens/ProductsScreen'), 'ProductsScreen');
const NewProductScreen = named(() => import('./screens/NewProductScreen'), 'NewProductScreen');
const ProductDetailsScreen = named(() => import('./screens/ProductDetailsScreen'), 'ProductDetailsScreen');
const CustomersScreen = named(() => import('./screens/CustomersScreen'), 'CustomersScreen');
const NewCustomerScreen = named(() => import('./screens/NewCustomerScreen'), 'NewCustomerScreen');
const CustomerDetailsScreen = named(() => import('./screens/CustomerDetailsScreen'), 'CustomerDetailsScreen');
const CompaniesScreen = named(() => import('./screens/CompaniesScreen'), 'CompaniesScreen');
const CategoriesScreen = named(() => import('./screens/CategoriesScreen'), 'CategoriesScreen');
const SettingsScreen = named(() => import('./screens/SettingsScreen'), 'SettingsScreen');
const MoreScreen = named(() => import('./screens/MoreScreen'), 'MoreScreen');
const PrivateCloudScreen = named(() => import('./screens/PrivateCloudScreen'), 'PrivateCloudScreen');
const WholeInventoryScreen = named(() => import('./screens/WholeInventoryScreen'), 'WholeInventoryScreen');
const StatePricingScreen = named(() => import('./screens/StatePricingScreen'), 'StatePricingScreen');
const DeliveryChargesScreen = named(() => import('./screens/DeliveryChargesScreen'), 'DeliveryChargesScreen');
const SlabDiscountsScreen = named(() => import('./screens/SlabDiscountsScreen'), 'SlabDiscountsScreen');
const RequestsScreen = named(() => import('./screens/RequestsScreen'), 'RequestsScreen');
const CustomerAuthScreen = named(() => import('./customer/CustomerAuthScreen'), 'CustomerAuthScreen');
const CustomerPortal = named(() => import('./customer/CustomerPortal'), 'CustomerPortal');

const ScreenLoading = () => (
  <div className="min-h-[50vh] flex items-center justify-center" role="status" aria-label="Loading">
    <div className="w-6 h-6 border-2 border-[#6B5744] border-t-transparent rounded-full animate-spin"></div>
  </div>
);
import { WifiOff, Download } from 'lucide-react';

type SubView = 
  | { type: 'tab'; tab: TabKey }
  | { type: 'new_order' }
  | { type: 'edit_order'; orderId: string }
  | { type: 'order_details'; orderId: string }
  | { type: 'new_product' }
  | { type: 'edit_product'; productId: string }
  | { type: 'product_details'; productId: string }
  | { type: 'new_customer' }
  | { type: 'edit_customer'; customerId: string }
  | { type: 'customer_details'; customerId: string }
  | { type: 'companies' }
  | { type: 'categories' }
  | { type: 'settings' }
  | { type: 'cloud' }
  | { type: 'inventory' }
  | { type: 'state_pricing' }
  | { type: 'delivery_charges' }
  | { type: 'slab_discounts' }
  | { type: 'requests'; tab: RequestsTab };

// Signed-out entry: customer landing (sign in / sign up), customer portal, or staff login
function PublicEntry() {
  const customer = useCustomerSession();
  const [view, setView] = useState<'landing' | 'signin' | 'signup' | 'staff'>('landing');

  // Once signed in, a later sign-out should come back to the landing page, not the old form
  useEffect(() => {
    if (customer.token) setView('landing');
  }, [customer.token]);

  if (!customer.ready) {
    return (
      <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#6B5744] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }
  if (customer.token && customer.account) {
    return <CustomerPortal />;
  }
  if (view === 'staff') {
    return <LoginScreen onBack={() => setView('landing')} />;
  }
  if (view === 'signin' || view === 'signup') {
    return <CustomerAuthScreen mode={view} onSwitchMode={setView} onBack={() => setView('landing')} />;
  }
  return (
    <LandingScreen
      onSignIn={() => setView('signin')}
      onSignUp={() => setView('signup')}
      onStaffLogin={() => setView('staff')}
    />
  );
}

function MainApp() {
  const { token, ready } = useAuth();
  const [viewStack, setViewStack] = useState<SubView[]>([{ type: 'tab', tab: 'dashboard' }]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  const [orderStatusFilter, setOrderStatusFilter] = useState<'All' | 'OPEN' | 'IN_PROGRESS' | 'CLOSED'>('All');
  const [orderRegionFilters, setOrderRegionFilters] = useState<{ zone?: string; state?: string; city?: string }>({});

  // Horizontal Swipe Navigation (iOS & Android): Swipe left/right redirects to Main Dashboard
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const touchStartTimeRef = useRef<number>(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
    touchStartTimeRef.current = Date.now();
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null || touchStartYRef.current === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const deltaX = touchEndX - touchStartXRef.current;
    const deltaY = touchEndY - touchStartYRef.current;
    const duration = Date.now() - touchStartTimeRef.current;

    touchStartXRef.current = null;
    touchStartYRef.current = null;

    // Detect horizontal swipe:
    if (Math.abs(deltaX) > 65 && Math.abs(deltaY) < 80 && duration < 600) {
      const isDashboard = currentView.type === 'tab' && currentView.tab === 'dashboard';
      if (!isDashboard) {
        switchTab('dashboard');
      }
    }
  };

  // Monitor online / offline network state
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const currentView = viewStack[viewStack.length - 1] || { type: 'tab', tab: 'dashboard' };

  const pushView = (view: SubView) => {
    setViewStack(prev => [...prev, view]);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const popView = () => {
    setViewStack(prev => {
      if (prev.length <= 1) return prev;
      return prev.slice(0, prev.length - 1);
    });
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const switchTab = (tab: TabKey) => {
    if (tab === 'orders') {
      setOrderStatusFilter('All');
    }
    setViewStack([{ type: 'tab', tab }]);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const handleInstallApp = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  // Splash Loading
  if (!ready) {
    const brandConfig = getBrandConfig(getActiveBrand());
    return (
      <div className="min-h-screen bg-[#F5F0E8] flex flex-col items-center justify-center p-6">
        <img src={brandConfig.logoUrl} alt={brandConfig.displayName} className="h-14 w-auto max-w-[200px] object-contain mb-4 animate-pulse" />
        <div className="w-6 h-6 border-2 border-[#6B5744] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Not authenticated as staff -> customer landing / portal / staff login
  if (!token) {
    return <Suspense fallback={<ScreenLoading />}><PublicEntry /></Suspense>;
  }

  // Render current active screen
  const renderScreen = () => {
    switch (currentView.type) {
      case 'tab':
        switch (currentView.tab) {
          case 'dashboard':
            return (
              <DashboardScreen
                onSelectStatus={(status) => {
                  setOrderStatusFilter(status);
                  setViewStack([{ type: 'tab', tab: 'orders' }]);
                }}
                onNavigateToOrders={(filters) => {
                  if (filters?.status) setOrderStatusFilter(filters.status as any);
                  setOrderRegionFilters({
                    zone: filters?.zone || 'All',
                    state: filters?.state || 'All',
                    city: filters?.city || 'All'
                  });
                  setViewStack([{ type: 'tab', tab: 'orders' }]);
                }}
                onOpenRequests={(tab) => pushView({ type: 'requests', tab })}
              />
            );
          case 'orders':
            return (
              <OrdersScreen
                initialStatus={orderStatusFilter}
                initialZone={orderRegionFilters.zone || 'All'}
                initialState={orderRegionFilters.state || 'All'}
                initialCity={orderRegionFilters.city || 'All'}
                onNewOrder={() => pushView({ type: 'new_order' })}
                onSelectOrder={(orderId) => pushView({ type: 'order_details', orderId })}
                onEditOrder={(orderId) => pushView({ type: 'edit_order', orderId })}
              />
            );
          case 'products':
            return (
              <ProductsScreen
                onNewProduct={() => pushView({ type: 'new_product' })}
                onSelectProduct={(productId) => pushView({ type: 'product_details', productId })}
                onEditProduct={(productId) => pushView({ type: 'edit_product', productId })}
              />
            );
          case 'customers':
            return (
              <CustomersScreen
                onNewCustomer={() => pushView({ type: 'new_customer' })}
                onSelectCustomer={(customerId) => pushView({ type: 'customer_details', customerId })}
                onEditCustomer={(customerId) => pushView({ type: 'edit_customer', customerId })}
              />
            );
          case 'more':
            return (
              <MoreScreen
                onNavigate={(route) => {
                  if (route === 'companies') pushView({ type: 'companies' });
                  else if (route === 'categories') pushView({ type: 'categories' });
                  else if (route === 'settings') pushView({ type: 'settings' });
                  else if (route === 'cloud') pushView({ type: 'cloud' });
                  else if (route === 'inventory') pushView({ type: 'inventory' });
                  else if (route === 'state_pricing') pushView({ type: 'state_pricing' });
                  else if (route === 'delivery_charges') pushView({ type: 'delivery_charges' });
                  else if (route === 'slab_discounts') pushView({ type: 'slab_discounts' });
                }}
              />
            );
          default:
            return <DashboardScreen />;
        }

      case 'new_order':
        return (
          <NewOrderScreen
            onBack={popView}
            onOrderCreated={(orderId) => {
              setViewStack(prev => [...prev.slice(0, prev.length - 1), { type: 'order_details', orderId }]);
            }}
            onNewCustomerFromOrder={() => pushView({ type: 'new_customer' })}
          />
        );

      case 'edit_order':
        return (
          <NewOrderScreen
            orderIdToEdit={currentView.orderId}
            onBack={popView}
            onOrderCreated={(orderId) => {
              setViewStack(prev => [...prev.slice(0, prev.length - 1), { type: 'order_details', orderId }]);
            }}
            onOrderUpdated={(_orderId) => {
              popView();
            }}
            onNewCustomerFromOrder={() => pushView({ type: 'new_customer' })}
          />
        );

      case 'order_details':
        return (
          <OrderDetailsScreen
            orderId={currentView.orderId}
            onBack={popView}
            onEditOrder={(orderId) => pushView({ type: 'edit_order', orderId })}
            onOrderDeleted={popView}
          />
        );

      case 'new_product':
        return (
          <NewProductScreen
            onBack={popView}
            onProductCreated={(productId) => {
              setViewStack(prev => [...prev.slice(0, prev.length - 1), { type: 'product_details', productId }]);
            }}
          />
        );

      case 'product_details':
        return (
          <ProductDetailsScreen
            productId={currentView.productId}
            onBack={popView}
            onSelectOrder={(orderId) => pushView({ type: 'order_details', orderId })}
            onEditProduct={(productId) => pushView({ type: 'edit_product', productId })}
            onProductDeleted={popView}
          />
        );

      case 'edit_product':
        return (
          <NewProductScreen
            productIdToEdit={currentView.productId}
            onBack={popView}
            onProductCreated={() => popView()}
            onProductUpdated={() => popView()}
          />
        );

      case 'cloud':
        return (
          <PrivateCloudScreen
            onBack={popView}
          />
        );

      case 'inventory':
        return <WholeInventoryScreen onBack={popView} />;

      case 'new_customer':
        return (
          <NewCustomerScreen
            onBack={popView}
            onCustomerCreated={(customerId) => {
              setViewStack(prev => [...prev.slice(0, prev.length - 1), { type: 'customer_details', customerId }]);
            }}
          />
        );

      case 'edit_customer':
        return (
          <NewCustomerScreen
            customerIdToEdit={currentView.customerId}
            onBack={popView}
            onCustomerCreated={(customerId) => {
              setViewStack(prev => [...prev.slice(0, prev.length - 1), { type: 'customer_details', customerId }]);
            }}
            onCustomerUpdated={(_customerId) => {
              popView();
            }}
          />
        );

      case 'customer_details':
        return (
          <CustomerDetailsScreen
            customerId={currentView.customerId}
            onBack={popView}
            onSelectOrder={(orderId) => pushView({ type: 'order_details', orderId })}
            onNewOrderForCustomer={() => pushView({ type: 'new_order' })}
            onEditCustomer={(customerId) => pushView({ type: 'edit_customer', customerId })}
          />
        );

      case 'companies':
        return (
          <CompaniesScreen
            onBack={popView}
          />
        );

      case 'categories':
        return (
          <CategoriesScreen
            onBack={popView}
          />
        );

      case 'settings':
        return (
          <SettingsScreen
            onBack={popView}
          />
        );

      case 'state_pricing':
        return <StatePricingScreen onBack={popView} />;

      case 'delivery_charges':
        return <DeliveryChargesScreen onBack={popView} />;

      case 'slab_discounts':
        return <SlabDiscountsScreen onBack={popView} />;

      case 'requests':
        return (
          <RequestsScreen
            initialTab={currentView.tab}
            onBack={popView}
            onSelectOrder={(orderId) => pushView({ type: 'order_details', orderId })}
          />
        );

      default:
        return <DashboardScreen />;
    }
  };

  const isMainTab = currentView.type === 'tab';

  return (
    <div className="min-h-screen bg-[#E8DCCB]/30 flex justify-center">
      <div 
        className="w-full max-w-lg min-h-screen bg-[#F5F0E8] text-[#2F2923] font-sans antialiased relative shadow-md flex flex-col"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Offline Alert Banner */}
        {!isOnline && (
          <div className="bg-[#D97732] text-white text-xs px-3 py-1.5 flex items-center justify-center gap-1.5 font-medium sticky top-0 z-50 shadow-sm">
            <WifiOff size={14} />
            <span>You are offline. Reconnect to see the latest data and save changes.</span>
          </div>
        )}

        {/* PWA Install Banner */}
        {deferredPrompt && (
          <div className="bg-[#6B5744] text-[#FFFCF7] text-xs px-4 py-2 flex items-center justify-between sticky top-0 z-50 shadow-sm">
            <span className="font-medium">Install AI925 App for quick home screen access</span>
            <button
              onClick={handleInstallApp}
              className="flex items-center gap-1 bg-[#FFFCF7] text-[#6B5744] px-2.5 py-1 rounded text-xs font-bold hover:bg-[#E8DCCB] transition-colors"
            >
              <Download size={12} />
              <span>Install</span>
            </button>
          </div>
        )}

        {/* Main Content Area */}
        <main className="flex-1 pb-4">
          <Suspense fallback={<ScreenLoading />}>{renderScreen()}</Suspense>
        </main>

        {/* Bottom Navigation (Always accessible on root tabs) */}
        {isMainTab && (
          <BottomNav
            activeTab={currentView.tab}
            onTabChange={switchTab}
          />
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <CustomerSessionProvider>
        <MainApp />
      </CustomerSessionProvider>
    </AuthProvider>
  );
}
