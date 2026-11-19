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

/**
 * Detect the current active brand from URL path, query params, hostname, or localStorage.
 */
export function detectBrand(): Brand {
  if (typeof window === 'undefined') return 'AI925';

  const path = window.location.pathname.toLowerCase();
  const search = window.location.search.toLowerCase();
  const host = window.location.hostname.toLowerCase();

  // 1. Path-based detection (/oraani vs /ai925)
  if (path.startsWith('/oraani')) {
    localStorage.setItem(STORAGE_KEY, 'ORAANI');
    return 'ORAANI';
  }
  if (path.startsWith('/ai925')) {
    localStorage.setItem(STORAGE_KEY, 'AI925');
    return 'AI925';
  }

  // 2. Query param detection (?brand=oraani)
  if (search.includes('brand=oraani')) {
    localStorage.setItem(STORAGE_KEY, 'ORAANI');
    return 'ORAANI';
  }
  if (search.includes('brand=ai925')) {
    localStorage.setItem(STORAGE_KEY, 'AI925');
    return 'AI925';
  }

  // 3. Domain / Hostname detection (e.g. oraani.com, oraani.local, oraani-portal)
  if (host.includes('oraani')) {
    localStorage.setItem(STORAGE_KEY, 'ORAANI');
    return 'ORAANI';
  }

  // 4. Stored preference
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'ORAANI' || stored === 'AI925') {
    return stored as Brand;
  }

  // Default to AI925
  return 'AI925';
}

export function setActiveBrand(brand: Brand): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, brand);
  }
}

export function getActiveBrand(): Brand {
  return detectBrand();
}

export function getBrandConfig(brand?: Brand): BrandConfig {
  const b = brand || getActiveBrand();
  return BRANDS[b] || BRANDS.AI925;
}
