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
}

export function getActiveBrand(): Brand {
  return detectBrand();
}

export function getBrandConfig(brand?: Brand): BrandConfig {
  const b = brand || getActiveBrand();
  return BRANDS[b] || BRANDS.AI925;
}
