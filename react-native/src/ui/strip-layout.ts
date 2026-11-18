import type { SelwiseProduct } from '../types.js';
import { isTurkishLocale } from './strings.js';

/**
 * How a strip lays its cards out — the arithmetic of the display types, without
 * a view.
 *
 * Plain TypeScript with no `react-native` import, so the slider's page maths,
 * the grid's rows, the role tabs and a look's total are tested without a
 * renderer. The rules are the storefront's (`recommendation/renderers`): a phone
 * reads the strip's PHONE column count (`slidesPerViewMobile`, which is the
 * one the dashboard offers on an app channel), the gap between cards is
 * `slideGap`, and a slider's dots are one per PAGE.
 */

/** The strip's own default when a stored strip carries none: the API's (`REC_DEFAULT_COLUMNS.mobile`). */
export const DEFAULT_PHONE_COLUMNS = 2;

/**
 * The gap between cards a strip is created with (`slideGap` of the API's default
 * recommendation, `getDefaultRecommendationConfig`). A STORED strip always carries
 * its own gap, so the arithmetic above never falls back to this; it is for a draw
 * that has no stored strip and wants the shape one is born with, such as the
 * dashboard's card designer showing a card at the width it ships at (2026-11-18).
 */
export const DEFAULT_PHONE_GAP = 16;

type WidgetLike = { slidesPerViewMobile?: unknown; slideGap?: unknown; [key: string]: unknown };

/** Cards per screen width on a phone, at least 1. */
export function phoneColumns(widget: WidgetLike | null | undefined): number {
  return Math.max(1, Math.round(Number(widget?.slidesPerViewMobile) || DEFAULT_PHONE_COLUMNS));
}

/** The space between cards, in pixels. */
export function cardGap(widget: WidgetLike | null | undefined): number {
  return Math.max(0, Number(widget?.slideGap) || 0);
}

/** One card's width when `columns` fill `containerWidth` with `gap` between them. */
export function cardWidth(containerWidth: number, columns: number, gap: number): number {
  const width = (containerWidth - gap * (columns - 1)) / columns;
  return Math.max(1, Math.floor(width));
}

/** A slider's pages, one dot each: `ceil(cards / cardsPerPage)`. */
export function pageCount(total: number, perPage: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, perPage)));
}

/**
 * The page after a step. `loop` wraps from the last page to the first (and the
 * other way); without it the slider stops at its ends, as the browser widget's.
 */
export function stepPage(current: number, pages: number, direction: 'next' | 'prev', loop: boolean): number {
  if (direction === 'next') return loop ? (current + 1) % pages : Math.min(current + 1, pages - 1);
  return loop ? (current - 1 + pages) % pages : Math.max(current - 1, 0);
}

/** The page a scroll offset rests on. */
export function pageAtOffset(offset: number, pageWidth: number, pages: number): number {
  if (!(pageWidth > 0)) return 0;
  return Math.min(pages - 1, Math.max(0, Math.round(offset / pageWidth)));
}

/** The items in rows of `columns`; the last row may be short. */
export function chunkRows<T>(items: readonly T[], columns: number): T[][] {
  const size = Math.max(1, columns);
  const rows: T[][] = [];
  for (let at = 0; at < items.length; at += size) rows.push(items.slice(at, at + size));
  return rows;
}

/* ----------------------------------------------------------------------------
   Roles and looks (the `complementary` strategy)
   -------------------------------------------------------------------------- */

/** The language a catalogue role is labelled in: Turkish or English, the two the role dictionary carries. */
export function roleLanguage(locale: string | null | undefined): 'tr' | 'en' {
  return isTurkishLocale(locale) ? 'tr' : 'en';
}

function complementLabel(product: SelwiseProduct, language: 'tr' | 'en'): string {
  return product.complement?.label?.[language] || product.complement?.role || '';
}

export interface RoleTab {
  role: string;
  label: string;
  products: SelwiseProduct[];
}

/**
 * One tab per role the products carry, in the order the first of each appears.
 * Empty when no product has a role (any other strategy): the caller draws the
 * plain grid, because a view must never be empty for a strip with no roles.
 */
export function roleTabs(products: readonly SelwiseProduct[], language: 'tr' | 'en'): RoleTab[] {
  const tabs: RoleTab[] = [];
  for (const product of products) {
    const role = product.complement?.role;
    if (!role) continue;
    const found = tabs.find((tab) => tab.role === role);
    if (found) found.products.push(product);
    else tabs.push({ role, label: complementLabel(product, language), products: [product] });
  }
  return tabs;
}

/** True when the strip is a look: at least one product carries a role. */
export function isComplementary(products: readonly SelwiseProduct[]): boolean {
  return products.some((product) => product.complement);
}

/**
 * A look card's caption, as the merchant chose it (`look.caption`): the body
 * slot ("Alt giyim"), the role ("Jean") or nothing. A role with no slot is
 * captioned with its role under "slot" — it is its own part of the look.
 */
export function lookCaption(product: SelwiseProduct, language: 'tr' | 'en', mode: string): string {
  if (mode === 'none') return '';
  if (mode === 'slot') return product.complement?.slotLabel?.[language] || complementLabel(product, language);
  return complementLabel(product, language);
}

/**
 * The look's total: the sum of the cards' prices, only when every card is priced
 * and all in one currency — a sum across currencies is not a price, and a card
 * with no price would make it a wrong number.
 */
export function lookTotal(products: readonly SelwiseProduct[]): { sum: number; currency: string | undefined } | null {
  const currencies = new Set(products.map((product) => product.currency).filter(Boolean));
  const priced = products.filter((product) => typeof product.price === 'number' && Number.isFinite(product.price) && product.price > 0);
  if (products.length === 0 || priced.length !== products.length || currencies.size > 1) return null;
  return { sum: priced.reduce((sum, product) => sum + product.price, 0), currency: [...currencies][0] };
}
