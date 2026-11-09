/**
 * The expanded catalogue: one row per model × colour.
 *
 * Expansion is deterministic (a seeded RNG keyed on the item code), so codes,
 * prices, stock and dates are identical on every boot and every machine — the
 * feed Selwise syncs never churns unless a test deliberately changes a row
 * through the store's control panel (see `lib/store/overrides`).
 */
import { CATEGORIES, COLORS, SIZE_SCALES, type ColorKey, type ModelDef, type SubcategoryDef } from './data';
import type { TemplateKey } from '../art/templates';

export interface ProductSize {
  label: string;
  stock: number;
}

export interface Product {
  /** item_code = sku: the code every Selwise event, order line and feed row carries. */
  code: string;
  /** Siblings in other colours share it (feed `item_group_id`). */
  groupCode: string;
  /** What the basket accepts (feed `product_id`), deliberately not the item code. */
  cartCode: string;
  slug: string;
  name: string;
  title: string;
  brand: string;
  categorySlug: string;
  categoryName: string;
  subcategorySlug: string;
  subcategoryName: string;
  categoryPath: string[];
  colorKey: ColorKey;
  colorName: string;
  colorHex: string;
  price: number;
  listPrice: number;
  discountRate: number;
  sizes: ProductSize[];
  sizeScale: string;
  material: string;
  spec?: string;
  attrs: Record<string, string>;
  description: string;
  care: string;
  type: TemplateKey;
  pattern?: 'stripe' | 'check' | 'dot';
  gender?: string;
  rating: number;
  reviewCount: number;
  isNew: boolean;
  isBestseller: boolean;
  createdAt: string;
}

export interface Subcategory {
  slug: string;
  name: string;
  parentSlug: string;
  parentName: string;
}

export interface Category {
  slug: string;
  name: string;
  description: string;
  children: Subcategory[];
}

