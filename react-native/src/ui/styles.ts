import type { TextStyle, ViewStyle } from 'react-native';
import {
  closeGlyphColor as contractCloseGlyphColor,
  FONT_WEIGHTS as CONTRACT_FONT_WEIGHTS,
  overlayStyle as contractOverlayStyle,
  parseBorder as contractParseBorder,
  parseColor,
  parseFontWeight,
  px as contractPx,
  resolveTokenValue,
  toNativeRadius,
  toNativeShadow,
  toNativeSpacing,
  toNativeStyle,
  type AppStyleContext,
  type NativeStyle,
  type ParsedBorder,
} from '../vendor/app-style.js';
import { asRecord } from '../core/records.js';

/**
 * A surface's `stylesJson`, as React Native styles.
 *
 * ## One translation table
 *
 * `stylesJson` is authored in the dashboard for a browser: lengths are CSS
 * strings (`'13px'`, `'10px 16px'`), weights are CSS keywords (`'medium'`),
 * shadows are a scale (`'md'`) or a raw `box-shadow`, colours are
 * `var(--selwise-brand, #1a1a1a)`. React Native takes unitless numbers, a
 * narrower `fontWeight`, no shorthand `padding`, no `var()`, and ignores what it
 * cannot parse instead of failing — so a merchant's colours would apply and
 * their sizing would not, which looks like a broken theme rather than a missing
 * translation.
 *
 * What a value becomes is decided ONCE, by the table the dashboard gates its
 * fields by (`@selwise/widget-contract/app-style`, generated into
 * `../vendor/app-style.ts`): a style key the dashboard offers on an app channel
 * is one this table translates, and the dashboard hides the rest. This module is
 * the thin layer over it that a React Native renderer needs — the brand theme as
 * the tokens, the per-element helpers (`containerStyle`, `textStyle`,
 * `buttonStyle`) and the few shapes the table leaves to the renderer. A new key
 * is a row in the table, not a branch here.
 */

type Tokens = Record<string, string>;

/**
 * The site brand theme, as resolved custom properties.
 *
 * Global for the same reason it is global on the web, where the widget writes
 * these onto `documentElement.style`: every renderer needs them and none of
 * them should have to be handed a theme. `<SelwiseProvider>` sets it from the
 * client and again whenever the theme moves.
 */
let themeTokens: Tokens = {};

export function setThemeTokens(tokens: unknown): void {
  const next: Tokens = tokens && typeof tokens === 'object' && !Array.isArray(tokens) ? (tokens as Tokens) : {};
  // Written on every render of every component that draws brand-themed
  // content, with a fresh copy each time: keep the object we hold while its
  // contents are the same, so what is memoised on it stays memoised.
  if (sameTokens(themeTokens, next)) return;
  themeTokens = next;
}

function sameTokens(a: Tokens, b: Tokens): boolean {
  if (a === b) return true;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && a[key] === b[key]);
}

export function getThemeTokens(): Tokens {
  return themeTokens;
}

/** The translator's context: the brand tokens, plus what a call knows of its element. */
export function styleContext(extra?: Omit<AppStyleContext, 'tokens'>): AppStyleContext {
  return { tokens: themeTokens, ...(extra ?? {}) };
}

/**
 * A CSS `var()` reference, resolved against the brand theme.
 *
 * This is not an edge case: the widget style DEFAULTS are literally the string
 * `'var(--selwise-brand, #1a1a1a)'`, so a merchant who never touched a colour
 * ships one. A browser resolves it against the tokens the widget wrote on the
 * root; React Native has no cascade and no `var()`. The fallback INSIDE the
 * var() is what the web falls back to when a token is unset, which is what
 * makes an unthemed site look identical on both.
 */
export function resolveVar<T>(value: T): T | string {
  if (typeof value !== 'string') return value;
  return resolveTokenValue(value, themeTokens);
}

/** `'13px'` / `13` / `'13'` / `'1rem'` -> 13. Returns the fallback (or null) when there is no number in it. */
export function px(value: unknown): number | null;
export function px(value: unknown, fallback: number): number;
export function px(value: unknown, fallback?: number): number | null {
  return contractPx(value, fallback, styleContext());
}

