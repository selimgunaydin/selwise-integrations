'use strict';

/**
 * Translates a surface's `stylesJson` into React Native styles.
 *
 * ## Why a translator and not a theme
 *
 * `stylesJson` is authored in the dashboard for a browser: lengths are CSS
 * strings (`'13px'`, `'10px 16px'`), weights are CSS keywords (`'medium'`),
 * shadows are Tailwind-ish scale names (`'md'`, `'2xl'`). React Native takes
 * unitless numbers, a narrower set of `fontWeight` values, and has no shorthand
 * `padding`. Passing the object straight through does not error — RN silently
 * ignores what it cannot parse — so a merchant's colours would apply and their
 * sizing would not, which looks like a broken theme rather than a missing
 * translation.
 *
 * Everything here is keyed on the values that actually appear in a real
 * `/config` payload, not on the CSS spec.
 */

/**
 * The site brand theme, as resolved custom properties.
 *
 * Global for the same reason it is global on the web, where the widget writes
 * these onto `documentElement.style`: every renderer needs them and none of
 * them should have to be handed a theme. `setThemeTokens` is called once, after
 * `/config` lands.
 */
let themeTokens = {};

function setThemeTokens(tokens) {
  themeTokens = tokens && typeof tokens === 'object' && !Array.isArray(tokens) ? tokens : {};
}

function getThemeTokens() {
  return themeTokens;
}

const VAR_PATTERN = /^var\(\s*(--[a-zA-Z0-9-]+)\s*(?:,\s*([\s\S]*?)\s*)?\)$/;

/**
 * A CSS `var()` reference, resolved.
 *
 * This is not an edge case: the widget style DEFAULTS are literally the string
 * `'var(--selwise-brand, #1a1a1a)'` (`packages/widget-contract/src/configs.ts`),
 * so a merchant who never touched a colour ships one. A browser resolves it
 * against the tokens the widget wrote on the root; React Native has no cascade
 * and no `var()`, so the string reached the native layer verbatim and the brand
 * colour was lost on every unmodified widget in the app.
 *
 * The fallback INSIDE the var() is the same value the web falls back to when a
 * token is unset, which is what makes an unthemed site look identical on both.
 */
function resolveVar(value) {
  if (typeof value !== 'string') return value;
  let text = value.trim();

  // A fallback can itself be a var(), so follow the chain — bounded, because a
  // merchant-authored value could point at itself.
  for (let depth = 0; depth < 5; depth += 1) {
    const match = VAR_PATTERN.exec(text);
    if (!match) return text;

    const token = themeTokens[match[1]];
    if (typeof token === 'string' && token.trim()) return token.trim();

    const fallback = (match[2] || '').trim();
    if (!fallback) return '';
    text = fallback;
  }

  return text;
}

/** `'13px'` / `13` / `'13'` -> 13. Returns null when there is no number in it. */
function px(value, fallback) {
  if (value === null || value === undefined || value === '') {
    return fallback === undefined ? null : fallback;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback ?? null;

  // `var(--selwise-radius, 8px)` is a real default, and `parseFloat` of it is
  // NaN — so without resolving first, a themed radius silently became the
  // fallback argument instead of the merchant's value.
  const text = resolveVar(String(value)).trim();
  if (text === 'auto' || text === 'none') return fallback === undefined ? null : fallback;

  const parsed = Number.parseFloat(text);
  return Number.isFinite(parsed) ? parsed : fallback === undefined ? null : fallback;
}

/** A colour RN can use, or null. Hex, rgb() and named colours all pass. */
function color(value) {
  if (typeof value !== 'string') return null;
  const text = resolveVar(value).trim();
  if (!text || text === 'none' || text === 'transparent') return text === 'transparent' ? 'transparent' : null;
  return text;
}

/**
 * CSS `font-weight` to what RN accepts.
 *
 * `'medium'` is the trap: it is a valid CSS keyword, it is what the dashboard
 * writes, and RN throws it away — the text renders at 400 and the merchant sees
 * their "medium" heading come out thin.
 */
const FONT_WEIGHTS = {
  thin: '100',
  extralight: '200',
  light: '300',
  normal: '400',
  regular: '400',
  medium: '500',
  semibold: '600',
  demibold: '600',
  bold: 'bold',
  extrabold: '800',
  black: '900',
};

function fontWeight(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim().toLowerCase();
  if (!text) return null;
  if (FONT_WEIGHTS[text]) return FONT_WEIGHTS[text];
  if (/^[1-9]00$/.test(text)) return text;
  return null;
}

/**
 * CSS shorthand padding to RN's two axes.
 *
 * RN has no `padding: '10px 16px'`. One value is all sides, two are
 * vertical/horizontal, three add a distinct bottom, four are TRBL — the same
 * order CSS uses, because that is what the dashboard emits.
 */
function padding(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return { padding: value };

  const parts = String(value)
    .trim()
    .split(/\s+/)
    .map((part) => px(part, 0));

  if (parts.length === 0) return null;
  if (parts.length === 1) return { padding: parts[0] };
  if (parts.length === 2) return { paddingVertical: parts[0], paddingHorizontal: parts[1] };
  if (parts.length === 3) {
    return { paddingTop: parts[0], paddingHorizontal: parts[1], paddingBottom: parts[2] };
  }
  return {
    paddingTop: parts[0],
    paddingRight: parts[1],
    paddingBottom: parts[2],
    paddingLeft: parts[3],
  };
}

/**
 * Shadow scale names to RN.
 *
 * iOS wants the four `shadow*` properties and Android only reads `elevation`,
 * so both are set. `'none'` must produce an explicit zero rather than nothing:
 * a container that inherits a shadow from the app's own style needs it removed.
 */
const SHADOWS = {
  none: { shadowOpacity: 0, shadowRadius: 0, elevation: 0 },
  sm: { shadowOpacity: 0.08, shadowRadius: 2, shadowOffsetHeight: 1, elevation: 1 },
  md: { shadowOpacity: 0.12, shadowRadius: 6, shadowOffsetHeight: 2, elevation: 4 },
  lg: { shadowOpacity: 0.16, shadowRadius: 12, shadowOffsetHeight: 4, elevation: 8 },
  xl: { shadowOpacity: 0.2, shadowRadius: 20, shadowOffsetHeight: 8, elevation: 12 },
  '2xl': { shadowOpacity: 0.28, shadowRadius: 28, shadowOffsetHeight: 12, elevation: 16 },
};

function shadow(value) {
  const preset = SHADOWS[String(value ?? '').trim().toLowerCase()];
  if (!preset) return null;

  const { shadowOffsetHeight, ...rest } = preset;
  return {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: shadowOffsetHeight || 0 },
    ...rest,
  };
}

