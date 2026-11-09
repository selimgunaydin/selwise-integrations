/** One place for the demo shop's "fill it in for me" values, so the checkout and the address book agree. */
export const DEMO_ADDRESS = {
  title: 'Ev',
  city: 'İstanbul',
  district: 'Kadıköy',
  line: 'Caferağa Mah. Moda Cad. No: 24 Daire: 5',
  postcode: '34710',
  phone: '+905551234567',
  /** Used only when the shopper has not typed a name yet. */
  firstName: 'Ayşe',
  lastName: 'Demir',
} as const;
