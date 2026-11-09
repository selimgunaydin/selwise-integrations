/**
 * Catalogue rows as the store sells them right now: the static catalogue with
 * the control panel's price / stock overrides applied.
 *
 * Overrides are how a tester makes the CATALOGUE move — a price drop, a
 * restock, a sell-out — so that Selwise sees it on its next feed sync and the
 * price-drop / back-in-stock / low-in-stock scenarios have something to react
 * to. The feed, the product page and the basket all read through here, so the
 * store never contradicts its own feed.
 */
import { PRODUCTS, getByCode, type Product, type ProductSize } from '../catalog';
import { db, nowIso } from './db';

interface OverrideRow {
  code: string;
  price: number | null;
  list_price: number | null;
  stock: string | null;
  updated_at: string;
}

let cache: { at: number; map: Map<string, OverrideRow> } | null = null;

function overrides(): Map<string, OverrideRow> {
  if (cache && Date.now() - cache.at < 2000) return cache.map;
  const rows = db().prepare('SELECT * FROM overrides').all() as OverrideRow[];
  cache = { at: Date.now(), map: new Map(rows.map((r) => [r.code, r])) };
  return cache.map;
}

export function invalidateOverrides() {
  cache = null;
}

export function applyOverride(p: Product): Product {
  const o = overrides().get(p.code);
  if (!o) return p;
  const listPrice = o.list_price ?? p.listPrice;
  const price = o.price ?? p.price;
  const sizes: ProductSize[] = o.stock ? JSON.parse(o.stock) : p.sizes;
  return {
    ...p,
    price,
    listPrice: Math.max(listPrice, price),
    discountRate: listPrice > price ? Math.round(((listPrice - price) / listPrice) * 100) : 0,
    sizes,
  };
}

export function liveProduct(code: string): Product | undefined {
  const p = getByCode(code);
  return p ? applyOverride(p) : undefined;
}

export function liveProducts(): Product[] {
  const map = overrides();
  if (map.size === 0) return PRODUCTS as Product[];
  return PRODUCTS.map(applyOverride);
}

export const totalStock = (p: Product) => p.sizes.reduce((s, x) => s + x.stock, 0);
export const inStock = (p: Product) => totalStock(p) > 0;

export function setOverride(code: string, patch: { price?: number | null; listPrice?: number | null; sizes?: ProductSize[] | null }) {
  const cur = overrides().get(code);
  db()
    .prepare(
      `INSERT INTO overrides (code, price, list_price, stock, updated_at) VALUES (@code, @price, @list_price, @stock, @at)
       ON CONFLICT(code) DO UPDATE SET price = @price, list_price = @list_price, stock = @stock, updated_at = @at`,
    )
    .run({
      code,
      price: patch.price !== undefined ? patch.price : (cur?.price ?? null),
      list_price: patch.listPrice !== undefined ? patch.listPrice : (cur?.list_price ?? null),
      stock: patch.sizes !== undefined ? (patch.sizes ? JSON.stringify(patch.sizes) : null) : (cur?.stock ?? null),
      at: nowIso(),
    });
  invalidateOverrides();
}

export function clearOverride(code?: string) {
  if (code) db().prepare('DELETE FROM overrides WHERE code = ?').run(code);
  else db().prepare('DELETE FROM overrides').run();
  invalidateOverrides();
}

export function listOverrides(): OverrideRow[] {
  return db().prepare('SELECT * FROM overrides ORDER BY updated_at DESC').all() as OverrideRow[];
}

/** Take stock off a size when an order is placed, so the PDP and feed follow. */
export function decrementStock(code: string, size: string, qty: number) {
  const p = liveProduct(code);
  if (!p) return;
  const sizes = p.sizes.map((s) => (s.label === size ? { ...s, stock: Math.max(0, s.stock - qty) } : s));
  setOverride(code, { sizes });
}
