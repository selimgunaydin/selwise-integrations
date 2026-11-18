/**
 * Selwise cart bridge for PZ Next (`@akinon/next`).
 *
 * ## Why you need this
 *
 * When a Selwise surface (a recommendation strip, search) adds a product, it
 * posts `/api/client/baskets/basket/` itself. The basket changes on the
 * server, but on PZ Next the header count and the mini basket are drawn from
 * an RTK Query cache inside the theme's own Redux store, which no outside
 * script can reach and which does not refetch on its own (no `setupListeners`,
 * no polling). Without this component the product is in the basket and the
 * page still shows the old count until the next navigation.
 *
 * This component listens to Selwise's `selwise:cart:added` event and refreshes
 * the theme's OWN basket queries, so the page redraws from the server's basket,
 * the same data a native add leaves behind. The store never leaves the theme:
 * Selwise only announces an event.
 *
 * ## Install
 *
 * 1. Copy `shared/selwise-cart-bridge-core.js` next to this file as
 *    `selwise-cart-bridge-core.js` (plain JS; Next projects allow JS imports).
 * 2. Copy this file into `src/components/selwise-cart-bridge.tsx`.
 * 3. Render it ONCE, anywhere under the Redux provider — the root layout, next
 *    to `<PzRoot>`'s children, is the usual place:
 *
 *      import SelwiseCartBridge from '@theme/components/selwise-cart-bridge';
 *      ...
 *      <SelwiseCartBridge />
 *
 * ## Options
 *
 *   openMiniBasket   default true. Open the mini basket and highlight the added
 *                    line, as the theme's own add does. Set false on a theme
 *                    whose native add does not open it (the count still updates).
 *   onAdded(detail)  call the project's own toast. `detail.product.title`,
 *                    `detail.cart.itemCount` are there when known.
 *   onError(detail)  `detail.code` is one of `out_of_stock`, `variant_required`,
 *                    `refused`, `limit`, `csrf`, `network`, `not_found`,
 *                    `unsupported`, `unknown`; `detail.message` is the store's
 *                    own sentence when it gave one.
 *
 *      <SelwiseCartBridge
 *        onAdded={(d) => toast.open(t('product.added_to_cart'), t('product.go_to_basket'), 'cart-check', ROUTES.BASKET)}
 *        onError={(d) => toast.error(d.message ?? t('product.add_failed'))}
 *      />
 *
 * `useToast` etc. are the project's own hooks: call them inside the component
 * that renders this one and pass the results in, or wrap this component.
 *
 * ## Import paths
 *
 * They are the ones `@akinon/next` 1.126 and 2.x both export. If a project pins
 * an older release, check that `@akinon/next/redux/reducers/root` exports
 * `openMiniBasket` and `setHighlightedItem`.
 */
'use client';

import { useEffect, useRef } from 'react';
import { useAppDispatch } from '@akinon/next/redux/hooks';
import { api } from '@akinon/next/data/client/api';
import {
  openMiniBasket as openMiniBasketAction,
  setHighlightedItem,
} from '@akinon/next/redux/reducers/root';
// @ts-ignore — plain JS file copied from the kit (shared/selwise-cart-bridge-core.js); its exports are CommonJS inside an IIFE, which TypeScript does not read as a module
import { createCartBridge } from './selwise-cart-bridge-core';

export interface SelwiseCartEventDetail {
  surface: string;
  /** `false` when the merchant chose their own message: the mini basket should stay shut. */
  openCart?: boolean;
  status: 'added' | 'delegated' | 'failed' | 'skipped';
  product: { id: string; itemCode?: string; cartCode?: string; title?: string; price?: number };
  code?: string;
  reason?: string;
  message?: string;
  cart?: { itemCount: number; total?: number; currency?: string; codes?: string[] };
}

export interface SelwiseCartBridgeProps {
  openMiniBasket?: boolean;
  onAdded?: (detail: SelwiseCartEventDetail) => void;
  onError?: (detail: SelwiseCartEventDetail) => void;
}

export default function SelwiseCartBridge({
  openMiniBasket = true,
  onAdded,
  onError,
}: SelwiseCartBridgeProps) {
  const dispatch = useAppDispatch();
  // The callbacks are read at event time, so a new function identity on a
  // re-render does not tear the listener down and up again.
  const callbacks = useRef({ onAdded, onError });
  callbacks.current = { onAdded, onError };

  useEffect(() => {
    const bridge = createCartBridge(
      {
        invalidate: (tags: string[]) => dispatch(api.util.invalidateTags(tags as never)),
        openMiniBasket: () => dispatch(openMiniBasketAction()),
        highlight: (pk: number | null) => dispatch(setHighlightedItem(pk)),
      },
      {
        openMiniBasket,
        onAdded: (detail: SelwiseCartEventDetail) => callbacks.current.onAdded?.(detail),
        onError: (detail: SelwiseCartEventDetail) => callbacks.current.onError?.(detail),
      },
    );
    return bridge.attach(document);
  }, [dispatch, openMiniBasket]);

  return null;
}
