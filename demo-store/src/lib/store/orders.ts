import crypto from 'crypto';
import { db, nowIso } from './db';
import { clearCart, loadCart, type CartLine } from './cart';
import { decrementStock } from './products';
import type { User } from './auth';
import { nextStatus, ORDER_FLOW, STATUS_LABELS, type OrderStatus } from './order-status';

export { nextStatus, ORDER_FLOW, STATUS_LABELS };
export type { OrderStatus };

export interface AddressInput {
  firstName: string;
  lastName: string;
  phone: string;
  city: string;
  district: string;
  line: string;
  postcode?: string;
  title?: string;
}

export const SHIPPING_METHODS = {
  standard: { label: 'Standart Teslimat', eta: '2-4 iş günü', price: null as number | null },
  express: { label: 'Hızlı Teslimat', eta: 'Ertesi iş günü', price: 89.9 },
  store: { label: 'Mağazadan Teslim Al', eta: 'Hazır olunca SMS ile bilgilendirilirsiniz', price: 0 },
} as const;

export const PAYMENT_METHODS = {
  card: { label: 'Kredi / Banka Kartı', fee: 0 },
  transfer: { label: 'Havale / EFT', fee: 0 },
  cod: { label: 'Kapıda Ödeme', fee: 29.9 },
} as const;

export type ShippingMethod = keyof typeof SHIPPING_METHODS;
export type PaymentMethod = keyof typeof PAYMENT_METHODS;

export const INSTALLMENT_RATES: Record<number, number> = { 1: 0, 2: 0, 3: 0, 6: 0.0699, 9: 0.1049, 12: 0.1399 };

export interface OrderLine extends CartLine {}

