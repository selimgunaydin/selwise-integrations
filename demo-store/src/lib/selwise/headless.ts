import { selwiseConfig } from './config';
import type { StoreLocale } from './locale';

/**
 * Headless Selwise: the store asks the public API for DATA and draws it with
 * its own templates — no widget rendering.
 *
 * Three calls, three keys, each the narrowest that works:
 *
 * | Call | Key | Why |
 * |---|---|---|
 * | `GET /ssr/recommendations/:widgetId` | `SELWISE_SSR_API_KEY` (`ssr_read`) | Anonymous strip baked into the HTML: cacheable, readable by bots. Writes nothing, so it is NOT measured. |
 * | `GET /recommendations` (list strips) | `SELWISE_SERVER_API_KEY` (`mobile_read`) | Which strips the panel targets at a page. |
 * | `GET /search` | `SELWISE_SERVER_API_KEY` (`mobile_read`) | A results page rendered on the server. |
 *
 * The measured, personal path is the browser's (components/selwise/headless):
 * the products request carries the visitor and goes out from the shopper's
 * device, where consent is decided.
 *
 * Every function here returns `{ ok: false, reason }` instead of throwing: a
 * page must never break because Selwise did not answer — the same rule as the
 * SSR enrichment kit (lib/selwise/ssr.ts).
 */

export type Headless<T> = { ok: true; data: T } | { ok: false; reason: string };

export interface SsrProduct {
  itemCode: string;
  title: string;
  url: string | null;
  imageUrl: string | null;
  price: number;
  originalPrice: number | null;
  discountRate: number | null;
  currency: string;
  brand: string | null;
  inStock: boolean | null;
  cartCode: string | null;
}

export interface SsrRecommendation {
  mode: 'anonymous';
  widget: { id: string; name: string; title: string | null; subtitle: string | null; strategy: string } | null;
  products: SsrProduct[];
  meta: { code: string | null; skipped: string | null; renderedAt: string };
}

export interface RecommendationStrip {
  id: string;
  name?: string;
  title?: string | null;
  strategy: string;
  maxProducts?: number;
  isActive?: boolean;
}

export interface SearchHit {
  id: string;
  itemCode: string;
  title: string;
  price: number;
  originalPrice?: number | null;
  discountRate?: number | null;
  currency: string;
  imageUrl?: string | null;
  url?: string | null;
  brand?: string | null;
  categories?: string | null;
  inStock?: boolean;
}

export interface SearchResult {
  hits: SearchHit[];
  total: number;
  took?: number;
  enabled?: boolean;
  redirect?: string;
  suggestions?: string[];
  expandedQuery?: string[];
}

const TIMEOUT_MS = 2500;

async function getJson<T>(path: string, apiKey: string | undefined, keyName: string, params: Record<string, string | undefined>): Promise<Headless<T>> {
  const cfg = selwiseConfig();
  if (!cfg.siteKey) return { ok: false, reason: 'SELWISE_SITE_KEY tanımlı değil.' };
  if (!apiKey) return { ok: false, reason: `${keyName} tanımlı değil.` };
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  const url = `${cfg.apiUrl}/public/sites/${encodeURIComponent(cfg.siteKey)}${path}${qs.size ? `?${qs}` : ''}`;
  try {
    const res = await fetch(url, {
      headers: { accept: 'application/json', 'x-selwise-api-key': apiKey },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}` };
    return { ok: true, data: (await res.json()) as T };
  } catch (e) {
    return { ok: false, reason: `Selwise'a ulaşılamadı: ${(e as Error).message}` };
  }
}

/** One strip, anonymous, for the server-rendered HTML. `code` is the product a product-context strategy anchors on. */
export function ssrRecommendation(widgetId: string, opts: { code?: string; lang?: StoreLocale } = {}) {
  return getJson<SsrRecommendation>(`/ssr/recommendations/${encodeURIComponent(widgetId)}`, process.env.SELWISE_SSR_API_KEY, 'SELWISE_SSR_API_KEY', {
    code: opts.code,
    lang: opts.lang,
  });
}

/** The strips the panel targets at `pageUrl` (page targeting applied by the server). */
export async function recommendationStrips(pageUrl: string, lang?: StoreLocale): Promise<Headless<RecommendationStrip[]>> {
  const res = await getJson<RecommendationStrip[] | { widgets?: RecommendationStrip[]; recommendations?: RecommendationStrip[] }>(
    '/recommendations',
    process.env.SELWISE_SERVER_API_KEY,
    'SELWISE_SERVER_API_KEY',
    { pageUrl, lang },
  );
  if (!res.ok) return res;
  const body = res.data;
  const list = Array.isArray(body) ? body : body.widgets || body.recommendations || [];
  return { ok: true, data: list };
}

/** Product search, server-side. Check `redirect` first: a redirect rule answers with no hits. */
export function searchProducts(q: string, opts: { limit?: number; lang?: StoreLocale } = {}) {
  return getJson<SearchResult>('/search', process.env.SELWISE_SERVER_API_KEY, 'SELWISE_SERVER_API_KEY', {
    q,
    limit: String(opts.limit ?? 12),
    lang: opts.lang,
  });
}
