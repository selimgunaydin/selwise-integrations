import { toNativeStyle, type AppStyleContext, type NativeStyle } from '../../vendor/app-style.js';
import { resolveCardRenderMode } from '../../vendor/product-card-logic.js';

/**
 * The product card's element tree (`productCard.cardTree`, version 3) as the app
 * reads it: the tree itself, the translation of a node's style into React
 * Native styles, and the text a node inherits.
 *
 * ## What the card designer designs, and what the app draws
 *
 * The designer (Design → Product cards) saves a TREE of nodes — stacks,
 * a media area with overlays, text, price, badge, rating, swatches, button,
 * divider, spacer — each with a style in CSS vocabulary. The public API ships it
 * already normalized, so this file only reads it; it never validates. The
 * translation of a node's style is the table the dashboard gates its card
 * fields by (`@selwise/widget-contract/app-style`, the `card` surface): a style
 * key the dashboard offers on an app channel is one this file draws.
 *
 * ## What does not carry over
 *
 * A node of type `html` (merchant markup) is web only and is not drawn; a
 * card-level `hover`, a node's `hover` rules and its reveal-on-hover
 * animations need a pointer; the entrance animation and a `transform` are not
 * drawn. A card drawn from its own HTML (advanced code) or from the old flat
 * field list has no tree — `readCardTree` answers null and the strip draws its
 * default card, themed from the brand.
 *
 * Plain TypeScript with no `react-native` import.
 */

export interface CardNodeLike {
  id: string;
  type: string;
  hidden?: boolean;
  style?: Record<string, unknown>;
  responsive?: { tablet?: Record<string, unknown>; mobile?: Record<string, unknown> };
  visibleWhen?: Array<{ field: string; op: string; value?: string | number }>;
  props?: Record<string, unknown>;
  children?: CardNodeLike[];
}

export interface CardTreeView {
  root: CardNodeLike;
  variantChooser: Record<string, unknown> | null;
  variantModal: Record<string, unknown> | null;
}

const isBag = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/**
 * The card's tree, or null when this card is not drawn from one (its own
 * markup, or the flat field list) — decided by the same function the storefront
 * decides its renderer with, so a card the web draws as a tree is one the app
 * draws as a tree.
 */
export function readCardTree(card: Record<string, unknown> | null | undefined): CardTreeView | null {
  if (!isBag(card)) return null;
  if (resolveCardRenderMode(card as Parameters<typeof resolveCardRenderMode>[0]) !== 'tree') return null;
  const tree = card['cardTree'];
  if (!isBag(tree)) return null;
  const root = tree['root'];
  if (!isBag(root) || root['type'] !== 'root') return null;
  return {
    root: root as unknown as CardNodeLike,
    variantChooser: isBag(tree['variantChooser']) ? tree['variantChooser'] : null,
    variantModal: isBag(tree['variantModal']) ? tree['variantModal'] : null,
  };
}

/**
 * A node's style on a phone: its own, over it the tablet rules, over those the
 * phone rules — the order the storefront's media queries cascade in at a
 * phone's width (both `max-width` queries match, the later wins).
 */
export function phoneStyleOf(node: CardNodeLike): Record<string, unknown> {
  return { ...(node.style ?? {}), ...(node.responsive?.tablet ?? {}), ...(node.responsive?.mobile ?? {}) };
}

/* ----------------------------------------------------------------------------
   Styles
   -------------------------------------------------------------------------- */

/** What a card text inherits down the tree, as CSS does: colour, face, size, leading, spacing, case, alignment. */
export interface TextInherit {
  color: string;
  fontSize: number;
  fontWeight?: string;
  fontStyle?: string;
  fontFamily?: string;
  /** A multiplier of the font size, as the card's `lineHeight` is. */
  lineHeight: number;
  letterSpacing?: number;
  textTransform?: string;
  textAlign?: string;
}

/**
 * The root's own text: what the storefront's base stylesheet gives every card
 * (`var(--selwise-text, #111111)`, 14px, 1.4) with the brand's font.
 */
export function rootTextOf(ctx: AppStyleContext): TextInherit {
  const tokens = ctx.tokens ?? {};
  const color = String(tokens['--selwise-text'] ?? tokens['selwise-text'] ?? '').trim() || '#111111';
  return { color, fontSize: 14, lineHeight: 1.4 };
}

const NOT_TEXT_PROPS = ['numberOfLines'];

/** The text properties a node writes, translated, and the number of lines it clamps to. */
export function ownTextOf(node: CardNodeLike, ctx: AppStyleContext): { style: NativeStyle; lines?: number } {
  const native = toNativeStyle('text', phoneStyleOf(node), ctx, 'card');
  const lines = typeof native['numberOfLines'] === 'number' && native['numberOfLines'] > 0 ? native['numberOfLines'] : undefined;
  for (const key of NOT_TEXT_PROPS) delete native[key];
  return { style: native, ...(lines !== undefined ? { lines } : {}) };
}

/** What a node's children inherit: the parent's, over it the node's own. */
export function inheritFrom(parent: TextInherit, node: CardNodeLike, ctx: AppStyleContext): TextInherit {
  const own = ownTextOf(node, ctx).style;
  const rawLeading = Number(phoneStyleOf(node)['lineHeight']);
  const next: TextInherit = { ...parent };
  if (typeof own['color'] === 'string') next.color = own['color'];
  if (typeof own['fontSize'] === 'number') next.fontSize = own['fontSize'];
  if (typeof own['fontWeight'] === 'string') next.fontWeight = own['fontWeight'];
  if (typeof own['fontStyle'] === 'string') next.fontStyle = own['fontStyle'];
  if (typeof own['fontFamily'] === 'string') next.fontFamily = own['fontFamily'];
  if (Number.isFinite(rawLeading) && rawLeading > 0) next.lineHeight = rawLeading;
  if (typeof own['letterSpacing'] === 'number') next.letterSpacing = own['letterSpacing'];
  if (typeof own['textTransform'] === 'string') next.textTransform = own['textTransform'];
  if (typeof own['textAlign'] === 'string') next.textAlign = own['textAlign'];
  return next;
}

