import { createElement as h, type ReactElement } from 'react';
import { Pressable, View } from 'react-native';
import { pickId } from './pick-ids.js';
import type { SearchSettings, SearchTextKey } from '../vendor/search-settings.js';
import { splitCategoryList } from '../vendor/category-list.js';
import { isSoldOut } from '../vendor/product-card-variant-logic.js';
import type { SelwiseProduct } from '../types.js';
import type { SearchTextVars } from '../core/search-config.js';
import { formatCategoryName, highlightSegments, markedSegments } from '../core/search-format.js';
import { SelwiseImage } from './host-hooks.js';
import { SearchText as Text } from './search-text-view.js';
import { formatMoney } from './price-format.js';
import { styler, type SearchTheme } from './search-styles.js';

/** What a row's add-to-cart button is doing. */
export type SearchCartState = 'idle' | 'adding' | 'added' | 'error';

/** A search row's price: `formatMoney`, kept under the name the SDK published. */
export const formatSearchPrice: (amount: number, currency: string | undefined, locale: string | undefined) => string =
  formatMoney;

export interface SearchResultItemProps {
  product: SelwiseProduct;
  index: number;
  settings: SearchSettings;
  theme: SearchTheme;
  /** What the shopper typed, to mark the matching part of the title. */
  query: string;
  locale: string | undefined;
  t: (key: SearchTextKey, vars?: SearchTextVars) => string;
  onPress: () => void;
  /** Present when the basket can be reached (`settings.cart.enabled` and a host `addToCart`). */
  onAddToCart?: () => void;
  cartState?: SearchCartState;
  /** The catalogue calls it sold out (`isSoldOut`). The panel passes the answer it already holds; without it the row asks. */
  soldOut?: boolean;
  /** Why the basket refused, in the platform's own words, shown under the button while `cartState` is `error`. */
  cartMessage?: string;
  /** The idle button's word when the app wants its own; without it, the merchant's (`texts.cartAdd`). */
  addToCartLabel?: string;
  unstyled?: boolean;
}

/** The title with the part the shopper typed marked. */
function Title(props: {
  product: SelwiseProduct;
  query: string;
  highlight: boolean;
  theme: SearchTheme;
  lines: number;
  unstyled: boolean;
}): ReactElement {
  const { product, query, highlight, theme, lines, unstyled } = props;
  const title = String(product.title || '');
  const segments = highlight
    ? (markedSegments(product.highlights?.title?.[0]) ?? highlightSegments(title, query))
    : [{ text: title, marked: false }];
  return h(
    Text,
    { numberOfLines: lines, ...(unstyled ? {} : { style: { fontSize: 14, fontWeight: '500', color: theme.colors.text } }) },
    ...segments.map((segment, at) =>
      segment.marked
        ? h(Text, { key: at, style: unstyled ? undefined : { fontWeight: '700', color: theme.colors.highlight } }, segment.text)
        : segment.text
    )
  );
}

/**
 * One result, as `results.layout` says: a row with the image (`list`), a row
 * without it (`compact`) or a card (`grid`) — and in every one only the parts
 * `results.fields` switches on.
 */
