// GENERATED FILE — DO NOT EDIT.
//
// Vendored from packages/widget-contract/src/product-card-logic.ts by
// scripts/sync-vendored-page-targeting.js. Edit the source, then run:
//
//   node scripts/sync-vendored-page-targeting.js
//
// It is copied rather than imported because @selwise/widget-contract is private
// and this SDK is published: a dependency on it would not resolve for anyone
// who installs @selwise/react-native from npm.

/**
 * What a product card SAYS about a product — the decisions behind the card tree,
 * without the markup.
 *
 * ## Why this is its own file
 *
 * `renderCardTree` answers two questions at once: WHAT does this node show for
 * this product (a discount of 25%, the second photo, the shade that is on
 * screen, "from ₺…"), and HOW is that drawn (an HTML string and a stylesheet).
 * The second half belongs to the surface — the storefront draws markup, the
 * app draws React Native views. The first half does not: a card that says
 * `-25%` on the web and `-24%` in the app, or hides an "original price" node
 * on a different product, is two designs. So the answers are here, plain
 * values in and out, and both renderers are views over them.
 *
 * ## What it is, what it is not
 *
 * PURE and import-free apart from the shade palette (`./product-card-swatch-colors`,
 * itself import-free): no DOM, no formatting — an amount comes back as a number
 * and the caller prints it in its own currency and language, which is the one
 * thing the two surfaces legitimately do differently. The SDK vendors this file
 * (`scripts/sync-vendored-page-targeting.js`).
 *
 * NOT re-exported from the barrel: import the subpath,
 *   import { derivedFlags } from '@selwise/widget-contract/product-card-logic'
 */

import { foldColorName, isLightSwatchColor, resolveSwatchColor } from './product-card-swatch-colors.js';

/** One colour sibling of a product (`CardMediaService.decorate`, the public payload's `swatches`). */
export interface CardSwatchInput {
  itemCode?: string;
  color?: string;
  imageUrl?: string;
  url?: string;
}

/**
 * The product facts a card reads. Structurally the renderers' own product
 * (`RenderableProduct`, the SDK's `SelwiseProduct`), declared here so this file
 * imports neither.
 */
export interface CardLogicProduct {
  id?: string;
  itemCode?: string;
  title?: string;
  imageUrl?: string | null;
  url?: string | null;
  price?: number;
  originalPrice?: number | null;
  discountRate?: number | null;
  inStock?: boolean;
  rating?: number | null;
  reviewCount?: number | null;
  secondaryImageUrl?: string | null;
  swatches?: ReadonlyArray<CardSwatchInput | null | undefined> | null;
  attributes?: Record<string, unknown> | null;
}

/* ----------------------------------------------------------------------------
   Fields
   -------------------------------------------------------------------------- */

/**
 * A product's value for a field name as a card node names it. A few names are
 * the card vocabulary's own (`name`, `oldPrice`, `link`, `image`, `category`);
 * anything else is read off the product by key.
 */
export function getProductFieldValue(product: object, fieldName?: string): unknown {
  if (!fieldName) return '';
  const record = product as Record<string, unknown>;
  switch (fieldName) {
    case 'name':
      return record.title;
    case 'oldPrice':
      return record.originalPrice;
    case 'link':
      return record.url;
    case 'image':
      return record.imageUrl;
    case 'category':
      return record.categories;
    default:
      break;
  }
  if (fieldName in record) {
    return record[fieldName];
  }
  return '';
}

/** A field value as text: nothing for `undefined`/`null`, `true`/`false` for a flag. */
export function formatFieldValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

/** A node's field: `attr.<key>` reads the feed's custom attributes, anything else the product. */
export function readCardField(product: CardLogicProduct, field: string): unknown {
  return field.startsWith('attr.') ? product.attributes?.[field.slice(5)] : getProductFieldValue(product, field);
}

/* ----------------------------------------------------------------------------
   Conditions
   -------------------------------------------------------------------------- */