export interface OrderRow {
  id: number;
  number: string;
  token: string;
  user_id: number | null;
  email: string;
  status: string;
  subtotal: number;
  discount_total: number;
  shipping_total: number;
  payment_fee: number;
  gift_wrap_total: number;
  total: number;
  coupon_code: string | null;
  shipping_method: ShippingMethod;
  payment_method: PaymentMethod;
  installments: number;
  shipping_address: string;
  billing_address: string;
  items: string;
  marketing_email: number;
  marketing_sms: number;
  gift_note: string | null;
  visitor_id: string | null;
  tracking_no: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderView {
  id: number;
  number: string;
  token: string;
  email: string;
  status: OrderStatus;
  statusLabel: string;
  subtotal: number;
  discount: number;
  shipping: number;
  paymentFee: number;
  giftWrap: number;
  total: number;
  coupon: string | null;
  shippingMethod: ShippingMethod;
  paymentMethod: PaymentMethod;
  installments: number;
  shippingAddress: AddressInput & { store?: string };
  billingAddress: AddressInput & { corporate?: { company: string; taxNo: string; taxOffice: string } };
  lines: OrderLine[];
  giftNote: string | null;
  trackingNo: string | null;
  createdAt: string;
  requests: Array<{ kind: string; status: string; reason: string; created_at: string }>;
}

/**
 * Orders move on by themselves, the way a real one would: nobody ships these,
 * so the status is a function of the order's age unless a person changed it.
 */
function effectiveStatus(row: OrderRow): OrderStatus {
  const stored = row.status as OrderStatus;
  if (stored !== 'received') return stored;
  const ageH = (Date.now() - new Date(row.created_at).getTime()) / 36e5;
  if (ageH > 72) return 'delivered';
  if (ageH > 20) return 'shipped';
  if (ageH > 1) return 'preparing';
  return 'received';
}

export function toView(row: OrderRow): OrderView {
  const status = effectiveStatus(row);
  const requests = db()
    .prepare('SELECT kind, status, reason, created_at FROM order_requests WHERE order_id = ? ORDER BY created_at')
    .all(row.id) as OrderView['requests'];
  return {
    id: row.id,
    number: row.number,
    token: row.token,
    email: row.email,
    status,
    statusLabel: STATUS_LABELS[status],
    subtotal: row.subtotal,
    discount: row.discount_total,
    shipping: row.shipping_total,
    paymentFee: row.payment_fee,
    giftWrap: row.gift_wrap_total,
    total: row.total,
    coupon: row.coupon_code,
    shippingMethod: row.shipping_method,
    paymentMethod: row.payment_method,
    installments: row.installments,
    shippingAddress: JSON.parse(row.shipping_address),
    billingAddress: JSON.parse(row.billing_address),
    lines: JSON.parse(row.items),
    giftNote: row.gift_note,
    trackingNo: row.tracking_no,
    createdAt: row.created_at,
    requests,
  };
}

function orderNumber() {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `ARD${ymd}${crypto.randomInt(10000, 99999)}`;
}

export interface PlaceOrderInput {
  cartId: string;
  user: User | null;
  email: string;
  shippingAddress: AddressInput & { store?: string };
  billingAddress: AddressInput & { corporate?: { company: string; taxNo: string; taxOffice: string } };
  shippingMethod: ShippingMethod;
  paymentMethod: PaymentMethod;
  installments: number;
  marketingEmail: boolean;
  marketingSms: boolean;
  /** The Selwise visitor id of the browser that placed it: who a later status event is addressed to when nobody was signed in. */
  visitorId?: string | null;
}

export function quote(cartId: string, shippingMethod: ShippingMethod, paymentMethod: PaymentMethod, installments: number) {
  const cart = loadCart(cartId);
  const method = SHIPPING_METHODS[shippingMethod];
  const shipping = method.price === null ? cart.shipping : cart.freeShipping && shippingMethod !== 'express' ? 0 : method.price;
  const paymentFee = PAYMENT_METHODS[paymentMethod].fee;
  const base = cart.subtotal - cart.discount + shipping + cart.giftWrapTotal + paymentFee;
  const rate = paymentMethod === 'card' ? INSTALLMENT_RATES[installments] ?? 0 : 0;
  const total = Math.round(base * (1 + rate) * 100) / 100;
  return { cart, shipping, paymentFee, total, installmentFee: Math.round(base * rate * 100) / 100 };
}

export function placeOrder(input: PlaceOrderInput): OrderView {
  const { cart, shipping, paymentFee, total } = quote(input.cartId, input.shippingMethod, input.paymentMethod, input.installments);
  if (cart.lines.length === 0) throw new Error('Sepetiniz boş.');
  for (const l of cart.lines) {
    if (l.qty > l.maxQty) throw new Error(`${l.title} (${l.size}) için yeterli stok yok.`);
  }
  const number = orderNumber();
  const token = crypto.randomBytes(16).toString('hex');
  const now = nowIso();
  const status: OrderStatus = input.paymentMethod === 'transfer' ? 'awaiting_payment' : 'received';
  const info = db()
    .prepare(
      `INSERT INTO orders (number, token, user_id, email, status, subtotal, discount_total, shipping_total, payment_fee, gift_wrap_total, total,
        coupon_code, shipping_method, payment_method, installments, shipping_address, billing_address, items, marketing_email, marketing_sms, gift_note, visitor_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      number,
      token,
      input.user?.id ?? null,
      input.email.trim().toLowerCase(),
      status,
      cart.subtotal,
      cart.discount,
      shipping,
      paymentFee,
      cart.giftWrapTotal,
      total,
      cart.coupon?.code ?? null,
      input.shippingMethod,
      input.paymentMethod,
      input.installments,
      JSON.stringify(input.shippingAddress),
      JSON.stringify(input.billingAddress),
      JSON.stringify(cart.lines),
      input.marketingEmail ? 1 : 0,
      input.marketingSms ? 1 : 0,
      cart.giftNote,
      input.visitorId?.slice(0, 80) || null,
      now,
      now,
    );
  logStatus(Number(info.lastInsertRowid), null, status);
  for (const l of cart.lines) decrementStock(l.code, l.size, l.qty);
  if (input.user) {
    db().prepare('UPDATE users SET loyalty_points = loyalty_points + ? WHERE id = ?').run(Math.floor(total / 10), input.user.id);
  }
  clearCart(input.cartId);
  return getOrderById(Number(info.lastInsertRowid))!;
}

export function getOrderById(id: number) {
  const row = db().prepare('SELECT * FROM orders WHERE id = ?').get(id) as OrderRow | undefined;
  return row ? toView(row) : null;
}

export function getOrderByToken(token: string) {
  const row = db().prepare('SELECT * FROM orders WHERE token = ?').get(token) as OrderRow | undefined;
  return row ? toView(row) : null;
}

export function getOrderByNumber(number: string) {
  const row = db().prepare('SELECT * FROM orders WHERE number = ?').get(number.trim().toUpperCase()) as OrderRow | undefined;
  return row ? toView(row) : null;
}

export function listOrders(userId: number) {
  const rows = db().prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC').all(userId) as OrderRow[];
  return rows.map(toView);
}

export function hasPurchased(userId: number, groupCode: string) {
  return listOrders(userId).some((o) => o.lines.some((l) => l.groupCode === groupCode));
}

export function requestCancellation(orderId: number, kind: 'cancel' | 'return', codes: string[], reason: string, note?: string) {
  const order = getOrderById(orderId);
  if (!order) throw new Error('Sipariş bulunamadı.');
  const now = nowIso();
  db()
    .prepare('INSERT INTO order_requests (order_id, kind, items, reason, note, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(orderId, kind, JSON.stringify(codes), reason, note || null, kind === 'cancel' ? 'approved' : 'pending', now);
  db()
    .prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?')
    .run(kind === 'cancel' ? 'cancelled' : 'return_requested', now, orderId);
  logStatus(orderId, order.status, kind === 'cancel' ? 'cancelled' : 'return_requested');
  return getOrderById(orderId)!;
}

/** Marks a transfer order paid; returns its number when it moved, so the caller can tell Selwise. */
export function markPaid(orderId: number): string | null {
  const moved = db().prepare("UPDATE orders SET status = 'received', updated_at = ? WHERE id = ? AND status = 'awaiting_payment'").run(nowIso(), orderId);
  if (!moved.changes) return null;
  logStatus(orderId, 'awaiting_payment', 'received');
  const row = db().prepare('SELECT number FROM orders WHERE id = ?').get(orderId) as { number: string } | undefined;
  return row?.number ?? null;
}

export function logStatus(orderId: number, from: string | null, to: string, eventKey: string | null = null, eventResult: string | null = null) {
  const info = db()
    .prepare('INSERT INTO order_status_log (order_id, from_status, to_status, event_key, event_result, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(orderId, from, to, eventKey, eventResult, nowIso());
  return Number(info.lastInsertRowid);
}

export function recordEventResult(logId: number, eventKey: string, result: string) {
  db().prepare('UPDATE order_status_log SET event_key = ?, event_result = ? WHERE id = ?').run(eventKey, result.slice(0, 300), logId);
}

/**
 * A person moves an order to a status. The stored status is what counts from
 * then on: `effectiveStatus` only ages orders that are still `received`, so
 * an order a person touched is never moved again behind their back.
 *
 * Shipping assigns the tracking number a carrier would have.
 */
export function setStatus(orderId: number, to: OrderStatus) {
  const row = db().prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as OrderRow | undefined;
  if (!row) throw new Error('Sipariş bulunamadı.');
  const from = toView(row).status;
  if (!(to in STATUS_LABELS)) throw new Error('Geçersiz durum.');
  const tracking = to === 'shipped' || to === 'delivered' ? row.tracking_no || `AK${row.number.slice(3)}TR` : row.tracking_no;
  db().prepare('UPDATE orders SET status = ?, tracking_no = ?, updated_at = ? WHERE id = ?').run(to, tracking, nowIso(), orderId);
  const logId = logStatus(orderId, from, to);
  return { order: getOrderById(orderId)!, from, logId };
}

export function statusLog(orderId: number) {
  return db()
    .prepare('SELECT from_status, to_status, event_key, event_result, created_at FROM order_status_log WHERE order_id = ? ORDER BY id')
    .all(orderId) as Array<{ from_status: string | null; to_status: string; event_key: string | null; event_result: string | null; created_at: string }>;
}
