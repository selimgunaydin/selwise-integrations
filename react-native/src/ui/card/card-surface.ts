import {
  createElement as h,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import { Dimensions, Text, View } from 'react-native';
import type { SelwiseHost } from '../../react/host.js';
import type { SelwiseProduct, SelwiseProductVariant } from '../../types.js';
import { isRecord } from '../../core/records.js';
import type { AppStyleContext } from '../../vendor/app-style.js';
import { firstFontFamily } from '../host-hooks.js';
import { fontFamilyMapOf, mapHostFont } from '../host-font.js';
import { styleContext } from '../styles.js';
import { selectionOf } from './card-cart.js';
import type { CardActions, CardEnv, WishlistActions } from './card-env.js';
import { readCardTree, rootTextOf } from './card-tree.js';
import { DefaultCard, type DefaultCardEnv } from './DefaultCard.js';
import { ProductCard } from './ProductCard.js';
import type { SheetRequest } from './VariantSheet.js';

/**
 * The plumbing every surface that draws the merchant's product card shares — a
 * recommendation strip and the search panel's grid — so a card is told the same
 * things and asked the same questions wherever it is drawn (2026-11-18).
 *
 * The card itself (`ProductCard`, `DefaultCard`) only draws and reports a press;
 * what a press MEANS — which tracking event, which `source` the host's basket is
 * told, what is said when the basket refuses — is the surface's, and is passed
 * in as `CardActions`. What does not differ is here: the style context, the
 * environment a card reads (`useCardEnvironment`), the one-question-at-a-time
 * option sheet (`useCardChooser`), the message (`useCardToast`) and the heart
 * (`cardWishlist`). Before this file the strip built all of it inline and the
 * search panel had no card at all, so a second copy would have drifted.
 */

/** The style context a card is painted with: brand tokens, the host's fonts and the screen's size. */
export function useCardStyleContext(hostFont: SelwiseHost['fontFamily'], tokens: unknown, refresh: unknown = 0): AppStyleContext {
  return useMemo(
    () =>
      styleContext({
        fontFamilyMap: fontFamilyMapOf(hostFont),
        viewport: Dimensions.get('window'),
      }),
    // `refresh` is the trigger that has always re-read the viewport (a rotation
    // changes the measured width); the tokens move when the brand does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hostFont, tokens, refresh]
  );
}

export interface CardEnvironmentInput {
  /** The card definition as the payload carried it, or null (no card chosen). */
  card: Record<string, unknown> | null;
  /** The surface's cart settings, as a button reads them. */
  cart: CardEnv['cart'];
  actions: CardActions;
  ctx: AppStyleContext;
  hostFont: SelwiseHost['fontFamily'];
  tokens: Readonly<Record<string, string>>;
  /** The surface's currency, which a card's price prefers over the product's own; a search hit carries its own. */
  currency: string | null | undefined;
  locale: string | undefined;
  language: string;
}

export interface CardEnvironment {
  selection: ReturnType<typeof selectionOf>;
  rootText: ReturnType<typeof rootTextOf>;
  /** The environment of a designer-tree card; null when the card is not a tree the app can draw. */
  env: CardEnv | null;
  /** What the default card reads: the same environment, with an empty tree when there is none. */
  defaultCardEnv: DefaultCardEnv;
}

/**
 * Everything a card needs, built once and kept stable while its inputs are, so a
 * toast, the option sheet or a basket change does not redraw every card
 * (`ProductCard` is a `React.memo`).
 */
export function useCardEnvironment(input: CardEnvironmentInput): CardEnvironment {
  const { card, cart, actions, ctx, hostFont, tokens, currency, locale, language } = input;
  const tree = useMemo(() => readCardTree(card), [card]);
  const selection = useMemo(() => selectionOf(card), [card]);
  const rootText = useMemo(() => rootTextOf(ctx), [ctx]);
  const brandFont = useMemo(() => mapHostFont(hostFont, firstFontFamily(tokens['--selwise-font']) ?? ''), [hostFont, tokens]);
  // Everything except the tree: the card with a tree and the default card (no
  // tree) read the same environment, brand font included.
  const baseEnv = useMemo<Omit<CardEnv, 'tree'>>(
    () => ({
      selection,
      cart,
      actions,
      ctx,
      rootText: { ...rootText, ...(brandFont ? { fontFamily: brandFont } : {}) },
      currency,
      locale,
      language,
    }),
    [selection, cart, actions, ctx, rootText, brandFont, currency, locale, language]
  );
  const env = useMemo<CardEnv | null>(() => (tree ? { tree, ...baseEnv } : null), [tree, baseEnv]);
  const defaultCardEnv = useMemo<DefaultCardEnv>(
    () => ({
      tokens,
      currency,
      locale,
      card: env ?? {
        tree: { root: { id: 'root', type: 'root' }, variantChooser: null, variantModal: null },
        ...baseEnv,
      },
    }),
    [tokens, currency, locale, env, baseEnv]
  );
  return { selection, rootText, env, defaultCardEnv };
}

/**
 * One product, drawn with the card the surface has: the designer's tree, or the
 * default card when there is none the app can draw. The default card takes a
 * plain `onPress`; here it is bound to the surface's `open`. Props are stable
 * while the surface's inputs are, so a card is not redrawn by a toast or the
 * option sheet.
 */
export const SurfaceCard = memo(function SurfaceCard(props: {
  product: SelwiseProduct;
  index: number;
  env: CardEnv | null;
  defaultCardEnv: DefaultCardEnv;
  actions: CardActions;
}): ReactElement {
  const { product, index, env, defaultCardEnv, actions } = props;
  if (env) return h(ProductCard, { product, index, env });
  return h(DefaultCard, { product, index, onPress: () => actions.open(product, index, product.url), env: defaultCardEnv });
});

/** The card definition a surface draws: the first of `candidates` that is a record, else null. */
export function firstCard(...candidates: unknown[]): Record<string, unknown> | null {
  for (const candidate of candidates) {
    if (isRecord(candidate)) return candidate;
  }
  return null;
}

/** The card's own words for the button's states (`buttonStyle.stateTexts`), as the button falls back to them. */
export function cardStateTexts(card: Record<string, unknown> | null): Record<string, unknown> {
  const style = card?.['buttonStyle'];
  if (!isRecord(style)) return {};
  const texts = style['stateTexts'];
  return isRecord(texts) ? texts : {};
}

export function nonEmpty(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

// ---------------------------------------------------------------------------
// The option sheet: one question at a time
// ---------------------------------------------------------------------------

/**
 * `choose` for `CardActions`, and the request the sheet draws. A second card's
 * press replaces the first's, and a sheet left open by a surface that goes away
 * answers "dismissed".
 */
export function useCardChooser(): { request: SheetRequest | null; choose: CardActions['choose'] } {
  const [request, setRequest] = useState<SheetRequest | null>(null);
  const openRequest = useRef<SheetRequest | null>(null);
  useEffect(
    () => () => {
      openRequest.current?.resolve(null);
    },
    []
  );
  const choose = useCallback<CardActions['choose']>(
    (product: SelwiseProduct, variants: SelwiseProductVariant[], confirmLabel: string) =>
      new Promise<string | null>((resolve) => {
        openRequest.current?.resolve(null);
        const next: SheetRequest = {
          product,
          variants,
          confirmLabel,
          resolve: (code) => {
            if (openRequest.current === next) openRequest.current = null;
            setRequest((shown) => (shown === next ? null : shown));
            resolve(code);
          },
        };
        openRequest.current = next;
        setRequest(next);
      }),
    []
  );
  return { request, choose };
}

// ---------------------------------------------------------------------------
// The message
// ---------------------------------------------------------------------------

export interface CardToast {
  id: number;
  text: string;
  kind: 'success' | 'error';
}

/** A message that goes away by itself; a newer one replaces the older and its timer. */
export function useCardToast(): { toast: CardToast | null; show: (text: string, kind: CardToast['kind'], seconds: number) => void } {
  const [toast, setToast] = useState<CardToast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );
  const show = useCallback((text: string, kind: CardToast['kind'], seconds: number) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ id: Date.now(), text, kind });
    timer.current = setTimeout(() => setToast(null), seconds * 1000);
  }, []);
  return { toast, show };
}