/**
 * Derived flags, computed once per product.
 *
 * `isOnSale` deliberately compares the two prices rather than trusting a feed's
 * own sale flag: a feed that sets `isSale` on everything is common, and a "-0%"
 * chip on a full-price product is the defect this exists to prevent.
 */
export function derivedFlags(product: CardLogicProduct): Record<string, boolean> {
  const price = typeof product.price === 'number' ? product.price : 0;
  const original = typeof product.originalPrice === 'number' ? product.originalPrice : undefined;
  const discounted = original !== undefined && original > price && original > 0;

  return {
    isOnSale: discounted,
    hasDiscount: discounted || Number(product.discountRate ?? 0) > 0,
    hasOriginalPrice: original !== undefined && original > 0,
    isOutOfStock: product.inStock === false,
    hasRating: typeof product.rating === 'number' && product.rating > 0,
    hasSecondImage: Boolean(product.secondaryImageUrl),
    hasSwatches: Array.isArray(product.swatches) && product.swatches.length > 1,
  };
}

/** What a `visibleWhen` entry says; the node types' (`CardNodeCondition`) own shape, structurally. */
export interface CardConditionLike {
  field: string;
  op: string;
  value?: string | number;
}

function conditionValue(product: CardLogicProduct, flags: Record<string, boolean>, field: string): unknown {
  if (field in flags) return flags[field];
  return readCardField(product, field);
}

export function conditionHolds(
  condition: CardConditionLike,
  product: CardLogicProduct,
  flags: Record<string, boolean>
): boolean {
  const actual = conditionValue(product, flags, condition.field);

  switch (condition.op) {
    case 'exists':
      return actual !== undefined && actual !== null && actual !== '' && actual !== false;
    case 'notExists':
      return actual === undefined || actual === null || actual === '' || actual === false;
    case 'isTrue':
      return actual === true;
    case 'isFalse':
      return actual === false;
    case 'eq':
      return String(actual ?? '') === String(condition.value ?? '');
    case 'neq':
      return String(actual ?? '') !== String(condition.value ?? '');
    case 'gt':
      return Number(actual) > Number(condition.value);
    case 'lt':
      return Number(actual) < Number(condition.value);
    default:
      return true;
  }
}

/** A node is drawn when it is not switched off and every one of its conditions holds. */
export function nodeIsVisible(
  node: { hidden?: boolean; visibleWhen?: readonly CardConditionLike[] },
  product: CardLogicProduct,
  flags: Record<string, boolean>
): boolean {
  if (node.hidden) return false;
  if (!node.visibleWhen?.length) return true;
  return node.visibleWhen.every((condition) => conditionHolds(condition, product, flags));
}

/* ----------------------------------------------------------------------------
   Text, price, badge, rating
   -------------------------------------------------------------------------- */

/**
 * A `text` node's words: the bound field (or its fallback), wrapped in the
 * node's prefix and suffix. Empty when there is nothing to say — the node is
 * then not drawn.
 */
export function textNodeText(props: Record<string, unknown> | undefined, product: CardLogicProduct): string {
  const p = props ?? {};
  const field = typeof p.field === 'string' ? p.field : 'title';
  let text = formatFieldValue(readCardField(product, field));
  if (!text && typeof p.fallback === 'string') text = p.fallback;
  if (!text) return '';
  const prefix = typeof p.prefix === 'string' ? p.prefix : '';
  const suffix = typeof p.suffix === 'string' ? p.suffix : '';
  return `${prefix}${text}${suffix}`;
}

/**
 * The discount in whole percent: from the two prices when the product is on
 * sale, else the feed's own rate. 0 when there is none.
 */
export function discountPercent(product: CardLogicProduct): number {
  const price = typeof product.price === 'number' ? product.price : 0;
  const original = product.originalPrice;
  const percent =
    typeof original === 'number' && original > price && original > 0
      ? Math.round(((original - price) / original) * 100)
      : Number(product.discountRate ?? 0);
  return percent > 0 ? Math.round(percent) : 0;
}

