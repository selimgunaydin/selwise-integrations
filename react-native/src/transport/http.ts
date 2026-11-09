import { SelwiseApiError } from '../types.js';

export interface HttpClientOptions {
  apiUrl: string;
  siteKey: string;
  apiKey: string;
  timeoutMs: number;
  clientPlatform: string;
  clientVersion: string;
  debug?: boolean;
  onLog?: (message: string, detail?: unknown) => void;
}

export interface RequestOptions {
  /** Path below `/public/sites/:siteKey`, e.g. `/recommendations`. */
  path: string;
  method?: 'GET' | 'POST';
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  /**
   * Omit `x-selwise-api-key`. Only for the ungated analytics endpoints
   * (`events/batch`, `recommendations/track/*`, `search/log|click|zero-results`),
   * which run without `PublicSiteGuard`.
   */
  unauthenticated?: boolean;
  /**
   * Site-scoped by QUERY rather than by path: `/public/<path>?siteKey=…`.
   *
   * Two public routes are cross-site — segment evaluation and experiment
   * assignment — because a visitor's membership and their arm are resolved
   * against the organization, not a channel. Everything else lives under
   * `/public/sites/:siteKey`.
   */
  absolute?: boolean;
  /**
   * A write whose ANSWER carries the merchant's text (a recommendation
   * strip's products), so it is asked in the app's language like a read.
   */
  localized?: boolean;
  signal?: AbortSignal;
}

/**
 * `fetch` wrapper for the Selwise public API.
 *
 * Two things this must get right and the browser widget does not have to:
 *
 * 1. **No Origin header.** A native `fetch` sends none, so `PublicSiteGuard`
 *    takes the API-key branch. That is by design, but it means a missing or
 *    wrong-scoped key fails every guarded call — hence the explicit
 *    `isAuthError` hint on `SelwiseApiError`.
 * 2. **No `AbortSignal.timeout`.** Hermes does not implement it, so timeouts
 *    are wired manually with `AbortController` + `setTimeout`.
 */
export class HttpClient {
  private readonly options: HttpClientOptions;
  /** The app's language, sent as `?lang=` on every read (see `setLocale`). */
  private locale: string | undefined;

  constructor(options: HttpClientOptions) {
    this.options = options;
  }

  /**
   * The language the merchant's text is read in. Sent with every GET — the
   * reads that return text; a write returns none. The server resolves it to
   * one of the account's languages, so any tag is safe to pass.
   */
  setLocale(locale: string | undefined): void {
    const tag = typeof locale === 'string' ? locale.trim() : '';
    this.locale = tag || undefined;
  }

  getLocale(): string | undefined {
    return this.locale;
  }

  private buildUrl(
    path: string,
    query?: RequestOptions['query'],
    absolute?: boolean
  ): string {
    const base = this.options.apiUrl.replace(/\/+$/, '');
    const suffix = path.startsWith('/') ? path : `/${path}`;
    let url = absolute
      ? `${base}/public${suffix}`
      : `${base}/public/sites/${encodeURIComponent(this.options.siteKey)}${suffix}`;

    // A cross-site route carries the channel in the query string instead.
    if (absolute) {
      query = { siteKey: this.options.siteKey, ...(query ?? {}) };
    }

    if (query) {
      const parts: string[] = [];
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null || value === '') continue;
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
      }
      if (parts.length > 0) {
        url += `?${parts.join('&')}`;
      }
    }

    return url;
  }

  async request<T>(options: RequestOptions): Promise<T> {
    const method = options.method ?? 'GET';
    const query =
      (method === 'GET' || options.localized) && this.locale && options.query?.lang === undefined
        ? { ...(options.query ?? {}), lang: this.locale }
        : options.query;
    const url = this.buildUrl(options.path, query, options.absolute);

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'x-selwise-client-platform': this.options.clientPlatform,
      'x-selwise-client-version': this.options.clientVersion,
    };

    if (!options.unauthenticated) {
      headers['x-selwise-api-key'] = this.options.apiKey;
    }
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);

    // A caller-supplied signal must still cancel the request; there is no
    // `AbortSignal.any` in Hermes, so the two are chained by hand.
    const onExternalAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onExternalAbort);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await safeText(response);
        this.log(`${method} ${options.path} → ${response.status}`, text);
        throw new SelwiseApiError(
          `Selwise API ${method} ${options.path} failed with ${response.status}`,
          response.status,
          options.path,
          text
        );
      }

      // 204 and empty bodies are legitimate for the tracking endpoints.
      const text = await safeText(response);
      if (!text) {
        return undefined as unknown as T;
      }

      try {
        return JSON.parse(text) as T;
      } catch {
        throw new SelwiseApiError(
          `Selwise API ${method} ${options.path} returned a non-JSON body`,
          response.status,
          options.path,
          text.slice(0, 200)
        );
      }
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onExternalAbort);
    }
  }

  private log(message: string, detail?: unknown): void {
    if (!this.options.debug) return;
    this.options.onLog?.(message, detail);
  }
}

async function safeText(response: Response): Promise<string | undefined> {
  try {
    const text = await response.text();
    return text.length > 0 ? text : undefined;
  } catch {
    return undefined;
  }
}
