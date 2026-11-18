// GENERATED FILE — DO NOT EDIT.
//
// Vendored from packages/widget-contract/src/surface-geometry.ts by
// scripts/sync-vendored-page-targeting.js. Edit the source, then run:
//
//   node scripts/sync-vendored-page-targeting.js
//
// It is copied rather than imported because @selwise/widget-contract is private
// and this SDK is published: a dependency on it would not resolve for anyone
// who installs @selwise/react-native from npm.

/**
 * Where a surface sits and how big it draws — the numbers the widget and the app
 * must agree on.
 *
 * Three rules that would otherwise live twice (once in the widget's CSS, once in
 * the SDK's styles) and drift:
 *
 * 1. A floating button with an icon (an emoji, or no text) is a circle; a button
 *    that says words is a PILL that fits its text, so a label never wraps inside
 *    a fixed square.
 * 2. A floating element in a bottom corner must not sit on (or under) a docked
 *    bar — the sticky footer, a bottom announcement bar — and its button and
 *    close. It is lifted by the height the docked bars reserve (the widget reads
 *    `--ws-edge-bottom`, the app measures its bottom dock); only that height is
 *    a number, so the rule lives in each channel's own layout.
 * 3. A campaign surface placed in a point of an app screen drew flush against the
 *    screen edge. A point gives its surfaces the same default side inset the
 *    enrichment block always had (`SLOT_SURFACE_INSET_PX`).
 *
 * Pure and dependency-free: the SDK vendors this file
 * (`scripts/sync-vendored-page-targeting.js`).
 */

/**
 * The default horizontal inset, in px, of a surface drawn in a named point of an
 * app screen. A phone screen has no page margin, so without it text touches the
 * edge. The enrichment block's default padding is built from it
 * (`ENRICHMENT_DEFAULT_PADDING`), so the two cannot drift.
 */
export const SLOT_SURFACE_INSET_PX = 16;

/** The button sizes the dashboard offers, as a height in px (the catalogue's `size`). */
const BUTTON_HEIGHTS: Readonly<Record<string, number>> = { '48px': 48, '56px': 56, '64px': 64, '72px': 72 };
const DEFAULT_BUTTON_HEIGHT = 56;

export interface FloatingButtonShape {
  /** `circle`: a square of `height`, for an icon or no label. `pill`: a height and room at the sides, as wide as its text. */
  kind: 'circle' | 'pill';
  /** The button's height (and, for a circle, its width), in px. */
  height: number;
  /** Space each side of a pill's text, in px (0 for a circle). */
  paddingX: number;
  /**
   * The corner radius to draw: the merchant's, except that the catalogue's round
   * `50%` is a full pill (`999px`) on a pill — `50%` of a wide box is an ellipse.
   */
  borderRadius: string;
}

/**
 * A label that is an icon rather than words: nothing, or one glyph (an emoji, a
 * `?`). An icon sits in a circle; words need room.
 */
export function isIconLabel(text: unknown): boolean {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return true;
  const Segmenter = (Intl as unknown as { Segmenter?: new (locale?: string, options?: { granularity: 'grapheme' }) => { segment(input: string): Iterable<unknown> } }).Segmenter;
  if (typeof Segmenter === 'function') {
    let graphemes = 0;
    for (const _ of new Segmenter(undefined, { granularity: 'grapheme' }).segment(trimmed)) {
      graphemes += 1;
      if (graphemes > 1) return false;
    }
    return true;
  }
  // No Segmenter (an older engine): one code point, ignoring a variation selector.
  return Array.from(trimmed.replace(/\uFE0F/g, '')).length <= 1;
}

/** The pill's side room as a share of its height: 56px tall → 22px at each side. */
const PILL_PADDING_RATIO = 0.4;

/**
 * The shape a floating button draws with. `text` is what it says (the label, or an
 * emoji); `size` and `borderRadius` are the merchant's style values. A legacy size
 * word (`small`, `medium`, `large`) gives the height its padding used to imply.
 */
export function floatingButtonShape(input: {
  text?: unknown;
  size?: unknown;
  borderRadius?: unknown;
}): FloatingButtonShape {
  const size = String(input.size ?? '').trim();
  const height =
    BUTTON_HEIGHTS[size] ?? (size === 'small' ? 40 : size === 'large' ? 64 : DEFAULT_BUTTON_HEIGHT);
  const radius = String(input.borderRadius ?? '').trim() || '50%';
  if (isIconLabel(input.text)) return { kind: 'circle', height, paddingX: 0, borderRadius: radius };
  return {
    kind: 'pill',
    height,
    paddingX: Math.round(height * PILL_PADDING_RATIO),
    borderRadius: radius === '50%' ? '999px' : radius,
  };
}
