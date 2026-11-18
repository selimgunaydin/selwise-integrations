// GENERATED FILE — DO NOT EDIT.
//
// Vendored from packages/widget-contract/src/app-style.ts by
// scripts/sync-vendored-page-targeting.js. Edit the source, then run:
//
//   node scripts/sync-vendored-page-targeting.js
//
// It is copied rather than imported because @selwise/widget-contract is private
// and this SDK is published: a dependency on it would not resolve for anyone
// who installs @selwise/react-native from npm.

/**
 * THE translation of a web style into a React Native style.
 *
 * ## Why one table
 *
 * A merchant designs a surface once, in CSS vocabulary: lengths are strings
 * (`'13px'`, `'10px 16px'`, `'50%'`), weights are keywords (`'medium'`), shadows
 * are a scale (`'md'`) or a raw `box-shadow`, colours are `var(--selwise-brand,
 * #1a1a1a)`. React Native takes unitless numbers, a narrower `fontWeight`, no
 * shorthand `padding`, no `var()` and no percentage radius. Passing the object
 * through does not error — RN ignores what it cannot parse — so a merchant's
 * colours would apply and their sizing would not, which looks like a broken
 * theme rather than a missing translation.
 *
 * Until November 2026 that decision lived in three places: the Akinon plugin's
 * `ui/styles.js`, a list of keys the plugin never reads (`APP_UNREAD_STYLE_KEYS`)
 * and the dashboard's "(not drawn in the app)" label. The list claimed what was
 * unread; a key it did not name was assumed read. This file inverts it: EVERY
 * style key of the three style catalogues is classified here, either as
 * translated (`APP_STYLE_TABLE`) or as untranslatable with a reason
 * (`APP_HIDDEN_STYLE_KEYS`), and `app-style.spec.ts` fails when a key of
 * `TYPE_STYLE_CONFIGS` (every campaign type), `RECOMMENDATION_STYLE_CONFIGS` or
 * `CARD_STYLE_PROPERTIES` is in neither. A key added to a catalogue therefore
 * cannot reach the dashboard without someone deciding what the app does with it.
 *
 * ## What it is, what it is not
 *
 * PURE: no `react-native` import, plain objects in and out, so the SDK, the
 * Akinon plugin, the dashboard's contract specs and the API can all read it.
 * It decides a VALUE'S translation; which element a role is painted on is the
 * renderer's. Three surfaces share it (`StyleSurface`): a campaign's
 * `stylesJson`, a recommendation strip's five style blocks, and a product-card
 * tree node's style.
 *
 * `channel-fields.ts` derives the dashboard's decision for every style key from
 * this table (translated → drawn, hidden → hidden, `pending` → the phase of the
 * roadmap that wires the renderer), so there is one place to say it.
 *
 * NOT re-exported from the barrel: import the subpath,
 *   import { toNativeStyle } from '@selwise/widget-contract/app-style'
 */

/** The phases of `docs/APP_KANALI_YOL_HARITASI_2026-11-17.md` that still owe the app a drawing. */
export type AppPendingPhase = 'faz3' | 'faz4' | 'faz5' | 'faz6' | 'faz7' | 'faz8' | 'faz9';

export type StyleSurface = 'campaign' | 'strip' | 'card';

/**
 * What a value IS, which decides how it is translated.
 *
 *  - `color`        a colour string, tokens resolved
 *  - `length`       a CSS length as a number, a percentage string or `'auto'`
 *  - `fontSize`     a size in logical pixels
 *  - `fontWeight`   a keyword or hundreds, as RN's string weight
 *  - `radius`       a (shorthand) border radius; `%` needs the element's size
 *  - `border`       a `border` shorthand; `to` names the side
 *  - `shadow`       a scale name or a raw `box-shadow`
 *  - `spacing`      a 1-4 value `padding` / `margin` shorthand
 *  - `opacity`      0..1, or a `%` string
 *  - `percent`      0..100 (the overlay's scale)
 *  - `align`        `left | center | right`
 *  - `enum`         one of a closed list, optionally mapped
 *  - `flag`         a boolean
 *  - `number`       a bare number
 *  - `text`         a string the renderer reads as is
 *  - `fontFamily`   a CSS family list, mapped to the app's own font names
 *  - `aspectRatio`  `16/9` as a number
 *  - `lineHeight`   a multiplier of the font size, as absolute pixels
 *  - `duration`     milliseconds, from a number or a numeric string
 */
export type StyleKind =
  | 'color'
  | 'length'
  | 'fontSize'
  | 'fontWeight'
  | 'radius'
  | 'border'
  | 'shadow'
  | 'spacing'
  | 'opacity'
  | 'percent'
  | 'align'
  | 'enum'
  | 'flag'
  | 'number'
  | 'text'
  | 'fontFamily'
  | 'aspectRatio'
  | 'lineHeight'
  | 'duration';

export interface AppStyleSpec {
  /** The element the value is painted on (campaign roles, a strip's section id, a card node's `box | text | image`). */
  role: string;
  /** The catalogue key the value is read from (`titleStyles` roles read the field key inside the block). */
  key: string;
  kind: StyleKind;
  /** The React Native property written (`textColor` → `color`); `border` kinds name the side (`borderTop`). Default: the key. */
  to: string;
  /** `enum`: the accepted values, and what each becomes (identity when no map). */
  values?: readonly string[];
  map?: Readonly<Record<string, string>>;
  /** The renderer does not read this key yet; the phase that wires it. */
  pending?: AppPendingPhase;
}

/** A plain React Native style fragment: no import of `react-native`, so no typing against it. */
export type NativeStyle = Record<string, unknown>;

export interface AppStyleContext {
  /** The channel's resolved theme tokens (`--selwise-brand` → `#1a1a1a`). */
  tokens?: Readonly<Record<string, string>>;
  /** The element's own size, in pixels: what `border-radius: 50%` is a percentage of. */
  sizeForPercent?: number;
  /**
   * The host's fonts: a CSS family name (lowercase, unquoted) → the name the app
   * registered it under. Without a map `fontFamily` is not written and the text
   * keeps the app's own typeface.
   */
  fontFamilyMap?: Readonly<Record<string, string>>;
  /** The screen's size, for `vw` / `vh`. Without it those lengths are dropped. */
  viewport?: { width: number; height: number };
  /** What `1rem` / `1em` is, in pixels. Default 16. */
  rootFontSize?: number;
}