/** A colour RN can use, or null. Hex, rgb() and named colours all pass. */
export function color(value: unknown): string | null {
  return parseColor(value, styleContext());
}

type FontWeight = NonNullable<TextStyle['fontWeight']>;

/** CSS `font-weight` keywords as RN's string weights (`'medium'` is the trap: valid CSS, what the dashboard writes, and RN throws it away). */
export const FONT_WEIGHTS: Record<string, string> = { ...CONTRACT_FONT_WEIGHTS };

export function fontWeight(value: unknown): FontWeight | null {
  return parseFontWeight(value) as FontWeight | null;
}

/** CSS shorthand padding as RN's axes (RN has no `padding: '10px 16px'`). */
export function padding(value: unknown): ViewStyle | null {
  return toNativeSpacing(value, 'padding', styleContext()) as ViewStyle | null;
}

/** A shadow scale name or a raw `box-shadow`, as both the iOS `shadow*` properties and the Android elevation. */
export function shadow(value: unknown): ViewStyle | null {
  return toNativeShadow(value, styleContext()) as ViewStyle | null;
}

/**
 * A border radius that may be a percentage (`'50%'` is "a circle" and RN has no
 * percentage radius, so it needs the element's own size). One number when every
 * corner is the same; null for a per-corner radius — use `radiusStyle`.
 */
export function borderRadius(value: unknown, sizeForPercent?: number): number | null {
  const style = radiusStyle(value, sizeForPercent);
  return style && typeof style['borderRadius'] === 'number' ? style['borderRadius'] : null;
}

/** A (shorthand) border radius as RN style properties: `borderRadius`, or the four corners. */
export function radiusStyle(value: unknown, sizeForPercent?: number): NativeStyle | null {
  return toNativeRadius(value, styleContext(sizeForPercent === undefined ? {} : { sizeForPercent }));
}

export type { ParsedBorder };

/**
 * A CSS border shorthand — what the dashboard writes (`border`, `borderTop`,
 * `borderBottom` are `'1px solid #e5e7eb'`, or `'none'`). Null for `none`, for a
 * zero width and for what cannot be read: there is nothing to draw.
 */
export function parseBorder(value: unknown): ParsedBorder | null {
  const border = contractParseBorder(value, styleContext());
  return border && border.width > 0 ? border : null;
}

/** Only the keys with a real value, so a spread never overwrites with null. */
function defined<T extends object>(object: { [K in keyof T]?: T[K] | null | undefined }): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(object)) {
    if (value !== null && value !== undefined) out[key] = value;
  }
  // The keys came from `object`, which is typed by `T`.
  return out as T;
}

type StyleRecord = Record<string, unknown>;

/**
 * What the table writes for a key that is not a React Native style property: a
 * renderer READS these (`offsetX`, `visible`, `stretch`, `pulse`, …) rather than
 * paints them, so they never reach a style prop (`nativeValues` has them).
 */
const NOT_A_STYLE_PROPERTY: readonly string[] = [
  'offsetX',
  'offsetY',
  'size',
  'visible',
  'stretch',
  'pulse',
  'animate',
  'animationDuration',
  'thousandsSeparator',
  'bleed',
  'spacing',
  'iconColor',
  'text',
];

/** The campaign table's output for one element, free of the renderer-only keys. */
export function nativeStyle(role: string, styles: unknown, extra?: Omit<AppStyleContext, 'tokens'>): StyleRecord {
  const out = toNativeStyle(role, styles, styleContext(extra));
  for (const key of NOT_A_STYLE_PROPERTY) delete out[key];
  return out;
}

/** The renderer-only values an element's keys carry (`visible`, `stretch`, `pulse`, `animate`, `bleed`, …). */
export function nativeValues(role: string, styles: unknown, extra?: Omit<AppStyleContext, 'tokens'>): StyleRecord {
  const out = toNativeStyle(role, styles, styleContext(extra));
  const kept: StyleRecord = {};
  for (const key of NOT_A_STYLE_PROPERTY) if (out[key] !== undefined) kept[key] = out[key];
  return kept;
}

