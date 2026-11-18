import { APP_SCREEN_SLOTS, appDefaultSlot, appScreenOfUrl, appSlotOfSelector } from '../vendor/app-surfaces.js';

/**
 * Where on a screen a recommendation strip is drawn.
 *
 * Plain Node, like `strip-impressions.ts`, so it is tested without React
 * Native.
 *
 * ## Why slots
 *
 * On the web a strip's place is a CSS selector. A native screen has nothing to
 * match one against, so every screen an app wants strips on mounts named
 * points — `<SelwiseSlot screen="app://product" slot="pdp-under-info" />` — and
 * the merchant picks the point in the dashboard (the strip's container
 * selector, `[data-selwise-slot="pdp-under-info"]`, which the dashboard writes
 * for an app channel). A new strip is then a dashboard action, never a release.
 *
 * Which SCREEN a strip is on stays the page-targeting rule (`app://product`),
 * exactly as for a campaign.
 *
 * ## The catalogue
 *
 * The screens and their points are the table the dashboard offers
 * (`APP_SCREENS`, generated into this package), keyed by the screen's address.
 * The order is top to bottom and the LAST name is the screen's default: a strip
 * with no slot, or a custom slot name no screen of the catalogue has, is drawn
 * there rather than vanishing. A strip placed in another screen's point is not
 * drawn here at all.
 *
 * A name an app does not mount is simply never asked for: an app mounts the
 * points it wants, and a screen's default must be one of them for a screen it
 * serves.
 */

/** Screen address → its points, top to bottom. Only screens that have any. */
export const SCREEN_SLOTS: Readonly<Record<string, readonly string[]>> = Object.freeze(
  Object.fromEntries(APP_SCREEN_SLOTS.map((screen) => [screen.url, screen.slots]))
);

/** What a slot decision reads of a widget: its container selector. */
export type SlotWidget = { containerSelector?: unknown; [key: string]: unknown } | null | undefined;

/** The slot name a widget's container selector carries; null when it names none. */
export function slotNameOf(widget: SlotWidget): string | null {
  return appSlotOfSelector(widget ? String(widget.containerSelector ?? '') : '');
}

/** The points of a screen, by its address (`app://product`); none for a screen without any. */
export function slotsOf(screen: string | null | undefined): readonly string[] {
  return appScreenOfUrl(screen)?.slots ?? [];
}

/** The screen's last slot: where a strip with no (or an unknown) slot goes. */
export function defaultSlotOf(screen: string | null | undefined): string | null {
  const found = appScreenOfUrl(screen);
  return found && found.slots.length > 0 ? appDefaultSlot(found) : null;
}

/**
 * The point a strip is drawn in on `screen`, or null when it is not drawn there.
 *
 * - A name this screen mounts: that point.
 * - A name that is a known point of ANOTHER screen of the catalogue
 *   (`basket-under-items` on the product screen): null. The strip was placed on
 *   that screen; drawing it here under this screen's default would show a basket
 *   strip on a product page.
 * - No name, or a custom name no screen of the catalogue has: this screen's
 *   default point, as a strip with no point always was.
 */
export function slotOfWidget(widget: SlotWidget, screen: string | null | undefined): string | null {
  const slots = slotsOf(screen);
  const named = slotNameOf(widget);
  if (named && slots.includes(named)) return named;
  if (named && APP_SCREEN_SLOTS.some((other) => other.slots.includes(named))) return null;
  return defaultSlotOf(screen);
}
