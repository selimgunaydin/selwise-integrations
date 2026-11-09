/**
 * An empty, server-rendered anchor for a Selwise surface (recommendation strip,
 * enrichment block, inline campaign). React renders it once and never again,
 * so nothing the widget inserts is wiped by a re-render.
 *
 * The dashboard addresses it as `[data-selwise-slot="<name>"]`. The full list
 * is in docs (SLOTS below) so provisioning and the store cannot drift.
 */
export const SLOTS = {
  homeHero: 'home-after-hero',
  homeRecs1: 'home-recs-1',
  homeRecs2: 'home-recs-2',
  homeRecs3: 'home-recs-3',
  homeBanner: 'home-inline-banner',
  listingTop: 'listing-top',
  listingBottom: 'listing-bottom',
  pdpPrice: 'pdp-under-price',
  pdpEnrichment: 'pdp-under-description',
  // Its own anchor for the complete-the-look strip: two strips on one
  // selector compete for it and the widget draws only one.
  pdpLook: 'pdp-look',
  pdpRecs1: 'pdp-recs-1',
  pdpRecs2: 'pdp-recs-2',
  cartRecs: 'cart-recs',
  cartTop: 'cart-top',
  searchEmpty: 'search-empty',
  searchTop: 'search-top',
  successRecs: 'success-recs',
  notFoundRecs: 'not-found-recs',
  accountRecs: 'account-recs',
  favoritesRecs: 'favorites-recs',
} as const;

export type SlotName = (typeof SLOTS)[keyof typeof SLOTS];

/**
 * Why `dangerouslySetInnerHTML` and not an empty element: the widget loads
 * `async` and can fill a slot BEFORE React has hydrated the page. An empty
 * `<div />` tells React the element has no children, so hydration meets the
 * widget's node, reports "Did not expect server HTML to contain a <div>", and
 * throws the whole document away to render it again on the client — taking
 * every Selwise surface on the page with it. Measured on this store with the
 * plain element: every page that had a filled slot (home, listings, product,
 * cart) re-rendered from scratch. With `__html` React neither claims nor
 * compares the children, and since the string never changes it never writes
 * them either.
 */
const EMPTY = { __html: '' };

export function Slot({ name, className }: { name: SlotName; className?: string }) {
  return <div data-selwise-slot={name} className={className} dangerouslySetInnerHTML={EMPTY} suppressHydrationWarning />;
}
