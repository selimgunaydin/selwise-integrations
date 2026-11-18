// GENERATED FILE — DO NOT EDIT.
//
// Vendored from packages/widget-contract/src/product-card-swatch-colors.ts by
// scripts/sync-vendored-page-targeting.js. Edit the source, then run:
//
//   node scripts/sync-vendored-page-targeting.js
//
// It is copied rather than imported because @selwise/widget-contract is private
// and this SDK is published: a dependency on it would not resolve for anyone
// who installs @selwise/react-native from npm.

/**
 * What colour a swatch chip paints, from the colour NAME a feed carries.
 *
 * ## Why a dictionary, and why here
 *
 * A feed names a shade — `Beyaz`, `Lacivert`, `Gül Kurusu`, `Navy` — and never
 * says what it looks like. Until 2026-10-21 the swatch row drew each colour
 * sibling's own PHOTOGRAPH cropped into an 18px circle, so on a catalogue shot
 * on one backdrop (Ardisa: every product on the same beige) five shades of one
 * blouse rendered as five identical beige dots, and a merchant who added the
 * "Colours" element saw it match nothing. A chip has to show the colour.
 *
 * The answer is resolved in the render core — DOM-free, shared by the widget,
 * the dashboard canvas and the API preview — so the three cannot paint a shade
 * three ways. A name the dictionary does not know resolves to `null` and the
 * chip falls back to the sibling's image, then to its initial: an unknown
 * shade is drawn honestly as unknown, never as a guessed colour.
 *
 * A feed that already sends a CSS colour (`#1f3a5f`, `rgb(…)`) is passed
 * through after validation, so a merchant with exact brand shades is not
 * rounded to our dictionary.
 */

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d+)\s*)?\)$/i;

/**
 * Lower-cased, accent-folded names → colour. Turkish first (the priority
 * accounts' feeds), then the English names Google Merchant feeds use. Keys are
 * stored FOLDED (see {@link foldColorName}), so `Adaçayı`, `adacayi` and
 * `ADAÇAYI` are one entry.
 */
