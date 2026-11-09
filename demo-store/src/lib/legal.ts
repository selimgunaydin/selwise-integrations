/**
 * The legal pages, in the order the left nav lists them. Slugs are part of
 * the store's URL contract (footer, register form, PDP and checkout link to
 * them) — never rename one. Client-safe.
 */
export const LEGAL_PAGES = [
  { slug: 'kvkk-aydinlatma-metni', title: 'KVKK Aydınlatma Metni' },
  { slug: 'gizlilik-politikasi', title: 'Gizlilik Politikası' },
  { slug: 'cerez-politikasi', title: 'Çerez Politikası' },
  { slug: 'mesafeli-satis-sozlesmesi', title: 'Mesafeli Satış Sözleşmesi' },
  { slug: 'on-bilgilendirme-formu', title: 'Ön Bilgilendirme Formu' },
  { slug: 'uyelik-sozlesmesi', title: 'Üyelik Sözleşmesi' },
  { slug: 'iade-kosullari', title: 'İade ve Değişim Koşulları' },
  { slug: 'teslimat-kosullari', title: 'Teslimat Koşulları' },
] as const;

export type LegalSlug = (typeof LEGAL_PAGES)[number]['slug'];

export function isLegalSlug(slug: string): slug is LegalSlug {
  return LEGAL_PAGES.some((p) => p.slug === slug);
}

export const legalHref = (slug: LegalSlug) => `/sozlesmeler/${slug}`;