/** `-25%`, or nothing. */
export function discountLabel(product: CardLogicProduct): string {
  const percent = discountPercent(product);
  return percent > 0 ? `-${percent}%` : '';
}

/**
 * What a `price` node reads, as a number the caller prints: `current` (what it
 * costs), `original` (the struck price, only while the product is discounted),
 * `saving` (what the discount is worth) or `discount` (the rate, as text).
 * Null when the product has no such reading.
 */
export type PriceReading = { kind: 'amount'; amount: number } | { kind: 'text'; text: string };

export function priceReading(variant: string | undefined, product: CardLogicProduct): PriceReading | null {
  const price = typeof product.price === 'number' ? product.price : 0;
  const original = product.originalPrice;

  switch (variant) {
    case 'original':
      return typeof original === 'number' && original > price ? { kind: 'amount', amount: original } : null;
    case 'discount': {
      const label = discountLabel(product);
      return label ? { kind: 'text', text: label } : null;
    }
    case 'saving':
      return typeof original === 'number' && original > price ? { kind: 'amount', amount: original - price } : null;
    case 'current':
    default:
      return { kind: 'amount', amount: price };
  }
}

/** A `badge` node's words: a static label, the discount, or a product field. */
export function badgeText(props: Record<string, unknown> | undefined, product: CardLogicProduct): string {
  const p = props ?? {};
  const source = typeof p.source === 'string' ? p.source : 'static';

  if (source === 'discount') return discountLabel(product);
  if (source === 'field') {
    const field = typeof p.field === 'string' ? p.field : '';
    return formatFieldValue(readCardField(product, field));
  }
  return typeof p.label === 'string' ? p.label : '';
}

export interface RatingReading {
  rating: number;
  max: number;
  filled: number;
  /** The review count, when the node asks for it and the product has one. */
  count?: number;
}

/** A `rating` node's stars, or null for an unrated product. */
export function ratingReading(props: Record<string, unknown> | undefined, product: CardLogicProduct): RatingReading | null {
  const rating = Number(product.rating ?? 0);
  if (!rating) return null;
  const max = Number(props?.max ?? 5);
  const filled = Math.max(0, Math.min(max, Math.round(rating)));
  const count = props?.showCount === true && product.reviewCount ? Number(product.reviewCount) : undefined;
  return { rating, max, filled, ...(count !== undefined && Number.isFinite(count) ? { count } : {}) };
}

/* ----------------------------------------------------------------------------
   Colour siblings
   -------------------------------------------------------------------------- */

/**
 * One chip of a `swatches` node.
 *
 * `auto` paints the shade when its name is one we know, then the sibling's
 * photo, then its initial: a photo cropped to 18px is the same beige dot for
 * every shade of a catalogue shot on one backdrop.
 */
export interface SwatchChip {
  swatch: CardSwatchInput;
  /** The product the card shows (its own shade). */
  active: boolean;
  /** The colour the name resolves to; set for a `paint` chip. */
  paint?: string;
  /** The paint is so light a white ring would vanish on a white card. */
  light?: boolean;
  /** The sibling's photo, for a `photo` chip. */
  photo?: string;
  /** The first letter, for an `initial` chip. */
  initial?: string;
  kind: 'paint' | 'photo' | 'initial';
  /** The name a screen reader says. */
  label: string;
}

export interface SwatchPlan {
  chips: SwatchChip[];
  /** Siblings past the node's `max`: "+3". */
  hidden: number;
}

function ownColorOf(product: CardLogicProduct): string {
  const value = product.attributes && typeof product.attributes === 'object' ? product.attributes.color : undefined;
  return typeof value === 'string' ? foldColorName(value) : '';
}

