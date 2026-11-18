import type { ComponentType, ReactElement } from 'react';
import type { SelwiseProduct } from '../types.js';

/**
 * What the SDK's components cannot know about the app they are drawn in — and
 * the app hands them.
 *
 * Every member is optional. Without one the component does the plain thing: it
 * opens an `https` link with React Native's `Linking`, draws images with
 * `Image`, takes safe-area insets from the platform, and a surface that needs a
 * capability the app did not hand over (a WebView for the merchant's own HTML,
 * an add-to-cart) says once, in the log, which one is missing and draws nothing.
 *
 * ```tsx
 * <SelwiseProvider
 *   client={selwise}
 *   host={{
 *     navigate: (target) => router.open(target.url),
 *     addToCart: async ({ code, quantity }) => ({ success: await basket.add(code, quantity) }),
 *     WebView,
 *     safeAreaInsets: useSafeAreaInsets,
 *   }}
 * >
 * ```
 */
export interface SelwiseHost {
  /**
   * Opens a link a surface, a strip or a search result points at. Return `false`
   * (or resolve it) when the app did not handle it, and the SDK falls back to
   * `Linking.openURL` for an `https` or custom-scheme link and does nothing for
   * the rest.
   */
  navigate?(target: SelwiseNavigationTarget): boolean | void | Promise<boolean | void>;
  /**
   * Adds a product to the app's own basket — the one its own buttons fill.
   * Called by the merchant's `custom` widgets today and by product cards that
   * carry an add-to-cart. Resolve `{ success: false }` when the basket refused.
   */
  addToCart?(item: SelwiseCartItem): SelwiseCartResult | Promise<SelwiseCartResult>;
  /**
   * Adds a product to the app's favourites, or takes it out — the list the app's
   * own heart buttons fill. Called by a product card's favourite button (a
   * `button` node the merchant designed with the "wishlist" action); `wished` is
   * the state the shopper asked for, so `true` is an add. Resolve
   * `{ success: false }` when the app refused — a guest it sent to its login
   * screen, say — and the button keeps the state it had.
   *
   * A card draws the favourite button only when the app hands this over: an app
   * with no favourites list has nothing for it to do.
   */
  toggleWishlist?(request: SelwiseWishlistRequest): SelwiseWishlistResult | Promise<SelwiseWishlistResult>;
  /**
   * Whether the app has this product among the shopper's favourites right now:
   * what a card's button shows when it appears. `code` is the product's
   * `itemCode`; `product` is the product itself, for an app whose favourites are
   * keyed by another code (`product.cartCode`). Without this a button starts
   * empty and shows what the shopper pressed since.
   */
  isWishlisted?(code: string, product?: SelwiseProduct): boolean;
  /**
   * Tells the SDK the favourites changed (a heart pressed on the product screen,
   * a login that loaded the shopper's list), so the cards on the screen redraw.
   * Subscribe to the app's own store and return how to stop; the listener takes
   * no argument — the SDK asks `isWishlisted` again.
   */
  subscribeWishlist?(listener: () => void): () => void;
  /**
   * `react-native-webview`'s `WebView`. A `custom` campaign and a product
   * enrichment block are the merchant's own HTML and run in one; the SDK does
   * not depend on the library, so the app that has it passes it in.
   */
  // `any` on purpose: the component's props belong to react-native-webview, which
  // this package does not depend on, and the one passed in has the library's own.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  WebView?: ComponentType<any>;
  /**
   * The safe-area insets surfaces dock inside. An object is used as it is; a
   * function is called as a hook on every render, so `useSafeAreaInsets` from
   * `react-native-safe-area-context` can be passed as it is.
   */
  safeAreaInsets?: SelwiseSafeAreaInsets | (() => SelwiseSafeAreaInsets);
  /**
   * Draws a product image — to put the app's own image component (a cache, a
   * placeholder) behind every card and result row.
   */
  renderImage?(props: SelwiseImageProps): ReactElement | null;
  /**
   * Draws one of the dashboard's named icons — a counter's `eye`, `users`,
   * `trending-up`, `flame`, `shopping-cart`, `shopping-bag` — with the app's own
   * icon set. Without it the component draws a small built-in glyph; return
   * `null` for a name the app has no icon for and the glyph is drawn instead.
   */
  renderIcon?(props: SelwiseIconProps): ReactElement | null;
  /**
   * The app's font for the brand's font. The dashboard's brand theme names a web
   * font (`"Inter", sans-serif`); a native app has its own set. A map from the
   * brand font's name (case does not matter) to the app's `fontFamily`, or a
   * function from the name to one.
   */
  fontFamily?: Record<string, string> | ((brandFont: string) => string | undefined);
  /**
   * The merchant's own origin (`https://shop.example.com`). A product enrichment
   * block's relative image sources (`/media/size-chart.png`) resolve against it.
   */
  storefrontUrl?: string;
  /**
   * The base typography of a product enrichment block, so one with no styling of
   * its own looks like it belongs to the app. Each defaults to the brand theme's
   * value, and every merchant rule can still override any of it.
   */
  enrichment?: {
    background?: string;
    textColor?: string;
    fontFamily?: string;
    fontSize?: string;
    padding?: string;
  };
  /**
   * Whether the screen this component sits on is the one the shopper is looking
   * at. A recommendation strip counts an impression only while it is, so a strip
   * on a screen another one covers is not "seen".
   */
  isFocused?(): boolean;
  /**
   * The same as `isFocused`, for an app that reads focus with a hook (React
   * Navigation's `useNavigation`). Called on every render of a component that
   * needs it, so it follows the rules of hooks; returns the function to ask.
   */
  useIsFocused?(): () => boolean;
}

