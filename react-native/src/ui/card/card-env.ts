import type { AppStyleContext } from '../../vendor/app-style.js';
import type { SelwiseProduct, SelwiseProductVariant } from '../../types.js';
import type { CardTreeView, TextInherit } from './card-tree.js';
import type { VariantSelection } from './card-cart.js';

/**
 * What a product card is told about the strip around it, and what it can ask the
 * strip to do. The strip owns the host, the tracking and the option sheet; a
 * card only draws and reports a press.
 */

/** The strip's cart settings, as a button reads them. */
export interface CardCartSettings {
  ctaMode: unknown;
  addToCartEnabled: unknown;
  /** The host can add to its basket (`host.addToCart`). */
  canAdd: boolean;
  /** The strip's own words for the review button. */
  reviewButtonText: string | undefined;
  /** What the button says while it works, from the strip's cart settings (the card's own words come first). */
  texts: { default?: string; loading?: string; success?: string; error?: string };
  /** The card's own state words (`buttonStyle.stateTexts`). */
  cardTexts: { loading?: string; success?: string; error?: string };
}

export interface CardActions {
  /** A product was opened (tap on its image, title or "view" button): reports the click, then opens `url`. */
  open(product: SelwiseProduct, index: number, url?: string | null): void;
  /**
   * Adds `code` to the host's basket and reports it. Resolves whether the
   * basket took it. Says what happened when the strip's After add setting asks.
   */
  add(product: SelwiseProduct, index: number, code: string): Promise<boolean>;
  /** Asks the shopper which option; resolves its code, or null when they dismiss the sheet. */
  choose(product: SelwiseProduct, variants: SelwiseProductVariant[], confirmLabel: string): Promise<string | null>;
  /** Says a sentence in the strip's message (After add: a message). */
  say(text: string, kind: 'success' | 'error'): void;
  /** The favourites; undefined when the app has none, and then a card draws no heart. */
  wishlist?: WishlistActions;
}

/**
 * The favourites a card's heart reads and writes — present only when the app
 * handed the SDK a `toggleWishlist`; without it a card draws no heart.
 */
export interface WishlistActions {
  /** Whether the app has the product among the favourites now; undefined when the app cannot say. */
  isWished(product: SelwiseProduct): boolean | undefined;
  /** Calls `listener` when the app's favourites changed; returns how to stop. */
  subscribe(listener: () => void): () => void;
  /**
   * Asks the app to put the product among the favourites (`wished`) or take it
   * out, and reports an add. Resolves the state that holds afterwards.
   */
  toggle(product: SelwiseProduct, index: number, wished: boolean): Promise<boolean>;
}

export interface CardEnv {
  tree: CardTreeView;
  /** The card definition as the payload carried it (`variantSelection`, `buttonStyle`). */
  selection: VariantSelection;
  cart: CardCartSettings;
  actions: CardActions;
  /** Brand tokens, the host's fonts and the screen's size, for the style table. */
  ctx: AppStyleContext;
  /** What the card's text inherits at the root. */
  rootText: TextInherit;
  /** The strip's currency, which a card's price prefers over the product's own. */
  currency: string | null | undefined;
  locale: string | undefined;
  language: string;
}