// ------------------------------------------------------------------ helpers

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rng(seed: string) {
  let a = hashString(seed) || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TR_MAP: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', İ: 'i', ö: 'o', ş: 's', ü: 'u', Ç: 'c', Ğ: 'g', Ö: 'o', Ş: 's', Ü: 'u' };

export function normalizeTr(s: string) {
  return s
    .replace(/[çğıİöşüÇĞÖŞÜ]/g, (c) => TR_MAP[c] || c)
    .toLowerCase();
}

export function slugify(s: string) {
  return normalizeTr(s)
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** A price that looks like a shop's: ends in 9 or 49/99. */
function retailRound(n: number) {
  // Rounded UP, so a "%40" sale never prints as 42%.
  if (n < 200) return Math.ceil(n / 10) * 10 - 1;
  if (n < 1000) return Math.ceil(n / 50) * 50 - 1;
  return Math.ceil(n / 100) * 100 - 1;
}

const NOW = Date.UTC(2026, 9, 6); // catalogue "today" — dates are relative to this, never to the wall clock

// ------------------------------------------------------------------ expansion

function describe(model: ModelDef, sub: SubcategoryDef, colorName: string) {
  const parts = [
    `${model.name}, ${colorName.toLocaleLowerCase('tr-TR')} rengiyle. ${sub.copy.lead}`,
    `Malzeme: ${model.material}.`,
  ];
  if (model.spec) parts.push(`Ölçü / içerik: ${model.spec}.`);
  if (sub.sizeScale === 'apparel' || sub.sizeScale === 'denim') {
    parts.push('Manken 1,76 m boyundadır ve S beden giymektedir. Normal kalıptır; kendi bedeninizi seçmenizi öneririz.');
  }
  if (sub.sizeScale === 'shoeM' || sub.sizeScale === 'shoeW') {
    parts.push('Standart kalıptır. Yarım numara giyiyorsanız bir büyük numarayı tercih edin.');
  }
  parts.push('Ardisa tasarım ekibi tarafından tasarlanmış, sorumlu üretim ilkeleriyle üretilmiştir.');
  return parts.join(' ');
}

function buildSizes(scale: keyof typeof SIZE_SCALES, r: () => number, mode: 'normal' | 'low' | 'out'): ProductSize[] {
  const labels = SIZE_SCALES[scale];
  return labels.map((label, i) => {
    if (mode === 'out') return { label, stock: 0 };
    if (mode === 'low') return { label, stock: i === Math.floor(labels.length / 2) ? 1 + Math.floor(r() * 2) : 0 };
    const middle = Math.abs(i - (labels.length - 1) / 2) < labels.length / 4;
    const base = middle ? 8 + r() * 22 : r() * 12;
    // A size is sometimes sold out on its own, which is what a real grid looks like.
    return { label, stock: r() < 0.12 ? 0 : Math.round(base) };
  });
}

function expand() {
  const products: Product[] = [];
  const categories: Category[] = [];
  let groupNo = 1000;
  let row = 0;

  for (const cat of CATEGORIES) {
    const children: Subcategory[] = [];
    for (const sub of cat.children) {
      children.push({ slug: sub.slug, name: sub.name, parentSlug: cat.slug, parentName: cat.name });
      for (const model of sub.models) {
        groupNo += 1;
        const groupCode = `AR${groupNo}`;
        const gr = rng(groupCode);
        const discounted = gr() < 0.3;
        const discountPct = discounted ? [15, 20, 25, 30, 40][Math.floor(gr() * 5)] : 0;
        const onlyOneColourOnSale = discounted && model.colors.length > 1 && gr() < 0.25;
        const ageDays = Math.floor(gr() * 240) + 1;
        const isNewGroup = gr() < 0.16;
        const isBestseller = gr() < 0.14;

        model.colors.forEach((colorKey, ci) => {
          const color = COLORS[colorKey];
          const code = `${groupCode}-${colorKey.toUpperCase()}`;
          const r = rng(code);
          const stockRoll = r();
          const mode = stockRoll < 0.06 ? 'out' : stockRoll < 0.13 ? 'low' : 'normal';
          const sizes = buildSizes(sub.sizeScale, r, mode);
          const pct = onlyOneColourOnSale ? (ci === 0 ? discountPct : 0) : discountPct;
          const listPrice = model.price;
          const price = pct ? retailRound(listPrice * (1 - pct / 100)) : listPrice;
          const created = new Date(NOW - (isNewGroup ? Math.floor(r() * 25) + 1 : ageDays + ci * 3) * 864e5);
          row += 1;
          products.push({
            code,
            groupCode,
            cartCode: String(40000 + row * 3 + 17),
            slug: `${slugify(`${model.name} ${color.name}`)}-${groupNo}`,
            name: model.name,
            title: `${model.name} ${color.name}`,
            brand: sub.brand,
            categorySlug: cat.slug,
            categoryName: cat.name,
            subcategorySlug: sub.slug,
            subcategoryName: sub.name,
            categoryPath: [cat.name, sub.name],
            colorKey,
            colorName: color.name,
            colorHex: color.hex,
            price,
            listPrice,
            discountRate: pct ? Math.round(((listPrice - price) / listPrice) * 100) : 0,
            sizes,
            sizeScale: sub.sizeScale,
            material: model.material,
            spec: model.spec,
            attrs: { malzeme: model.material, ...(model.spec ? { olcu_icerik: model.spec } : {}), ...(model.attrs || {}) },
            description: describe(model, sub, color.name),
            care: sub.copy.care,
            type: model.type,
            pattern: model.pattern,
            gender: sub.gender,
            rating: Math.round((3.7 + r() * 1.3) * 10) / 10,
            reviewCount: Math.floor(r() * r() * 260),
            isNew: isNewGroup,
            isBestseller,
            createdAt: created.toISOString(),
          });
        });
      }
    }
    categories.push({ slug: cat.slug, name: cat.name, description: cat.description, children });
  }
  return { products, categories };
}

const BUILT = expand();

export const PRODUCTS: readonly Product[] = BUILT.products;
export const CATEGORY_TREE: readonly Category[] = BUILT.categories;

const BY_CODE = new Map(PRODUCTS.map((p) => [p.code, p]));
const BY_SLUG = new Map(PRODUCTS.map((p) => [p.slug, p]));
const BY_CART = new Map(PRODUCTS.map((p) => [p.cartCode, p]));
const BY_GROUP = new Map<string, Product[]>();
for (const p of PRODUCTS) {
  const list = BY_GROUP.get(p.groupCode) || [];
  list.push(p);
  BY_GROUP.set(p.groupCode, list);
}

export const getByCode = (code: string) => BY_CODE.get(code);
export const getBySlug = (slug: string) => BY_SLUG.get(slug);
export const getByCartCode = (cartCode: string) => BY_CART.get(cartCode);
export const getSiblings = (p: Product) => BY_GROUP.get(p.groupCode) || [p];

/**
 * The basket code of ONE size of a colour: the colour's own cart code plus the
 * size label (`40020-M`). The feed nests each size under its colour row with
 * this as the option's `variant_id`, so a Selwise card that offers sizes hands
 * the chosen one straight back to `ArdisaCart.add` — a colour row's cart code
 * alone cannot say which size went in the basket.
 */
export const sizeCartCode = (p: Product, label: string) => `${p.cartCode}-${label}`;

/** Anything a basket or a Selwise card hands us: item code, cart code or slug. */
export function resolveProduct(ref: string) {
  return BY_CODE.get(ref) || BY_CART.get(ref) || BY_SLUG.get(ref) || resolveSizeRef(ref)?.product;
}

/** A size's basket code (`sizeCartCode`) back to its product and size label. */
export function resolveSizeRef(ref: string): { product: Product; size: string } | undefined {
  const dash = ref.indexOf('-');
  if (dash <= 0) return undefined;
  const product = BY_CART.get(ref.slice(0, dash));
  const size = ref.slice(dash + 1);
  return product && product.sizes.some((s) => s.label === size) ? { product, size } : undefined;
}

export function findCategory(slug: string): { category: Category; sub?: Subcategory } | null {
  for (const c of CATEGORY_TREE) {
    if (c.slug === slug) return { category: c };
    const sub = c.children.find((s) => s.slug === slug);
    if (sub) return { category: c, sub };
  }
  return null;
}

/** Virtual collections live beside the category tree, under the same /c/ prefix. */
export const COLLECTIONS = {
  'yeni-gelenler': { name: 'Yeni Gelenler', description: 'Son 30 günde koleksiyona eklenen ürünler.' },
  indirim: { name: 'İndirim', description: 'Seçili ürünlerde %40\'a varan indirimler.' },
  'cok-satanlar': { name: 'Çok Satanlar', description: 'Ardisa müşterilerinin en çok tercih ettiği ürünler.' },
} as const;

export type CollectionSlug = keyof typeof COLLECTIONS;

export function isCollection(slug: string): slug is CollectionSlug {
  return slug in COLLECTIONS;
}

export const NOW_ISO = new Date(NOW).toISOString();
