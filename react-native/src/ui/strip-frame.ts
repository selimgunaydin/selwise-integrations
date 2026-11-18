import { toNativeStyle, type AppStyleContext, type NativeStyle } from '../vendor/app-style.js';
import { SLOT_SURFACE_INSET_PX } from '../vendor/surface-geometry.js';
import { stripHeading } from './strip-heading.js';

/**
 * The frame a recommendation strip is drawn in: its heading, its container and
 * its page dots, as React Native styles.
 *
 * ## One table, the web's defaults
 *
 * The merchant designs the frame in the dashboard — `titleStyles`,
 * `subtitleStyles`, `containerStyles`, `dotStyles` — in CSS vocabulary. The
 * values are translated by the table the dashboard gates its fields by
 * (`@selwise/widget-contract/app-style`, the `strip` surface), so a key the
 * dashboard offers on an app channel is one this file draws. What the browser
 * widget does with a missing value is what this does too (a 24px bold heading,
 * a 14px subtitle), except that the colours it falls back to are the brand's
 * tokens first (`var(--selwise-text, #111111)`): an unthemed channel draws the
 * same literal the web does, a themed one draws its brand.
 *
 * Plain TypeScript with no `react-native` import, so it is tested without a
 * renderer.
 */

type Bag = Record<string, unknown>;

/**
 * The container padding of a strip that stores none (one a host built by hand),
 * in px: the page inset on every side (`SLOT_SURFACE_INSET_PX`, the one a
 * campaign or an enrichment block drawn in a point gets), so it sits on the same
 * rhythm as the rest of the screen. A padding the strip DOES store is drawn
 * exactly as stored: the dashboard writes an app strip the phone's padding when
 * it is created, so nothing here second-guesses a value.
 */
export const STRIP_PHONE_PADDING = Object.freeze({ vertical: SLOT_SURFACE_INSET_PX, horizontal: SLOT_SURFACE_INSET_PX });

const isBag = (value: unknown): value is Bag => !!value && typeof value === 'object' && !Array.isArray(value);

export interface StripHeadingView {
  text: string;
  /** Text style; `marginBottom` is the heading's own space below it. */
  style: NativeStyle;
}

export interface StripDotsView {
  width: number;
  height: number;
  radius: number;
  color: string;
  activeColor: string;
  gap: number;
  /** The space between the cards and the dots. */
  offset: number;
}

export interface StripFrame {
  /** Container style: background, padding, corner, margin, max width. */
  container: NativeStyle;
  title: StripHeadingView | null;
  subtitle: StripHeadingView | null;
  /** Null when the strip draws no dots. */
  dots: StripDotsView | null;
}

/**
 * One dot's geometry: `circle` is round, `bar` a pill twice as wide as tall,
 * `line` a thin dash three times as wide — the storefront's `dotDimensionsOf`.
 */
export function dotGeometry(style: unknown, size: number): { width: number; height: number; radius: number } {
  if (style === 'line') return { width: size * 3, height: Math.max(2, size / 2), radius: 2 };
  if (style === 'bar') return { width: size * 2, height: size, radius: size / 2 };
  return { width: size, height: size, radius: size / 2 };
}

function heading(
  block: unknown,
  text: string,
  ctx: AppStyleContext,
  role: 'titleStyles' | 'subtitleStyles',
  defaults: { fontSize: number; fontWeight: string; color: string; marginBottom: number }
): StripHeadingView | null {
  if (!text) return null;
  const native = toNativeStyle(role, block, ctx, 'strip');
  // `visible` is the block's `enabled` switch: a heading the merchant turned off is not drawn.
  if (native['visible'] === false) return null;
  delete native['visible'];
  return {
    text,
    style: {
      fontSize: defaults.fontSize,
      fontWeight: defaults.fontWeight,
      color: defaults.color,
      textAlign: 'left',
      marginBottom: defaults.marginBottom,
      ...native,
    },
  };
}