/* ----------------------------------------------------------------------------
   Primitives
   -------------------------------------------------------------------------- */

const VAR_PATTERN = /^var\(\s*(--[a-zA-Z0-9-]+)\s*(?:,\s*([\s\S]*?)\s*)?\)$/;

function tokenOf(tokens: AppStyleContext['tokens'], name: string): string {
  if (!tokens) return '';
  const value = tokens[name] ?? tokens[name.replace(/^--/, '')];
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * A CSS `var()` reference, resolved against the channel's tokens.
 *
 * Every widget style DEFAULT is literally `var(--selwise-brand, #1a1a1a)`, so a
 * merchant who never touched a colour ships one. A browser resolves it against
 * the tokens the widget wrote on the root; React Native has no cascade, so the
 * string used to reach the native layer verbatim. The fallback INSIDE the
 * `var()` is what the web uses when a token is unset, which keeps an unthemed
 * channel identical on both. A fallback can itself be a `var()`, so the chain is
 * followed — bounded, because a merchant-authored value could point at itself.
 * Not a `var()`: returned trimmed. An unresolvable `var()` with no fallback: `''`.
 */
export function resolveTokenValue(value: unknown, tokens?: AppStyleContext['tokens']): string {
  if (typeof value === 'number') return String(value);
  if (typeof value !== 'string') return '';
  let text = value.trim();
  for (let depth = 0; depth < 5; depth += 1) {
    const match = VAR_PATTERN.exec(text);
    if (!match) return text;
    const token = tokenOf(tokens, match[1] ?? '');
    if (token) return token;
    const fallback = (match[2] ?? '').trim();
    if (!fallback) return '';
    text = fallback;
  }
  return text;
}

function rootFont(ctx: AppStyleContext | undefined): number {
  return ctx?.rootFontSize && ctx.rootFontSize > 0 ? ctx.rootFontSize : 16;
}

/**
 * A CSS length. A number stays; `px`, `rem`, `em` and a bare number are pixels;
 * `vw` / `vh` need the viewport; `%` and `auto` stay strings (RN reads both on
 * a dimension). `ch`, `fr` and anything else: null.
 */
export function parseLength(value: unknown, ctx?: AppStyleContext): number | string | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const text = resolveTokenValue(value, ctx?.tokens).trim().toLowerCase();
  if (!text) return null;
  if (text === 'auto') return 'auto';
  const match = /^(-?\d*\.?\d+)(px|rem|em|%|vw|vh)?$/.exec(text);
  if (!match) return null;
  const amount = Number.parseFloat(match[1] ?? '');
  if (!Number.isFinite(amount)) return null;
  switch (match[2]) {
    case undefined:
    case 'px':
      return amount;
    case 'rem':
    case 'em':
      return amount * rootFont(ctx);
    case '%':
      return `${amount}%`;
    case 'vw':
      return ctx?.viewport ? (ctx.viewport.width * amount) / 100 : null;
    case 'vh':
      return ctx?.viewport ? (ctx.viewport.height * amount) / 100 : null;
    default:
      return null;
  }
}

/** `'13px'` / `13` / `'13'` / `'1rem'` as pixels; null for a percentage, `auto`, `none` or no number. */
export function px(value: unknown, fallback?: number, ctx?: AppStyleContext): number | null {
  const none = fallback === undefined ? null : fallback;
  if (value === null || value === undefined || value === '') return none;
  const length = parseLength(value, ctx);
  return typeof length === 'number' ? length : none;
}

const NAMED_COLOR = /^[a-z]{3,32}$/i;
const NOT_A_COLOR = new Set(['none', 'inherit', 'initial', 'unset', 'currentcolor', 'auto', 'revert']);
const HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const COLOR_FUNCTION = /^(rgba?|hsla?)\(\s*([^)]*?)\s*\)$/i;

/**
 * A colour React Native accepts, or null: hex, `rgb()` / `rgba()` / `hsl()` /
 * `hsla()` (the space-separated `rgb(0 0 0 / 50%)` form is rewritten to commas),
 * `transparent` and a named colour. Tokens are resolved first. A gradient,
 * `currentColor`, `none` and a `var()` that resolves to nothing are null.
 */
export function parseColor(value: unknown, ctx?: AppStyleContext): string | null {
  if (typeof value !== 'string') return null;
  const text = resolveTokenValue(value, ctx?.tokens).trim();
  if (!text) return null;
  if (HEX_COLOR.test(text)) return text;
  const fn = COLOR_FUNCTION.exec(text);
  if (fn) {
    const name = (fn[1] ?? '').toLowerCase();
    const parts = (fn[2] ?? '').split(/\s*[,/]\s*|\s+/).filter(Boolean);
    if (parts.length < 3 || parts.length > 4) return null;
    const base = name.startsWith('rgb') ? 'rgb' : 'hsl';
    const hasAlpha = parts.length === 4;
    return `${base}${hasAlpha ? 'a' : ''}(${parts.join(', ')})`;
  }
  const lower = text.toLowerCase();
  if (lower === 'transparent') return 'transparent';
  if (NOT_A_COLOR.has(lower)) return null;
  return NAMED_COLOR.test(text) ? lower : null;
}

