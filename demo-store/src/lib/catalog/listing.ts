/**
 * Listing pages: category, collection and search share one filter/sort/page
 * pipeline, driven entirely by the URL so every state is linkable (and so a
 * Selwise "view all" link or a campaign link can land on a filtered listing).
 */
import type { Product } from './index';
import { COLORS } from './data';
import { normalizeTr } from './index';

export const PAGE_SIZE = 24;

export const SORTS = {
  onerilen: 'Önerilen',
  yeni: 'En Yeniler',
  'fiyat-artan': 'Fiyat (Artan)',
  'fiyat-azalan': 'Fiyat (Azalan)',
  indirim: 'İndirim Oranı',
  puan: 'En Yüksek Puan',
  'cok-satan': 'Çok Satanlar',
} as const;
export type SortKey = keyof typeof SORTS;

export const PRICE_BANDS: Array<{ key: string; label: string; min: number; max: number }> = [
  { key: '0-500', label: '500 TL altı', min: 0, max: 500 },
  { key: '500-1000', label: '500 - 1.000 TL', min: 500, max: 1000 },
  { key: '1000-2000', label: '1.000 - 2.000 TL', min: 1000, max: 2000 },
  { key: '2000-4000', label: '2.000 - 4.000 TL', min: 2000, max: 4000 },
  { key: '4000-', label: '4.000 TL üzeri', min: 4000, max: Infinity },
];

export interface ListingParams {
  q?: string;
  kategori?: string[];
  marka?: string[];
  renk?: string[];
  beden?: string[];
  fiyat?: string[];
  indirimli?: boolean;
  stokta?: boolean;
  sort: SortKey;
  page: number;
}

const arr = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? v.split(',') : []).filter(Boolean);

export function parseParams(sp: Record<string, string | string[] | undefined>): ListingParams {
  const sort = (typeof sp.sirala === 'string' && sp.sirala in SORTS ? sp.sirala : 'onerilen') as SortKey;
  return {
    q: typeof sp.q === 'string' ? sp.q : undefined,
    kategori: arr(sp.kategori),
    marka: arr(sp.marka),
    renk: arr(sp.renk),
    beden: arr(sp.beden),
    fiyat: arr(sp.fiyat),
    indirimli: sp.indirimli === '1',
    stokta: sp.stokta === '1',
    sort,
    page: Math.max(1, Number(sp.sayfa) || 1),
  };
}

const stockOf = (p: Product) => p.sizes.reduce((s, x) => s + x.stock, 0);

/** Token search over the fields a shopper would type: name, colour, category, brand, material. */
export function searchScore(p: Product, q: string): number {
  const tokens = normalizeTr(q).split(/\s+/).filter((t) => t.length > 1);
  if (tokens.length === 0) return 0;
  const hay = {
    title: normalizeTr(p.title),
    cat: normalizeTr(`${p.categoryName} ${p.subcategoryName}`),
    brand: normalizeTr(p.brand),
    rest: normalizeTr(`${p.material} ${p.description} ${p.gender || ''}`),
  };
  let score = 0;
  for (const t of tokens) {
    const stem = t.length > 4 ? t.slice(0, t.length - 1) : t; // "elbiseler" ~ "elbise", crude but enough
    if (hay.title.includes(t) || hay.title.includes(stem)) score += 5;
    else if (hay.cat.includes(t) || hay.cat.includes(stem)) score += 3;
    else if (hay.brand.includes(t)) score += 2;
    else if (hay.rest.includes(t) || hay.rest.includes(stem)) score += 1;
    else return 0; // every token must match somewhere
  }
  return score;
}

export interface Facets {
  kategori: Array<{ key: string; label: string; count: number }>;
  marka: Array<{ key: string; label: string; count: number }>;
  renk: Array<{ key: string; label: string; hex: string; count: number }>;
  beden: Array<{ key: string; label: string; count: number }>;
  fiyat: Array<{ key: string; label: string; count: number }>;
}

function matches(p: Product, f: ListingParams, skip?: keyof Facets) {
  if (skip !== 'kategori' && f.kategori?.length && !f.kategori.includes(p.subcategorySlug)) return false;
  if (skip !== 'marka' && f.marka?.length && !f.marka.includes(p.brand)) return false;
  if (skip !== 'renk' && f.renk?.length && !f.renk.includes(p.colorKey)) return false;
  if (skip !== 'beden' && f.beden?.length && !p.sizes.some((s) => f.beden!.includes(s.label) && s.stock > 0)) return false;
  if (skip !== 'fiyat' && f.fiyat?.length) {
    const ok = f.fiyat.some((k) => {
      const band = PRICE_BANDS.find((b) => b.key === k);
      return band && p.price >= band.min && p.price < band.max;
    });
    if (!ok) return false;
  }
  if (f.indirimli && p.discountRate <= 0) return false;
  if (f.stokta && stockOf(p) <= 0) return false;
  return true;
}

