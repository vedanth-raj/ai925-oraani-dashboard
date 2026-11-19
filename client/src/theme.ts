// AI925 OMS — Design tokens (Premium Beige Palette, light-only).
// Values mirror reference code specification.

export const theme = {
  colors: {
    // Surfaces
    surface: "#F5F0E8", // Warm Ivory — primary app canvas
    onSurface: "#2F2923", // Espresso — primary text/icons
    surfaceSecondary: "#FFFCF7", // Content cards / forms / tables
    onSurfaceSecondary: "#2F2923",
    surfaceTertiary: "#E8DCCB", // Classic Beige — chips, selected nav
    onSurfaceTertiary: "#2F2923",
    surfaceInverse: "#2F2923",
    onSurfaceInverse: "#F5F0E8",
    muted: "#766B60", // Secondary text

    // Brand (Deep Mocha family)
    brand: "#6B5744",
    onBrand: "#FFFCF7",
    brandPrimary: "#6B5744", // Deep Mocha — primary CTAs / active tab
    onBrandPrimary: "#FFFCF7",
    brandSecondary: "#B49A7A", // Muted Taupe
    onBrandSecondary: "#FFFCF7",
    brandTertiary: "#D2BFA7", // Sand Beige — borders / inactive fills
    onBrandTertiary: "#2F2923",

    // Status (functional, distinct from brand)
    success: "#4F7D5B", // Closed
    onSuccess: "#FFFFFF",
    warning: "#D97732", // In Progress
    onWarning: "#FFFFFF",
    error: "#C94C4C", // Open
    onError: "#FFFFFF",
    info: "#766B60",
    onInfo: "#FFFFFF",

    // Lines
    border: "#D2BFA7",
    borderStrong: "#B49A7A",
    divider: "#E8DCCB",
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
    xxxl: 48,
  },
  radius: {
    sm: 6,
    md: 12,
    lg: 20,
    pill: 9999,
  },
  statusColors: {
    Open: { bg: "#FBE9E9", fg: "#C94C4C" },
    "In Progress": { bg: "#FBE8DB", fg: "#D97732" },
    Closed: { bg: "#E3EEE6", fg: "#4F7D5B" },
  }
};
