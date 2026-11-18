import type { SelwiseHost } from '../react/host.js';

/**
 * The app's font for a named web font, from `host.fontFamily` — a map keyed by
 * the web font's name (case does not matter) or a function from the name.
 *
 * Plain TypeScript with no `react-native` import, so the pure parts of a card
 * can map a font without a hook.
 */
export function mapHostFont(mapping: SelwiseHost['fontFamily'], named: string): string | undefined {
  if (!mapping || !named) return undefined;
  if (typeof mapping === 'function') return mapping(named) || undefined;
  const wanted = named.toLowerCase();
  const key = Object.keys(mapping).find((name) => name.toLowerCase() === wanted);
  return key ? mapping[key] : undefined;
}

/**
 * `host.fontFamily` as the lookup the style table reads (`fontFamilyMap`: a
 * lower-case unquoted family name to the name the app registered). A function
 * cannot be listed, so it answers on demand.
 */
export function fontFamilyMapOf(mapping: SelwiseHost['fontFamily']): Readonly<Record<string, string>> | undefined {
  if (!mapping) return undefined;
  return new Proxy({} as Record<string, string>, {
    get: (_target, name) => (typeof name === 'string' ? mapHostFont(mapping, name) : undefined),
  });
}
