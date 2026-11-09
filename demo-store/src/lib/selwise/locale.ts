import { cookies } from 'next/headers';

/**
 * The page's language, as Selwise reads it.
 *
 * The widget takes the language from `<html lang>` — not from the browser —
 * and asks for the channel's campaigns, search and recommendations in it: a
 * text the merchant wrote in that language (`{ $i18n }` in the panel) and a
 * product the catalogue's language feed translated come back in it, anything
 * else in the account's default language. Server-side calls say the same with
 * `lang=` (lib/selwise/headless).
 *
 * Ardisa's own pages stay Turkish; the switch (/gelistirici/dil) changes only
 * what Selwise draws, which is exactly the part a merchant has to wire.
 */
export const STORE_LOCALES = ['tr', 'en'] as const;
export type StoreLocale = (typeof STORE_LOCALES)[number];
export const LOCALE_COOKIE = 'ardisa_lang';

export function storeLocale(): StoreLocale {
  const value = cookies().get(LOCALE_COOKIE)?.value;
  return (STORE_LOCALES as readonly string[]).includes(value || '') ? (value as StoreLocale) : 'tr';
}

/** Who draws the cookie banner — see components/selwise/StoreConsentBanner. */
export function consentUiMode(): 'selwise' | 'store' {
  return process.env.SELWISE_CONSENT_UI === 'store' ? 'store' : 'selwise';
}
