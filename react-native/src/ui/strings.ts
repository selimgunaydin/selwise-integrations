/**
 * The few sentences a surface says on its own — when the merchant wrote none.
 *
 * The campaign's own words are the merchant's, in the viewer's language
 * (`/config` resolves them); these are only what stands in for an unwritten
 * field: a counter with no template, a close button's name. Turkish and English,
 * the two languages the dashboard ships; a language the SDK has no sentence for
 * reads English, the platform's agreed fallback, and an app that has not named a
 * language reads Turkish (the platform's primary market, and what it always said).
 *
 * Plain TypeScript with no `react-native` import.
 */

type Table = Readonly<Record<string, string>>;

const TR: Table = {
  'socialProof.views': '{count} kişi bu ürünü görüntüledi',
  'socialProof.cart': '{count} kişi sepete ekledi',
  'newsletter.subscribe': 'Abone ol',
  close: 'Kapat',
};

const EN: Table = {
  'socialProof.views': '{count} people viewed this product',
  'socialProof.cart': '{count} people added this to their basket',
  'newsletter.subscribe': 'Subscribe',
  close: 'Close',
};

export type StringKey = 'socialProof.views' | 'socialProof.cart' | 'newsletter.subscribe' | 'close';

/** True when sentences should be Turkish: no language named, or a Turkish one. */
export function isTurkishLocale(locale: string | null | undefined): boolean {
  const language = String(locale ?? '').trim().toLowerCase();
  return !language || language === 'tr' || language.startsWith('tr-') || language.startsWith('tr_');
}

export function appString(key: StringKey, locale: string | null | undefined): string {
  return (isTurkishLocale(locale) ? TR : EN)[key] ?? '';
}

/**
 * The language a surface speaks when it speaks for itself (the countdown's unit
 * words, the counters' sentences): the viewer's, else Turkish — the same
 * fallback `isTurkishLocale` applies, so one surface never mixes two languages.
 */
export function appLanguage(locale: string | null | undefined): string {
  return isTurkishLocale(locale) ? 'tr' : String(locale).trim().toLowerCase();
}