/**
 * The container style shared by every surface type: background, padding,
 * radius, border, shadow and size.
 */
export function containerStyle(styles: unknown, options?: { sizeForPercent?: number }): ViewStyle {
  const s = asRecord(styles);
  const base = nativeStyle(
    'container',
    s,
    options?.sizeForPercent === undefined ? {} : { sizeForPercent: options.sizeForPercent }
  );
  // A surface saved with `borderColor` / `borderWidth` (no style editor writes
  // them) stays readable; the editor's `border` shorthand wins.
  const legacyColor = color(s['borderColor']);
  const legacy: ViewStyle =
    base['borderWidth'] === undefined && legacyColor
      ? { borderColor: legacyColor, borderWidth: px(s['borderWidth'], 1) }
      : {};
  return { ...legacy, ...base } as ViewStyle;
}

/** The text style shared by every surface type. */
export function textStyle(
  styles: unknown,
  options?: { colorKey?: string; sizeKey?: string; weightKey?: string; defaultSize?: number }
): TextStyle {
  const s = asRecord(styles);
  const opts = options || {};
  const align = s['contentAlignment'];
  const size = opts.sizeKey ? s[opts.sizeKey] : s['fontSize'];

  return defined<TextStyle>({
    color: color(opts.colorKey ? s[opts.colorKey] : s['textColor']),
    fontSize: opts.defaultSize === undefined ? px(size) : px(size, opts.defaultSize),
    fontWeight: fontWeight(opts.weightKey ? s[opts.weightKey] : s['fontWeight']),
    textAlign: align === 'left' || align === 'center' || align === 'right' ? align : null,
  });
}

/**
 * Button surface + label, from the `button*` keys. `fullWidthDefault` is what a
 * type does when the merchant never touched the switch: the modal's button
 * fills the card (the web's `buttonFullWidth !== false`), a bar's does not.
 */
export function buttonStyle(
  styles: unknown,
  options?: { fullWidthDefault?: boolean }
): { container: ViewStyle; label: TextStyle } {
  const s = asRecord(styles);
  const surface = toNativeStyle('button', s, styleContext());
  const label = toNativeStyle('buttonLabel', s, styleContext());
  const full = typeof surface['stretch'] === 'boolean' ? surface['stretch'] : options?.fullWidthDefault === true;
  return {
    container: defined<ViewStyle>({
      backgroundColor: typeof surface['backgroundColor'] === 'string' ? surface['backgroundColor'] : null,
      borderRadius: px(s['buttonBorderRadius'], 6),
      alignSelf: full ? 'stretch' : null,
    }),
    label: defined<TextStyle>({
      color: typeof label['color'] === 'string' ? label['color'] : null,
      fontSize: typeof label['fontSize'] === 'number' ? label['fontSize'] : 14,
      fontWeight: (typeof label['fontWeight'] === 'string' ? label['fontWeight'] : '600') as FontWeight,
    }),
  };
}

/**
 * The scrim behind a modal, as ONE colour: RN cannot give a view's background an
 * opacity without fading what is inside it, so the opacity is folded into the
 * colour (`rgba(0, 0, 0, 0.5)`). Defaults are the web's: black at 50%.
 */
export function overlayStyle(styles: unknown): ViewStyle {
  return contractOverlayStyle(asRecord(styles), styleContext()) as ViewStyle;
}

/**
 * The colour of a close glyph, and why the DEFAULT is load-bearing.
 *
 * A bar or a sticky footer paints its own brand-coloured ground, so white is
 * the readable default there. A modal card is white — and the same default made
 * the × invisible on it, which is not a cosmetic bug: the newsletter popup had
 * no dismiss at all on a real device while its config said
 * `showCloseButton: true`.
 *
 * The per-type style allow-list does not offer `closeButtonColor` on every
 * type (`newsletter` is one that does not), so a merchant cannot correct this.
 * The default has to be right.
 */
export function closeGlyphColor(styles: unknown, options?: { onSurface?: boolean }): string {
  return contractCloseGlyphColor(asRecord(styles), styleContext(), options);
}