/** The token a literal default stands behind, resolved against the brand: `var(--selwise-text, #111111)`. */
const tokened = (token: string, literal: string, ctx: AppStyleContext): string => {
  const raw = ctx.tokens?.[token] ?? ctx.tokens?.[token.replace(/^--/, '')];
  return typeof raw === 'string' && raw.trim() ? raw.trim() : literal;
};

/**
 * The strip's frame.
 *
 * `titleOverride` is the screen's own heading (`<RecommendationStrip title>`),
 * which wins over the merchant's and is drawn whatever the merchant's switch
 * says: a host that names a heading wants it.
 */
export function stripFrameOf(
  widget: { title?: unknown; name?: unknown; subtitle?: unknown; [key: string]: unknown } | null | undefined,
  ctx: AppStyleContext,
  titleOverride?: string | null
): StripFrame {
  const w: Bag = isBag(widget) ? widget : {};

  // A strip the API sent carries its style blocks and the web's rule is exact:
  // a heading is drawn when it is switched on AND has words. One a host built by
  // hand carries no block, and keeps the SDK's older rule (the widget's title,
  // its internal name as the last resort).
  const fromApi = isBag(w['titleStyles']);
  const titleText = titleOverride?.trim()
    ? titleOverride
    : fromApi
      ? typeof w['title'] === 'string'
        ? w['title']
        : ''
      : stripHeading(widget, null);
  const title = heading(
    titleOverride?.trim() ? { ...(isBag(w['titleStyles']) ? w['titleStyles'] : {}), enabled: true } : w['titleStyles'],
    titleText,
    ctx,
    'titleStyles',
    { fontSize: 24, fontWeight: '700', color: tokened('--selwise-text', '#111111', ctx), marginBottom: 16 }
  );

  const subtitleText = typeof w['subtitle'] === 'string' ? w['subtitle'] : '';
  const subtitle = heading(w['subtitleStyles'], subtitleText, ctx, 'subtitleStyles', {
    fontSize: 14,
    fontWeight: '400',
    color: tokened('--selwise-text-muted', '#666666', ctx),
    marginBottom: 24,
  });

  const container = toNativeStyle('containerStyles', w['containerStyles'], ctx, 'strip');
  // A phone has no room for a "max width" wider than itself, and `auto` is not a width RN's `maxWidth` takes.
  if (container['maxWidth'] === 'auto') delete container['maxWidth'];
  // `margin: 0 auto` arrives as `alignSelf: 'center'`, which in React Native wraps the view to its content: the
  // box a CSS block fills up to its `maxWidth`. The cards are sized by this box, so it takes the width and
  // `maxWidth` is the cap, as in CSS.
  if (container['alignSelf'] === 'center' && container['width'] === undefined) container['width'] = '100%';
  // A strip that stores no padding at all gets the phone's; a stored one is drawn as typed.
  const stored = isBag(w['containerStyles']) ? w['containerStyles']['padding'] : undefined;
  const hasStoredPadding = typeof stored === 'string' ? stored.trim() !== '' : stored !== undefined && stored !== null;
  if (!hasStoredPadding) {
    container['paddingVertical'] = STRIP_PHONE_PADDING.vertical;
    container['paddingHorizontal'] = STRIP_PHONE_PADDING.horizontal;
  }

  let dots: StripDotsView | null = null;
  if (isBag(w['dotStyles'])) {
    const native = toNativeStyle('dotStyles', w['dotStyles'], ctx, 'strip');
    if (native['visible'] === true) {
      const size = typeof native['size'] === 'number' && native['size'] > 0 ? native['size'] : 10;
      dots = {
        ...dotGeometry(native['style'], size),
        color: typeof native['color'] === 'string' ? native['color'] : '#cccccc',
        activeColor: typeof native['activeColor'] === 'string' ? native['activeColor'] : '#333333',
        gap: typeof native['gap'] === 'number' ? native['gap'] : 8,
        offset: typeof native['offset'] === 'number' ? native['offset'] : 12,
      };
    }
  }

  return { container, title, subtitle, dots };
}
