// Copied verbatim from the Akinon PZ Next kit (akinon/pz-next/selwise-ssr.ts) — the demo
// store runs the same server-side enrichment kit a merchant installs, so the kit is what
// gets tested. Keep it identical: the monorepo's copies check fails if the two drift.
/**
 * Server-side Selwise enrichment for PZ Next (`@akinon/next`).
 *
 * ## What it does
 *
 * Fills a slot you put in your own product page with the content prepared in
 * the Selwise dashboard, ON THE SERVER. The markup arrives in the HTML itself;
 * the widget then recognises it, declines to render it a second time, and takes
 * over only impression and click tracking.
 *
 * ## Why
 *
 * The client-side path is fine for a shopper. It is not fine for a growing
 * share of the clients that read a product page: GPTBot, ClaudeBot,
 * PerplexityBot and every link-preview bot run no JavaScript at all, and Bing
 * and Yandex render unreliably. Enrichment's whole product is readable text on
 * a product page, so the client-only path undercuts the feature itself.
 *
 * ## Install
 *
 * 1. Copy this file into your project (e.g. `src/lib/selwise-ssr.ts`).
 * 2. Set the environment variables — note that NEITHER is `NEXT_PUBLIC_`:
 *
 *        SELWISE_SITE_KEY=...
 *        SELWISE_SSR_API_KEY=swpk_live_...   # dashboard, with the ssr_read scope
 *        # optional
 *        SELWISE_API_URL=https://api.selwise.com/api/v1
 *        SELWISE_SSR_TIMEOUT_MS=400
 *
 * 3. Use it from a server component (or `getServerSideProps`):
 *
 *        const slot = await getSelwiseEnrichment('pdp-below-description', product.sku)
 *        // …
 *        {slot.css ? <style dangerouslySetInnerHTML={{ __html: slot.css }} /> : null}
 *        {slot.html ? <div dangerouslySetInnerHTML={{ __html: slot.html }} /> : null}
 *
 * 4. In the dashboard, give the rule the same "Slot name" and set "Where it
 *    renders" to **Server, with browser fallback**.
 *
 * ## Two rules, both deliberate
 *
 * - **It never throws.** Timeout, network error, 4xx, 5xx, malformed body — all
 *   return empty strings. Your product page must not wait on us and must not
 *   break because of us; the client-side path is already the fallback.
 * - **`dangerouslySetInnerHTML` is correct here, and only here.** The HTML has
 *   already been interpolated, sanitized against the enrichment allowlist and
 *   CSS-scoped by the API — that is the entire reason the endpoint returns
 *   markup instead of a payload. Do not run it through a second sanitizer:
 *   a generic one will strip the `data-selwise-*` attributes the widget needs
 *   to recognise the block, and the content will then be rendered twice.
 *
 * ## Never expose the API key to the browser
 *
 * This call is server-to-server. Do not rename the variable to
 * `NEXT_PUBLIC_SELWISE_SSR_API_KEY`, do not pass it through props, and do not
 * call this from a client component.
 */

const DEFAULT_API_URL = 'https://api.selwise.com/api/v1';

/**
 * Your page does not wait on us. 400ms is many times a healthy round trip and
 * short enough that a shopper cannot perceive it.
 */
const DEFAULT_TIMEOUT_MS = 400;

export interface SelwiseEnrichmentSlot {
  /** Ready to print. Empty when there is no content, or the call failed. */
  html: string;
  /**
   * Scoped CSS for the blocks in `html`. Print it once per page — printing it
   * beside every slot only makes the browser parse the same rules twice.
   */
  css: string;
  /** The rules that rendered. Useful in logs; not needed to print anything. */
  assignmentIds: string[];
}

const EMPTY: SelwiseEnrichmentSlot = { html: '', css: '', assignmentIds: [] };

interface SsrResponse {
  v: string;
  mode: string;
  slots: Record<string, { html: string; assignmentIds: string[] }>;
  css: string;
  meta: { code: string; resolved: boolean; renderedAt: string };
}

function apiUrl(): string {
  return (process.env.SELWISE_API_URL || DEFAULT_API_URL).replace(/\/+$/, '');
}

function timeoutMs(): number {
  const parsed = Number.parseInt(process.env.SELWISE_SSR_TIMEOUT_MS || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

async function fetchSlots(code: string, slots: string[], lang?: string): Promise<SsrResponse | null> {
  const siteKey = process.env.SELWISE_SITE_KEY;
  const apiKey = process.env.SELWISE_SSR_API_KEY;
  if (!siteKey || !apiKey || !code || slots.length === 0) return null;

  const query = new URLSearchParams({ code, slots: slots.join(',') });
  // The page's language (the locale segment of the URL, `<html lang>`). The
  // API answers in the closest language the account has, and in its default
  // when none is sent — so a single-language store passes nothing.
  if (lang) query.set('lang', lang);
  const url = `${apiUrl()}/public/sites/${encodeURIComponent(siteKey)}/ssr/enrichments?${query}`;

  // AbortSignal.timeout rather than a manual race: it aborts the socket too,
  // so a slow response does not keep a connection open behind an already
  // rendered page.
  const signal =
    typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
      ? AbortSignal.timeout(timeoutMs())
      : undefined;

  try {
    const response = await fetch(url, {
      headers: { 'x-selwise-api-key': apiKey, Accept: 'application/json' },
      signal,
      // The API already answers `Cache-Control: public, max-age=60,
      // stale-while-revalidate=600`. Restating it here is what makes Next's
      // own data cache honour it, and it is the reason a busy PDP costs one
      // upstream call a minute rather than one per render.
      next: { revalidate: 60 },
    } as RequestInit & { next?: { revalidate: number } });

    if (!response.ok) return null;
    return (await response.json()) as SsrResponse;
  } catch {
    // Fail open, silently. This runs on every product view, so a warning here
    // would be the loudest line in the log for a condition the page already
    // handled by rendering without us.
    return null;
  }
}

/** One slot. Returns empty strings when there is nothing to print. */
export async function getSelwiseEnrichment(
  slot: string,
  code: string,
  lang?: string,
): Promise<SelwiseEnrichmentSlot> {
  const payload = await fetchSlots(code, [slot], lang);
  const entry = payload?.slots?.[slot];
  if (!payload || !entry?.html) return EMPTY;

  return {
    html: entry.html,
    css: payload.css || '',
    assignmentIds: entry.assignmentIds || [],
  };
}

/**
 * Several slots in ONE request.
 *
 * Prefer this whenever a page has more than one slot: `getSelwiseEnrichment`
 * makes its own call each time, which on a cold cache is three separate waits
 * for the same product.
 *
 * Every requested slot is present in the result; the ones with no content hold
 * empty strings, so the caller writes no conditionals.
 */
export async function getSelwiseEnrichmentSlots(
  code: string,
  slots: string[],
  lang?: string,
): Promise<{ css: string; slots: Record<string, SelwiseEnrichmentSlot> }> {
  const empty = {
    css: '',
    slots: Object.fromEntries(slots.map((slot) => [slot, EMPTY])),
  };

  const payload = await fetchSlots(code, slots, lang);
  if (!payload) return empty;

  return {
    css: payload.css || '',
    slots: Object.fromEntries(
      slots.map((slot) => {
        const entry = payload.slots?.[slot];
        return [
          slot,
          entry?.html
            ? { html: entry.html, css: payload.css || '', assignmentIds: entry.assignmentIds || [] }
            : EMPTY,
        ];
      }),
    ),
  };
}
