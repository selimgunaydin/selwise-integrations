import { cloneElement, createElement as h, isValidElement, memo, useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { cardPickId, nodePickId } from '../pick-ids.js';
import { Image, Pressable, Text, View } from 'react-native';
import { shopperString } from '../../vendor/shopper-strings.js';
import {
  badgeText,
  cardButtonLabel,
  derivedFlags,
  nodeIsVisible,
  planSwatches,
  priceReading,
  ratingReading,
  textNodeText,
  CARD_ACTIONS,
  type SwatchChip,
} from '../../vendor/product-card-logic.js';
import type { SelwiseProduct } from '../../types.js';
import { SelwiseImage } from '../host-hooks.js';
import { asView } from '../style-cast.js';
import { formatMoney } from '../price-format.js';
import { buttonAction } from './card-cart.js';
import { CtaButton } from './CtaButton.js';
import { WishlistButton } from './WishlistButton.js';
import type { CardEnv } from './card-env.js';
import {
  boxStyleOf,
  inheritFrom,
  isSized,
  resizeModeOf,
  textStyleOf,
  type CardNodeLike,
  type TextInherit,
} from './card-tree.js';

/**
 * A product card drawn from the designer's element tree, with React Native views.
 *
 * The tree is the merchant's design (Design → Product cards): stacks, a media
 * area with overlays, text, price, badge, rating, shades, buttons, dividers and
 * spacers. What each node SAYS for a product is the storefront's own answer
 * (`@selwise/widget-contract/product-card-logic`, vendored); what it LOOKS like is
 * the style table's (`toNativeStyle`, the `card` surface). This file is the
 * view over both: nothing about a product or a style is decided here.
 *
 * Not drawn, on purpose: an `html` node (merchant markup), a second image that
 * replaces the first on hover (a touch screen has no hover), and every hover,
 * reveal or entrance effect. The favourite button is drawn when the app hands
 * over its favourites (`host.toggleWishlist`), and not otherwise.
 */

interface CardView {
  env: CardEnv;
  /** The product, as the card lists it. */
  product: SelwiseProduct;
  index: number;
  flags: Record<string, boolean>;
  /** The product the card SHOWS: the previewed shade's photo and page over its own. */
  shown: SelwiseProduct;
  previewed: SwatchChip | null;
  preview(chip: SwatchChip | null): void;
}

const HAIRLINE = 'rgba(0,0,0,.14)';
const HAIRLINE_LIGHT = 'rgba(0,0,0,.24)';
const SWATCH_SIZE: Record<string, number> = { sm: 14, md: 18, lg: 24 };
const SWATCH_FONT: Record<string, number> = { sm: 8, md: 9, lg: 11 };

function token(env: CardEnv, name: string, literal: string): string {
  const tokens = env.ctx.tokens ?? {};
  const raw = tokens[name] ?? tokens[name.replace(/^--/, '')];
  return typeof raw === 'string' && raw.trim() ? raw.trim() : literal;
}

function priceText(env: CardEnv, product: SelwiseProduct, variant: unknown): string {
  const reading = priceReading(typeof variant === 'string' ? variant : undefined, product);
  if (!reading) return '';
  return reading.kind === 'text' ? reading.text : formatMoney(reading.amount, env.currency || product.currency, env.locale);
}

/** The shades row. A shade is its own product: tapping one shows it on the card. */
function Swatches(props: { node: CardNodeLike; view: CardView; box: Record<string, unknown>; testID?: string }): ReactElement | null {
  const { node, view, box } = props;
  const plan = planSwatches(node.props, view.product);
  if (!plan) return null;
  const size = SWATCH_SIZE[String(node.props?.['size'])] ?? SWATCH_SIZE['md']!;
  const fontSize = SWATCH_FONT[String(node.props?.['size'])] ?? SWATCH_FONT['md']!;
  const square = node.props?.['shape'] === 'square';
  const radius = square ? 3 : size;
  const ring = token(view.env, '--selwise-text', '#111111');
  const muted = token(view.env, '--selwise-text-muted', '#6b7280');
  const previewing = view.previewed?.swatch;

  return h(
    View,
    { ...(props.testID ? { testID: props.testID } : {}), style: { ...box, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' } },
    ...plan.chips.map((chip, at) => {
      // The shade on the card: the one tapped, else the product's own.
      const selected = previewing ? chip.swatch === previewing : chip.active;
      const fill: Record<string, unknown> = {
        width: size,
        height: size,
        borderRadius: radius,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: chip.light ? HAIRLINE_LIGHT : HAIRLINE,
        backgroundColor: chip.kind === 'paint' ? chip.paint : token(view.env, '--selwise-surface-alt', '#f3f4f6'),
      };
      return h(
        Pressable,
        {
          key: `${chip.swatch.itemCode ?? chip.label}:${at}`,
          accessibilityRole: 'button',
          accessibilityLabel: chip.label,
          accessibilityState: { selected },
          hitSlop: 6,
          // The active shade's ring and the one that was tapped: a 1.5px edge drawn beside the chip, in no layout.
          onPress: () => view.preview(chip.active || chip.swatch === previewing ? null : chip),
          style: { width: size, height: size },
        },
        selected
          ? h(View, {
              style: {
                position: 'absolute',
                top: -3,
                left: -3,
                right: -3,
                bottom: -3,
                borderRadius: square ? 5 : size + 3,
                borderWidth: 1.5,
                borderColor: ring,
                backgroundColor: 'transparent',
              },
            })
          : null,
        h(
          View,
          { style: fill, pointerEvents: 'none' },
          chip.kind === 'photo'
            ? h(Image, { source: { uri: chip.photo }, style: { width: '100%', height: '100%' }, resizeMode: 'cover' })
            : chip.kind === 'initial'
              ? h(Text, { style: { fontSize, fontWeight: '600', color: muted, textTransform: 'uppercase' } }, chip.initial)
              : null
        )
      );
    }),
    plan.hidden > 0
      ? h(Text, { key: 'more', style: { fontSize: 11, color: muted, marginLeft: 4 } }, `+${plan.hidden}`)
      : null
  );
}

/** A `button` node: its action and words are the card's, its press is `CtaButton`'s. */
function Button(props: { node: CardNodeLike; view: CardView; box: Record<string, unknown>; text: TextInherit; testID?: string }): ReactElement | null {
  const { node, view, box, text } = props;
  const { env, product, index } = view;

  const declared = typeof node.props?.['action'] === 'string' ? (node.props['action'] as string) : 'add_to_cart';
  const action = buttonAction(declared, view.shown, {
    ctaMode: env.cart.ctaMode,
    addToCartEnabled: env.cart.addToCartEnabled,
    canAdd: env.cart.canAdd,
  });
  if (action === CARD_ACTIONS.WISHLIST) {
    // The heart needs the app's favourites; without them there is nothing to press.
    const wishlist = env.actions.wishlist;
    if (!wishlist) return null;
    const label = typeof node.props?.['label'] === 'string' ? (node.props['label'] as string) : '';
    return h(WishlistButton, {
      ...(props.testID ? { testID: props.testID } : {}),
      env,
      wishlist,
      // The product itself, not a previewed shade: a favourite is the colour the list knows.
      product,
      index,
      label,
      iconOnly: node.props?.['iconOnly'] === true,
      style: box,
      textStyle: textStyleOf(node, text, env.ctx).style,
    });
  }
  // Nothing to do: a link with no page to go to.
  if (action !== CARD_ACTIONS.ADD_TO_CART && !view.shown.url) return null;

  const builtIn = (key: Parameters<typeof shopperString>[0]) => shopperString(key, env.language);
  const nodeLabel = typeof node.props?.['label'] === 'string' ? (node.props['label'] as string) : '';
  const idleLabel =
    declared === 'link' && !nodeLabel
      ? builtIn('card.viewProduct')
      : cardButtonLabel(action, nodeLabel, env.cart.reviewButtonText, (key) => builtIn(key));
  const own = (key: string): string | undefined => {
    const value = node.props?.[key];
    return typeof value === 'string' && value.trim() ? value : undefined;
  };
  const t = textStyleOf(node, text, env.ctx);

  return h(CtaButton, {
    ...(props.testID ? { testID: props.testID } : {}),
    env,
    product,
    index,
    action,
    label: idleLabel,
    ownTexts: { loading: own('labelLoading'), success: own('labelSuccess'), error: own('labelError') },
    other: view.previewed && !view.previewed.active ? view.shown : null,
    url: view.shown.url,
    style: box,
    textStyle: t.style,
    lines: t.lines,
  });
}

/**
 * One element of the tree, named by the id the designer gave it (`testID`,
 * `pick-ids.ts`): the dashboard's designer canvas turns a click on the rendering
 * into the layer that draws it. A node that draws nothing is still nothing.
 */
function renderNode(node: CardNodeLike, view: CardView, text: TextInherit, parent: CardNodeLike | null): ReactNode {
  const drawn = drawNode(node, view, text, parent);
  return isValidElement(drawn) ? cloneElement(drawn as ReactElement<{ testID?: string }>, { testID: nodePickId(node.id) }) : drawn;
}

function drawNode(node: CardNodeLike, view: CardView, text: TextInherit, parent: CardNodeLike | null): ReactNode {
  const { env, product, flags } = view;
  if (node.type === 'html') return null;
  if (!nodeIsVisible(node, product, flags)) return null;

  const overlay = parent?.type === 'media' && node.type !== 'image';
  const { none, style: box } = boxStyleOf(node, env.ctx, { overlay });
  if (none) return null;
  const key = node.id;
  const inherited = inheritFrom(text, node, env.ctx);

  switch (node.type) {
    case 'stack':
    case 'media': {
      const media = node.type === 'media';
      const style = asView({ ...box, ...(media ? { overflow: 'hidden', ...(isSized(box) ? {} : { aspectRatio: 1 }) } : {}) });
      const children = (node.children ?? []).map((child) => renderNode(child, view, inherited, node));
      return h(View, { key, style }, ...children);
    }
    case 'image': {
      if (node.props?.['source'] === 'secondary') return null;
      const uri = view.shown.imageUrl;
      if (!uri) return null;
      const inMedia = parent?.type === 'media';
      const style = asView(
        inMedia
          ? { ...box, width: '100%', height: '100%' }
          : { ...box, ...(isSized(box) ? {} : { aspectRatio: 1 }), alignSelf: 'stretch' }
      );
      const picture = h(SelwiseImage, {
        uri,
        style: { width: '100%', height: '100%' },
        resizeMode: resizeModeOf(node, env.ctx) as 'cover' | 'contain' | 'stretch',
        accessibilityLabel: product.title,
      });
      return node.props?.['linkToProduct'] !== false && view.shown.url
        ? h(
            Pressable,
            { key, accessibilityRole: 'link', accessibilityLabel: product.title, onPress: () => env.actions.open(product, view.index, view.shown.url), style },
            picture
          )
        : h(View, { key, style }, picture);
    }
    case 'text': {
      const words = textNodeText(node.props, product);
      if (!words) return null;
      const t = textStyleOf(node, text, env.ctx);
      const body = h(Text, { style: t.style, numberOfLines: t.lines }, words);
      return node.props?.['linkToProduct'] === true && view.shown.url
        ? h(Pressable, { key, accessibilityRole: 'link', onPress: () => env.actions.open(product, view.index, view.shown.url), style: box }, body)
        : h(View, { key, style: box }, body);
    }
    case 'price': {
      const words = priceText(env, product, node.props?.['variant']);
      if (!words) return null;
      const t = textStyleOf(node, text, env.ctx);
      // One line, whatever the merchant set: a price that wraps splits its NUMBER
      // ("₺1.14" over "9,00"), which is no price at all. Its box does not shrink
      // (`boxStyleOf`), so it takes its text's width and the row wraps around it.
      return h(View, { key, style: box }, h(Text, { style: t.style, numberOfLines: 1 }, words));
    }
    case 'badge': {
      const words = badgeText(node.props, product);
      if (!words) return null;
      const t = textStyleOf(node, text, env.ctx);
      return h(View, { key, style: box }, h(Text, { style: t.style, numberOfLines: t.lines }, words));
    }
    case 'rating': {
      const reading = ratingReading(node.props, product);
      if (!reading) return null;
      const t = textStyleOf(node, text, env.ctx);
      const stars = '★'.repeat(reading.filled) + '☆'.repeat(Math.max(0, reading.max - reading.filled));
      return h(
        View,
        { key, style: box },
        h(
          Text,
          { style: t.style, accessibilityLabel: `${reading.rating}/${reading.max}` },
          stars,
          reading.count !== undefined ? ` (${reading.count})` : ''
        )
      );
    }
    case 'swatches':
      return h(Swatches, { key, node, view, box });
    case 'button':
      return h(Button, { key, node, view, box, text: inherited });
    case 'divider':
      return h(View, {
        key,
        style: { height: 1, alignSelf: 'stretch', backgroundColor: token(env, '--selwise-border', '#e5e7eb'), ...box },
      });
    case 'spacer':
      return h(View, { key, style: box });
    default:
      return null;
  }
}

export interface ProductCardProps {
  product: SelwiseProduct;
  index: number;
  env: CardEnv;
}

/**
 * One product, drawn from the card's tree. Memoised: it is redrawn when its
 * product, position or environment changes, not when the strip around it
 * re-renders for something it does not read.
 */
export const ProductCard = memo(function ProductCard(props: ProductCardProps): ReactElement {
  const { product, index, env } = props;
  const [previewed, setPreviewed] = useState<SwatchChip | null>(null);
  // A new product on the same card (a list that re-answered) starts from its own shade.
  useEffect(() => setPreviewed(null), [product.itemCode]);

  const shown: SelwiseProduct =
    previewed && !previewed.active
      ? {
          ...product,
          imageUrl: previewed.swatch.imageUrl || product.imageUrl,
          url: previewed.swatch.url || product.url,
        }
      : product;
  const view: CardView = {
    env,
    product,
    index,
    flags: derivedFlags(product),
    shown,
    previewed,
    preview: setPreviewed,
  };

  const root = env.tree.root;
  const { style } = boxStyleOf(root, env.ctx);
  const children = (root.children ?? []).map((child) => renderNode(child, view, inheritFrom(env.rootText, root, env.ctx), root));
  return h(View, { style: { ...style, alignSelf: 'stretch' }, testID: cardPickId(product.itemCode) }, ...children);
});