function count<K extends string>(list: Product[], key: (p: Product) => K | K[]) {
  const m = new Map<K, number>();
  for (const p of list) {
    const ks = key(p);
    for (const k of Array.isArray(ks) ? ks : [ks]) m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}

/** One card per model: the colour that matches the filter, else the first in stock. */
function collapseGroups(list: Product[]) {
  const byGroup = new Map<string, Product>();
  for (const p of list) {
    const cur = byGroup.get(p.groupCode);
    if (!cur || (stockOf(cur) === 0 && stockOf(p) > 0)) byGroup.set(p.groupCode, p);
  }
  return list.filter((p) => byGroup.get(p.groupCode) === p);
}

export function runListing(base: Product[], f: ListingParams, scores?: Map<string, number>) {
  const filtered = base.filter((p) => matches(p, f));
  const collapsed = collapseGroups(filtered);

  const sorted = [...collapsed].sort((a, b) => {
    switch (f.sort) {
      case 'yeni':
        return b.createdAt.localeCompare(a.createdAt);
      case 'fiyat-artan':
        return a.price - b.price;
      case 'fiyat-azalan':
        return b.price - a.price;
      case 'indirim':
        return b.discountRate - a.discountRate;
      case 'puan':
        return b.rating - a.rating || b.reviewCount - a.reviewCount;
      case 'cok-satan':
        return Number(b.isBestseller) - Number(a.isBestseller) || b.reviewCount - a.reviewCount;
      default: {
        if (scores) return (scores.get(b.code) || 0) - (scores.get(a.code) || 0);
        // "Recommended": in stock first, then bestsellers and new, then reviews.
        const s = (p: Product) => (stockOf(p) > 0 ? 100 : 0) + (p.isBestseller ? 20 : 0) + (p.isNew ? 10 : 0) + Math.min(p.reviewCount, 200) / 20;
        return s(b) - s(a);
      }
    }
  });

  const facetFor = (k: keyof Facets) => collapseGroups(base.filter((p) => matches(p, f, k)));
  const kat = count(facetFor('kategori'), (p) => p.subcategorySlug);
  const marka = count(facetFor('marka'), (p) => p.brand);
  const renk = count(base.filter((p) => matches(p, f, 'renk')), (p) => p.colorKey);
  const beden = count(facetFor('beden'), (p) => p.sizes.filter((s) => s.stock > 0).map((s) => s.label));
  const fiyat = count(facetFor('fiyat'), (p) => PRICE_BANDS.find((b) => p.price >= b.min && p.price < b.max)?.key || '');

  const names = new Map(base.map((p) => [p.subcategorySlug, p.subcategoryName]));
  const sizeOrder = ['XS', 'S', 'M', 'L', 'XL', '26', '27', '28', '29', '30', '31', '32', '34', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', 'Standart'];
  const facets: Facets = {
    kategori: [...kat].map(([key, c]) => ({ key, label: names.get(key) || key, count: c })),
    marka: [...marka].map(([key, c]) => ({ key, label: key, count: c })).sort((a, b) => a.label.localeCompare(b.label, 'tr')),
    renk: [...renk]
      .map(([key, c]) => ({ key, label: COLORS[key as keyof typeof COLORS]?.name || key, hex: COLORS[key as keyof typeof COLORS]?.hex || '#ccc', count: c }))
      .sort((a, b) => b.count - a.count),
    beden: [...beden]
      .filter(([k]) => k !== 'Standart')
      .map(([key, c]) => ({ key, label: key, count: c }))
      .sort((a, b) => sizeOrder.indexOf(a.key) - sizeOrder.indexOf(b.key)),
    fiyat: PRICE_BANDS.filter((b) => fiyat.get(b.key)).map((b) => ({ key: b.key, label: b.label, count: fiyat.get(b.key) || 0 })),
  };

  const total = sorted.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(f.page, pages);
  return {
    total,
    pages,
    page,
    // "Load more" shows pages 1..N, which is what an infinite list looks like after scrolling.
    items: sorted.slice(0, page * PAGE_SIZE),
    facets,
  };
}

export function toQuery(f: Partial<ListingParams>, patch: Partial<ListingParams>) {
  const next = { ...f, ...patch };
  const sp = new URLSearchParams();
  if (next.q) sp.set('q', next.q);
  for (const k of ['kategori', 'marka', 'renk', 'beden', 'fiyat'] as const) {
    const v = next[k];
    if (v && v.length) sp.set(k, v.join(','));
  }
  if (next.indirimli) sp.set('indirimli', '1');
  if (next.stokta) sp.set('stokta', '1');
  if (next.sort && next.sort !== 'onerilen') sp.set('sirala', next.sort);
  if (next.page && next.page > 1) sp.set('sayfa', String(next.page));
  const s = sp.toString();
  return s ? `?${s}` : '';
}
