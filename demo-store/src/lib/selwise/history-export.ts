/**
 * The store's history in Selwise's import format (Settings → Data Import):
 * NDJSON, one person or one order per line, two datasets — `users` and
 * `orders`, never a third. docs: data-import/preparing-data.
 *
 * Pure mappers, free of the database and of Next, so the export script
 * (scripts/export-selwise-history.ts) and the tests share them.
 *
 * Three rules a merchant's own export must keep too:
 *  - `customerId` is the SAME id the storefront passes to `identify`
 *    (`ardisa-<id>` here) — otherwise the imported history and the live
 *    visitor are two people;
 *  - `placedAt` is the order's own time with its offset; Selwise dates the
 *    order by it, not by the import;
 *  - a cancelled or returned order says so in `status` (English words), or it
 *    is counted as revenue.
 */
import { SELWISE_ORDER_STATUS } from './server';
import { selwiseUserId } from './identity';

export interface StoreUserRow {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  birthday: string | null;
  gender: string | null;
  email_opt_in: number;
  sms_opt_in: number;
  loyalty_points: number;
  created_at: string;
  last_order_at?: string | null;
}

export interface StoreOrderRow {
  number: string;
  user_id: number | null;
  email: string;
  status: string;
  subtotal: number;
  discount_total: number;
  shipping_total: number;
  total: number;
  coupon_code: string | null;
  shipping_method: string;
  payment_method: string;
  items: string;
  created_at: string;
}

interface StoredLine {
  code: string;
  title?: string;
  qty: number;
  price: number;
  lineTotal?: number;
}

/** E.164 for a Turkish mobile typed the local way; anything else is left out rather than guessed. */
export function normalizePhone(phone: string | null): string | undefined {
  if (!phone) return undefined;
  const digits = phone.replace(/\D/g, '');
  if (/^905\d{9}$/.test(digits)) return `+${digits}`;
  if (/^05\d{9}$/.test(digits)) return `+9${digits}`;
  if (/^5\d{9}$/.test(digits)) return `+90${digits}`;
  return undefined;
}

const tier = (points: number) => (points >= 1500 ? 'gold' : points >= 500 ? 'silver' : 'bronze');

export function toImportUser(u: StoreUserRow) {
  const phone = normalizePhone(u.phone);
  // The store keeps the opt-in flag, not the moment it was ticked: the sign-up
  // is the earliest it can have happened, and the form is the evidence.
  const evidence = 'Ardisa üyelik formu, iletişim izni kutusu';
  return {
    customerId: selwiseUserId(u),
    email: u.email,
    ...(phone ? { phone } : {}),
    firstName: u.first_name,
    lastName: u.last_name,
    locale: 'tr',
    firstSeenAt: u.created_at,
    ...(u.last_order_at ? { lastSeenAt: u.last_order_at } : {}),
    traits: {
      loyalty_points: u.loyalty_points,
      loyalty_tier: tier(u.loyalty_points),
      ...(u.birthday ? { birthday: u.birthday } : {}),
      ...(u.gender ? { gender: u.gender } : {}),
      member_since: u.created_at.slice(0, 10),
    },
    consent: {
      email: u.email_opt_in ? { optIn: true, at: u.created_at, source: 'üyelik', evidence } : { optIn: false, at: u.created_at },
      ...(phone ? { sms: u.sms_opt_in ? { optIn: true, at: u.created_at, source: 'üyelik', evidence } : { optIn: false, at: u.created_at } } : {}),
    },
  };
}

/** The store's status in the words Selwise's revenue rule reads; a return request is still a sale. */
export function importStatus(storeStatus: string): string {
  if (storeStatus === 'return_requested') return 'delivered';
  return SELWISE_ORDER_STATUS[storeStatus] ?? storeStatus;
}

export function toImportOrder(o: StoreOrderRow) {
  let lines: StoredLine[] = [];
  try {
    lines = JSON.parse(o.items) as StoredLine[];
  } catch {
    lines = [];
  }
  return {
    orderId: o.number,
    ...(o.user_id ? { customerId: selwiseUserId({ id: o.user_id }) } : { email: o.email }),
    placedAt: o.created_at,
    currency: 'TRY',
    status: importStatus(o.status),
    subtotal: o.subtotal,
    discountTotal: o.discount_total,
    shippingTotal: o.shipping_total,
    total: o.total,
    channel: 'web',
    items: lines.slice(0, 100).map((l) => ({
      productItemCode: l.code,
      ...(l.title ? { name: l.title } : {}),
      quantity: l.qty,
      unitPrice: l.price,
      totalPrice: l.lineTotal ?? Math.round(l.price * l.qty * 100) / 100,
    })),
    metadata: {
      ...(o.coupon_code ? { couponCode: o.coupon_code } : {}),
      shippingMethod: o.shipping_method,
      paymentMethod: o.payment_method,
    },
  };
}

