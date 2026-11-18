import { createElement as h, useEffect, useRef, useState, type ReactElement } from 'react';
import { Pressable, Text } from 'react-native';
import { shopperString } from '../../vendor/shopper-strings.js';
import { CARD_ACTIONS } from '../../vendor/product-card-logic.js';
import { isSoldOut } from '../../vendor/product-card-variant-logic.js';
import type { SelwiseProduct } from '../../types.js';
import { decideAdd } from './card-cart.js';
import type { CardEnv } from './card-env.js';

/**
 * A card's call to action: opens the product, or adds it to the host's basket
 * and says how that went on the button itself.
 *
 * Shared by the designer's card (`ProductCard`, a `button` node) and the default
 * card, so the two cannot disagree about what pressing it does:
 *
 *  - an add decides its code like the storefront does (`decideAdd`): the
 *    product's own basket code, the one option there is, the option the shopper
 *    picks in the sheet — never a guessed size;
 *  - the button says what it is doing (the card's own words, then the strip's,
 *    then the widget's phrase) and is itself again after two seconds;
 *  - a product the catalogue calls sold out (`isSoldOut`) gets the same button
 *    DISABLED and saying so, instead of inviting a press the platform would
 *    only refuse (2026-11-18); a press on it does nothing;
 *  - a shade other than the product's own on the card is previewed, and its
 *    basket code is not known here: the button opens that shade's screen
 *    rather than add the wrong one.
 */

export type ButtonPhase = 'idle' | 'busy' | 'done' | 'error';

export interface CtaButtonProps {
  /** Names the button for a UI test and the dashboard's designer (`pick-ids.ts`). */
  testID?: string;
  env: CardEnv;
  product: SelwiseProduct;
  index: number;
  /** `add-to-cart`, or what opens the product (`review`, `link`). */
  action: string;
  /** What the button says at rest. */
  label: string;
  /** The button's own words for its states (a designer node's `labelLoading` …). */
  ownTexts?: { loading?: string; success?: string; error?: string };
  /** The product a previewed shade shows, when it is not the card's own. */
  other?: { url?: string | null } | null;
  /** The product's page, for an open. */
  url?: string | null;
  style: Record<string, unknown>;
  textStyle: Record<string, unknown>;
  lines?: number | undefined;
}

export function CtaButton(props: CtaButtonProps): ReactElement {
  const { env, product, index, action, label: idleLabel, ownTexts, other, url, style, textStyle, lines } = props;
  const [phase, setPhase] = useState<ButtonPhase>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const builtIn = (key: Parameters<typeof shopperString>[0]) => shopperString(key, env.language);
  const stateText = (state: 'loading' | 'success' | 'error', fallbackKey: Parameters<typeof shopperString>[0]): string =>
    ownTexts?.[state]?.trim() || env.cart.cardTexts[state] || env.cart.texts[state] || builtIn(fallbackKey);
  const soldOut = action === CARD_ACTIONS.ADD_TO_CART && !other && isSoldOut(product, product.variants);
  const label = soldOut
    ? builtIn('cart.soldOut')
    : phase === 'busy'
      ? stateText('loading', 'cart.adding')
      : phase === 'done'
        ? stateText('success', 'cart.added')
        : phase === 'error'
          ? stateText('error', 'cart.error')
          : idleLabel;

  const settle = (next: ButtonPhase) => {
    setPhase(next);
    if (timer.current) clearTimeout(timer.current);
    if (next === 'done' || next === 'error') timer.current = setTimeout(() => setPhase('idle'), 2000);
  };

  const press = async () => {
    if (phase === 'busy' || soldOut) return;
    if (action !== CARD_ACTIONS.ADD_TO_CART || other) {
      env.actions.open(product, index, url);
      return;
    }
    const decision = decideAdd(product, env.selection);
    if (decision.kind === 'page') {
      env.actions.open(product, index, product.url);
      return;
    }
    if (decision.kind === 'stop') {
      env.actions.say(builtIn('cart.toast.outOfStock'), 'error');
      settle('error');
      return;
    }
    let code: string | null = decision.kind === 'code' ? decision.code : null;
    if (decision.kind === 'choose') {
      code = await env.actions.choose(product, decision.variants, idleLabel);
    }
    if (!code) return;
    settle('busy');
    const ok = await env.actions.add(product, index, code).catch(() => false);
    settle(ok ? 'done' : 'error');
  };

  return h(
    Pressable,
    {
      accessibilityRole: 'button',
      accessibilityLabel: label,
      ...(props.testID ? { testID: props.testID } : {}),
      accessibilityState: { busy: phase === 'busy', disabled: phase === 'busy' || soldOut },
      disabled: phase === 'busy' || soldOut,
      onPress: press,
      style: {
        alignItems: 'center',
        justifyContent: 'center',
        ...style,
        ...(phase === 'busy' ? { opacity: 0.6 } : soldOut ? { opacity: 0.5 } : {}),
      },
    },
    // A label stays on one line unless the merchant chose a number of lines: a
    // button that wraps "Sepete ekle" onto two lines is a taller button than the
    // designer drew (2026-11-18); a label too long for it is cut with an ellipsis.
    h(Text, { style: textStyle, numberOfLines: lines ?? 1 }, label)
  );
}