export function SearchResultItem(props: SearchResultItemProps): ReactElement {
  const { product, settings, theme, query, locale, t, onPress, onAddToCart, cartState = 'idle', unstyled = false } = props;
  const { layout, fields, highlight, categories } = settings.results;
  const grid = layout === 'grid';
  const showImage = fields.image && layout !== 'compact';
  const s = styler(unstyled);

  const price = Number(product.price);
  const original = Number(product.originalPrice);
  const hasOldPrice = fields.oldPrice && Number.isFinite(original) && original > price;
  const discount = fields.discount && Number(product.discountRate) > 0 ? Math.round(Number(product.discountRate)) : 0;
  const firstCategory = splitCategoryList(product.categories)[0];

  const imageSize = grid ? undefined : 64;
  const image = product.imageUrl
    ? h(SelwiseImage, {
        uri: String(product.imageUrl),
        resizeMode: 'cover',
        style: unstyled
          ? undefined
          : grid
            ? { width: '100%', aspectRatio: theme.imageRatio, borderRadius: theme.radius, backgroundColor: theme.colors.surfaceAlt }
            : { width: imageSize, height: imageSize, borderRadius: theme.radius, backgroundColor: theme.colors.surfaceAlt },
      })
    : h(View, {
        style: s(
          grid
            ? { width: '100%', aspectRatio: theme.imageRatio, borderRadius: theme.radius, backgroundColor: theme.colors.surfaceAlt }
            : { width: imageSize, height: imageSize, borderRadius: theme.radius, backgroundColor: theme.colors.surfaceAlt }
        ),
      });

  const priceRow =
    fields.price && Number.isFinite(price)
      ? h(
          View,
          { style: s({ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }) },
          h(
            Text,
            // A price is one line at its text's width and the row wraps whole prices
            // (the card's rule, `card-tree.ts` `wrapsPrices`): never a number split in two.
            { style: s({ fontSize: 14, fontWeight: '600', color: theme.colors.text, flexShrink: 0 }), numberOfLines: 1 },
            formatSearchPrice(price, product.currency, locale)
          ),
          hasOldPrice
            ? h(
                Text,
                { style: s({ fontSize: 12, color: theme.colors.muted, textDecorationLine: 'line-through', flexShrink: 0 }), numberOfLines: 1 },
                formatSearchPrice(original, product.currency, locale)
              )
            : null,
          discount > 0
            ? h(
                Text,
                {
                  style: s({
                    fontSize: 11,
                    fontWeight: '700',
                    color: theme.colors.saleText,
                    backgroundColor: theme.colors.sale,
                    borderRadius: 4,
                    paddingHorizontal: 5,
                    paddingVertical: 1,
                    overflow: 'hidden',
                    flexShrink: 0,
                  }),
                  numberOfLines: 1,
                },
                `-${discount}%`
              )
            : null
        )
      : null;

  const stock =
    fields.stock && typeof product.inStock === 'boolean'
      ? h(
          Text,
          { style: s({ fontSize: 12, color: product.inStock ? theme.colors.muted : theme.colors.sale }) },
          t(product.inStock ? 'inStock' : 'outOfStock')
        )
      : null;

  // A product the catalogue calls sold out is offered no basket: the button
  // stays, disabled, saying so — pressing it could only be refused by the
  // platform with nothing on screen to say why (2026-11-18).
  const soldOut = props.soldOut ?? isSoldOut(product, product.variants ?? undefined);
  const cartLabel = soldOut
    ? t('outOfStock')
    : cartState === 'adding'
      ? t('cartAdding')
      : cartState === 'added'
        ? t('cartAdded')
        : cartState === 'error'
          ? t('cartError')
          : props.addToCartLabel || t('cartAdd');
  const cartButton = onAddToCart
    ? h(
        Pressable,
        {
          onPress: soldOut ? undefined : onAddToCart,
          disabled: soldOut || cartState === 'adding',
          testID: pickId('button', 'cart'),
          accessibilityRole: 'button',
          accessibilityLabel: cartLabel || String(product.title || ''),
          accessibilityState: { disabled: soldOut || cartState === 'adding', busy: cartState === 'adding' },
          style: s({
            alignSelf: 'flex-start',
            marginTop: 4,
            minHeight: 32,
            minWidth: 32,
            paddingHorizontal: 12,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: theme.radius,
            backgroundColor: cartState === 'error' && !soldOut ? theme.colors.sale : theme.colors.accent,
            opacity: soldOut ? 0.5 : cartState === 'adding' ? 0.7 : 1,
          }),
        },
        h(
          Text,
          { style: s({ fontSize: 13, fontWeight: '600', color: theme.colors.accentText }) },
          cartLabel || '+'
        )
      )
    : null;

  // Why the basket refused, in the platform's own sentence. Under the button
  // and announced: the red label alone said "error" and nothing else.
  const cartReason =
    onAddToCart && !soldOut && cartState === 'error' && props.cartMessage
      ? h(
          Text,
          {
            testID: 'selwise-search-cart-message',
            accessibilityRole: 'alert' as const,
            accessibilityLiveRegion: 'polite' as const,
            style: s({ fontSize: 12, color: theme.colors.sale, marginTop: 2 }),
          },
          props.cartMessage
        )
      : null;

  // What the card says is one tap target. The add-to-cart button is a SIBLING of
  // it, never inside it: a button inside a button is invalid on the web (the
  // preview draws this through react-native-web), a second, unreachable target
  // for a screen reader, and a tap that can land on both.
  const tapProps = {
    onPress,
    accessibilityRole: 'button' as const,
    accessibilityLabel: String(product.title || ''),
  };
  const text = h(
    Pressable,
    { ...tapProps, style: s({ gap: 3 }) },
    h(Title, { product, query, highlight, theme, lines: grid ? 2 : layout === 'compact' ? 1 : 2, unstyled }),
    fields.description && product.description
      ? h(Text, { numberOfLines: 2, style: s({ fontSize: 12, color: theme.colors.muted }) }, String(product.description))
      : null,
    priceRow,
    fields.category && firstCategory
      ? h(
          Text,
          { numberOfLines: 1, style: s({ fontSize: 12, color: theme.colors.muted }) },
          formatCategoryName(firstCategory, categories.naming)
        )
      : null,
    stock
  );
  const content = h(
    View,
    { style: s({ flex: grid ? undefined : 1, marginTop: grid ? 8 : 0 }) },
    text,
    cartButton,
    cartReason
  );
  // The picture opens the product too, but is not a second stop for a screen reader: the title is.
  const picture = showImage
    ? h(Pressable, { onPress, accessible: false, importantForAccessibility: 'no' as const, accessibilityLabel: String(product.title || '') }, image)
    : null;

  return h(
    View,
    {
      testID: pickId('card', 'results'),
      style: s(
        grid
          ? { flex: 1 }
          : {
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.gap,
              paddingVertical: layout === 'compact' ? 6 : theme.gap,
            }
      ),
    },
    picture,
    content
  );
}
