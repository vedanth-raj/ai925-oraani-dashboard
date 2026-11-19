// Multi-brand configuration and detection (Oraani vs AI 925)

export type Brand = 'AI925' | 'ORAANI';

export interface BrandConfig {
  code: Brand;
  displayName: string;
  tagline: string;
  logoUrl: string;
  companyName: string;
  supportPhone: string;
  portalPath: string;
  adminPrefix: string;
}

export const BRANDS: Record<Brand, BrandConfig> = {
  AI925: {
    code: 'AI925',
    displayName: 'AI 925',
    tagline: 'Aryan International — Fine Silver Jewellery',
    logoUrl: '/logo.png',
    companyName: 'Aryan International (AI 925)',
    supportPhone: '+91 98200 00000',
    portalPath: '/ai925',
    adminPrefix: 'AI 925'
  },
  ORAANI: {
    code: 'ORAANI',
    displayName: 'Oraani',
    tagline: 'Oraani Jewels — Contemporary Silver Creations',
    logoUrl: '/oraani-logo.png',
    companyName: 'Oraani Silver',
    supportPhone: '+91 98200 00000',
    portalPath: '/oraani',
    adminPrefix: 'Oraani'
  }
};

const STORAGE_KEY = 'ai925_active_brand';

function safeSetStorage(val: Brand): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY, val);
    }
  } catch {}
}

function safeGetStorage(): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(STORAGE_KEY);
    }
  } catch {}
  return null;
}

/**
 * Detect the current active brand from URL path, query params, hash, hostname, or localStorage.
 */
export function detectBrand(): Brand {
  if (typeof window === 'undefined') return 'AI925';

  const path = (window.location.pathname || '').toLowerCase();
  const search = (window.location.search || '').toLowerCase();
  const hash = (window.location.hash || '').toLowerCase();
  const host = (window.location.hostname || '').toLowerCase();

  // 1. Explicit path-based detection (/oraani vs /ai925)
  if (path.includes('oraani') || hash.includes('oraani') || search.includes('oraani')) {
    safeSetStorage('ORAANI');
    return 'ORAANI';
  }
  if (path.includes('ai925') || hash.includes('ai925') || search.includes('ai925')) {
    safeSetStorage('AI925');
    return 'AI925';
  }

  // 2. Domain / Hostname detection (e.g. oraani.com, oraani.local, oraani-portal)
  if (host.includes('oraani')) {
    safeSetStorage('ORAANI');
    return 'ORAANI';
  }

  // 3. Stored preference
  const stored = safeGetStorage();
  if (stored === 'ORAANI' || stored === 'AI925') {
    return stored as Brand;
  }

  // Default to AI925
  return 'AI925';
}

export function setActiveBrand(brand: Brand): void {
  safeSetStorage(brand);
  applyPwaBranding(brand);
}

export function getActiveBrand(): Brand {
  return detectBrand();
}

export function getBrandConfig(brand?: Brand): BrandConfig {
  const b = brand || getActiveBrand();
  return BRANDS[b] || BRANDS.AI925;
}

export function applyPwaBranding(brand?: Brand): void {
  if (typeof document === 'undefined') return;
  const b = brand || getActiveBrand();
  const config = BRANDS[b] || BRANDS.AI925;

  // 1. Update Title
  document.title = b === 'ORAANI' ? 'Oraani' : 'AI925 Order Management System';

  // 2. Update Manifest Link
  let manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
  if (!manifestLink) {
    manifestLink = document.createElement('link');
    manifestLink.rel = 'manifest';
    document.head.appendChild(manifestLink);
  }
  manifestLink.href = b === 'ORAANI' ? '/oraani-manifest.json' : '/manifest.json';

  // 3. Update Apple Touch Icons
  const appleIcons = document.querySelectorAll('link[rel="apple-touch-icon"]');
  const appleTouchHref = b === 'ORAANI' ? '/oraani-apple-touch-icon.png' : '/apple-touch-icon.png';
  appleIcons.forEach(el => el.setAttribute('href', appleTouchHref));

  // 4. Update Favicon / Shortcut Icons
  const svgIcon = document.querySelector('link[type="image/svg+xml"]');
  if (svgIcon) {
    svgIcon.setAttribute('href', b === 'ORAANI' ? '/oraani-logo.svg' : '/icon.svg');
  }

  const icon192 = document.querySelector('link[sizes="192x192"]');
  if (icon192) {
    icon192.setAttribute('href', b === 'ORAANI' ? '/oraani-icon-192.png' : '/icon-192.png');
  }

  const icon512 = document.querySelector('link[sizes="512x512"]');
  if (icon512) {
    icon512.setAttribute('href', b === 'ORAANI' ? '/oraani-icon-512.png' : '/icon-512.png');
  }

  // 5. Update Web App Title Meta
  const appTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
  if (appTitle) {
    appTitle.setAttribute('content', config.displayName);
  }
  const appName = document.querySelector('meta[name="application-name"]');
  if (appName) {
    appName.setAttribute('content', config.displayName);
  }
}
