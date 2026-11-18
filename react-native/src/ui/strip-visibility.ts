/**
 * Whether a strip is really on the shopper's screen.
 *
 * Plain Node, like `strip-impressions.ts`, so it is tested without React
 * Native; `RecommendationStrip` samples it with `measureInWindow`.
 *
 * ## Why the FlatList's own answer is not enough
 *
 * A strip is a horizontal FlatList inside the screen's vertical ScrollView.
 * `onViewableItemsChanged` measures against the FlatList's own scroll
 * container, so it knows which cards are visible HORIZONTALLY and nothing about
 * the vertical scroll: a strip at the bottom of a long product page reports
 * its first cards as viewable the moment the page mounts, long before anyone
 * scrolls there. Counting that writes impressions for a strip nobody saw, and
 * the merchant's click-through rate falls for no reason that could be found.
 *
 * So an impression needs both answers: the cards visible along the strip, and
 * the strip itself on the screen — more than half of it, for a full second.
 */

export const VISIBLE_RATIO = 0.5;
export const DWELL_MS = 1000;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
}

/** The share of a rectangle inside the viewport, 0..1. */
export function visibleRatio(rect: Rect | null | undefined, viewport: Viewport | null | undefined): number {
  if (!rect || !viewport) return 0;
  const { x, y, width, height } = rect;
  if (!(width > 0) || !(height > 0)) return 0;

  const visibleWidth = Math.min(x + width, viewport.width) - Math.max(x, 0);
  const visibleHeight = Math.min(y + height, viewport.height) - Math.max(y, 0);
  if (visibleWidth <= 0 || visibleHeight <= 0) return 0;
  return (visibleWidth * visibleHeight) / (width * height);
}

export interface VisibilityGate {
  sample(rect: Rect | null | undefined, viewport: Viewport | null | undefined, now: number): boolean;
  readonly open: boolean;
}

/**
 * A gate that opens once the strip has been visible for `dwellMs` without a
 * break and closes the moment it is not. Feed it one sample per tick.
 *
 * `sample(rect, viewport, now)` returns whether the gate is open after the
 * sample; a `null` rect (not measurable, not focused, app in the background)
 * closes it.
 */
export function createVisibilityGate(options?: { ratio?: number; dwellMs?: number }): VisibilityGate {
  const opts = options || {};
  const ratio = typeof opts.ratio === 'number' ? opts.ratio : VISIBLE_RATIO;
  const dwellMs = typeof opts.dwellMs === 'number' ? opts.dwellMs : DWELL_MS;
  // `null`, not 0: a clock that starts at zero (a test, a monotonic timer) is
  // a start time, not "not started".
  let since: number | null = null;
  let open = false;

  return {
    sample(rect, viewport, now) {
      if (!rect || visibleRatio(rect, viewport) < ratio) {
        since = null;
        open = false;
        return false;
      }
      if (since === null) since = now;
      if (now - since >= dwellMs) open = true;
      return open;
    },
    get open() {
      return open;
    },
  };
}
