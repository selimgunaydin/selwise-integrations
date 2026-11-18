import type { Surface } from '../core/surfaces.js';
import type { GoalBarView } from '../vendor/dynamic-content.js';
import { countdownTargetOf, remainingParts, type CountdownResolver } from './countdown.js';
import { resolveCustomCode } from './custom-widget-document.js';
import { socialProofMinCount, socialProofShown } from '../vendor/social-proof.js';
import { isModal } from './triggers.js';

type ShownSurface = Pick<Surface, 'type'> & Partial<Pick<Surface, 'id' | 'content' | 'customCss' | 'customJs'>>;

/**
 * The widget types this package draws itself (`renderSurface` in
 * `SelwiseSurfaces`). Keep the two in step: a type missing here is never
 * shown, and a type missing from the renderer is never drawn.
 */
export const RENDERED_SURFACE_TYPES: ReadonlySet<string> = new Set([
  'announcement_bar',
  'sticky_footer',
  'floating_button',
  'countdown_timer',
  'goal_bar',
  'cart_count',
  'product_view_count',
  'newsletter',
  'custom',
  'slide_in',
  'exit_intent_popup',
  'popup',
  'modal',
]);

export interface ShouldRenderOptions {
  /** The client's resolved view of a goal bar for the current cart. */
  goalBarView?: GoalBarView | null;
  /** The contract's `countdownTarget`, so a daily-cutoff countdown is judged by the target it is drawn with. */
  countdownTarget?: CountdownResolver | null;
  now?: number;
  /** The host's own renderers: an app that supplies one for a type does draw it. */
  canDraw?: (type: string) => boolean;
}

/** Why a surface that reached the overlay is not drawn: one of the dashboard's reason codes, and what it was judged on. */
export interface RenderMiss {
  reason: 'type' | 'content' | 'below_min_count' | 'count_unavailable' | 'product_unresolved';
  detail?: Record<string, string | number | boolean | null>;
}

/**
 * What a social-proof counter has to be judged on: the number the SDK read for it
 * (`getProductCount`), `null` when it could not be read, `undefined` while it is
 * still being asked — and whether there is a product to ask about at all.
 */
export interface CounterReading {
  count?: number | null;
  /** False when neither the merchant's `productId` nor the screen names a product. Defaults to true. */
  productKnown?: boolean;
}

/**
 * Whether a surface will actually draw something — and when it will not, why.
 *
 * ## Why this is not the renderer's business alone
 *
 * Four types can decide, at render time, that they have nothing to show: a
 * count badge below the merchant's `minCount`, a countdown whose deadline has
 * passed, and a custom widget with no markup to put in its WebView. The
 * renderer returning null is correct — but the overlay had already reported the
 * impression by then, so the merchant's report counted a `product_view_count`
 * badge that nobody could see. An impression has to mean "this was on screen".
 *
 * So the decision lives here, where both the impression, the render and
 * `Selwise.explain()` can ask the same question, and where it can be tested
 * without React Native. `shouldRender` is `renderVerdict(...) === null`: the
 * reason a surface is not drawn is the condition that decided it.
 */