/** The message drawn over the surface, in the brand's colours; announced politely. */
export function CardToastView(props: {
  toast: CardToast | null;
  tokens: Readonly<Record<string, string>>;
  position?: 'top' | 'bottom';
}): ReactElement | null {
  const { toast, tokens } = props;
  if (!toast) return null;
  return h(
    View,
    {
      pointerEvents: 'none',
      accessibilityLiveRegion: 'polite',
      style: {
        position: 'absolute',
        left: 12,
        right: 12,
        ...(props.position === 'top' ? { top: 8 } : { bottom: 8 }),
        alignItems: 'center',
      },
      testID: 'selwise-add-toast',
    },
    h(
      View,
      {
        style: {
          borderRadius: 8,
          paddingVertical: 8,
          paddingHorizontal: 14,
          backgroundColor: toast.kind === 'error' ? (tokens['--selwise-sale'] || '#dc2626') : (tokens['--selwise-text'] || '#111111'),
        },
      },
      h(
        Text,
        { style: { fontSize: 13, color: toast.kind === 'error' ? (tokens['--selwise-sale-text'] || '#ffffff') : (tokens['--selwise-surface'] || '#ffffff') } },
        toast.text
      )
    )
  );
}

// ---------------------------------------------------------------------------
// The heart
// ---------------------------------------------------------------------------

/**
 * The app's favourites, when it has any (`host.toggleWishlist`): a card's heart
 * asks, and a refusal (a guest sent to log in) leaves the heart as it was.
 * `onAdded` is the surface's own report of an add; a removal is reported by no one.
 */
export function cardWishlist(
  host: SelwiseHost,
  ask: { source: 'recommendation' | 'search'; surfaceId?: string; onAdded?: (product: SelwiseProduct) => void }
): WishlistActions | undefined {
  if (!host.toggleWishlist) return undefined;
  return {
    isWished: (product) => {
      if (!host.isWishlisted) return undefined;
      try {
        return host.isWishlisted(product.itemCode, product) === true;
      } catch {
        return undefined;
      }
    },
    subscribe: (listener) => host.subscribeWishlist?.(listener) ?? (() => undefined),
    toggle: async (product, _index, wished) => {
      let answer: { success?: boolean; wished?: boolean } | undefined;
      try {
        answer = await host.toggleWishlist?.({
          product,
          wished,
          source: ask.source,
          ...(ask.surfaceId ? { surfaceId: ask.surfaceId } : {}),
        });
      } catch {
        answer = { success: false };
      }
      if (!answer || answer.success === false) return !wished;
      const now = typeof answer.wished === 'boolean' ? answer.wished : wished;
      if (now && wished) ask.onAdded?.(product);
      return now;
    },
  };
}
