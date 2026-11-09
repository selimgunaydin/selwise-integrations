/** The store's languages — shared by the server (lib/selwise/locale) and the language switch. */
export const STORE_LOCALES = ['tr', 'en'] as const;
export type StoreLocale = (typeof STORE_LOCALES)[number];
export const LOCALE_COOKIE = 'ardisa_lang';

export const isStoreLocale = (value: unknown): value is StoreLocale => (STORE_LOCALES as readonly unknown[]).includes(value);
