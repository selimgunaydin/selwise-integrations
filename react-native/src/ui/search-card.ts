import { createElement as h, Fragment, useCallback, useMemo, useRef, type ReactElement } from 'react';
import { useSelwiseHost } from '../react/context.js';
import type { UseSelwiseSearchResult } from '../react/use-selwise-search.js';
import type { SelwiseProduct } from '../types.js';
import { shopperString } from '../vendor/shopper-strings.js';
import { useNavigate } from './host-hooks.js';
import { getThemeTokens } from './styles.js';
import { appLanguage } from './strings.js';
import {
  CardToastView,
  SurfaceCard,
  cardStateTexts,
  cardWishlist,
  nonEmpty,
  useCardChooser,
  useCardEnvironment,
  useCardStyleContext,
  useCardToast,
} from './card/card-surface.js';
import { VariantSheet } from './card/VariantSheet.js';
import type { CardActions, CardEnv } from './card/card-env.js';

/**
 * The search results grid's product card: the merchant's card from Search →
 * Results, drawn by the SAME component and environment the recommendation strips
 * use (`card/card-surface.ts`), told that it is the search it belongs to.
 *
 * What a press means here is the search's, exactly as the rows have it:
 *
 *  - a tap reports the click (`trackClick(itemCode, index)`) and opens the
 *    product through `onProductPress`, else `host.navigate`;
 *  - an add goes to `host.addToCart` as `source: 'search'` (so the host and the
 *    report attribute it to the search, never to a strip) and, once the host took
 *    it, is reported with `trackAddToCart`;
 *  - the basket's own reason for a refusal is said as a message over the screen
 *    (the row shows it under its button; a card has no such place), and a sold-out
 *    product's button is disabled by the card itself (`isSoldOut`);
 *  - a size is asked in the card's option sheet, and the heart is the app's
 *    favourites when it has any.
 *
 * Plain rows (`list`, `compact`, or no card chosen) are not this file's.
 */

/** A refusal with a reason is read, not glanced at (the row's `CART_MESSAGE_MS`). */
const MESSAGE_SECONDS = 6;

export interface SearchCard {
  /** One result drawn as the merchant's card. */
  renderCard: (product: SelwiseProduct, index: number) => ReactElement;
  /** The message and the option sheet; draw it once, over the results. */
  overlay: ReactElement;
}

export function useSearchCard(input: {
  search: UseSelwiseSearchResult;
  /** The panel's tap: reports the click and opens the product (its `onProductPress`, else the link). */
  pressProduct: (product: SelwiseProduct, index: number) => void;
  /** The idle button's word when the app wants its own. */
  addToCartLabel?: string | undefined;
  locale: string | undefined;
}): SearchCard {
  const { search, addToCartLabel, locale } = input;
  const { settings, productCard: card, t, trackAddToCart, trackClick } = search;
  const host = useSelwiseHost();
  const navigate = useNavigate();
  const tokens = getThemeTokens();
  const language = appLanguage(locale);
  const ctx = useCardStyleContext(host.fontFamily, tokens);
  const { toast, show } = useCardToast();
  const { request, choose } = useCardChooser();

  // The panel's own functions change with the app's inline handlers: read the
  // latest through a ref, so the actions (and every card) keep their identity.
  const press = useRef(input.pressProduct);
  press.current = input.pressProduct;

  const say = useCallback((message: string, kind: 'success' | 'error') => {
    if (message) show(message, kind, MESSAGE_SECONDS);
  }, [show]);

  const add = useCallback<CardActions['add']>(
    async (product, _index, code) => {
      if (!host.addToCart) return false;
      let answer: { success?: boolean; message?: string } | void | undefined;
      try {
        answer = await host.addToCart({ code, quantity: 1, source: 'search', product });
      } catch {
        answer = { success: false };
      }
      if (!(answer && answer.success === false)) {
        trackAddToCart(product);
        return true;
      }
      // The platform's own sentence when the host handed one over: a refused add
      // that says nothing is the defect.
      const reason = typeof answer.message === 'string' ? answer.message.trim() : '';
      say(reason || shopperString('cart.toast.failed', language), 'error');
      return false;
    },
    [host, trackAddToCart, say, language]
  );

  const wishlist = useMemo(() => cardWishlist(host, { source: 'search' }), [host]);

  const actions = useMemo<CardActions>(
    () => ({
      open: (product, index, url) => {
        // A previewed shade has a page of its own: the click is still the search's.
        if (url && url !== product.url) {
          trackClick(product.itemCode, index);
          void navigate({ url, source: 'search' });
          return;
        }
        press.current(product, index);
      },
      add,
      choose,
      say,
      ...(wishlist ? { wishlist } : {}),
    }),
    [trackClick, navigate, add, choose, say, wishlist]
  );

  const cardTexts = useMemo(() => cardStateTexts(card), [card]);
  const cartEnabled = settings?.cart.enabled === true;
  const canAdd = typeof host.addToCart === 'function';
  const cartWords = {
    default: nonEmpty(addToCartLabel) ?? nonEmpty(t('cartAdd')),
    loading: nonEmpty(t('cartAdding')),
    success: nonEmpty(t('cartAdded')),
    error: nonEmpty(t('cartError')),
  };
  const cart = useMemo<CardEnv['cart']>(
    () => ({
      ctaMode: 'add_to_cart',
      // The search's own basket switch (Search → Cart), as the rows read it.
      addToCartEnabled: cartEnabled,
      canAdd,
      reviewButtonText: undefined,
      texts: cartWords,
      cardTexts: {
        loading: nonEmpty(cardTexts['loading']),
        success: nonEmpty(cardTexts['success']),
        error: nonEmpty(cardTexts['error']),
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cartEnabled, canAdd, cartWords.default, cartWords.loading, cartWords.success, cartWords.error, cardTexts]
  );

  const { env, defaultCardEnv } = useCardEnvironment({
    card,
    cart,
    actions,
    ctx,
    hostFont: host.fontFamily,
    tokens,
    // A hit carries its own currency (the API fills the channel's when the feed has none).
    currency: undefined,
    locale,
    language,
  });

  const renderCard = useCallback(
    (product: SelwiseProduct, index: number) => h(SurfaceCard, { product, index, env, defaultCardEnv, actions }),
    [env, defaultCardEnv, actions]
  );

  const overlay = h(
    Fragment,
    null,
    h(CardToastView, { toast, tokens }),
    h(VariantSheet, {
      request,
      window: env?.tree.variantModal ?? null,
      chooser: env?.tree.variantChooser ?? null,
      ctx,
      currency: undefined,
      locale,
      language,
    })
  );

  return { renderCard, overlay };
}
