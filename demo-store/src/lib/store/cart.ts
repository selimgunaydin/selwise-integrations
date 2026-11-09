import crypto from 'crypto';
import { cookies } from 'next/headers';
import { db, nowIso } from './db';
import { liveProduct } from './products';
import type { User } from './auth';

import { FREE_SHIPPING_THRESHOLD, GIFT_WRAP_PRICE, STANDARD_SHIPPING } from './constants';

export { FREE_SHIPPING_THRESHOLD, GIFT_WRAP_PRICE, STANDARD_SHIPPING };
export const CART_COOKIE = 'ardisa_cart';

export interface Coupon {
  code: string;
  kind: 'percent' | 'amount' | 'shipping';
  value: number;
  min_total: number;
  description: string;
  active: number;
}

export interface CartLine {
  code: string;
  cartCode: string;
  groupCode: string;
  slug: string;
  name: string;
  title: string;
  brand: string;
  category: string;
  categoryPath: string[];
  colorName: string;
  size: string;
  qty: number;
  price: number;
  listPrice: number;
  lineTotal: number;
  maxQty: number;
  image: string;
}

export interface CartView {
  id: string;
  lines: CartLine[];
  itemCount: number;
  subtotal: number;
  listSubtotal: number;
  coupon: { code: string; description: string } | null;
  couponNotice: string | null;
  discount: number;
  freeShipping: boolean;
  shipping: number;
  freeShippingRemaining: number;
  giftWrap: boolean;
  giftWrapTotal: number;
  giftNote: string | null;
  total: number;
}

export function readCartId(): string | null {
  return cookies().get(CART_COOKIE)?.value || null;
}

export function ensureCartId(user?: User | null): string {
  let id = readCartId();
  const exists = id ? db().prepare('SELECT id FROM carts WHERE id = ?').get(id) : null;
  if (!id || !exists) {
    // A signed-in shopper with a basket elsewhere gets it back.
    const own = user
      ? (db().prepare('SELECT id FROM carts WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1').get(user.id) as { id: string } | undefined)
      : undefined;
    id = own?.id || crypto.randomUUID();
    if (!own) db().prepare('INSERT INTO carts (id, user_id, updated_at) VALUES (?, ?, ?)').run(id, user?.id ?? null, nowIso());
    cookies().set(CART_COOKIE, id, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 60, secure: process.env.NODE_ENV === 'production' });
  }
  return id;
}

export function getCoupon(code: string): Coupon | undefined {
  return db().prepare('SELECT * FROM coupons WHERE code = ? AND active = 1').get(code.trim().toUpperCase()) as Coupon | undefined;
}

export function loadCart(id: string | null): CartView {
  const empty: CartView = {
    id: id || '',
    lines: [],
    itemCount: 0,
    subtotal: 0,
    listSubtotal: 0,
    coupon: null,
    couponNotice: null,
    discount: 0,
    freeShipping: false,
    shipping: 0,
    freeShippingRemaining: FREE_SHIPPING_THRESHOLD,
    giftWrap: false,
    giftWrapTotal: 0,
    giftNote: null,
    total: 0,
  };
  if (!id) return empty;
  const cart = db().prepare('SELECT * FROM carts WHERE id = ?').get(id) as
    | { id: string; coupon_code: string | null; gift_wrap: number; gift_note: string | null }
    | undefined;
  if (!cart) return empty;
  const rows = db().prepare('SELECT * FROM cart_items WHERE cart_id = ? ORDER BY added_at').all(id) as Array<{ code: string; size: string; qty: number }>;

  const lines: CartLine[] = [];
  for (const r of rows) {
    const p = liveProduct(r.code);
    if (!p) continue;
    const stock = p.sizes.find((s) => s.label === r.size)?.stock ?? 0;
    lines.push({
      code: p.code,
      cartCode: p.cartCode,
      groupCode: p.groupCode,
      slug: p.slug,
      name: p.name,
      title: p.title,
      brand: p.brand,
      category: p.subcategoryName,
      categoryPath: p.categoryPath,
      colorName: p.colorName,
      size: r.size,
      qty: r.qty,
      price: p.price,
      listPrice: p.listPrice,
      lineTotal: Math.round(p.price * r.qty * 100) / 100,
      maxQty: Math.max(stock, r.qty),
      image: `/img/p/${p.code}/1.svg`,
    });
  }

  const subtotal = round(lines.reduce((s, l) => s + l.lineTotal, 0));
  const listSubtotal = round(lines.reduce((s, l) => s + l.listPrice * l.qty, 0));
  let discount = 0;
  let couponFreeShipping = false;
  let coupon: CartView['coupon'] = null;
  let couponNotice: string | null = null;
  if (cart.coupon_code) {
    const c = getCoupon(cart.coupon_code);
    if (!c) couponNotice = 'Kupon artık geçerli değil.';
    else if (subtotal < c.min_total) couponNotice = `${c.code} kuponu için sepet tutarı en az ${c.min_total.toLocaleString('tr-TR')} TL olmalı.`;
    else {
      coupon = { code: c.code, description: c.description };
      if (c.kind === 'percent') discount = round((subtotal * c.value) / 100);
      else if (c.kind === 'amount') discount = Math.min(subtotal, c.value);
      else couponFreeShipping = true;
    }
  }
  const afterDiscount = subtotal - discount;
  const freeShipping = couponFreeShipping || afterDiscount >= FREE_SHIPPING_THRESHOLD;
  const shipping = lines.length === 0 || freeShipping ? 0 : STANDARD_SHIPPING;
  const giftWrapTotal = cart.gift_wrap ? GIFT_WRAP_PRICE : 0;
  return {
    id,
    lines,
    itemCount: lines.reduce((s, l) => s + l.qty, 0),
    subtotal,
    listSubtotal,
    coupon,
    couponNotice,
    discount,
    freeShipping,
    shipping,
    freeShippingRemaining: Math.max(0, round(FREE_SHIPPING_THRESHOLD - afterDiscount)),
    giftWrap: !!cart.gift_wrap,
    giftWrapTotal,
    giftNote: cart.gift_note,
    total: round(afterDiscount + shipping + giftWrapTotal),
  };
}