export function renderVerdict(
  surface: ShownSurface | null | undefined,
  /**
   * What the surface counts, for a social-proof counter. Anything but a number
   * that reaches the merchant's threshold is a counter that is not drawn.
   */
  counted?: CounterReading | null,
  options?: ShouldRenderOptions
): RenderMiss | null {
  if (!surface) return { reason: 'content', detail: { cause: 'none' } };
  const content = surface.content || {};
  const counter = counted || {};
  const opts = options || {};

  // A type this package has no renderer for (`inline_banner`, `embedded_card`,
  // or one added after this version) draws nothing, so it is not on screen and
  // must not be reported or charged against its frequency cap. `canDraw` is the
  // host's own renderers: an app that supplies one for the type does draw it.
  if (!RENDERED_SURFACE_TYPES.has(surface.type)) {
    const drawn = typeof opts.canDraw === 'function' ? Boolean(opts.canDraw(surface.type)) : false;
    return drawn ? null : { reason: 'type', detail: { type: surface.type } };
  }

  if (surface.type === 'goal_bar') {
    // Armed is not shown: a bar for an unmeasured cart, an empty one the
    // merchant did not ask to show, or a sentence that cannot be said is on
    // the overlay's list and on nobody's screen — so no impression.
    return opts.goalBarView && opts.goalBarView.visible ? null : { reason: 'content', detail: { cause: 'goal_bar_hidden' } };
  }

  if (surface.type === 'cart_count' || surface.type === 'product_view_count') {
    // The widget's own rule (`@selwise/widget-contract/social-proof`): "0 kişi"
    // argues against the product, so the count decides whether the surface exists —
    // a count not yet read, or that could not be, is not a count.
    if (counter.productKnown === false) return { reason: 'product_unresolved' };
    const count = typeof counter.count === 'number' ? counter.count : null;
    const min = socialProofMinCount(content);
    if (socialProofShown(count, min)) return null;
    return count === null
      ? { reason: 'count_unavailable', detail: { pending: counter.count === undefined } }
      : { reason: 'below_min_count', detail: { count, min } };
  }

  if (surface.type === 'custom') {
    // The WebView needs markup. CSS and JS alone style and script nothing, so
    // the document builder returns null and the overlay must agree.
    return resolveCustomCode(content, surface).html ? null : { reason: 'content', detail: { cause: 'no_markup' } };
  }

  if (surface.type === 'countdown_timer') {
    // An expired countdown is not a surface; rendering a dash would tell the
    // visitor the offer is live when it is over.
    const now = typeof opts.now === 'number' ? opts.now : Date.now();
    return remainingParts(countdownTargetOf(content, now, opts.countdownTarget), now) !== null
      ? null
      : { reason: 'content', detail: { cause: 'countdown_over' } };
  }

  return null;
}

/** Whether a surface will actually draw something (`renderVerdict` says why not). */
export function shouldRender(
  surface: ShownSurface | null | undefined,
  counted?: CounterReading | null,
  options?: ShouldRenderOptions
): boolean {
  return renderVerdict(surface, counted, options) === null;
}

/**
 * The list after a reload caused by a CART change rather than a navigation.
 *
 * The SDK chooses a campaign's content state and fills `{cart.total}` at
 * `getSurfaces()` time, so the overlay asks again when the basket moves — that
 * is what lets "Sepetin {cart.total}" appear on the basket screen once the app
 * has fetched the basket. Two things must not follow from it:
 *
 * - A modal already in front of the shopper keeps the words it was shown with.
 *   A popup rewritten under the reader's eyes, or a half-typed newsletter form
 *   redrawn, is worse than a stale sentence — the browser widget draws the
 *   same line (only its live types re-choose on screen).
 * - A surface already shown does not vanish mid-screen. The reload runs the
 *   frequency cap again, and the allowance was spent when it appeared; a state
 *   that now hides it takes effect on the next screen, as a cap would.
 *
 * Everything else takes the new answer, and a surface the cart has just made
 * eligible appears.
 */
export function keepShownSurfaces<S extends Pick<Surface, 'id' | 'type'>>(
  previous: readonly S[] | null | undefined,
  next: readonly S[] | null | undefined,
  shownIds: Set<string> | readonly string[] | null | undefined
): S[] {
  const shown = shownIds instanceof Set ? shownIds : new Set(shownIds || []);
  const before = Array.isArray(previous) ? (previous as readonly S[]) : [];
  const after = Array.isArray(next) ? (next as readonly S[]) : [];
  const afterIds = new Set(after.map((surface) => surface.id));

  const merged = after.map((surface) => {
    if (!isModal(surface.type) || !shown.has(surface.id)) return surface;
    return before.find((entry) => entry.id === surface.id) || surface;
  });
  for (const surface of before) {
    if (shown.has(surface.id) && !afterIds.has(surface.id)) merged.push(surface);
  }
  return merged;
}
