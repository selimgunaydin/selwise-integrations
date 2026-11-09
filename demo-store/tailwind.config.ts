import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: { DEFAULT: '1rem', md: '1.5rem', lg: '2rem' }, screens: { '2xl': '1360px' } },
    extend: {
      colors: {
        ink: { DEFAULT: '#1F1D1A', soft: '#4A463F', muted: '#77716A', faint: '#A39D94' },
        paper: '#FAF8F4',
        sand: { DEFAULT: '#F1ECE4', deep: '#E6DFD3' },
        line: { DEFAULT: '#E6E0D7', strong: '#D5CEC2' },
        accent: { DEFAULT: '#9A4A2B', soft: '#F4E6DE', deep: '#7A3820' },
        sale: '#B4232A',
        ok: '#2E6B4A',
        warn: '#A86A12',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'Georgia', 'serif'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      letterSpacing: { label: '0.12em' },
      // Overlays the shopper OPENS sit above the Selwise widget's ambient layers
      // (announcement/countdown bars, popups, goal bar: z-index 99999). At z-50
      // a cart-page bar covered the mini cart's title and close button. The
      // order among them is the old one; the widget's search overlay (999999)
      // and consent layers (2147483645+) still sit above everything.
      zIndex: { drawer: '100000', toast: '100010', modal: '100015', 'modal-top': '100020' },
      boxShadow: {
        drawer: '0 0 0 1px rgba(31,29,26,.06), 0 24px 48px -12px rgba(31,29,26,.25)',
        pop: '0 0 0 1px rgba(31,29,26,.06), 0 12px 32px -8px rgba(31,29,26,.18)',
      },
      keyframes: {
        'slide-in': { from: { transform: 'translateX(100%)' }, to: { transform: 'translateX(0)' } },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
      },
      animation: {
        'slide-in': 'slide-in .28s cubic-bezier(.2,.8,.2,1)',
        'fade-in': 'fade-in .2s ease-out',
      },
    },
  },
  plugins: [],
};

export default config;