/**
 * The colour row of a card: which siblings are drawn, which one is the product
 * on screen, and how each is painted. Null when the product has no row to draw
 * (fewer than two siblings — one shade is nothing to choose).
 *
 * Three things make the row MATCH the products it names:
 *  - it paints the shade (`fill`), then the photo, then the initial;
 *  - it marks the product the card shows — by item code, then colour name, then
 *    (a feed that names no colour, one chip per PHOTO) by the photo — and keeps
 *    it inside the `max` it draws;
 *  - the shade on screen is never the one cut off by the cap.
 */
export function planSwatches(props: Record<string, unknown> | undefined, product: CardLogicProduct): SwatchPlan | null {
  // A `null` entry threw on `.itemCode` and took the whole card with it.
  const swatches = (Array.isArray(product.swatches) ? product.swatches : []).filter(
    (swatch): swatch is CardSwatchInput => Boolean(swatch) && typeof swatch === 'object'
  );
  if (swatches.length < 2) return null;

  const max = Number(props?.max ?? 6);
  const fill = typeof props?.fill === 'string' ? props.fill : 'auto';

  const ownCode = product.itemCode || '';
  const ownColor = ownColorOf(product);
  const ownImage = product.imageUrl || '';
  let activeIndex = swatches.findIndex((swatch) => ownCode && swatch.itemCode === ownCode);
  if (activeIndex < 0 && ownColor) {
    activeIndex = swatches.findIndex((swatch) => swatch.color && foldColorName(swatch.color) === ownColor);
  }
  if (activeIndex < 0 && ownImage) {
    activeIndex = swatches.findIndex((swatch) => !swatch.color && swatch.imageUrl === ownImage);
  }

  let shown = swatches.slice(0, max);
  if (activeIndex >= max) {
    shown = [...swatches.slice(0, Math.max(0, max - 1)), swatches[activeIndex] as CardSwatchInput];
  }

  const chips = shown.map((swatch): SwatchChip => {
    const name = swatch.color || '';
    const label = name || swatch.itemCode || '';
    const active = swatch === swatches[activeIndex];
    const paint = fill === 'image' ? null : resolveSwatchColor(name);
    const photo = fill === 'color' ? undefined : swatch.imageUrl;

    if (paint) {
      return { swatch, active, kind: 'paint', paint, light: isLightSwatchColor(paint), label };
    }
    if (photo) return { swatch, active, kind: 'photo', photo, label };
    return { swatch, active, kind: 'initial', initial: (name || swatch.itemCode || '?').trim().charAt(0), label };
  });

  return { chips, hidden: swatches.length - shown.length };
}

/* ----------------------------------------------------------------------------
   Which renderer draws a card
   -------------------------------------------------------------------------- */

/**
 * The stored `renderVersion` of a card drawn from the designer's element tree
 * (`CARD_TREE_VERSION` in `./product-card-nodes`, which `product-card-logic.spec.ts`
 * holds this equal to).
 */
const CARD_TREE_RENDER_VERSION = 3;

/** What `resolveCardRenderMode` reads of a card definition. */
export interface CardRenderModeInput {
  mode?: 'schema' | 'advanced_code';
  template?: string;
  renderVersion?: number;
  customHTML?: string;
  /** The visual designer's element tree; present when `renderVersion` is 3. */
  cardTree?: unknown;
}

export const CARD_RENDER_MODES = ['advanced_code', 'tree', 'schema'] as const;
export type CardRenderMode = (typeof CARD_RENDER_MODES)[number];

/**
 * Which renderer draws this card.
 *
 * ORDER IS THE CONTRACT, and it is the same order on every surface:
 *
 *  1. **Hand-written markup wins.** A merchant who opened the code editor has
 *     made a more specific statement about their card than the designer did, and
 *     silently preferring the tree would throw away work they can see in a text
 *     area.
 *  2. **Then the tree**, when the row says v3 and carries one.
 *  3. **Then the flat field list**, which is what every card written before the
 *     designer still renders from, byte for byte as it always has.
 */
