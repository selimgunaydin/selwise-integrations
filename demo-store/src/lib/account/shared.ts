/**
 * Account-area constants that both server pages and client forms read.
 * Nothing in here may import a server-only module (db, cookies).
 */
import type { OrderStatus } from '../store/orders';

export const TR_CITIES = [
  'İstanbul',
  'Ankara',
  'İzmir',
  'Bursa',
  'Antalya',
  'Adana',
  'Konya',
  'Gaziantep',
  'Kocaeli',
  'Mersin',
  'Eskişehir',
  'Kayseri',
  'Samsun',
  'Trabzon',
  'Muğla',
  'Denizli',
  'Aydın',
  'Balıkesir',
  'Bolu',
  'Çanakkale',
  'Diyarbakır',
  'Edirne',
  'Erzurum',
  'Hatay',
  'Isparta',
  'Kahramanmaraş',
  'Malatya',
  'Manisa',
  'Nevşehir',
  'Rize',
  'Sakarya',
  'Sivas',
  'Şanlıurfa',
  'Tekirdağ',
  'Van',
  'Zonguldak',
] as const;

export const REQUEST_REASONS = ['Beden uymadı', 'Beğenmedim', 'Hatalı/kusurlu ürün', 'Yanlış ürün geldi', 'Vazgeçtim', 'Diğer'] as const;
export type RequestReason = (typeof REQUEST_REASONS)[number];

export const GENDERS = ['Kadın', 'Erkek'] as const;

/** A request the shopper can still open, decided by the order's status alone. */
export const CANCELLABLE: readonly OrderStatus[] = ['awaiting_payment', 'received', 'preparing'];
export const RETURNABLE: readonly OrderStatus[] = ['shipped', 'delivered'];

export function requestKindFor(status: OrderStatus): 'cancel' | 'return' | null {
  if (CANCELLABLE.includes(status)) return 'cancel';
  if (RETURNABLE.includes(status)) return 'return';
  return null;
}

export interface LoyaltyTier {
  key: 'bronze' | 'silver' | 'gold';
  label: string;
  /** Points needed for the next tier, null at the top. */
  nextAt: number | null;
  nextLabel: string | null;
  floor: number;
}

/** Same thresholds as the `loyalty_tier` trait sent to Selwise (lib/selwise/client.ts). */
export function loyaltyTier(points: number): LoyaltyTier {
  if (points >= 1500) return { key: 'gold', label: 'Altın', nextAt: null, nextLabel: null, floor: 1500 };
  if (points >= 500) return { key: 'silver', label: 'Gümüş', nextAt: 1500, nextLabel: 'Altın', floor: 500 };
  return { key: 'bronze', label: 'Bronz', nextAt: 500, nextLabel: 'Gümüş', floor: 0 };
}

/** "+905321234567" from whatever a shopper types; null when it is not a Turkish mobile-like number. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 12 && digits.startsWith('90')) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `+9${digits}`;
  if (digits.length === 10) return `+90${digits}`;
  return null;
}

/** "+905321234567" → "0532 123 45 67"; anything else is returned as stored. */
export function formatPhone(p: string | null | undefined): string {
  if (!p) return '';
  const d = p.replace(/\D/g, '');
  const local = d.length === 12 && d.startsWith('90') ? `0${d.slice(2)}` : d;
  return local.length === 11 && local.startsWith('0') ? `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7, 9)} ${local.slice(9)}` : p;
}

/** A cargo tracking number that is stable for an order (nobody really ships these). */
export function cargoTrackingNumber(orderNumber: string) {
  let h = 2166136261;
  for (let i = 0; i < orderNumber.length; i++) {
    h ^= orderNumber.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const digits = String(h >>> 0).padStart(10, '0').slice(0, 10);
  return `ARK${digits}`;
}

export const STATUS_TONE: Record<OrderStatus, string> = {
  awaiting_payment: 'bg-warn/10 text-warn',
  received: 'bg-sand text-ink-soft',
  preparing: 'bg-accent-soft text-accent-deep',
  shipped: 'bg-accent-soft text-accent-deep',
  delivered: 'bg-ok/10 text-ok',
  cancelled: 'bg-sale/10 text-sale',
  return_requested: 'bg-warn/10 text-warn',
  returned: 'bg-sand text-ink-muted',
};