export interface SelwiseSafeAreaInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * Where a link points, as far as the SDK can tell without the app's router.
 *
 * - `https`: `http(s)://…` — a page; on the merchant's own domain an app usually
 *   has a screen for it.
 * - `deeplink`: any other scheme (`myshop://basket`, `mailto:`, `tel:`).
 * - `screen`: an address in the app's own screen catalogue (`app://basket`).
 * - `path`: a storefront path authored for the web (`/list/`).
 */
export type SelwiseNavigationKind = 'https' | 'deeplink' | 'screen' | 'path';

export interface SelwiseNavigationTarget {
  kind: SelwiseNavigationKind;
  /** The link, trimmed and otherwise as the merchant wrote it. */
  url: string;
  /** What asked to go there. */
  source: SelwiseNavigationSource;
  /** The campaign or recommendation widget, when one asked. */
  entityId?: string;
}

export type SelwiseNavigationSource =
  | 'campaign'
  | 'custom_widget'
  | 'newsletter'
  | 'recommendation'
  | 'search'
  | 'enrichment';

/** What `addToCart` is asked to add. */
export interface SelwiseCartItem {
  /** The code the app's basket accepts (`cart_code` in the catalogue). */
  code: string;
  /** At least 1. */
  quantity: number;
  /** What asked for the add, so the app can attribute it. */
  source: 'custom_widget' | 'recommendation' | 'search';
  /** The campaign, or the recommendation widget, behind it. */
  surfaceId?: string;
  /** The product, when a card asked and the SDK has it. */
  product?: SelwiseProduct;
}

export interface SelwiseCartResult {
  success: boolean;
  /**
   * Why the basket refused, in the platform's own words ("This product cannot be
   * bought more than 0 times"). Set it with `success: false` and the SDK shows it
   * to the shopper where the add was pressed — a search row, a strip's message —
   * instead of a bare "error". Leave it out and the generic error label stays.
   * It is shown as written: it should already be in the shopper's language.
   */
  message?: string;
}

/** What `toggleWishlist` is asked to do. */
export interface SelwiseWishlistRequest {
  /** The product the card shows. */
  product: SelwiseProduct;
  /** The state asked for: `true` puts the product among the favourites, `false` takes it out. */
  wished: boolean;
  /** What asked, so the app can attribute it: a strip's card, or a card in the search results. */
  source: 'recommendation' | 'search';
  /** The recommendation widget behind it; absent for the search. */
  surfaceId?: string;
}

export interface SelwiseWishlistResult {
  success: boolean;
  /**
   * The state the app ended up in, when it is not the one asked for (an add the
   * app answered with "already a favourite" is `true` either way). Omitted, the
   * requested state is taken to hold when `success` is true.
   */
  wished?: boolean;
}

export interface SelwiseIconProps {
  /** The dashboard's icon name (`eye`, `flame`, `shopping-cart`, …). */
  name: string;
  /** Logical pixels, the size the surface draws its text at. */
  size: number;
  /** The colour the dashboard chose for the icon, resolved. */
  color?: string;
}

export interface SelwiseImageProps {
  uri: string;
  /** `stretch` is a campaign picture's `fill` (the dashboard's "Fill"); products use `contain` / `cover`. */
  resizeMode: 'contain' | 'cover' | 'stretch';
  accessibilityLabel?: string;
  // `any` on purpose: a native style, left structural so this entry does not
  // import react-native; pass it to the app's image component as it is.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  style: any;
}
