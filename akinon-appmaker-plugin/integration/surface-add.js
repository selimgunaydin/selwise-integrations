'use strict';

/**
 * One add, one event — and the event carries who asked.
 *
 * A Selwise surface (a custom widget) adds through the app's own basket action.
 * The app then publishes `cartChanges`, and the analytics mapper turns the
 * basket's quantity going UP into an `add_to_cart` event. Without a hand-off the
 * same tap was counted twice: once by the surface, with its attribution, and
 * once by the mapper, without it.
 *
 * The surface marks the add BEFORE it dispatches (the basket changes inside the
 * dispatch, so the mark has to exist by then) and says who is asking. The
 * mapper, which knows the line by its sku, writes the ONE event and copies the
 * attribution onto it. After the dispatch the surface asks whether the mark is
 * still there: if it is, the mapper never saw the add (the app published no
 * `cartChanges`) and the surface writes the event itself. Either way exactly one
 * event is written, and it is never a guess which of the two it was.
 *
 * The mark expires by itself. One nobody consumed must not hand the visitor's
 * next real add somebody else's attribution.
 */

const WINDOW_MS = 4000;

/**
 * How long the surface leaves its mark for the mapper after a successful add
 * before writing the event itself. An app may publish `cartChanges` after its
 * basket action has settled, so "still marked right after the dispatch" does
 * not yet mean "nobody will claim it". Well inside `WINDOW_MS`.
 */
const CLAIM_GRACE_MS = 1500;

let mark = null;

/**
 * Mark the next add as a surface's own. `attribution` is `{ source, surfaceId }`.
 * Returns the mark, so the surface can later settle THIS one
 * (`consumeOwnSurfaceAdd`) and never a newer add's.
 */
function markSurfaceAdd(attribution, now) {
  mark = { attribution: attribution, until: (typeof now === 'number' ? now : Date.now()) + WINDOW_MS };
  return mark;
}

/**
 * Take the mark: its attribution once, and only inside its window; `null` when
 * there is none, it was already taken, or it expired.
 */
function consumeSurfaceAdd(now) {
  const taken = mark;
  mark = null;
  const at = typeof now === 'number' ? now : Date.now();
  return taken && at <= taken.until ? taken.attribution : null;
}

/**
 * Take the mark only if it is still `own` — the one this add set. A second
 * surface add during the first one's grace period replaced it, and that one is
 * its own surface's to settle.
 */
function consumeOwnSurfaceAdd(own, now) {
  if (!own || mark !== own) return null;
  return consumeSurfaceAdd(now);
}

module.exports = { markSurfaceAdd, consumeSurfaceAdd, consumeOwnSurfaceAdd, WINDOW_MS, CLAIM_GRACE_MS };