const NAMED_COLORS: Record<string, string> = {
  // Neutrals
  beyaz: '#ffffff',
  white: '#ffffff',
  'kirik beyaz': '#f7f4ec',
  'off white': '#f7f4ec',
  offwhite: '#f7f4ec',
  ekru: '#efe8d8',
  ecru: '#efe8d8',
  krem: '#f3ead3',
  cream: '#f3ead3',
  ivory: '#fffff0',
  fildisi: '#fffff0',
  siyah: '#111111',
  black: '#111111',
  gri: '#9ca3af',
  gray: '#9ca3af',
  grey: '#9ca3af',
  'acik gri': '#d1d5db',
  'light gray': '#d1d5db',
  'light grey': '#d1d5db',
  'koyu gri': '#4b5563',
  'dark gray': '#4b5563',
  'dark grey': '#4b5563',
  antrasit: '#383e42',
  anthracite: '#383e42',
  fume: '#5b5f63',
  melanj: '#b8b8b8',
  'gri melanj': '#b8b8b8',
  gumus: '#c0c0c0',
  silver: '#c0c0c0',
  altin: '#d4af37',
  gold: '#d4af37',
  bronz: '#a97142',
  bronze: '#a97142',
  // Browns and beiges
  bej: '#d9c7a7',
  beige: '#d9c7a7',
  tas: '#cfc6b8',
  stone: '#cfc6b8',
  vizon: '#a39382',
  mink: '#a39382',
  camel: '#c19a6b',
  deve: '#c19a6b',
  'deve tuyu': '#c19a6b',
  kahve: '#6f4e37',
  kahverengi: '#6f4e37',
  brown: '#6f4e37',
  'acik kahve': '#a47551',
  'koyu kahve': '#4a3426',
  taba: '#a0522d',
  tan: '#d2b48c',
  hardal: '#d4a017',
  mustard: '#d4a017',
  haki: '#7d7a4f',
  khaki: '#7d7a4f',
  nude: '#e3bc9a',
  ten: '#e3bc9a',
  pudra: '#efc3bf',
  powder: '#efc3bf',
  // Reds and pinks
  kirmizi: '#d1242f',
  red: '#d1242f',
  bordo: '#6d1a2a',
  burgundy: '#6d1a2a',
  maroon: '#6d1a2a',
  'gul kurusu': '#c08081',
  'dusty rose': '#c08081',
  mercan: '#ff7f50',
  coral: '#ff7f50',
  kiremit: '#b5523b',
  terracotta: '#b5523b',
  pembe: '#f4a6c1',
  pink: '#f4a6c1',
  fusya: '#d6338a',
  fuchsia: '#d6338a',
  magenta: '#d6338a',
  somon: '#fa8072',
  salmon: '#fa8072',
  // Oranges and yellows
  turuncu: '#f28c28',
  orange: '#f28c28',
  sari: '#f5cf3b',
  yellow: '#f5cf3b',
  limon: '#f2e86d',
  // Greens
  yesil: '#2f855a',
  green: '#2f855a',
  'zeytin yesili': '#6b6b2e',
  zeytin: '#6b6b2e',
  olive: '#6b6b2e',
  adacayi: '#9caf88',
  sage: '#9caf88',
  mint: '#a8dcc4',
  nane: '#a8dcc4',
  'su yesili': '#a8dcc4',
  'koyu yesil': '#1f4d36',
  'dark green': '#1f4d36',
  'acik yesil': '#9ad19a',
  zumrut: '#1f7a5a',
  emerald: '#1f7a5a',
  'cagla yesili': '#b5c46a',
  // Blues
  mavi: '#3b82f6',
  blue: '#3b82f6',
  lacivert: '#1f2a44',
  navy: '#1f2a44',
  'navy blue': '#1f2a44',
  'acik mavi': '#9cc5ec',
  'light blue': '#9cc5ec',
  'bebek mavisi': '#a7c7e7',
  'koyu mavi': '#1e3a8a',
  'dark blue': '#1e3a8a',
  indigo: '#3f4a8a',
  petrol: '#1f5f6b',
  'petrol mavisi': '#1f5f6b',
  turkuaz: '#2ab7b0',
  turquoise: '#2ab7b0',
  saks: '#3b5bdb',
  'saks mavi': '#3b5bdb',
  denim: '#4a6c8f',
  // Purples
  mor: '#7e3fa1',
  purple: '#7e3fa1',
  lila: '#c8a2c8',
  lilac: '#c8a2c8',
  lavanta: '#b9a7d6',
  lavender: '#b9a7d6',
  murdum: '#5e2750',
  plum: '#5e2750',
  patlican: '#4b2142',
};

/**
 * Lower-case, Turkish letters to their ASCII base, separators to one space.
 * `toLocaleLowerCase('tr')` alone would leave `ç`/`ğ`/`ş`; the fold is what
 * makes a feed's `ADAÇAYI`, `Adaçayı` and `adacayi` the same key.
 */
export function foldColorName(value: string): string {
  return value
    .toLocaleLowerCase('tr')
    .replace(/\u0307/g, '')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u')
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The CSS colour a shade name paints, or `null` when we do not know it.
 *
 * A compound name (`Siyah/Beyaz`, `Lacivert - Beyaz`) paints its FIRST shade:
 * a two-tone chip would need a gradient, which the card's base stylesheet
 * keeps out, and the first-named colour is the garment's main one in every
 * catalogue we read. A modifier we do not list (`Koyu Lacivert`) falls back to
 * the last word that names a colour.
 */
export function resolveSwatchColor(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (HEX.test(trimmed) || RGB.test(trimmed)) return trimmed;

  const first = trimmed.split(/\s*[/|,+&]\s*|\s+-\s+/)[0] ?? trimmed;
  const folded = foldColorName(first);
  if (NAMED_COLORS[folded]) return NAMED_COLORS[folded];

  const words = folded.split(' ');
  for (let length = words.length - 1; length >= 1; length -= 1) {
    const tail = words.slice(words.length - length).join(' ');
    if (NAMED_COLORS[tail]) return NAMED_COLORS[tail];
  }
  return null;
}

/**
 * Whether a resolved colour is light enough that a white chip edge would vanish
 * on a white card — the active ring and the hairline need a darker edge then.
 */
export function isLightSwatchColor(color: string): boolean {
  const hex = HEX.test(color) ? color.slice(1) : null;
  if (!hex) return false;
  const full =
    hex.length <= 4
      ? hex
          .slice(0, 3)
          .split('')
          .map((c) => c + c)
          .join('')
      : hex.slice(0, 6);
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 225;
}