/** `rgba(...)` from a colour and an opacity, when the colour is a literal we can read; else null. */
export function withAlpha(color: string, alpha: number): string | null {
  const a = Math.min(1, Math.max(0, alpha));
  const hex = HEX_COLOR.exec(color) ? color.slice(1) : null;
  if (hex) {
    const full =
      hex.length <= 4
        ? hex
            .split('')
            .map((char) => char + char)
            .join('')
        : hex;
    const r = Number.parseInt(full.slice(0, 2), 16);
    const g = Number.parseInt(full.slice(2, 4), 16);
    const b = Number.parseInt(full.slice(4, 6), 16);
    const own = full.length === 8 ? Number.parseInt(full.slice(6, 8), 16) / 255 : 1;
    return `rgba(${r}, ${g}, ${b}, ${round(own * a)})`;
  }
  const fn = COLOR_FUNCTION.exec(color);
  if (fn && (fn[1] ?? '').toLowerCase().startsWith('rgb')) {
    const parts = (fn[2] ?? '').split(/\s*,\s*/);
    if (parts.length >= 3) {
      const own = parts.length === 4 ? Number.parseFloat(parts[3] ?? '1') : 1;
      return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${round((Number.isFinite(own) ? own : 1) * a)})`;
    }
  }
  return null;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * CSS `font-weight` as what RN accepts. `'medium'` is the trap: a valid keyword,
 * what the dashboard writes, and RN throws it away — the text renders at 400 and
 * a "medium" heading comes out thin.
 */
export const FONT_WEIGHTS: Readonly<Record<string, string>> = {
  thin: '100',
  extralight: '200',
  light: '300',
  normal: '400',
  regular: '400',
  medium: '500',
  semibold: '600',
  demibold: '600',
  bold: '700',
  extrabold: '800',
  black: '900',
};

export function parseFontWeight(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim().toLowerCase();
  if (!text) return null;
  const named = FONT_WEIGHTS[text];
  if (named) return named;
  return /^[1-9]00$/.test(text) ? text : null;
}

/**
 * The shadow scale as RN draws it. iOS wants the four `shadow*` properties and
 * Android reads only `elevation`, so both are set; `none` is an explicit zero so
 * a container inheriting a shadow has it removed. The values are the plugin's,
 * measured on a device — a scale step is always stronger than the one below.
 */
export const SHADOW_SCALE: Readonly<
  Record<string, { opacity: number; radius: number; height: number; elevation: number }>
> = {
  none: { opacity: 0, radius: 0, height: 0, elevation: 0 },
  sm: { opacity: 0.08, radius: 2, height: 1, elevation: 1 },
  md: { opacity: 0.12, radius: 6, height: 2, elevation: 4 },
  lg: { opacity: 0.16, radius: 12, height: 4, elevation: 8 },
  xl: { opacity: 0.2, radius: 20, height: 8, elevation: 12 },
  '2xl': { opacity: 0.28, radius: 28, height: 12, elevation: 16 },
};

/** Splits on whitespace outside parentheses: `0 4px 6px rgba(0, 0, 0, 0.1)` → four parts. */
function words(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of text.trim()) {
    if (char === '(') depth += 1;
    if (char === ')') depth = Math.max(0, depth - 1);
    if (/\s/.test(char) && depth === 0) {
      if (current) out.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  if (current) out.push(current);
  return out;
}

function alphaOf(color: string): number {
  const fn = COLOR_FUNCTION.exec(color);
  if (fn) {
    const parts = (fn[2] ?? '').split(/\s*,\s*/);
    if (parts.length === 4) {
      const value = Number.parseFloat(parts[3] ?? '1');
      return Number.isFinite(value) ? value : 1;
    }
    return 1;
  }
  if (HEX_COLOR.test(color)) {
    const hex = color.slice(1);
    if (hex.length === 8) return Number.parseInt(hex.slice(6, 8), 16) / 255;
    if (hex.length === 4) return Number.parseInt((hex[3] ?? 'f') + (hex[3] ?? 'f'), 16) / 255;
  }
  return 1;
}

function opaque(color: string): string {
  const fn = COLOR_FUNCTION.exec(color);
  if (fn) {
    const parts = (fn[2] ?? '').split(/\s*,\s*/);
    if (parts.length === 4) {
      const base = (fn[1] ?? '').toLowerCase().startsWith('rgb') ? 'rgb' : 'hsl';
      return `${base}(${parts.slice(0, 3).join(', ')})`;
    }
    return color;
  }
  if (HEX_COLOR.test(color)) {
    const hex = color.slice(1);
    if (hex.length === 8) return `#${hex.slice(0, 6)}`;
    if (hex.length === 4) return `#${hex.slice(0, 3)}`;
  }
  return color;
}

/**
 * A shadow as RN styles: a scale name (`sm` … `2xl`) or a raw `box-shadow`
 * (`0 4px 6px -1px rgba(0,0,0,0.1)`, first layer; `inset` has no RN equivalent).
 * Null for anything else.
 */
export function toNativeShadow(value: unknown, ctx?: AppStyleContext): NativeStyle | null {
  if (typeof value !== 'string') return null;
  const text = resolveTokenValue(value, ctx?.tokens).trim();
  if (!text) return null;
  const preset = SHADOW_SCALE[text.toLowerCase()];
  if (preset) {
    return {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: preset.height },
      shadowOpacity: preset.opacity,
      shadowRadius: preset.radius,
      elevation: preset.elevation,
    };
  }
  // Only the first layer: RN has one shadow per view.
  const firstLayer = splitTopLevel(text)[0] ?? '';
  const parts = words(firstLayer);
  if (parts.length < 3 || parts[0]?.toLowerCase() === 'inset' || parts.some((part) => part.toLowerCase() === 'inset')) {
    return null;
  }
  const lengths: number[] = [];
  let color: string | null = null;
  for (const part of parts) {
    const length = parseLength(part, ctx);
    if (typeof length === 'number') lengths.push(length);
    else {
      const parsed = parseColor(part, ctx);
      if (parsed && color === null) color = parsed;
      else return null;
    }
  }
  if (lengths.length < 2 || lengths.length > 4) return null;
  const [x = 0, y = 0, blur = 0] = lengths;
  const base = color ?? 'rgba(0, 0, 0, 0.25)';
  const opacity = round(alphaOf(base));
  return {
    shadowColor: opaque(base),
    shadowOffset: { width: x, height: y },
    shadowOpacity: opacity,
    shadowRadius: round(blur / 2),
    elevation: Math.max(0, Math.min(24, Math.round(blur / 2 + Math.abs(y) / 2))),
  };
}