const round = (n: number) => Math.round(n * 100) / 100;

function touch(id: string) {
  db().prepare('UPDATE carts SET updated_at = ? WHERE id = ?').run(nowIso(), id);
}

export class CartError extends Error {}

export function addItem(id: string, code: string, size: string, qty: number) {
  const p = liveProduct(code);
  if (!p) throw new CartError('Ürün bulunamadı.');
  const sizeRow = p.sizes.find((s) => s.label === size) || (p.sizes.length === 1 ? p.sizes[0] : undefined);
  if (!sizeRow) throw new CartError('Lütfen beden seçin.');
  const existing = db().prepare('SELECT qty FROM cart_items WHERE cart_id = ? AND code = ? AND size = ?').get(id, code, sizeRow.label) as { qty: number } | undefined;
  const next = (existing?.qty || 0) + qty;
  if (sizeRow.stock <= 0) throw new CartError('Bu ürün şu anda stokta yok.');
  if (next > sizeRow.stock) throw new CartError(`Bu bedenden en fazla ${sizeRow.stock} adet ekleyebilirsiniz.`);
  db()
    .prepare(
      `INSERT INTO cart_items (cart_id, code, size, qty, added_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(cart_id, code, size) DO UPDATE SET qty = excluded.qty`,
    )
    .run(id, code, sizeRow.label, next, nowIso());
  touch(id);
  return { product: p, size: sizeRow.label, qty };
}

export function setQty(id: string, code: string, size: string, qty: number) {
  if (qty <= 0) return removeItem(id, code, size);
  const p = liveProduct(code);
  const stock = p?.sizes.find((s) => s.label === size)?.stock ?? 0;
  if (qty > stock) throw new CartError(`Bu bedenden en fazla ${stock} adet ekleyebilirsiniz.`);
  db().prepare('UPDATE cart_items SET qty = ? WHERE cart_id = ? AND code = ? AND size = ?').run(qty, id, code, size);
  touch(id);
}

export function removeItem(id: string, code: string, size: string) {
  db().prepare('DELETE FROM cart_items WHERE cart_id = ? AND code = ? AND size = ?').run(id, code, size);
  touch(id);
}

export function clearCart(id: string) {
  db().prepare('DELETE FROM cart_items WHERE cart_id = ?').run(id);
  db().prepare('UPDATE carts SET coupon_code = NULL, gift_wrap = 0, gift_note = NULL, updated_at = ? WHERE id = ?').run(nowIso(), id);
}

export function setCoupon(id: string, code: string | null) {
  if (code) {
    const c = getCoupon(code);
    if (!c) throw new CartError('Geçersiz kupon kodu.');
    db().prepare('UPDATE carts SET coupon_code = ? WHERE id = ?').run(c.code, id);
  } else {
    db().prepare('UPDATE carts SET coupon_code = NULL WHERE id = ?').run(id);
  }
  touch(id);
}

export function setGift(id: string, wrap: boolean, note: string | null) {
  db().prepare('UPDATE carts SET gift_wrap = ?, gift_note = ? WHERE id = ?').run(wrap ? 1 : 0, note, id);
  touch(id);
}

/** On sign-in the anonymous basket is folded into the shopper's own. */
export function attachCartToUser(id: string, user: User) {
  const other = db()
    .prepare('SELECT id FROM carts WHERE user_id = ? AND id != ? ORDER BY updated_at DESC LIMIT 1')
    .get(user.id, id) as { id: string } | undefined;
  if (other) {
    const items = db().prepare('SELECT * FROM cart_items WHERE cart_id = ?').all(other.id) as Array<{ code: string; size: string; qty: number; added_at: string }>;
    const upsert = db().prepare(
      `INSERT INTO cart_items (cart_id, code, size, qty, added_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(cart_id, code, size) DO UPDATE SET qty = MAX(qty, excluded.qty)`,
    );
    for (const it of items) upsert.run(id, it.code, it.size, it.qty, it.added_at);
    db().prepare('DELETE FROM carts WHERE id = ?').run(other.id);
  }
  db().prepare('UPDATE carts SET user_id = ?, updated_at = ? WHERE id = ?').run(user.id, nowIso(), id);
}
