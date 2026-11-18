/**
 * The two social-proof counters, as text: the template with its numbers, the
 * number's format and the count-up.
 *
 * Plain TypeScript, like `countdown.ts`, so it is tested in Node. What a counter
 * SAYS is the web's (`apps/client/.../social-proof.ts`): the same template
 * rules, the same `1.2K` / `3M` shortening, the same ease — one campaign, one
 * sentence on both channels.
 */

import { appString } from './strings.js';

/**
 * A count as the web prints it: from a thousand on `1.2K` / `3M`, below it with
 * the merchant's separator (which, below a thousand, never has a group to
 * separate — kept because it is the web's rule, not because it can differ).
 */
export function formatCount(count: number, separator: string = 'comma'): string {
  if (count >= 1_000_000) return (count / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (count >= 1000) return (count / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  const plain = String(count);
  switch (separator) {
    case 'dot':
      return plain.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    case 'space':
      return plain.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    case 'none':
      return plain;
    default:
      return plain.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
}

/** The easing of the count-up (ease-out quart, the web's). */
export function easeOutQuart(progress: number): number {
  const clamped = Math.min(1, Math.max(0, progress));
  return 1 - Math.pow(1 - clamped, 4);
}

/** The number on screen `elapsedMs` into a count-up from 0 to `end`. */
export function countAt(end: number, elapsedMs: number, durationMs: number): number {
  if (!(durationMs > 0)) return end;
  return Math.round(end * easeOutQuart(elapsedMs / durationMs));
}

/** The count-up's length: the merchant's `animationDuration` (a number or a numeric string), else a second. */
export function countDuration(value: unknown): number {
  const ms = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseFloat(value) : NaN;
  return Number.isFinite(ms) && ms > 0 ? ms : 1000;
}

const textOf = (value: unknown): string => (typeof value === 'string' && value.trim() ? value : '');

/** The counter's sentence: the merchant's custom text, else the picked template, else the platform's. `{timePeriod}` is filled. */
export function counterTemplate(
  type: 'product_view_count' | 'cart_count',
  content: Record<string, unknown>,
  locale: string | null | undefined
): string {
  const fallback = appString(type === 'cart_count' ? 'socialProof.cart' : 'socialProof.views', locale);
  const period = textOf(content['timePeriod']) || '24h';
  return (textOf(content['customText']) || textOf(content['template']) || fallback).replace(/\{timePeriod\}/g, period);
}

/**
 * The template split around its `{count}` — `['Bu ürünü ', null, ' kişi gördü']`,
 * `null` being where the number goes. A template with no `{count}` ends with
 * the number after a space, as the web's does.
 */
export function counterParts(template: string): Array<string | null> {
  const pieces = template.split('{count}');
  if (pieces.length === 1) return [template, ' ', null];
  const out: Array<string | null> = [];
  pieces.forEach((piece, index) => {
    if (piece) out.push(piece);
    if (index < pieces.length - 1) out.push(null);
  });
  return out;
}

/** The dashboard's icon choices for the two counters, as the glyph drawn when the host supplies no icon component. */
export const COUNTER_ICON_GLYPHS: Readonly<Record<string, string>> = {
  eye: '👁',
  users: '👥',
  'trending-up': '📈',
  flame: '🔥',
  fire: '🔥',
  'shopping-cart': '🛒',
  'shopping-bag': '🛍',
};

/** The icon a counter draws: the merchant's pick when it is one the dashboard offers, else the type's default. */
export function counterIconName(type: 'product_view_count' | 'cart_count', picked: unknown): string {
  const fallback = type === 'cart_count' ? 'shopping-cart' : 'eye';
  return typeof picked === 'string' && picked in COUNTER_ICON_GLYPHS ? picked : fallback;
}