/**
 * A border radius that may be a percentage.
 *
 * `'50%'` means "a circle" and RN has no percentage radius, so it needs the
 * element's own size — which only the caller knows. Hence the second argument.
 */
function borderRadius(value, sizeForPercent) {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).trim();

  if (text.endsWith('%')) {
    const percent = Number.parseFloat(text);
    if (!Number.isFinite(percent) || !Number.isFinite(sizeForPercent)) return null;
    return (sizeForPercent * percent) / 100;
  }
  return px(text);
}

/** Only the keys with a real value, so a spread never overwrites with null. */
function defined(object) {
  const out = {};
  for (const [key, value] of Object.entries(object)) {
    if (value !== null && value !== undefined) out[key] = value;
  }
  return out;
}

/**
 * The container style shared by every surface type: background, padding,
 * radius, border colour and shadow.
 */
function containerStyle(styles, options) {
  const s = styles || {};
  const opts = options || {};

  return defined({
    backgroundColor: color(s.backgroundColor),
    borderRadius: borderRadius(s.borderRadius, opts.sizeForPercent),
    borderColor: color(s.borderColor),
    borderWidth: color(s.borderColor) ? px(s.borderWidth, 1) : null,
    maxWidth: px(s.maxWidth),
    width: px(s.width),
    maxHeight: px(s.maxHeight),
    ...(padding(s.padding) || {}),
    ...(shadow(s.shadow) || {}),
  });
}

/** The text style shared by every surface type. */
function textStyle(styles, options) {
  const s = styles || {};
  const opts = options || {};

  return defined({
    color: color(opts.colorKey ? s[opts.colorKey] : s.textColor),
    fontSize: px(opts.sizeKey ? s[opts.sizeKey] : s.fontSize, opts.defaultSize),
    fontWeight: fontWeight(opts.weightKey ? s[opts.weightKey] : s.fontWeight),
    textAlign: ['left', 'center', 'right'].includes(s.contentAlignment)
      ? s.contentAlignment
      : null,
  });
}

/** Button surface + label, from the `button*` keys. */
function buttonStyle(styles) {
  const s = styles || {};
  return {
    container: defined({
      backgroundColor: color(s.buttonColor),
      borderRadius: px(s.buttonBorderRadius, 6),
      alignSelf: s.buttonFullWidth === true ? 'stretch' : null,
    }),
    label: defined({
      color: color(s.buttonTextColor),
      fontSize: px(s.buttonFontSize, 14),
      fontWeight: fontWeight(s.buttonFontWeight) || '600',
    }),
  };
}

/** The scrim behind a modal: colour plus opacity, which RN cannot read as one. */
function overlayStyle(styles) {
  const s = styles || {};
  const base = color(s.overlayColor) || '#000000';
  const opacity = px(s.overlayOpacity, 0.5);

  return {
    backgroundColor: base,
    opacity: opacity > 1 ? opacity / 100 : opacity,
  };
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
function closeGlyphColor(styles, options) {
  const s = styles || {};
  const explicit = color(s.closeButtonColor);
  if (explicit) return explicit;

  if (options && options.onSurface) {
    return color(s.textColor) || '#1a1a1a';
  }
  return '#ffffff';
}

module.exports = {
  closeGlyphColor,
  setThemeTokens,
  getThemeTokens,
  resolveVar,
  px,
  color,
  fontWeight,
  padding,
  shadow,
  borderRadius,
  containerStyle,
  textStyle,
  buttonStyle,
  overlayStyle,
  FONT_WEIGHTS,
  SHADOWS,
};
