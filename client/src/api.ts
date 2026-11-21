// API Client for AI925 Order Management System
export const TOKEN_KEY = 'ai925_token';
export const USER_KEY = 'ai925_user';

const API_BASE = '/api';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers || {});

  // Bypass Ngrok free tier browser warning interstitial for API calls
  headers.set('ngrok-skip-browser-warning', 'true');

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    // Check if session was invalidated due to single device enforcement
    if (response.status === 401 && (data.session_invalidated || data.error?.includes('another device'))) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      window.dispatchEvent(new CustomEvent('ai925_session_invalidated', { detail: data.error }));
    }
    const errorMsg = data.error || `Request failed with status ${response.status}`;
    throw new Error(errorMsg);
  }

  return data as T;
}

// Authenticated file download helper that guarantees the downloaded file is valid and NOT an error JSON
async function downloadAuthenticatedBlob(endpoint: string, filename: string): Promise<void> {
  const token = getToken();
  const headers = new Headers();
  headers.set('ngrok-skip-browser-warning', 'true');
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, { headers });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Download failed with status ${response.status}`);
  }

  const blob = await response.blob();
  const blobUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    window.URL.revokeObjectURL(blobUrl);
    document.body.removeChild(a);
  }, 100);
}

export const api = {
  // Auth
  loginPin: (pin: string, role?: string) =>
    request<{ token: string; user: any }>('/auth/login-pin', {
      method: 'POST',
      body: JSON.stringify({ pin, role })
    }),

  login: (username: string, passwordOrPin: string) =>
    request<{ token: string; user: any }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password: passwordOrPin, pin: passwordOrPin })
    }),

  getMe: () => request<{ user: any }>('/auth/me'),

  updatePin: (current_pin: string, new_pin: string) =>
    request<{ success: boolean; message: string }>('/auth/update-pin', {
      method: 'POST',
      body: JSON.stringify({ current_pin, new_pin })
    }),

  // Categories
  getCategories: () => request<{ categories: any[] }>('/categories'),
  createCategory: (data: { name: string; description?: string }) =>
    request<{ category: any }>('/categories', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  archiveCategory: (id: string) =>
    request<{ success: boolean }>(`/categories/${id}`, {
      method: 'DELETE'
    }),

  // Products
  getProducts: (params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<{ products: any[] }>(`/products${query}`);
  },
  getProduct: (id: string) =>
    request<{ product: any; kpis: any; history: any[]; variants: ProductSize[]; tiers: PriceTier[]; weight_options: WeightOption[]; weight_columns: string[]; pricing: any; silver_rate: SilverRate }>(`/products/${id}`),
  createProduct: (data: any) =>
    request<{ product: any }>('/products', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  updateProduct: (id: string, data: any) =>
    request<{ product: any }>(`/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
  archiveProduct: (id: string) =>
    request<{ success: boolean }>(`/products/${id}`, {
      method: 'DELETE'
    }),
  deleteProduct: (id: string) =>
    request<{ success: boolean; message: string }>(`/products/${id}`, {
      method: 'DELETE'
    }),
  duplicateProduct: (id: string) =>
    request<{ product: any }>(`/products/${id}/duplicate`, {
      method: 'POST'
    }),
  // Add (or with a minus number, remove) ready stock pieces for one standard weight × size
  addInventory: (id: string, data: { std_weight_g: number; size_inches: number; qty: number }) =>
    request<{ product: any; variants: ProductSize[]; message: string }>(`/products/${id}/inventory`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  getProductOptions: () => request<{ options: ProductOptionLists }>('/products/meta/options'),
  addProductOption: (field: keyof ProductOptionLists, value: string) =>
    request<{ options: ProductOptionLists }>('/products/meta/options', {
      method: 'POST',
      body: JSON.stringify({ field, value })
    }),

  // Customers & Companies
  getCustomers: (params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<{ customers: any[] }>(`/customers${query}`);
  },
  getCustomer: (id: string) =>
    request<{ customer: any; summary: any; orders: any[] }>(`/customers/${id}`),
  createCustomer: (data: any) =>
    request<{ customer: any }>('/customers', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  updateCustomer: (id: string, data: any) =>
    request<{ customer: any; message?: string }>(`/customers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
  archiveCustomer: (id: string) =>
    request<{ success: boolean; message?: string }>(`/customers/${id}`, {
      method: 'DELETE'
    }),
  deleteCustomer: (id: string) =>
    request<{ success: boolean; message?: string }>(`/customers/${id}`, {
      method: 'DELETE'
    }),
  getCompaniesSummary: (search?: string) => {
    const query = search ? `?search=${encodeURIComponent(search)}` : '';
    return request<{ companies: any[] }>(`/customers/companies/summary${query}`);
  },

  // Orders
  getOrders: (params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<{ orders: any[] }>(`/orders${query}`);
  },
  getOrder: (id: string) =>
    request<{ order: any; items: any[]; deliveries: any[]; images: any[] }>(`/orders/${id}`),
  createOrder: (data: any) =>
    request<{ order: any; message: string }>('/orders', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  updateOrder: (id: string, data: any) =>
    request<{ order: any; message: string }>(`/orders/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
  deleteOrder: (id: string) =>
    request<{ success: boolean; message: string }>(`/orders/${id}`, {
      method: 'DELETE'
    }),
  closeOrder: (id: string) =>
    request<{ order: any; message: string }>(`/orders/${id}/close`, {
      method: 'POST'
    }),

  // Deliveries & Shipments
  recordDelivery: (orderId: string, data: any) =>
    request<{ success: boolean; deliveryId: string; message: string }>(`/orders/${orderId}/deliveries`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  uploadShipmentImage: (orderId: string, formData: FormData) =>
    request<{ image: any }>(`/orders/${orderId}/shipment-images`, {
      method: 'POST',
      body: formData
    }),
  deleteShipmentImage: (orderId: string, imageId: string) =>
    request<{ success: boolean }>(`/orders/${orderId}/shipment-images/${imageId}`, {
      method: 'DELETE'
    }),

  // Analytics with interactive timeframes & region/state/city filters
  getOverview: (params?: { timeframe?: 'daily' | 'weekly' | 'monthly' | 'yearly'; zone?: string; state?: string; city?: string }) => {
    const query = params ? '?' + new URLSearchParams(Object.entries(params).filter(([_, v]) => Boolean(v)) as [string, string][]).toString() : '';
    return request<any>(`/analytics/overview${query}`);
  },

  // Customer Visiting Card & Live Location
  uploadVisitingCard: (formData: FormData) =>
    request<{ success: boolean; file_path: string; filename: string }>('/customers/upload-visiting-card', {
      method: 'POST',
      body: formData
    }),

  // Product Square Image Upload
  uploadProductImage: (formData: FormData) =>
    request<{ success: boolean; file_path: string; filename: string }>('/products/upload-image', {
      method: 'POST',
      body: formData
    }),

  // Location Tracking
  updateLocation: (coords: { latitude: number; longitude: number; address?: string }) =>
    request<{ success: boolean; timestamp: string }>('/users/location', {
      method: 'POST',
      body: JSON.stringify(coords)
    }),
  getRepLocations: () =>
    request<{ representatives: any[] }>('/users/representatives/locations'),

  // Unassigned Companies & Company Directory
  getUnassignedCompanies: () =>
    request<{ companies: string[] }>('/users/unassigned-companies'),
  getCompaniesDirectory: () =>
    request<{ companies: { company_name: string; assigned_rep_id: string | null; assigned_rep_name: string | null }[] }>('/users/companies-directory'),

  // Sequential Order Photo Uploads with Order ID & Type ('shipment' | 'package' | 'bill')
  uploadOrderImage: (orderId: string, formData: FormData) =>
    request<{ image: any }>(`/orders/${orderId}/shipment-images`, {
      method: 'POST',
      body: formData
    }),

  // CSV Bulk Import
  importCustomersCsv: (data: FormData | { csv_data: string }) =>
    request<CsvImportResult>('/export/import/customers', {
      method: 'POST',
      body: data instanceof FormData ? data : JSON.stringify(data)
    }),
  importProductsCsv: (data: FormData | { csv_data: string }) =>
    request<CsvImportResult>('/export/import/products', {
      method: 'POST',
      body: data instanceof FormData ? data : JSON.stringify(data)
    }),
  importOrdersCsv: (data: FormData | { csv_data: string }) =>
    request<CsvImportResult>('/export/import/orders', {
      method: 'POST',
      body: data instanceof FormData ? data : JSON.stringify(data)
    }),

  // Pincode & Region Mapping
  lookupPincode: (pin: string) =>
    request<{ city: string; state: string; district?: string; zone: string; localities?: string[]; source: string }>(`/pincode/${pin}`),
  getRegionMappings: () => request<{ mappings: any[] }>('/pincode/mappings/list'),
  saveRegionMapping: (data: any) =>
    request<{ mappings: any[] }>('/pincode/mappings', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  // Business Administrators Management (Admin only)
  getBusinessAdmins: () => request<{ business_admins: any[] }>('/users/business-admins'),
  createBusinessAdmin: (data: any) =>
    request<{ business_admin: any; message: string }>('/users/business-admins', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  updateBusinessAdmin: (id: string, data: any) =>
    request<{ business_admin: any; message: string }>(`/users/business-admins/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
  deleteBusinessAdmin: (id: string) =>
    request<{ success: boolean; message: string }>(`/users/business-admins/${id}`, {
      method: 'DELETE'
    }),
  resetBusinessAdminPin: (id: string, passwordOrPin: string) =>
    request<{ success: boolean; message: string }>(`/users/business-admins/${id}/reset-pin`, {
      method: 'POST',
      body: JSON.stringify({ password: passwordOrPin, new_pin: passwordOrPin })
    }),

  // Sales Representatives Management
  getRepresentatives: () => request<{ representatives: any[] }>('/users/representatives'),
  createRepresentative: (data: any) =>
    request<{ representative: any; message: string }>('/users/representatives', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  updateRepresentative: (id: string, data: any) =>
    request<{ representative: any; message?: string }>(`/users/representatives/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
  deleteRepresentative: (id: string) =>
    request<{ success: boolean; message: string }>(`/users/representatives/${id}`, {
      method: 'DELETE'
    }),
  resetRepresentativePin: (id: string, new_pin: string) =>
    request<{ success: boolean; message: string }>(`/users/representatives/${id}/reset-pin`, {
      method: 'POST',
      body: JSON.stringify({ new_pin, password: new_pin })
    }),

  // Company Assignment to Sales Reps
  getRepCompanies: (repId: string) =>
    request<{ companies: string[]; assignments: any[] }>(`/users/representatives/${repId}/companies`),
  assignRepCompany: (repId: string, company_name: string) =>
    request<{ success: boolean; message: string }>(`/users/representatives/${repId}/companies`, {
      method: 'POST',
      body: JSON.stringify({ company_name })
    }),
  unassignRepCompany: (repId: string, company_name: string) =>
    request<{ success: boolean; message: string }>(`/users/representatives/${repId}/companies/${encodeURIComponent(company_name)}`, {
      method: 'DELETE'
    }),

  // Salesperson Activity / Audit Trail
  getAuditLogs: (params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<{ logs: any[] }>(`/users/audit-logs${query}`);
  },

  // Private Cloud Storage
  getCloudFolders: (parentId?: string | null) => {
    const query = parentId ? `?parent_id=${encodeURIComponent(parentId)}` : '';
    return request<{ folders: any[]; currentFolder: any }>(`/cloud/folders${query}`);
  },
  createCloudFolder: (data: { name: string; parent_id?: string | null }) =>
    request<{ folder: any; message: string }>('/cloud/folders', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  renameCloudFolder: (id: string, name: string) =>
    request<{ success: boolean; message: string }>(`/cloud/folders/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name })
    }),
  deleteCloudFolder: (id: string) =>
    request<{ success: boolean; message: string }>(`/cloud/folders/${id}`, {
      method: 'DELETE'
    }),
  getCloudFiles: (folderId?: string | null) => {
    const query = folderId ? `?folder_id=${encodeURIComponent(folderId)}` : '';
    return request<{ files: any[] }>(`/cloud/files${query}`);
  },
  uploadCloudFile: (formData: FormData) =>
    request<{ file: any; message: string }>('/cloud/upload', {
      method: 'POST',
      body: formData
    }),
  deleteCloudFile: (id: string) =>
    request<{ success: boolean; message: string }>(`/cloud/files/${id}`, {
      method: 'DELETE'
    }),
  downloadCloudFileUrl: (id: string) => `${API_BASE}/cloud/files/${id}/download?token=${getToken() || ''}`,
  downloadCloudFile: (id: string, filename: string) => downloadAuthenticatedBlob(`/cloud/files/${id}/download`, filename),

  // Backup & Restore
  getBackups: () => request<{ backups: any[] }>('/backup/list'),
  createBackup: () => request<{ success: boolean; message: string; backup: any }>('/backup/create', { method: 'POST' }),
  downloadBackupUrl: (filename: string) => `${API_BASE}/backup/${encodeURIComponent(filename)}/download?token=${getToken() || ''}`,

  // Reliable Authenticated CSV & ZIP Downloads
  downloadOrdersCsv: () => downloadAuthenticatedBlob('/export/orders.csv', 'ai925_orders.csv'),
  downloadProductsCsv: () => downloadAuthenticatedBlob('/export/products.csv', 'ai925_products.csv'),
  downloadCustomersCsv: () => downloadAuthenticatedBlob('/export/customers.csv', 'ai925_customers.csv'),
  downloadOrderImagesZip: () => downloadAuthenticatedBlob('/export/order-images.zip', 'ai925_order_images.zip'),

  // Direct URLs with token fallback
  exportOrdersUrl: () => `${API_BASE}/export/orders.csv?token=${getToken() || ''}`,
  exportProductsUrl: () => `${API_BASE}/export/products.csv?token=${getToken() || ''}`,
  exportCustomersUrl: () => `${API_BASE}/export/customers.csv?token=${getToken() || ''}`,
  exportOrderImagesUrl: () => `${API_BASE}/export/order-images.zip?token=${getToken() || ''}`,

  // Silver rate (live market feed or manual override)
  getSilverRate: () => request<{ silver_rate: SilverRate; gst_rate: number; history: any[] }>('/pricing/silver-rate'),
  setSilverRate: (rate_per_gram: number) =>
    request<{ silver_rate: SilverRate; message: string }>('/pricing/silver-rate', {
      method: 'PUT',
      body: JSON.stringify({ rate_per_gram })
    }),
  updateSilverRateSettings: (data: { mode?: 'auto' | 'manual'; premium_pct?: number }) =>
    request<{ silver_rate: SilverRate; refresh_error: string | null }>('/pricing/settings', {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
  refreshSilverRate: () => request<{ silver_rate: SilverRate; updated: boolean }>('/pricing/refresh', { method: 'POST' }),

  // Bulk add inventory entries for multiple products/weights/sizes simultaneously
  bulkAddInventory: (items: { product_id: string; std_weight_g: number; size_inches: number; qty: number }[]) =>
    request<{ success: boolean; added_count: number; updated_variants: number; message: string }>('/products/bulk-inventory', {
      method: 'POST',
      body: JSON.stringify({ items })
    }),

  // State-wise premium pricing (System Administrator)
  getStatePremiums: () => request<{ state_premiums: StatePremium[] }>('/pricing/state-premiums'),
  saveStatePremium: (data: { state: string; premium_pct: number; is_active?: boolean }) =>
    request<{ state_premium: StatePremium; message: string }>('/pricing/state-premiums', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  deleteStatePremium: (id: string) =>
    request<{ success: boolean; message: string }>(`/pricing/state-premiums/${id}`, {
      method: 'DELETE'
    }),

  // Custom delivery charges by PIN code (Excel Upload, Download & Single Edit)
  getDeliveryPincodes: (search?: string) =>
    request<{ delivery_pincodes: DeliveryPincode[]; total_count: number }>(`/pricing/delivery-pincodes${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  saveDeliveryPincodeSingle: (data: { pincode: string; charge: number; city?: string; state?: string }) =>
    request<{ success: boolean; message: string }>('/pricing/delivery-pincodes/single', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  deleteDeliveryPincode: (pincode: string) =>
    request<{ success: boolean; message: string }>(`/pricing/delivery-pincodes/${pincode}`, {
      method: 'DELETE'
    }),
  uploadDeliveryPincodesFile: (formData: FormData) =>
    request<{ success: boolean; message: string; count: number }>('/pricing/delivery-pincodes/upload', {
      method: 'POST',
      body: formData
    }),

  // Weight slab discounts (Rs/g discount on labour charges)
  getWeightSlabDiscounts: () =>
    request<{ weight_slab_discounts: WeightSlabDiscount[] }>('/pricing/weight-slab-discounts'),
  addWeightSlabDiscount: (data: { min_kg: number; max_kg: number | null; discount_per_gram: number; is_active?: boolean }) =>
    request<{ success: boolean; message: string; weight_slab_discounts: WeightSlabDiscount[] }>('/pricing/weight-slab-discounts', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  deleteWeightSlabDiscount: (id: string) =>
    request<{ success: boolean; message: string; weight_slab_discounts: WeightSlabDiscount[] }>(`/pricing/weight-slab-discounts/${id}`, {
      method: 'DELETE'
    }),

  // Staff inbox: seller requests, new customer verification, on-order requests
  getRequestsSummary: () => request<RequestsSummary>('/requests/summary'),
  getStockRequests: (status?: string) =>
    request<{ requests: any[] }>(`/requests/stock-requests${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  updateStockRequest: (id: string, data: any) =>
    request<{ request: any }>(`/requests/stock-requests/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
  getCustomerAccounts: (status = 'PENDING') =>
    request<{ accounts: any[] }>(`/requests/customer-accounts?status=${encodeURIComponent(status)}`),
  approveCustomerAccount: (id: string, access?: CustomerAccess) =>
    request<{ account: any; fully_approved: boolean; message: string }>(`/requests/customer-accounts/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify(access || {})
    }),
  setCustomerAccess: (id: string, access: CustomerAccess) =>
    request<{ account: any; message: string }>(`/requests/customer-accounts/${id}/access`, { method: 'PUT', body: JSON.stringify(access) }),
  getPortalAccountForCustomer: (customerId: string) =>
    request<{ account: any | null }>(`/requests/customer-accounts/by-customer/${encodeURIComponent(customerId)}`),

  // Whole Inventory (both administrators)
  getInventory: () => request<InventoryPayload>('/inventory'),
  updateInventory: (updates: InventoryUpdate[]) =>
    request<InventoryPayload & { message: string }>('/inventory', { method: 'PUT', body: JSON.stringify({ updates }) }),
  rejectCustomerAccount: (id: string, reason: string) =>
    request<{ account: any }>(`/requests/customer-accounts/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    }),
  deleteCustomerAccount: (id: string) =>
    request<{ success: boolean; message: string }>(`/requests/customer-accounts/${id}`, { method: 'DELETE' }),
  markCustomerNotified: (id: string) =>
    request<{ account: any }>(`/requests/customer-accounts/${id}/notified`, { method: 'POST' }),
  getOnOrderRequests: (status = 'OPEN') =>
    request<{ orders: any[] }>(`/requests/on-order?status=${encodeURIComponent(status)}`),
  getProfileChanges: (status = 'PENDING') =>
    request<{ requests: ProfileChangeRequest[] }>(`/requests/profile-changes?status=${encodeURIComponent(status)}`),
  approveProfileChange: (id: string) =>
    request<{ message: string }>(`/requests/profile-changes/${id}/approve`, { method: 'POST' }),
  rejectProfileChange: (id: string, reason: string) =>
    request<{ message: string }>(`/requests/profile-changes/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
  getCallBookings: (status?: string) =>
    request<{ bookings: any[] }>(`/requests/call-bookings${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  updateCallBooking: (id: string, data: { status?: string; admin_notes?: string }) =>
    request<{ booking: any }>(`/requests/call-bookings/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  // System Administrator only
  getCustomerCredentials: (params: { customer_id?: string; account_id?: string }) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => Boolean(v)) as [string, string][]).toString();
    return request<CustomerCredentials>(`/requests/credentials?${q}`);
  },
  setCustomerPassword: (accountId: string, password: string) =>
    request<{ message: string }>(`/requests/credentials/${accountId}`, { method: 'PUT', body: JSON.stringify({ password }) }),

  // Delivery charges by PIN code and On Order payment terms
  getCommerceSettings: () => request<{ delivery_rates: DeliveryRates; payment_terms: PaymentTerms }>('/pricing/commerce'),
  saveDeliveryRates: (data: DeliveryRates) =>
    request<{ delivery_rates: DeliveryRates; message: string }>('/pricing/delivery-rates', { method: 'PUT', body: JSON.stringify(data) }),
  savePaymentTerms: (data: PaymentTerms) =>
    request<{ payment_terms: PaymentTerms; message: string }>('/pricing/payment-terms', { method: 'PUT', body: JSON.stringify(data) }),

  // Dummy payment gateway (staff collecting payment)
  collectOrderPayment: (orderId: string, data: { method: string; amount?: number }) =>
    request<{ payment: any; order: any; message: string }>(`/orders/${orderId}/payments`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),
};

export interface SilverRate {
  rate_per_gram: number | null;
  source: 'live' | 'manual' | null;
  updated_at: string | null;
  mode: 'auto' | 'manual';
  premium_pct: number;
  last_error?: string | null;
  last_checked_at?: string | null;
  set_by_name?: string | null;
  usd_per_oz?: number;
  usd_inr?: number;
}

// Which portal sections a customer may see (set by either administrator)
export interface CustomerAccess {
  can_view_ready?: boolean;
  can_view_order?: boolean;
}

export interface InventoryRow {
  std_weight_g: number;
  size_inches: number;
  unit_weight_g: number;
  stock_qty: number;
  derived?: boolean;
}

export interface InventoryChain {
  product_id: string;
  name: string;
  sku: string;
  category_name: string | null;
  status: string;
  rows: InventoryRow[];
  total_pieces: number;
  total_weight_g: number;
}

export interface InventoryPayload {
  chains: InventoryChain[];
  totals: { pieces: number; weight_g: number };
}

export interface InventoryUpdate {
  product_id: string;
  std_weight_g: number;
  size_inches: number;
  stock_qty: number;
}

export interface RequestsSummary {
  open_stock_requests: number;
  pending_customers: number;
  awaiting_my_approval: number;
  on_order_open: number;
  profile_changes: number;
  call_bookings: number;
  payments_received: number;
  payments_outstanding: number;
  unpaid_orders: number;
}

// ---------------------------------------------------------------------------
// Customer portal client: separate token so a customer session never reaches staff APIs
// ---------------------------------------------------------------------------
export const CUSTOMER_TOKEN_KEY = 'ai925_customer_token';

// "Remember me" keeps the token in localStorage; otherwise it lives in sessionStorage and ends with the browser session
export function getCustomerToken(): string | null {
  try {
    return localStorage.getItem(CUSTOMER_TOKEN_KEY) || sessionStorage.getItem(CUSTOMER_TOKEN_KEY);
  } catch {
    return null;
  }
}

async function portalRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('ngrok-skip-browser-warning', 'true');
  const token = getCustomerToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(`${API_BASE}/portal${endpoint}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err: any = new Error(data.error || `Request failed with status ${response.status}`);
    err.verificationPending = Boolean(data.verification_pending);
    err.sectionClosed = Boolean(data.section_closed);
    err.status = response.status;
    throw err;
  }
  return data as T;
}

export const portalApi = {
  lookupPincode: (pin: string) =>
    portalRequest<{ city?: string; state?: string; district?: string }>(`/pincode/${pin}`),
  sendOtp: (data: { destination: string; purpose?: string; brand?: string }) =>
    portalRequest<{ ok: boolean; message: string; expires_in_seconds: number; dev_otp?: string }>('/otp/send', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  verifyOtp: (data: { destination: string; otp: string; purpose?: string }) =>
    portalRequest<{ ok: boolean; message: string }>('/otp/verify', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  loginWithOtp: (data: { destination: string; otp: string }) =>
    portalRequest<{ token: string; account: CustomerAccount }>('/otp/login', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  loginWithFirebase: (idToken: string) =>
    portalRequest<{ token: string; account: CustomerAccount }>('/auth/firebase-login', {
      method: 'POST',
      body: JSON.stringify({ idToken })
    }),
  register: (formData: FormData) =>
    portalRequest<{ token: string; account: CustomerAccount; message: string }>('/register', { method: 'POST', body: formData }),
  login: (identifier: string, password: string) =>
    portalRequest<{ token: string; account: CustomerAccount }>('/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password })
    }),
  me: () => portalRequest<{ account: CustomerAccount }>('/me'),
  presence: (coords?: { latitude: number; longitude: number }) =>
    portalRequest<{ ok: boolean }>('/presence', { method: 'POST', body: JSON.stringify(coords || {}) }),
  getProducts: (params: { mode: 'ready' | 'order'; search?: string; category?: string }) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => Boolean(v)) as [string, string][]).toString();
    return portalRequest<{ products: CatalogProduct[]; categories: string[]; silver_rate: SilverRate; weight_slab_discounts?: WeightSlabDiscount[] }>(`/products?${q}`);
  },
  getProduct: (id: string, mode?: 'READY_STOCK' | 'ON_ORDER') =>
    portalRequest<{ product: CatalogProduct; silver_rate: SilverRate; weight_slab_discounts?: WeightSlabDiscount[] }>(`/products/${id}${mode ? `?mode=${mode}` : ''}`),
  requestStock: (data: { product_id: string; size_inches?: number | null; quantity: number; notes?: string }) =>
    portalRequest<{ request: any; message: string }>('/stock-requests', { method: 'POST', body: JSON.stringify(data) }),
  getStockRequests: () => portalRequest<{ requests: any[] }>('/stock-requests'),
  checkout: (data: { mode: 'READY_STOCK' | 'ON_ORDER'; items: { product_id: string; std_weight_g: number; size_inches: number; pieces: number }[]; notes?: string }) =>
    portalRequest<{ order: any; payment_options: PaymentOptions; message: string }>('/checkout', { method: 'POST', body: JSON.stringify(data) }),
  getOrders: () => portalRequest<{ orders: any[] }>('/orders'),
  getOrder: (id: string) => portalRequest<{ order: any; items: any[]; payments: any[]; images: OrderImage[]; payment_options: PaymentOptions }>(`/orders/${id}`),
  pay: (orderId: string, method: string, plan?: PaymentPlan) =>
    portalRequest<{ payment: any; order: any; message: string }>(`/orders/${orderId}/pay`, {
      method: 'POST',
      body: JSON.stringify({ method, plan })
    }),
  deliveryQuote: (amount: number) =>
    portalRequest<{ delivery: DeliveryQuote; payment_terms: PaymentTerms }>(`/delivery-quote?amount=${encodeURIComponent(amount.toFixed(2))}`),
  requestProfileChange: (data: Record<string, string>) =>
    portalRequest<{ account: CustomerAccount; message: string }>('/profile-requests', { method: 'POST', body: JSON.stringify(data) }),
  withdrawProfileChange: () => portalRequest<{ account: CustomerAccount }>('/profile-requests/pending', { method: 'DELETE' }),
  bookCall: (data: { phone: string; preferred_date?: string; preferred_slot?: string; notes: string }) =>
    portalRequest<{ booking: any; message: string }>('/call-bookings', { method: 'POST', body: JSON.stringify(data) }),
  getCallBookings: () => portalRequest<{ bookings: any[]; slots: string[] }>('/call-bookings'),
};

export type PaymentPlan = 'ADVANCE' | 'FULL';

// Payment choices for an order: an unpaid On Order purchase can pay an advance or the full amount less a discount
export interface PaymentOptions {
  choices: boolean;
  due: number;
  terms: PaymentTerms;
  advance?: { pct: number; amount: number };
  full?: { discount_pct: number; discount: number; amount: number };
}

export interface PaymentTerms {
  advance_pct: number;
  full_payment_discount_pct: number;
}

export interface DeliveryQuote {
  charge: number;
  basis: string;
  pin: string | null;
}

export interface DeliveryRates {
  rules: { prefix: string; label: string; charge: number }[];
  zones: Record<'North' | 'South' | 'East' | 'West', number | null>;
  default_charge: number;
  free_above: number | null;
}

export interface ProductOptionLists {
  lock_type: string[];
  wire_size: string[];
  endings: string[];
}

export interface ProfileChangeRequest {
  id: string;
  customer_account_id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  created_at: string;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
  rejected_reason: string | null;
  current: Record<string, string | null>;
  changes: Record<string, string>;
  changes_password: boolean;
  new_password: string | null;
}

export interface CustomerCredentials {
  account: {
    id: string;
    full_name: string;
    phone: string;
    email: string;
    status: string;
    password: string | null;
    password_recorded: boolean;
    password_changed_at: string | null;
    created_at: string;
    pending_password: { password: string | null; requested_at: string } | null;
  } | null;
  history: { password: string | null; source: string; created_at: string; approved_by_name: string | null }[];
}

export interface StatePremium {
  id: string;
  state: string;
  premium_pct: number;
  is_active: number | boolean;
  created_at: string;
  updated_at: string;
}

export interface DeliveryPincode {
  pincode: string;
  charge: number;
  city?: string;
  state?: string;
  updated_at: string;
}

export interface WeightSlabDiscount {
  id: string;
  min_kg: number;
  max_kg: number | null;
  discount_per_gram: number;
  is_active: number | boolean;
  created_at: string;
  updated_at: string;
}

export type AccountType = 'Retailer' | 'Wholesaler' | 'Both';
export const ACCOUNT_TYPES: AccountType[] = ['Retailer', 'Wholesaler', 'Both'];

export interface CustomerAccount {
  id: string;
  full_name: string;
  company_name: string | null;
  phone: string;
  email: string;
  address: string;
  pin_code?: string | null;
  state?: string | null;
  brand?: 'AI925' | 'ORAANI';
  state_premium_pct?: number;
  id_card_path: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  biz_approved_at: string | null;
  sys_approved_at: string | null;
  rejected_reason: string | null;
  customer_id: string | null;
  account_type?: AccountType | null;
  can_view_ready?: boolean;
  can_view_order?: boolean;
  password_changed_at?: string | null;
  change_request?: {
    id: string;
    changes: Record<string, string>;
    changes_password: boolean;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    rejected_reason: string | null;
    created_at: string;
    reviewed_at: string | null;
  } | null;
  created_at: string;
}

export interface OrderImage {
  id: string;
  file_path: string;
  image_type: 'bill' | 'package' | 'shipment';
  caption: string | null;
  created_at: string;
}

// Ready stock row: standard weight (g per piece) × size, with its piece weight and pieces on the shelf
export interface ProductSize {
  id: string | null;
  std_weight_g: number;
  size_inches: number;
  weight_g: number;
  stock_qty: number;
  derived?: boolean;
}

export type TierUnit = 'pcs' | 'g' | 'kg';
export type TierType = 'READY_STOCK' | 'ON_ORDER' | 'ALL';

// Order quantity slab: making charge per gram for a quantity range of one purchase type
export interface PriceTier {
  id?: string;
  min_qty: number;
  max_qty: number | null;
  price_per_gram: number;
  discount_price_per_gram: number | null;
  qty_unit?: TierUnit;
  order_type?: TierType;
  discount_pct?: number;
}

// Standard weight option (g per piece) with its own pricing (making charge per gram) and build details
// Making charge slab of a standard weight, by net grams of that weight in an order (max_g null = & above)
export interface WeightSlab {
  min_g: number;
  max_g: number | null;
  making: number;
  order_type?: TierType; // purchase type the slab applies to ('ALL' = both)
}

export interface WeightOption {
  id?: string;
  std_weight_g: number;
  making_charge: number | null;
  weight_slabs?: WeightSlab[];
  sku_code: string | null;
  lock_type: string | null;
  wire_size?: string | null;
  thickness?: string | null;
  endings?: string | null;
  extra?: Record<string, string>;
}

// Result of a CSV import: rows that could not be imported are listed in errors
export interface CsvImportResult {
  success: boolean;
  imported: number;
  updated?: number;
  skipped: number;
  errors?: string[];
  total_rows: number;
}

export interface CatalogProduct {
  id: string;
  name: string;
  sku: string;
  category_name: string | null;
  description: string | null;
  lock_type: string | null;
  thickness?: string | null;
  image_path: string | null;
  image_paths?: string[]; // every photo in order; the first is image_path
  std_weight_per_20in: number;
  labour_per_gram: number;
  sizes: ProductSize[];
  tiers: PriceTier[];
  weight_options: WeightOption[];
  ready_stock: number;
  pricing: { price_per_gram: number; reference_weight_g: number; reference_piece_price: number; slabs: PriceTier[] };
}