export function resolveCardRenderMode(template: CardRenderModeInput | undefined): CardRenderMode {
  if (!template) return 'schema';

  const hasCustomHtml = typeof template.customHTML === 'string' && template.customHTML.trim() !== '';

  /*
    AN EXPLICIT MODE IS THE MERCHANT'S OWN ANSWER, and it outranks
    `template === 'custom'`.

    That marker predates `mode` existing and is still carried by every card ever
    created from a code template, so treating it as "advanced" on its own means a
    merchant who switches such a card to the designer keeps shipping the old
    markup — with a canvas beside it drawing the design, which is precisely the
    editor-lies-about-production failure this file exists to prevent. Measured on
    a real card: mode `schema`, renderVersion 3, a saved tree, and a storefront
    still rendering the HTML.

    `mode === undefined` is a row written before the column existed; there the
    legacy marker is the only signal there is, so it still decides.
  */
  if (template.mode !== 'schema') {
    const legacyAdvanced =
      template.mode === 'advanced_code' || template.template === 'custom' || template.mode === undefined;
    if (hasCustomHtml && legacyAdvanced) {
      return 'advanced_code';
    }
  }

  if (template.renderVersion === CARD_TREE_RENDER_VERSION && template.cardTree) {
    return 'tree';
  }

  return 'schema';
}

/* ----------------------------------------------------------------------------
   What a card's button does
   -------------------------------------------------------------------------- */

/** The actions a card's control carries (`data-selwise-action` on the storefront). */
export const CARD_ACTIONS = {
  ADD_TO_CART: 'add-to-cart',
  REVIEW: 'review',
  QUICK_VIEW: 'quick-view',
  LINK: 'link',
  WISHLIST: 'wishlist',
} as const;

/** What the surface around a card says about its button. */
export interface CardActionContext {
  source: 'search' | 'recommendation' | 'preview';
  ctaMode?: 'add_to_cart' | 'review';
  addToCartEnabled?: boolean;
}

/**
 * The action a card's primary button really has: the one the card designed
 * (`templateAction`), as the surface around it allows.
 *
 * A strip set to "go to product" turns every basket button into a review one; a
 * surface that cannot add (`addToCartEnabled: false`) does the same; and a
 * review of a product with no page is a plain link. The storefront's
 * `resolveEffectiveAction` and the app's card both answer through this, so one
 * card does the same thing in both.
 */
export function resolveCardAction(
  templateAction: string,
  product: { url?: string | null },
  context: CardActionContext
): string {
  let action = templateAction;

  // Recommendation CTA mode override is only relevant for review/add-to-cart.
  if (context.source === 'recommendation') {
    if (context.ctaMode === 'review') {
      action = CARD_ACTIONS.REVIEW;
    } else if (context.ctaMode === 'add_to_cart' && action !== CARD_ACTIONS.LINK) {
      action = CARD_ACTIONS.ADD_TO_CART;
    }
  }

  if (action === CARD_ACTIONS.ADD_TO_CART && context.addToCartEnabled === false) {
    action = CARD_ACTIONS.REVIEW;
  }

  if (action === CARD_ACTIONS.REVIEW && !product.url) {
    action = CARD_ACTIONS.LINK;
  }

  return action;
}

/**
 * A control node's label, in the order the storefront prints it: a review
 * button says the strip's own review text first; every other says the node's
 * label, then the built-in one for its action. `builtIn` resolves the card's
 * stock words (`card.addToCart`, `card.view`, …) in the visitor's language.
 */
export function cardButtonLabel(
  action: string,
  nodeLabel: string,
  reviewButtonText: string | undefined,
  builtIn: (key: 'card.addToCart' | 'card.view' | 'card.viewProduct' | 'card.review' | 'card.quickView') => string
): string {
  if (action === CARD_ACTIONS.REVIEW) return reviewButtonText || nodeLabel || builtIn('card.view');
  if (action === CARD_ACTIONS.ADD_TO_CART) return nodeLabel || builtIn('card.addToCart');
  return nodeLabel || builtIn('card.view');
}
