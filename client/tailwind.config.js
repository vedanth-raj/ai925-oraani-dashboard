/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#F5F0E8', // Warm Ivory — primary app canvas
          secondary: '#FFFCF7', // Content cards / forms / tables
          tertiary: '#E8DCCB', // Classic Beige — chips, selected nav
          inverse: '#2F2923',
        },
        brand: {
          primary: '#6B5744', // Deep Mocha — primary CTAs / active tab
          secondary: '#B49A7A', // Muted Taupe
          tertiary: '#D2BFA7', // Sand Beige — borders / inactive fills
        },
        appText: {
          primary: '#2F2923', // Espresso — primary text/icons
          muted: '#766B60', // Secondary text
          inverse: '#F5F0E8',
        },
        status: {
          openBg: '#FBE9E9',
          openFg: '#C94C4C',
          progressBg: '#FBE8DB',
          progressFg: '#D97732',
          closedBg: '#E3EEE6',
          closedFg: '#4F7D5B',
        },
        appBorder: {
          DEFAULT: '#D2BFA7',
          strong: '#B49A7A',
          divider: '#E8DCCB',
        }
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Display"',
          'Inter',
          '"Segoe UI"',
          'Roboto',
          'sans-serif'
        ]
      },
      borderRadius: {
        'sm': '6px',
        'md': '12px',
        'lg': '20px',
        'pill': '9999px',
      },
      boxShadow: {
        'card': '0 1px 3px rgba(47, 41, 35, 0.05)',
        'sheet': '0 -4px 20px -2px rgba(47, 41, 35, 0.12)',
      }
    },
  },
  plugins: [],
}