/** The style of a `Text`: what it inherits, over it its own. */
export function textStyleOf(node: CardNodeLike, inherited: TextInherit, ctx: AppStyleContext): { style: NativeStyle; lines?: number } {
  const own = ownTextOf(node, ctx);
  const merged = inheritFrom(inherited, node, ctx);
  const style: NativeStyle = {
    color: merged.color,
    fontSize: merged.fontSize,
    lineHeight: Math.round(merged.lineHeight * merged.fontSize * 100) / 100,
    ...(merged.fontWeight ? { fontWeight: merged.fontWeight } : {}),
    ...(merged.fontStyle ? { fontStyle: merged.fontStyle } : {}),
    ...(merged.fontFamily ? { fontFamily: merged.fontFamily } : {}),
    ...(merged.letterSpacing !== undefined ? { letterSpacing: merged.letterSpacing } : {}),
    ...(merged.textTransform ? { textTransform: merged.textTransform } : {}),
    ...(merged.textAlign ? { textAlign: merged.textAlign } : {}),
  };
  // `textDecorationLine` is the one text property that is not inherited.
  if (typeof own.style['textDecorationLine'] === 'string') style['textDecorationLine'] = own.style['textDecorationLine'];
  // A node's own absolute line height (written beside its own size) is already in `merged`.
  return { style, ...(own.lines !== undefined ? { lines: own.lines } : {}) };
}

export interface BoxView {
  /** `display: none`: the node draws nothing. */
  none: boolean;
  style: NativeStyle;
}

/**
 * A node's box: layout, background, border, radius, shadow, size, position.
 *
 * Two CSS defaults React Native does not share are written here: a flex item
 * SHRINKS (`flexShrink: 1`, RN's is 0 — without it a row of two long titles
 * overflows the card), and a border needs a border STYLE to draw at all
 * (`border-width` alone draws nothing in a browser, so it must not in the app).
 */
export function boxStyleOf(node: CardNodeLike, ctx: AppStyleContext, options: { overlay?: boolean; sizeForPercent?: number } = {}): BoxView {
  const native = toNativeStyle(
    'box',
    phoneStyleOf(node),
    options.sizeForPercent === undefined ? ctx : { ...ctx, sizeForPercent: options.sizeForPercent },
    'card'
  );

  const none = native['display'] === 'none';
  delete native['display'];

  const borderStyle = native['borderStyle'];
  if (borderStyle === undefined || borderStyle === 'none') {
    delete native['borderStyle'];
    delete native['borderWidth'];
    delete native['borderColor'];
  }
  // `auto` is no width for a maximum.
  if (native['maxWidth'] === 'auto') delete native['maxWidth'];
  // RN reads a percentage only on a dimension; a `%` radius needs the size (see `sizeForPercent`).
  if (typeof native['borderRadius'] === 'string') delete native['borderRadius'];

  // A price never shrinks below its text (2026-11-18): a CSS flex item shrinks, so
  // in a card ~170pt wide the row of selling price, struck price and discount chip
  // squeezed the last one until the NUMBER broke across two lines ("₺1.14" over
  // "9,00"). Every other node keeps the shrinking default (a long title must not
  // push the card wider); a price keeps its width and the row it sits in WRAPS
  // whole items instead (`wrapsPrices`).
  // `native` comes last, so a `flexWrap` the merchant set wins over the default.
  const style: NativeStyle = {
    flexShrink: node.type === 'price' ? 0 : 1,
    ...(wrapsPrices(node) ? { flexWrap: 'wrap' } : {}),
    ...native,
  };
  if (options.overlay) style['position'] = 'absolute';
  return { none, style };
}

/**
 * True when a container lays prices out in a ROW: the row of selling price, struck
 * price and discount chip. Such a row wraps WHOLE items to the next line (with its
 * own gap) when they do not fit, so a long old price moves down instead of squeezing
 * a number. A column has nothing to wrap, and a fixed-height column would start a
 * second column, so only a row does. The web card makes the same decision
 * (`sc-has-price`, `product-card-tree-render.ts`).
 */
export function wrapsPrices(node: CardNodeLike): boolean {
  if (node.type !== 'stack' && node.type !== 'root') return false;
  if (!(node.children ?? []).some((child) => child.type === 'price')) return false;
  return String(phoneStyleOf(node)['flexDirection'] ?? '').startsWith('row');
}

/** True when the node sizes itself (`height`, `aspectRatio`, or it grows to fill). */
export function isSized(style: NativeStyle): boolean {
  return style['height'] !== undefined || style['aspectRatio'] !== undefined || typeof style['flexGrow'] === 'number';
}

/** An image's resize mode: the node's `objectFit`, `cover` by default (the storefront's own). */
export function resizeModeOf(node: CardNodeLike, ctx: AppStyleContext): 'cover' | 'contain' | 'stretch' | 'center' {
  const native = toNativeStyle('image', phoneStyleOf(node), ctx, 'card');
  const mode = native['resizeMode'];
  return mode === 'contain' || mode === 'stretch' || mode === 'center' ? mode : 'cover';
}
