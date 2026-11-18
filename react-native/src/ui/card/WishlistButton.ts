import { createElement as h, useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { Pressable, Text } from 'react-native';
import { useSelwiseHost } from '../../react/context.js';
import { shopperString } from '../../vendor/shopper-strings.js';
import type { SelwiseProduct } from '../../types.js';
import type { CardEnv, WishlistActions } from './card-env.js';

/**
 * A card's favourite button: the heart the merchant designed as a `button` node
 * with the "wishlist" action.
 *
 * The list is the app's (`host.toggleWishlist`, `host.isWishlisted`,
 * `host.subscribeWishlist`) and the card only asks. It shows the state the app
 * reports, changes at once when pressed and goes back when the app refuses — a
 * guest the app sent to its login screen keeps an empty heart.
 */

export interface WishlistButtonProps {
  /** Names the button for a UI test and the dashboard's designer (`pick-ids.ts`). */
  testID?: string;
  env: CardEnv;
  wishlist: WishlistActions;
  product: SelwiseProduct;
  index: number;
  /** The node's own words (`props.label`), else the built-in phrase. */
  label: string;
  /** The heart alone, without the words (`props.iconOnly`). */
  iconOnly: boolean;
  style: Record<string, unknown>;
  textStyle: Record<string, unknown>;
}

const HEART_OUTLINE = '\u2661';
const HEART_FILLED = '\u2665';

export function WishlistButton(props: WishlistButtonProps): ReactElement {
  const { env, wishlist, product, index, label, iconOnly, style, textStyle } = props;
  const host = useSelwiseHost();
  const [wished, setWished] = useState(() => wishlist.isWished(product) === true);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  // The strip builds its actions again on every render; the effect below must not
  // follow that, or a press the app cannot confirm would be reset by the next draw.
  const latest = useRef({ wishlist, product });
  latest.current = { wishlist, product };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // The app's list moved (a heart on another screen, a login): ask it again. An
  // app that cannot say keeps what the shopper pressed.
  const code = product.itemCode;
  useEffect(() => {
    const read = () => {
      const state = latest.current.wishlist.isWished(latest.current.product);
      if (state !== undefined) setWished(state);
    };
    read();
    return latest.current.wishlist.subscribe(read);
  }, [code]);

  const press = useCallback(async () => {
    if (busy) return;
    const asked = !wished;
    setBusy(true);
    setWished(asked);
    const now = await wishlist.toggle(product, index, asked);
    if (!mounted.current) return;
    setWished(now);
    setBusy(false);
  }, [busy, wished, wishlist, product, index]);

  const glyph = wished ? HEART_FILLED : HEART_OUTLINE;
  const words = label || shopperString('card.wishlist', env.language);
  const icon = host.renderIcon?.({
    name: wished ? 'heart-filled' : 'heart',
    size: Number(textStyle['fontSize']) || 18,
    ...(typeof textStyle['color'] === 'string' ? { color: textStyle['color'] } : {}),
  });

  return h(
    Pressable,
    {
      accessibilityRole: 'button',
      accessibilityLabel: words,
      accessibilityState: { selected: wished, busy },
      ...(props.testID ? { testID: props.testID } : {}),
      hitSlop: 6,
      onPress: press,
      style: { alignItems: 'center', justifyContent: 'center', flexDirection: 'row', ...style },
    },
    icon ?? h(Text, { style: textStyle, accessibilityElementsHidden: true, importantForAccessibility: 'no' }, glyph),
    iconOnly ? null : h(Text, { style: { ...textStyle, marginLeft: 6 } }, words)
  );
}
