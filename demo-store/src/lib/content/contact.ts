/** Shared by the contact form and its API route. Client-safe. */
export const CONTACT_SUBJECTS = [
  'Sipariş',
  'Kargo & Teslimat',
  'İade & Değişim',
  'Ödeme',
  'Ürün bilgisi',
  'Üyelik',
  'Öneri & Şikâyet',
  'Diğer',
] as const;

export type ContactSubject = (typeof CONTACT_SUBJECTS)[number];

/** Everything here is fictional — Ardisa is the Selwise demo store. */
export const COMPANY = {
  legalName: 'Ardisa Mağazacılık A.Ş.',
  address: 'Büyükdere Cad. No: 000, Levent, 34330 Beşiktaş / İstanbul',
  phone: '0850 000 00 00',
  email: 'destek@ardisa.example',
  hours: 'Hafta içi 09:00 – 21:00, hafta sonu 10:00 – 18:00',
  mersis: '0000-0000-0000-0000',
  kep: 'ardisa@hs00.kep.example',
};
