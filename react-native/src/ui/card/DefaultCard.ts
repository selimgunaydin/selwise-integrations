import { createElement as h, type ReactElement } from 'react';
import { Pressable, Text, View } from 'react-native';
import { shopperString } from '../../vendor/shopper-strings.js';
import { CARD_ACTIONS, discountLabel } from '../../vendor/product-card-logic.js';
import type { SelwiseProduct } from '../../types.js';
import { SelwiseImage, SelwiseText } from '../host-hooks.js';
import { formatMoney } from '../price-format.js';
import { buttonAction } from './card-cart.js';
import type { CardEnv } from './card-env.js';
import { CtaButton } from './CtaButton.js';

/**
 * The card a strip draws when its product card is not a designer tree (the
 * merchant never designed one, or wrote it as markup the app cannot draw).
 *
 * Painted from the brand — the tokens the storefront's own default reads: the
 * text, muted text, price, sale and brand colours, the surface and the corner —
 * so an unthemed channel gets the plain card it always had and a themed one its
 * own look; no colour is typed in here that a brand could not change.
 */

/** What the default card needs of the world around it; a subset of `CardEnv` a bare `DefaultCard` can build. */
export interface DefaultCardEnv {
  tokens: Readonly<Record<string, string>>;
  currency: string | null | undefined;
  locale: string | undefined;
  /** The full card environment, when the strip has one: it adds the call to action. */
  card?: CardEnv;
}

function token(tokens: Readonly<Record<string, string>>, name: string, literal: string): string {
  const raw = tokens[name] ?? tokens[name.replace(/^--/, '')];
  return typeof raw === 'string' && raw.trim() ? raw.trim() : literal;
}

export interface DefaultCardProps {
  product: SelwiseProduct;
  onPress: () => void;
  index?: number;
  env?: DefaultCardEnv;
}

export function DefaultCard(props: DefaultCardProps): ReactElement {
  const { product, onPress, index = 0 } = props;
  const tokens = props.env?.tokens ?? {};
  const card = props.env?.card;
  const text = token(tokens, '--selwise-text', '#111111');
  const muted = token(tokens, '--selwise-text-muted', '#6b7280');
  const priceColor = token(tokens, '--selwise-price', text);
  const sale = token(tokens, '--selwise-sale', '#dc2626');
  const saleText = token(tokens, '--selwise-sale-text', '#ffffff');
  const brand = token(tokens, '--selwise-brand', '#111111');
  const brandText = token(tokens, '--selwise-brand-text', '#ffffff');
  const radius = Number.parseFloat(token(tokens, '--selwise-radius', '8')) || 0;
  const image = product.imageUrl || (product as { image?: string }).image;
  const original = Number(product.originalPrice);
  const price = Number(product.price);
  const discounted = Number.isFinite(original) && Number.isFinite(price) && original > price;
  const currency = props.env?.currency || product.currency;
  const money = (amount: number) => formatMoney(amount, currency, props.env?.locale);
  const discount = discountLabel(product);

  // A call to action only when the strip says what it should be: a card a host
  // builds by hand has none to offer.
  let cta: ReactElement | null = null;
  if (card && (card.cart.ctaMode === 'add_to_cart' || card.cart.ctaMode === 'review')) {
    const action = buttonAction('add_to_cart', product, {
      ctaMode: card.cart.ctaMode,
      addToCartEnabled: card.cart.addToCartEnabled,
      canAdd: card.cart.canAdd,
    });
    const adds = action === CARD_ACTIONS.ADD_TO_CART;
    if (adds || product.url) {
      const label = adds
        ? card.cart.texts.default || shopperString('card.addToCart', card.language)
        : card.cart.reviewButtonText || shopperString('card.review', card.language);
      cta = h(CtaButton, {
        env: card,
        product,
        index,
        action,
        label,
        url: product.url,
        style: { backgroundColor: brand, borderRadius: radius, paddingVertical: 8, paddingHorizontal: 10, marginTop: 4 },
        textStyle: { color: brandText, fontSize: 12, fontWeight: '600' },
      });
    }
  }

  // The product is one tap target and the CTA a SIBLING of it: a button inside a
  // button is invalid on the web (the dashboard previews this card through
  // react-native-web) and a second, unreachable target for a screen reader.
  return h(
    View,
    { style: { gap: 6 } },
    h(
      Pressable,
      { onPress, style: { gap: 6 }, accessibilityRole: 'button' },
      h(
        View,
        { style: { aspectRatio: 1, backgroundColor: token(tokens, '--selwise-surface-alt', '#f4f4f4'), borderRadius: radius, overflow: 'hidden' } },
        image ? h(SelwiseImage, { uri: String(image), style: { width: '100%', height: '100%' }, resizeMode: 'contain' }) : null,
        discount
          ? h(
              View,
              { style: { position: 'absolute', top: 6, left: 6, backgroundColor: sale, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 } },
              h(Text, { style: { fontSize: 11, fontWeight: '700', color: saleText } }, discount)
            )
          : null
      ),
      h(
        SelwiseText,
        { style: { fontSize: 12, lineHeight: 16, color: text }, numberOfLines: 2 },
        String(product.title || (product as { name?: string }).name || '')
      ),
      h(
        View,
        // The same rule as a designed card's price row (`card-tree.ts`, `wrapsPrices`): a
        // price keeps its text's width on ONE line and the row wraps whole prices.
        { style: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 } },
        h(SelwiseText, { style: { fontSize: 13, fontWeight: '600', color: priceColor, flexShrink: 0 }, numberOfLines: 1 }, money(price)),
        discounted
          ? h(SelwiseText, { style: { fontSize: 11, color: muted, textDecorationLine: 'line-through', flexShrink: 0 }, numberOfLines: 1 }, money(original))
          : null
      )
    ),
    cta
  );
}