function splitTopLevel(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of text) {
    if (char === '(') depth += 1;
    if (char === ')') depth = Math.max(0, depth - 1);
    if (char === ',' && depth === 0) {
      out.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

/**
 * A border radius as RN styles. One value is every corner; two to four follow
 * the CSS shorthand (TL, TR, BR, BL). A percentage needs the element's size
 * (`ctx.sizeForPercent`) — `50%` is "a circle", RN has no percentage radius.
 */
export function toNativeRadius(value: unknown, ctx?: AppStyleContext): NativeStyle | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? { borderRadius: value } : null;
  const text = resolveTokenValue(value, ctx?.tokens).trim();
  if (!text) return null;
  const corner = (part: string): number | null => {
    if (part.endsWith('%')) {
      const percent = Number.parseFloat(part);
      const size = ctx?.sizeForPercent;
      return Number.isFinite(percent) && size !== undefined && Number.isFinite(size)
        ? (size * percent) / 100
        : null;
    }
    return px(part, undefined, ctx);
  };
  const parts = words(text.split('/')[0] ?? text).map(corner);
  if (parts.length === 0 || parts.some((part) => part === null)) return null;
  const [a = 0, b = a, c = a, d = b] = parts as number[];
  if (parts.length === 1) return { borderRadius: a };
  return {
    borderTopLeftRadius: a,
    borderTopRightRadius: b,
    borderBottomRightRadius: parts.length >= 3 ? c : a,
    borderBottomLeftRadius: parts.length === 4 ? d : b,
  };
}

export interface ParsedBorder {
  width: number;
  style: 'solid' | 'dashed' | 'dotted' | 'none';
  color: string | null;
}

const BORDER_STYLES = new Set(['solid', 'dashed', 'dotted', 'none']);

/**
 * A CSS `border` shorthand: `'1px solid #e5e7eb'`, `'solid 1px red'`, `'2px'`,
 * `'1px solid var(--selwise-border, #ddd)'` or `'none'`. `none` is width 0.
 * Null for anything it cannot read (a double border, a gradient).
 */
export function parseBorder(value: unknown, ctx?: AppStyleContext): ParsedBorder | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;
  if (text.toLowerCase() === 'none' || text === '0') return { width: 0, style: 'none', color: null };
  let width: number | null = null;
  let style: ParsedBorder['style'] | null = null;
  let color: string | null = null;
  for (const part of words(text)) {
    const lower = part.toLowerCase();
    if (BORDER_STYLES.has(lower)) {
      style = lower as ParsedBorder['style'];
      continue;
    }
    const length = parseLength(part, ctx);
    if (typeof length === 'number' && width === null && !VAR_PATTERN.test(part)) {
      width = length;
      continue;
    }
    const parsed = parseColor(part, ctx);
    if (parsed && color === null) {
      color = parsed;
      continue;
    }
    return null;
  }
  if (width === null) width = style === 'none' ? 0 : 1;
  if (width <= 0) return { width: 0, style: 'none', color: null };
  return { width, style: style ?? 'solid', color };
}

/**
 * A 1-4 value `padding` / `margin` shorthand, as RN's axes: one value all sides,
 * two vertical / horizontal, three adds a distinct bottom, four are TRBL — CSS's
 * order, which is what the dashboard writes. `auto` margins become 0 and centre
 * the element on that axis (`alignSelf: 'center'`).
 */
export function toNativeSpacing(value: unknown, prefix: 'padding' | 'margin', ctx?: AppStyleContext): NativeStyle | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? { [prefix]: value } : null;
  const raw = words(resolveTokenValue(value, ctx?.tokens));
  if (raw.length === 0 || raw.length > 4) return null;
  const auto = raw.map((part) => part.toLowerCase() === 'auto');
  const parts = raw.map((part, index) => {
    if (auto[index]) return 0;
    const length = parseLength(part, ctx);
    return length === null || length === 'auto' ? 0 : length;
  });
  const [first = 0, second = first, third = first, fourth = second] = parts;
  const out: NativeStyle = {};
  if (parts.length === 1) out[prefix] = first;
  else if (parts.length === 2) {
    out[`${prefix}Vertical`] = first;
    out[`${prefix}Horizontal`] = second;
  } else if (parts.length === 3) {
    out[`${prefix}Top`] = first;
    out[`${prefix}Horizontal`] = second;
    out[`${prefix}Bottom`] = third;
  } else {
    out[`${prefix}Top`] = first;
    out[`${prefix}Right`] = second;
    out[`${prefix}Bottom`] = third;
    out[`${prefix}Left`] = fourth;
  }
  const horizontalAuto =
    parts.length === 2 ? auto[1] : parts.length === 3 ? auto[1] : parts.length === 4 ? auto[1] && auto[3] : false;
  if (prefix === 'margin' && horizontalAuto) out.alignSelf = 'center';
  return out;
}

/** `16/9` / `16 / 9` as 1.777…; `auto` and anything else: null. */
export function parseAspectRatio(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value !== 'string') return null;
  const match = /^\s*(\d*\.?\d+)\s*(?:\/\s*(\d*\.?\d+))?\s*$/.exec(value);
  if (!match) return null;
  const a = Number.parseFloat(match[1] ?? '');
  const b = match[2] === undefined ? 1 : Number.parseFloat(match[2]);
  return a > 0 && b > 0 ? a / b : null;
}

/** 0..1 from a number, a numeric string or a `%` string; null otherwise. */
export function parseOpacity(value: unknown): number | null {
  if (typeof value === 'string' && value.trim().endsWith('%')) {
    const percent = Number.parseFloat(value);
    return Number.isFinite(percent) ? clamp01(percent / 100) : null;
  }
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(number) ? clamp01(number) : null;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** 0..1 from the dashboard's 0..100 scale (the overlay's). */
export function parsePercent(value: unknown): number | null {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number.parseFloat(value) : NaN;
  return Number.isFinite(number) ? clamp01(number / 100) : null;
}

/**
 * The first family of a CSS list that the host mapped to a font it registered.
 * Generic keywords (`sans-serif`, `inherit`) and a family nobody mapped are null:
 * the text keeps the app's own typeface.
 */
