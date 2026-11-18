import { splitCategoryList } from '../vendor/category-list.js';
import type { SearchCategoryNaming } from '../vendor/search-settings.js';
import type { SearchCategoryFacet, SelwiseProduct } from '../types.js';

/**
 * What the search draws, worked out from what the API sent: category names,
 * the categories of a result list, the matched part of a title.
 *
 * Pure and free of React Native, so a host that draws its own search screen
 * (`useSelwiseSearch` only) uses the same rules the ready-made panel does.
 */

const ENTITIES: Record<string, string> = { '&gt;': '>', '&lt;': '<', '&quot;': '"', '&#39;': "'", '&apos;': "'" };

/** A feed that escapes its category separators (`A &gt; B`, sometimes twice) reads as the path it means. */
export function decodeEntities(text: string): string {
  let out = String(text ?? '');
  for (let pass = 0; pass < 2; pass += 1) {
    const next = out.replace(/&(?:gt|lt|quot|apos|#39);/g, (entity) => ENTITIES[entity] ?? entity).replace(/&amp;/g, '&');
    if (next === out) break;
    out = next;
  }
  return out;
}

/**
 * A category path as the merchant chose to name it: the whole path, its last
 * part ("Ceket") or its first ("Kadın").
 */
export function formatCategoryName(category: string, naming: SearchCategoryNaming = 'last_part'): string {
  const text = decodeEntities(category);
  if (!text.includes('>') || naming === 'full_path') return text.replace(/\s*>\s*/g, ' › ');
  const parts = text
    .split('>')
    .map((part) => part.trim())
    .filter(Boolean);
  return (naming === 'first_part' ? parts[0] : parts[parts.length - 1]) ?? text;
}

/**
 * The categories of a result list, by first level, most results first. What
 * the API's own `categories` say is used as it comes; this is the answer for an
 * API that sent none.
 */
export function categoriesFromHits(hits: readonly SelwiseProduct[]): SearchCategoryFacet[] {
  const counts = new Map<string, number>();
  for (const hit of hits) {
    // Each path the value lists ("A | B" is two), once per product, by its first level.
    const tops = new Set(
      splitCategoryList(hit.categories)
        .map((path) => path.split('>')[0]?.trim() ?? '')
        .filter(Boolean)
    );
    for (const top of tops) counts.set(top, (counts.get(top) ?? 0) + 1);
  }
  return [...counts.entries()].map(([name, count]) => ({ name, count }));
}

export interface TextSegment {
  text: string;
  /** The part that matched what the shopper typed. */
  marked: boolean;
}

/** `text` as the search reads it: lower-case, accent-free, Turkish `ı` and `i` alike. */
export function foldText(text: string): string {
  return foldWithMap(String(text ?? '')).folded;
}

/** One lower-case, accent-free character per input character, and where each came from. */
function foldWithMap(text: string): { folded: string; origin: number[] } {
  let folded = '';
  const origin: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] ?? '';
    // `İ` lower-cases to `i` plus a combining dot; the dot is an accent like any other.
    const piece = char.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    // Turkish dotless `ı` and the Latin `i` are searched alike: both fold to `i`.
    const plain = piece === 'ı' ? 'i' : piece;
    for (let at = 0; at < plain.length; at += 1) {
      folded += plain[at];
      origin.push(index);
    }
  }
  return { folded, origin };
}

/**
 * `title` cut into the parts that match a word of `query` and the parts that
 * do not. Case, accents and Turkish `ı`/`i` are ignored, as the search itself
 * ignores them. A title nothing matched is one unmarked segment.
 */
export function highlightSegments(title: string, query: string): TextSegment[] {
  const text = String(title ?? '');
  const words = foldWithMap(String(query ?? ''))
    .folded.split(/\s+/)
    .filter((word) => word.length > 0);
  if (!text || words.length === 0) return text ? [{ text, marked: false }] : [];

  const { folded, origin } = foldWithMap(text);
  const marked = new Array<boolean>(text.length).fill(false);
  for (const word of words) {
    let from = 0;
    while (from <= folded.length - word.length) {
      const at = folded.indexOf(word, from);
      if (at === -1) break;
      const start = origin[at] ?? 0;
      const end = (origin[at + word.length - 1] ?? text.length - 1) + 1;
      for (let index = start; index < end; index += 1) marked[index] = true;
      from = at + word.length;
    }
  }

  const segments: TextSegment[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const flag = marked[index] === true;
    const last = segments[segments.length - 1];
    if (last && last.marked === flag) last.text += text[index];
    else segments.push({ text: text[index] ?? '', marked: flag });
  }
  return segments;
}

/**
 * A title the search engine marked up (`Kırmızı <mark>ceket</mark>`) as
 * segments, tags removed. Null when it holds no mark.
 */
export function markedSegments(markup: string | null | undefined): TextSegment[] | null {
  const text = String(markup ?? '');
  if (!/<mark>/i.test(text)) return null;
  const segments: TextSegment[] = [];
  const pattern = /<mark>([\s\S]*?)<\/mark>/gi;
  let cursor = 0;
  let match = pattern.exec(text);
  while (match) {
    if (match.index > cursor) segments.push({ text: stripTags(text.slice(cursor, match.index)), marked: false });
    segments.push({ text: stripTags(match[1] ?? ''), marked: true });
    cursor = match.index + match[0].length;
    match = pattern.exec(text);
  }
  if (cursor < text.length) segments.push({ text: stripTags(text.slice(cursor)), marked: false });
  return segments.filter((segment) => segment.text.length > 0);
}

function stripTags(text: string): string {
  return decodeEntities(text.replace(/<[^>]*>/g, ''));
}
