import type { ConsentSnapshot } from '../types.js';
import type { DynamicCart } from '../vendor/dynamic-content.js';
import type { ProductInput } from './product.js';

/**
 * The screen the app is showing, as the host told the SDK.
 *
 * `pageUrl` is the synthetic address page targeting matches (`app://product`),
 * `screenName` the host's own name for the route, `pageType` the dashboard's
 * page kind (`product`, `cart`, …) for a rule limited to one. All `null` until
 * the host reports a screen.
 */
export interface ScreenState {
  pageUrl: string | null;
  screenName: string | null;
  pageType: string | null;
}

/** What a host may say about a screen beside its address. */
export interface ScreenInfo {
  screenName?: string | null;
  pageType?: string | null;
}

export const NO_SCREEN: ScreenState = Object.freeze({ pageUrl: null, screenName: null, pageType: null });

/**
 * The product on the current product screen: its facts, `{ pending: true }`
 * while the screen still loads it, or `null` when there is none. See
 * `Selwise.setProduct`.
 */
export type ProductState = ProductInput | null;

/**
 * What `Selwise.on(event, listener)` reports.
 *
 * - `ready`: `init()` finished (`true`) or `destroy()` ran (`false`).
 * - `screen`: the host named another screen.
 * - `product`: the product on screen changed — loaded, swapped, or gone.
 * - `cart`: the basket changed (the same call as `onCartChange`).
 * - `theme`: the brand theme's tokens arrived or changed with `/config`.
 * - `consent`: the visitor's consent answer was set.
 * - `locale`: the app's language changed.
 * - `config`: the channel's configuration was read again (the app returned to the
 *   foreground or changed screen with a copy older than five minutes) and had
 *   changed — a campaign, strip or enrichment rule was published or edited.
 *   Surfaces and strips ask again. The value counts the changes.
 * - `experiments`: the visitor's A/B arms were dropped and will be asked for
 *   again (a QA link, a consent answer) — a point that resolved its screen
 *   experiment asks again.
 *
 * A listener is NOT called with the current value when it subscribes: read it
 * with `getScreen()`, `getProduct()`, `getCart()`, `getTheme()`, `getConsent()`,
 * `getLocale()` or `isInitialized`, then subscribe.
 */
// A type alias, not an interface: only an alias is assignable to the emitter's
// string-keyed constraint.
export type SelwiseEvents = {
  ready: boolean;
  screen: ScreenState;
  product: ProductState;
  cart: DynamicCart;
  theme: Record<string, string>;
  consent: ConsentSnapshot;
  locale: string | undefined;
  experiments: number;
  config: number;
};