export function parseFontFamily(value: unknown, ctx?: AppStyleContext): string | null {
  if (typeof value !== 'string' || !ctx?.fontFamilyMap) return null;
  const text = resolveTokenValue(value, ctx.tokens);
  if (!text) return null;
  for (const family of text.split(',')) {
    const name = family.trim().replace(/^["']|["']$/g, '').toLowerCase();
    const mapped = ctx.fontFamilyMap[name];
    if (mapped) return mapped;
  }
  return null;
}

/* ----------------------------------------------------------------------------
   The tables
   -------------------------------------------------------------------------- */

function spec(
  role: string,
  key: string,
  kind: StyleKind,
  extra: { to?: string; values?: readonly string[]; map?: Record<string, string>; pending?: AppPendingPhase } = {}
): AppStyleSpec {
  return { role, key, kind, to: extra.to ?? key.split('.').pop() ?? key, ...extra };
}

const pend = (value: AppPendingPhase | undefined) => (value ? { pending: value } : {});

/**
 * A campaign's `stylesJson` (`TYPE_STYLE_CONFIGS`, every type), by key. A key is
 * one entry whatever type carries it: `fontSize` means the same on every type.
 * No key of a campaign is `pending` any more: every one the table translates is
 * drawn by the SDK's renderers (`@selwise/react-native/ui`, proved by its
 * `campaign-content.spec.ts` and `campaign-actions.spec.ts`).
 */
const CAMPAIGN: Record<string, AppStyleSpec> = {
  // container
  backgroundColor: spec('container', 'backgroundColor', 'color'),
  padding: spec('container', 'padding', 'spacing', { to: 'padding' }),
  borderRadius: spec('container', 'borderRadius', 'radius'),
  shadow: spec('container', 'shadow', 'shadow'),
  border: spec('container', 'border', 'border', { to: 'border' }),
  borderTop: spec('container', 'borderTop', 'border', { to: 'borderTop' }),
  borderBottom: spec('container', 'borderBottom', 'border', { to: 'borderBottom' }),
  maxWidth: spec('container', 'maxWidth', 'length'),
  maxHeight: spec('container', 'maxHeight', 'length'),
  width: spec('container', 'width', 'length'),
  offsetX: spec('container', 'offsetX', 'length'),
  offsetY: spec('container', 'offsetY', 'length'),
  containerPadding: spec('container', 'containerPadding', 'spacing', { to: 'padding' }),
  containerBackground: spec('container', 'containerBackground', 'color', { to: 'backgroundColor' }),
  // text
  textColor: spec('text', 'textColor', 'color', { to: 'color' }),
  fontSize: spec('text', 'fontSize', 'fontSize'),
  fontWeight: spec('text', 'fontWeight', 'fontWeight'),
  contentAlignment: spec('text', 'contentAlignment', 'align', { to: 'textAlign' }),
  titleFontSize: spec('title', 'titleFontSize', 'fontSize', { to: 'fontSize' }),
  titleFontWeight: spec('title', 'titleFontWeight', 'fontWeight', { to: 'fontWeight' }),
  textFontSize: spec('body', 'textFontSize', 'fontSize', { to: 'fontSize' }),
  headlineFontSize: spec('headline', 'headlineFontSize', 'fontSize', { to: 'fontSize' }),
  headlineFontWeight: spec('headline', 'headlineFontWeight', 'fontWeight', { to: 'fontWeight' }),
  // buttons
  buttonColor: spec('button', 'buttonColor', 'color', { to: 'backgroundColor' }),
  buttonFullWidth: spec('button', 'buttonFullWidth', 'flag', { to: 'stretch' }),
  buttonTextColor: spec('buttonLabel', 'buttonTextColor', 'color', { to: 'color' }),
  buttonFontSize: spec('buttonLabel', 'buttonFontSize', 'fontSize', { to: 'fontSize' }),
  buttonFontWeight: spec('buttonLabel', 'buttonFontWeight', 'fontWeight', { to: 'fontWeight' }),
  // close button
  showCloseButton: spec('close', 'showCloseButton', 'flag', { to: 'visible' }),
  closeButtonColor: spec('close', 'closeButtonColor', 'color', { to: 'color' }),
  // the scrim behind a modal
  overlayColor: spec('overlay', 'overlayColor', 'color', { to: 'backgroundColor' }),
  overlayOpacity: spec('overlay', 'overlayOpacity', 'percent', { to: 'opacity' }),
  // an image
  imageSize: spec('image', 'imageSize', 'length', { to: 'size' }),
  imageBorderRadius: spec('image', 'imageBorderRadius', 'radius'),
  imageSpacing: spec('image', 'imageSpacing', 'length', { to: 'spacing' }),
  imageMode: spec('image', 'imageMode', 'enum', {
    values: ['thumbnail', 'cover', 'fullWidth'],
  }),
  imageAspectRatio: spec('image', 'imageAspectRatio', 'aspectRatio'),
  imageObjectFit: spec('image', 'imageObjectFit', 'enum', {
    to: 'resizeMode',
    values: ['cover', 'contain', 'fill'],
    map: { cover: 'cover', contain: 'contain', fill: 'stretch' },
  }),
  imagePosition: spec('image', 'imagePosition', 'enum', {
    values: ['top', 'bottom', 'left', 'right'],
  }),
  imageWidth: spec('image', 'imageWidth', 'length', { to: 'width' }),
  imageBleed: spec('image', 'imageBleed', 'flag', { to: 'bleed' }),
  // the floating button
  size: spec('floating', 'size', 'length', { to: 'size' }),
  pulseAnimation: spec('floating', 'pulseAnimation', 'flag', { to: 'pulse' }),
  tooltipBgColor: spec('tooltip', 'tooltipBgColor', 'color', { to: 'backgroundColor' }),
  tooltipTextColor: spec('tooltip', 'tooltipTextColor', 'color', { to: 'color' }),
  // the modal's own entrance
  animation: spec('motion', 'animation', 'enum', {
    values: ['none', 'fade', 'scale', 'slide'],
  }),
  // the countdown
  timerBgColor: spec('timer', 'timerBgColor', 'color', { to: 'backgroundColor' }),
  timerTextColor: spec('timer', 'timerTextColor', 'color', { to: 'color' }),
  timerFontSize: spec('timer', 'timerFontSize', 'fontSize', { to: 'fontSize' }),
  timerFontWeight: spec('timer', 'timerFontWeight', 'fontWeight', { to: 'fontWeight' }),
  separatorStyle: spec('timer', 'separatorStyle', 'enum', { values: ['colon', 'dot', 'slash', 'none'] }),
  // the social-proof counters
  iconColor: spec('counter', 'iconColor', 'color', { to: 'iconColor' }),
  counterColor: spec('counter', 'counterColor', 'color', { to: 'color' }),
  display: spec('counter', 'display', 'enum', {
    to: 'alignSelf',
    values: ['inline', 'block', 'flex'],
    map: { inline: 'flex-start', block: 'stretch', flex: 'flex-start' },
  }),
  animateCounter: spec('counter', 'animateCounter', 'flag', { to: 'animate' }),
  animationDuration: spec('counter', 'animationDuration', 'duration', { to: 'animationDuration' }),
  separator: spec('counter', 'separator', 'enum', {
    to: 'thousandsSeparator',
    values: ['comma', 'dot', 'space', 'none'],
  }),
  showBadge: spec('badge', 'showBadge', 'flag', { to: 'visible' }),
  badgeText: spec('badge', 'badgeText', 'text', { to: 'text' }),
  badgeColor: spec('badge', 'badgeColor', 'color', { to: 'backgroundColor' }),
  badgeTextColor: spec('badge', 'badgeTextColor', 'color', { to: 'color' }),
  // the newsletter's input
  inputBackgroundColor: spec('input', 'inputBackgroundColor', 'color', { to: 'backgroundColor' }),
  inputTextColor: spec('input', 'inputTextColor', 'color', { to: 'color' }),
  inputBorderColor: spec('input', 'inputBorderColor', 'color', { to: 'borderColor' }),
  // the goal bar
  barTrackColor: spec('bar', 'barTrackColor', 'color', { to: 'backgroundColor' }),
  barFillColor: spec('bar', 'barFillColor', 'color', { to: 'backgroundColor' }),
  barCompleteColor: spec('bar', 'barCompleteColor', 'color', { to: 'backgroundColor' }),
  barHeight: spec('bar', 'barHeight', 'length', { to: 'height' }),
};

/** The five `RECOMMENDATION_STYLE_CONFIGS` blocks, by `<section>.<field>`; the role is the section id. */
const STRIP: Record<string, AppStyleSpec> = {};

function strip(section: string, key: string, kind: StyleKind, extra: Parameters<typeof spec>[3] = {}): void {
  STRIP[`${section}.${key}`] = spec(section, key, kind, extra);
}

strip('dotStyles', 'enabled', 'flag', { to: 'visible' });
strip('dotStyles', 'style', 'enum', { values: ['circle', 'bar', 'line'] });
strip('dotStyles', 'size', 'length');
strip('dotStyles', 'color', 'color');
strip('dotStyles', 'activeColor', 'color');
strip('dotStyles', 'gap', 'length');
strip('dotStyles', 'offset', 'length');
for (const section of ['titleStyles', 'subtitleStyles'] as const) {
  strip(section, 'enabled', 'flag', { to: 'visible' });
  strip(section, 'fontSize', 'fontSize');
  strip(section, 'fontWeight', 'fontWeight');
  strip(section, 'color', 'color');
  strip(section, 'textAlign', 'align');
  strip(section, 'marginBottom', 'length');
}
strip('containerStyles', 'backgroundColor', 'color');
strip('containerStyles', 'padding', 'spacing', { to: 'padding' });
strip('containerStyles', 'borderRadius', 'radius');
strip('containerStyles', 'maxWidth', 'length');
strip('containerStyles', 'margin', 'spacing', { to: 'margin' });

/**
 * A product-card tree node's style (`CARD_STYLE_PROPERTIES`), by key. The role
 * says which native element carries it: `box` (a View), `text` (a Text) or
 * `image`. The app draws the card tree natively (`@selwise/react-native`'s
 * `ProductCard`), every translated key of it.
 */
const CARD: Record<string, AppStyleSpec> = {};

function card(
  role: 'box' | 'text' | 'image',
  key: string,
  kind: StyleKind,
  extra: Parameters<typeof spec>[3] = {}
): void {
  CARD[key] = spec(role, key, kind, extra);
}

card('box', 'display', 'enum', {
  values: ['flex', 'block', 'inline-flex', 'none'],
  map: { flex: 'flex', block: 'flex', 'inline-flex': 'flex', none: 'none' },
});
card('box', 'flexDirection', 'enum', { values: ['row', 'column', 'row-reverse', 'column-reverse'] });
card('box', 'justifyContent', 'enum', {
  values: ['flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly'],
});
card('box', 'alignItems', 'enum', { values: ['stretch', 'flex-start', 'center', 'flex-end', 'baseline'] });
card('box', 'flexWrap', 'enum', { values: ['nowrap', 'wrap'] });
card('box', 'gap', 'length');
card('box', 'flexGrow', 'number');
card('box', 'width', 'length');
card('box', 'height', 'length');
card('box', 'minHeight', 'length');
card('box', 'maxWidth', 'length');
card('box', 'overflow', 'enum', { values: ['visible', 'hidden'] });
card('text', 'fontFamily', 'fontFamily');
card('text', 'fontSize', 'fontSize');
card('text', 'fontWeight', 'fontWeight');
card('text', 'fontStyle', 'enum', { values: ['normal', 'italic'] });
card('text', 'lineHeight', 'lineHeight');
card('text', 'letterSpacing', 'length');
card('text', 'textTransform', 'enum', { values: ['none', 'uppercase', 'lowercase', 'capitalize'] });
card('text', 'textAlign', 'align');
card('text', 'textDecoration', 'enum', {
  to: 'textDecorationLine',
  values: ['none', 'underline', 'line-through'],
});
card('text', 'maxLines', 'number', { to: 'numberOfLines' });
card('text', 'color', 'color');
card('box', 'background', 'color', { to: 'backgroundColor' });
card('box', 'opacity', 'opacity');
card('box', 'padding', 'spacing', { to: 'padding' });
card('box', 'margin', 'spacing', { to: 'margin' });
card('box', 'borderRadius', 'radius');
card('box', 'borderWidth', 'length');
card('box', 'borderStyle', 'enum', { values: ['none', 'solid', 'dashed', 'dotted'] });
card('box', 'borderColor', 'color');
card('box', 'boxShadow', 'shadow');
card('box', 'insetTop', 'length', { to: 'top' });
card('box', 'insetRight', 'length', { to: 'right' });
card('box', 'insetBottom', 'length', { to: 'bottom' });
card('box', 'insetLeft', 'length', { to: 'left' });
card('box', 'zIndex', 'number');
card('box', 'aspectRatio', 'aspectRatio');
card('image', 'objectFit', 'enum', {
  to: 'resizeMode',
  values: ['cover', 'contain', 'fill', 'none', 'scale-down'],
  map: { cover: 'cover', contain: 'contain', fill: 'stretch', none: 'center', 'scale-down': 'contain' },
});

export const APP_STYLE_TABLE: Readonly<Record<StyleSurface, Readonly<Record<string, AppStyleSpec>>>> = {
  campaign: CAMPAIGN,
  strip: STRIP,
  card: CARD,
};

/**
 * What the app CANNOT translate, by surface and key, with the reason. A key is
 * here instead of in the table when the native layer has no equivalent, or the
 * key belongs to a surface the app does not have (a cookie banner, an inline
 * banner). The dashboard does not show these on an app channel.
 */
export const APP_HIDDEN_STYLE_KEYS: Readonly<Record<StyleSurface, Readonly<Record<string, string>>>> = {
  campaign: {
    overlayBlur: 'A backdrop blur needs a native blur view the SDK does not depend on.',
    contentDirection: 'Only the inline banner has it, and an app has no inline banner (it has points).',
    declineButtonColor: 'The cookie banner is not an app surface: consent is the host\'s (`setConsent`).',
    declineButtonTextColor: 'The cookie banner is not an app surface: consent is the host\'s (`setConsent`).',
    customizeButtonColor: 'The cookie banner is not an app surface: consent is the host\'s (`setConsent`).',
    customizeButtonTextColor: 'The cookie banner is not an app surface: consent is the host\'s (`setConsent`).',
    linkColor: 'The cookie banner is not an app surface: consent is the host\'s (`setConsent`).',
    showDeclineButton: 'The cookie banner is not an app surface: consent is the host\'s (`setConsent`).',
    showCustomizeButton: 'The cookie banner is not an app surface: consent is the host\'s (`setConsent`).',
  },
  strip: {
    'arrowStyles.enabled': 'A phone swipes: arrows are a pointer\'s control.',
    'arrowStyles.style': 'A phone swipes: arrows are a pointer\'s control.',
    'arrowStyles.size': 'A phone swipes: arrows are a pointer\'s control.',
    'arrowStyles.color': 'A phone swipes: arrows are a pointer\'s control.',
    'arrowStyles.backgroundColor': 'A phone swipes: arrows are a pointer\'s control.',
    'arrowStyles.borderColor': 'A phone swipes: arrows are a pointer\'s control.',
    'arrowStyles.borderWidth': 'A phone swipes: arrows are a pointer\'s control.',
    'arrowStyles.borderRadius': 'A phone swipes: arrows are a pointer\'s control.',
    'arrowStyles.iconSize': 'A phone swipes: arrows are a pointer\'s control.',
    'arrowStyles.hoverColor': 'A phone swipes: arrows are a pointer\'s control, and there is no hover.',
    'arrowStyles.hoverBackgroundColor': 'A phone swipes: arrows are a pointer\'s control, and there is no hover.',
    'arrowStyles.position': 'A phone swipes: arrows are a pointer\'s control.',
    'arrowStyles.offset': 'A phone swipes: arrows are a pointer\'s control.',
  },
  card: {
    transform: 'The presets are pointer feedback (lift, grow on hover); a touch screen has no hover to show them on.',
    objectPosition: 'RN\'s Image has no object-position; the picture is placed by its resize mode only.',
  },
};

/**
 * Features of the web styles that are not keys, and what the app does instead.
 * Reprinted by the guardrail; none of them has a control in the dashboard of an
 * app channel.
 */
export const APP_UNTRANSLATABLE_FEATURES: Readonly<Record<string, string>> = {
  hover: 'No pointer: a card\'s hover rules and the strip\'s hover colours are not drawn.',
  breakpoints: 'The app is one phone: tablet and desktop overrides are not read.',
  gradient: 'The panel offers no gradient (flat:check); a pasted one is dropped by `parseColor`.',
  cssAnimationName: 'CSS animations by name have no native counterpart; `animation` is a closed list.',
  backdropFilter: 'Needs a native blur view.',
  customCss: 'Custom CSS is web only; a `custom` campaign\'s own CSS runs inside its WebView.',
  htmlNode: 'A card\'s `html` node is web only (K4).',
};

/* ----------------------------------------------------------------------------
   Translation
   -------------------------------------------------------------------------- */

function readValue(entry: AppStyleSpec, value: unknown, ctx: AppStyleContext | undefined, size: number | undefined): NativeStyle | null {
  const to = entry.to;
  switch (entry.kind) {
    case 'color': {
      const color = parseColor(value, ctx);
      return color ? { [to]: color } : null;
    }
    case 'length': {
      const length = parseLength(value, ctx);
      return length === null ? null : { [to]: length };
    }
    case 'fontSize': {
      const pixels = px(value, undefined, ctx);
      return pixels === null ? null : { [to]: pixels };
    }
    case 'fontWeight': {
      const weight = parseFontWeight(value);
      return weight ? { [to]: weight } : null;
    }
    case 'radius':
      return toNativeRadius(value, ctx);
    case 'border':
      return nativeBorder(to, parseBorder(value, ctx));
    case 'shadow':
      return toNativeShadow(value, ctx);
    case 'spacing':
      return toNativeSpacing(value, to === 'margin' ? 'margin' : 'padding', ctx);
    case 'opacity': {
      const opacity = parseOpacity(value);
      return opacity === null ? null : { [to]: opacity };
    }
    case 'percent': {
      const opacity = parsePercent(value);
      return opacity === null ? null : { [to]: opacity };
    }
    case 'align':
      return value === 'left' || value === 'center' || value === 'right' ? { [to]: value } : null;
    case 'enum': {
      const text = typeof value === 'string' ? value.trim() : '';
      if (!text || (entry.values && !entry.values.includes(text))) return null;
      return { [to]: entry.map?.[text] ?? text };
    }
    case 'flag': {
      if (typeof value === 'boolean') return { [to]: value };
      if (value === 'true') return { [to]: true };
      if (value === 'false') return { [to]: false };
      return null;
    }
    case 'number': {
      const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
      return Number.isFinite(number) ? { [to]: number } : null;
    }
    case 'text':
      return typeof value === 'string' && value.trim() ? { [to]: value } : null;
    case 'fontFamily': {
      const family = parseFontFamily(value, ctx);
      return family ? { [to]: family } : null;
    }
    case 'aspectRatio': {
      const ratio = parseAspectRatio(value);
      return ratio === null ? null : { [to]: ratio };
    }
    case 'lineHeight': {
      const multiplier = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseFloat(value) : NaN;
      return Number.isFinite(multiplier) && multiplier > 0 ? { [to]: round(multiplier * (size ?? 14)) } : null;
    }
    case 'duration': {
      const ms = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseFloat(value) : NaN;
      return Number.isFinite(ms) && ms >= 0 ? { [to]: ms } : null;
    }
    default:
      return null;
  }
}

function nativeBorder(side: string, border: ParsedBorder | null): NativeStyle | null {
  if (!border) return null;
  if (side === 'border') {
    return border.width === 0
      ? { borderWidth: 0 }
      : { borderWidth: border.width, borderStyle: border.style, ...(border.color ? { borderColor: border.color } : {}) };
  }
  // RN has no per-side border style, only a per-side width and colour.
  const prefix = side === 'borderTop' ? 'borderTop' : side === 'borderBottom' ? 'borderBottom' : side;
  return border.width === 0
    ? { [`${prefix}Width`]: 0 }
    : { [`${prefix}Width`]: border.width, ...(border.color ? { [`${prefix}Color`]: border.color } : {}) };
}

const POSITION_KEYS = new Set(['top', 'right', 'bottom', 'left']);

/**
 * The React Native style a role's keys produce.
 *
 * `role` names the element (campaign: `container`, `text`, `title`, `body`,
 * `headline`, `button`, `buttonLabel`, `close`, `overlay`, `image`, `floating`,
 * `tooltip`, `motion`, `timer`, `counter`, `badge`, `input`, `bar`; strip: the
 * section id — `titleStyles`, `dotStyles`, …; card: `box`, `text`, `image`), and
 * `styles` is the bag it reads (a campaign's `stylesJson`, ONE strip block, a
 * card node's style). Only keys with a value that translates are written, so a
 * spread never overwrites with `undefined`. Flags and `enum`s the renderer reads
 * rather than paints (`visible`, `stretch`, `pulse`) come back under their `to`
 * name beside the real RN properties.
 *
 * Nothing is thrown: a value that cannot be translated is skipped, which is what
 * the table's `hidden` list and the dashboard's gating exist to make rare.
 */
export function toNativeStyle(
  role: string,
  styles: unknown,
  ctx?: AppStyleContext,
  surface: StyleSurface = 'campaign'
): NativeStyle {
  const bag = styles && typeof styles === 'object' && !Array.isArray(styles) ? (styles as Record<string, unknown>) : {};
  const entries = Object.values(APP_STYLE_TABLE[surface]).filter((entry) => entry.role === role);
  const out: NativeStyle = {};
  // The size lineHeight multiplies, read before the loop so key order does not matter.
  const fontSizeEntry = entries.find((entry) => entry.kind === 'fontSize');
  const fontSize = fontSizeEntry ? px(bag[fontSizeEntry.key], undefined, ctx) ?? undefined : undefined;
  let positioned = false;
  for (const entry of entries) {
    const value = bag[entry.key];
    if (value === undefined || value === null || value === '') continue;
    const native = readValue(entry, value, ctx, fontSize);
    if (!native) continue;
    for (const [property, converted] of Object.entries(native)) {
      out[property] = converted;
      if (POSITION_KEYS.has(property)) positioned = true;
    }
  }
  // An inset means nothing in a flex column unless the node is taken out of flow.
  if (positioned && out.position === undefined) out.position = 'absolute';
  return out;
}

/**
 * The scrim behind a modal as ONE colour. RN has no way to give a view's background
 * an opacity without fading its children, so the opacity is folded into the colour
 * (`rgba(0, 0, 0, 0.5)`); a colour that is not a literal keeps `opacity` beside it.
 * Defaults are the web's: black at 50%.
 */
export function overlayStyle(styles: unknown, ctx?: AppStyleContext): NativeStyle {
  const bag = styles && typeof styles === 'object' && !Array.isArray(styles) ? (styles as Record<string, unknown>) : {};
  const base = parseColor(bag.overlayColor, ctx) ?? '#000000';
  const opacity = parsePercent(bag.overlayOpacity ?? 50) ?? 0.5;
  const folded = withAlpha(base, opacity);
  return folded ? { backgroundColor: folded } : { backgroundColor: base, opacity };
}

/**
 * The colour of a close glyph, and why the DEFAULT is load-bearing: a bar paints
 * its own brand ground so white reads there, a modal card is white and the same
 * default made the × invisible on it. `onSurface` says the glyph sits on the
 * surface's own ground (read the text colour).
 */
export function closeGlyphColor(styles: unknown, ctx?: AppStyleContext, options?: { onSurface?: boolean }): string {
  const bag = styles && typeof styles === 'object' && !Array.isArray(styles) ? (styles as Record<string, unknown>) : {};
  const explicit = parseColor(bag.closeButtonColor, ctx);
  if (explicit) return explicit;
  if (options?.onSurface) return parseColor(bag.textColor, ctx) ?? '#1a1a1a';
  return '#ffffff';
}
