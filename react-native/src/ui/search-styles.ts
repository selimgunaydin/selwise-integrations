import type { SearchAppearance, SearchGridColumns, SearchImageAspect } from '../vendor/search-settings.js';
import type { ImageStyle, TextStyle, ViewStyle } from 'react-native';
import { resolveVar } from './styles.js';

/** A style of the search screen: a view's, a text's or an image's. */
export type SearchStyle = ViewStyle & TextStyle & ImageStyle;

/**
 * `s(style)` is the style, or nothing in an `unstyled` screen: the structure
 * stays and the app styles every part itself.
 */
export const styler =
  (unstyled: boolean) =>
  (style: SearchStyle): SearchStyle | undefined =>
    unstyled ? undefined : style;

/**
 * The part of `settings.appearance` a native screen can draw, as React Native
 * values: colours resolved against the brand, radii, the density's spacing, the
 * grid. What an app does not draw — the overlay, panel and drawer sizes, the
 * floating button, custom CSS — is a storefront's, and is not read here.
 *
 * A colour the merchant left empty follows the channel's brand
 * (`var(--selwise-*)`), exactly as the storefront's search does; the fallbacks
 * inside the `var()` are the storefront's too, so an unthemed channel looks the
 * same in both. The brand tokens must be set (`useBrandTheme`) before this runs.
 */

export interface SearchTheme {
  colors: {
    accent: string;
    accentText: string;
    background: string;
    surfaceAlt: string;
    text: string;
    muted: string;
    border: string;
    highlight: string;
    sale: string;
    saleText: string;
  };
  /** Cards, images and the buttons' corners. */
  radius: number;
  chipRadius: number;
  /** The screen's horizontal padding and the gap between rows and cards. */
  pad: number;
  gap: number;
  input: { height: number; radius: number; icon: boolean };
  /** Columns of a grid. */
  columns: number;
  /** Width over height of a grid card's image. */
  imageRatio: number;
  /** The merchant's own font stack, when they set one; else the brand's. */
  fontStack: string | undefined;
}

const read = (value: string, fallback: string): string => {
  const text = value.trim();
  const resolved = String(resolveVar(text || fallback)).trim();
  return resolved || fallback;
};

/** `auto` is two columns: what a phone draws when nobody chose (`PHONE_DEFAULT_MAX_COLUMNS`). */
export function gridColumnCount(columns: SearchGridColumns): number {
  return columns === 'auto' ? 2 : Number(columns);
}

export function imageRatio(aspect: SearchImageAspect): number {
  if (aspect === '3/4') return 3 / 4;
  if (aspect === '4/3') return 4 / 3;
  return 1;
}

export function searchTheme(appearance: SearchAppearance): SearchTheme {
  const c = appearance.colors;
  const accent = read(c.accent, 'var(--selwise-brand, #111827)');
  const compact = appearance.density === 'compact';
  return {
    colors: {
      accent,
      accentText: read('', 'var(--selwise-brand-text, #ffffff)'),
      background: read(c.background, 'var(--selwise-surface, #ffffff)'),
      surfaceAlt: read('', 'var(--selwise-surface-alt, #f5f5f6)'),
      text: read(c.text, 'var(--selwise-text, #111827)'),
      muted: read(c.muted, 'var(--selwise-text-muted, #6b7280)'),
      border: read(c.border, 'var(--selwise-border, #e5e7eb)'),
      highlight: c.highlight.trim() ? read(c.highlight, accent) : accent,
      sale: read('', 'var(--selwise-sale, #dc2626)'),
      saleText: read('', 'var(--selwise-sale-text, #ffffff)'),
    },
    radius: appearance.radius,
    chipRadius: appearance.chipRadius,
    pad: compact ? 12 : 16,
    gap: compact ? 8 : 12,
    input: { height: appearance.input.height, radius: appearance.input.radius, icon: appearance.input.icon },
    columns: gridColumnCount(appearance.grid.columns),
    imageRatio: imageRatio(appearance.grid.imageAspect),
    fontStack: appearance.font.trim() || undefined,
  };
}
