import { EXPERIMENT_CLIENT_CAPABILITIES, type ExperimentAssignment } from '../core/eligibility.js';
import { CONFIG_PROTOCOL_CURRENT } from '../vendor/dynamic-content.js';
import type { HttpClient } from '../transport/http.js';
import type {
  OrderInput,
  RecommendationContext,
  RecommendationProductsResult,
  RecommendationWidgetSummary,
  SearchOptions,
  SearchResult,
  SelwiseProduct,
} from '../types.js';

/**
 * Thin, typed bindings for the Selwise public API.
 *
 * Which endpoints need the API key is NOT a stylistic choice — it mirrors
 * whether the route declares `PublicSiteGuard` on the server:
 *
 *   guarded   → /config, /recommendations, /recommendations/:id/products,
 *               /search, /search-config, /search/suggestions, /orders
 *   ungated   → /events/batch, /presence, /recommendations/track/*, /search/log,
 *               /search/click, /search/zero-results
 *
 * Keep this comment in step with `apps/api/src/modules/public/controllers/*`:
 * marking a guarded route `unauthenticated` produces a 403 that looks like a
 * bad key, and marking an ungated route authenticated works but sends the key
 * further than it needs to go.
 */
export class Endpoints {
  private readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  /**
   * Batch bootstrap: campaigns, widgets, recommendations, tracking config, `search.enabled`.
   *
   * `p` announces the `/config` protocol this SDK understands. Version 2 fills
   * the cart placeholders (`{cart.total}` in any campaign's words), version 3
   * the product placeholders too (`{product.price}`, from the product the host
   * passes to `getSurfaces`), version 4 the product conditions (`productStock`
   * and the rest in a state's or the targeting's rules); the API withholds a
   * campaign from a client that announces less than it needs, because an
   * older SDK would hand the host the raw braces to print — or drop a rule it
   * does not know and return the campaign more widely than it was targeted.
   */
  getConfig(signal?: AbortSignal): Promise<Record<string, unknown>> {
    return this.http.request({
      path: '/config',
      query: { p: CONFIG_PROTOCOL_CURRENT },
      signal,
    });
  }

  /**
   * Rendered enrichment content for one product, in named slots.
   *
   * `app/enrichments` and not `enrichments`: the app route places by name and
   * returns finished markup, because a React Native package is the wrong place
   * to keep a copy of a CSS sanitizer. See `AppEnrichmentItem` in
   * `@selwise/widget-contract` for the whole argument.
   */
  getEnrichment(
    code: string,
    slots: readonly string[],
    options: { testMode?: boolean } = {},
    signal?: AbortSignal
  ): Promise<Record<string, unknown>> {
    return this.http.request({
      path: '/app/enrichments',
      query: {
        code,
        slots: slots.join(','),
        ...(options.testMode ? { test: '1' } : {}),
      },
      signal,
    });
  }

  /**
   * Scenario deliveries waiting for this shopper.
   *
   * NOT part of `/config`. That response is cached for five minutes PER
   * CHANNEL and handed to every shopper who asks in that window, so one
   * visitor's pending claims in it would be handed to all of them. This is the
   * per-visitor read, and it happens once per foreground rather than once per
   * screen.
   */
  /**
   * `testMode` mirrors the web widget's `&testMode=true`: the server withholds
   * a test-mode run's claims from every visitor who does not say it is testing,
   * so without it a test scenario's on-site step never reached the tester.
   */
  getScenarioInbox(
    visitorId: string,
    signal?: AbortSignal,
    options: { testMode?: boolean } = {},
  ): Promise<Record<string, unknown>> {
    return this.http.request({
      path: '/scenarios/inbox',
      // `p` as on `/config`: a claim whose campaign this SDK cannot draw stays
      // pending on the server instead of being served and closed as missing.
      query: { visitorId, ...(options.testMode ? { testMode: 'true' } : {}), p: CONFIG_PROTOCOL_CURRENT },
      signal,
    });
  }

  /**
   * Report what the host did with each claim.
   *
   * `shown` closes it as delivered; anything else closes it WITH THE REASON,
   * which is what lets the merchant tell "nobody came back" apart from "the
   * frequency cap ate it".
   */
  acknowledgeScenarioDeliveries(
    visitorId: string,
    acknowledgements: ReadonlyArray<{ deliveryId: string; outcome: string }>,
    signal?: AbortSignal
  ): Promise<{ updated?: number }> {
    return this.http.request({
      path: '/scenarios/inbox/ack',
      method: 'POST',
      body: { visitorId, acknowledgements },
      signal,
    });
  }

  /**
   * Recommendation widgets configured for this site.
   *
   * `pageUrl` drives page targeting. A native app has no URL, so pass a stable
   * synthetic one per screen (`app://product`, `app://basket`) and target on
   * that in the dashboard — see the SDK README.
   */
  async getRecommendationWidgets(
    pageUrl?: string,
    signal?: AbortSignal
  ): Promise<RecommendationWidgetSummary[]> {
    const response = await this.http.request<
      RecommendationWidgetSummary[] | { widgets?: RecommendationWidgetSummary[] }
    >({ path: '/recommendations', query: { pageUrl }, signal });

    if (Array.isArray(response)) return response;
    return response?.widgets ?? [];
  }

  /**
   * Products for one widget.
   *
   * This is a POST because it carries visitor context, which means the guard
   * requires the `mobile_write` scope even though it reads. A key with only
   * `mobile_read` returns 403 here and nowhere else — the single most common
   * mobile setup mistake.
   */
  async getRecommendationProducts(
    widgetId: string,
    context: RecommendationContext & {
      sessionId?: string;
      visitorId?: string;
      userId?: string;
      /**
       * The visitor's `config_override` arm on this strip. An id, never a
       * strategy: the API reads the arm's strategy and product count from the
       * stored experiment, and an API that predates it ignores the field.
       */
      experimentVariantId?: string;
    },
    signal?: AbortSignal
  ): Promise<RecommendationProductsResult> {
    const response = await this.http.request<{
      products?: SelwiseProduct[];
      productCard?: Record<string, unknown> | null;
      meta?: Record<string, unknown> | null;
      liveCartRequired?: unknown;
      error?: string;
    }>({
      path: `/recommendations/${encodeURIComponent(widgetId)}/products`,
      method: 'POST',
      body: context,
      // The strip's product titles and URLs in the app's language: a POST,
      // but its answer is text to read.
      localized: true,
      signal,
    });

    return {
      widgetId,
      products: response?.products ?? [],
      productCard: response?.productCard ?? null,
      meta: response?.meta ?? null,
      // Only when the API said so: an older API does not, and "unknown" must
      // not read as "this strip ignores the cart".
      ...(typeof response?.liveCartRequired === 'boolean'
        ? { liveCartRequired: response.liveCartRequired }
        : {}),
    };
  }

  async search(
    query: string,
    options: SearchOptions = {},
    signal?: AbortSignal
  ): Promise<SearchResult> {
    const response = await this.http.request<Record<string, unknown>>({
      path: '/search',
      query: {
        q: query,
        limit: options.limit,
        minPrice: options.minPrice,
        maxPrice: options.maxPrice,
        inStock: options.inStock,
        category: options.category,
        // An app is always a phone: the search answers with its phone settings.
        device: 'mobile',
      },
      signal,
    });

    // The endpoint has carried both `hits` and `products` across versions;
    // normalising here keeps that off every call site.
    const hits =
      (response?.['hits'] as SelwiseProduct[] | undefined) ??
      (response?.['products'] as SelwiseProduct[] | undefined) ??
      [];

    return { ...response, query, hits } as SearchResult;
  }

  getSearchConfig(signal?: AbortSignal): Promise<Record<string, unknown>> {
    return this.http.request({ path: '/search-config', signal });
  }

  getSearchSuggestions(signal?: AbortSignal): Promise<Record<string, unknown>> {
    return this.http.request({ path: '/search/suggestions', query: { device: 'mobile' }, signal });
  }

  /**
   * Identity merge.
   *
   * Without this call the merchant's user id lives only on the device: events
   * and orders carry it, but no `site_users` row is created, so the person
   * never appears in a segment, a customer profile or CLV — which is the whole
   * "same customer as on the web" promise of the mobile SDK.
   *
   * Sends `visitorId` so the server can merge the anonymous history collected
   * before the login into the identified user.
   */
  identifyUser(
    payload: {
      externalId: string;
      visitorId?: string;
      sessionId?: string;
      email?: string;
      traits?: Record<string, unknown>;
      pageUrl?: string;
      /** Signed identity: hex HMAC-SHA256 your backend made with the channel's identity secret. */
      userHash?: string;
      userHashTs?: number;
    },
    signal?: AbortSignal
  ): Promise<{ success: boolean; merged?: boolean; verified?: boolean; error?: string }> {
    return this.http.request({ path: '/users/identify', method: 'POST', body: payload, signal });
  }

  /**
   * Newsletter signup, from a newsletter widget.
   *
   * Guarded, so it carries the api key. `sourcePath` is the synthetic screen
   * url in an app — that is what tells a merchant which surface the signup came
   * from, and there is no referer header to fall back on.
   */
  subscribeNewsletter(
    payload: {
      email: string;
      fullName?: string;
      locale?: string;
      visitorId?: string;
      siteUserId?: string;
      sourcePath?: string;
    },
    signal?: AbortSignal
  ): Promise<{ success?: boolean; status?: string; error?: string }> {
    return this.http.request({ path: '/newsletter', method: 'POST', body: payload, signal });
  }

  /** Order ingest. `orderId` is the idempotency key — re-sending never double-counts. */
  ingestOrder(
    payload: OrderInput & {
      sessionId?: string;
      visitorId?: string;
      siteUserId?: string;
      deviceType?: string;
      metadata?: Record<string, unknown>;
    },
    signal?: AbortSignal
  ): Promise<{ success: boolean; created: boolean; id?: string }> {
    return this.http.request({ path: '/orders', method: 'POST', body: payload, signal });
  }

  /**
   * Segment membership for this visitor.
   *
   * Site-key scoped by QUERY, not by path: it is a cross-site public route
   * (`/public/segments/evaluate?siteKey=…`), unlike everything else here.
   */
  evaluateSegments(
    payload: {
      segmentIds: string[];
      visitorId?: string;
      siteUserId?: string;
      sessionId?: string;
      deviceType?: string;
      pageUrl?: string;
    },
    signal?: AbortSignal
  ): Promise<{ results?: Record<string, boolean> }> {
    return this.http.request({
      path: '/segments/evaluate',
      method: 'POST',
      body: payload,
      absolute: true,
      signal,
    });
  }

  /** A/B assignments for this visitor. Stable per visitor, so fetched once. */
  getExperimentAssignments(
    visitorId: string,
    signal?: AbortSignal
  ): Promise<Record<string, ExperimentAssignment>> {
    return this.http.request({
      path: '/experiments/assign',
      // `holdout`: this SDK drops a held-out surface. The API keeps a client
      // that does not declare it out of every experiment that has a holdout
      // arm — an older SDK would hand the host a surface for a visitor counted
      // as never having seen it.
      //
      // `p`: the `/config` protocol, as on `getConfig`. An arm reaches the SDK
      // here, not through `/config`, so the API checks what an arm's override
      // (or swapped-in campaign) says and checks against it, and keeps an SDK
      // that cannot draw it as written out of that experiment.
      query: { visitorId, capabilities: EXPERIMENT_CLIENT_CAPABILITIES, p: CONFIG_PROTOCOL_CURRENT },
      absolute: true,
      signal,
    });
  }

  /**
   * One experiment event — the SDK sends only `exposure`, the denominator.
   * Ungated on the server (`PublicExperimentsController` has no site guard;
   * it resolves the channel from `siteKey`), so the key is not sent.
   */
  trackExperimentEvent(
    body: { experimentId: string; variantId: string; eventType: 'exposure'; visitorId: string },
    signal?: AbortSignal
  ): Promise<unknown> {
    return this.http.request({
      path: '/experiments/track',
      method: 'POST',
      body,
      absolute: true,
      unauthenticated: true,
      signal,
    });
  }

  // ---- ungated analytics routes ----

  /** The live heartbeat (`POST /presence`): keeps a visitor with recent events live. */
  sendPresence(
    body: {
      consentSnapshot: unknown;
      visitorId?: string;
      sessionId?: string;
    },
    signal?: AbortSignal
  ): Promise<{ accepted?: boolean; live?: boolean; intervalMs?: number } | undefined> {
    return this.http.request({
      path: '/presence',
      method: 'POST',
      body,
      unauthenticated: true,
      signal,
    });
  }

  trackEventsBatch(body: unknown, signal?: AbortSignal): Promise<unknown> {
    return this.http.request({
      path: '/events/batch',
      method: 'POST',
      body,
      unauthenticated: true,
      signal,
    });
  }

  trackRecommendationEvent(body: unknown, signal?: AbortSignal): Promise<unknown> {
    return this.http.request({
      path: '/recommendations/track/event',
      method: 'POST',
      body,
      unauthenticated: true,
      signal,
    });
  }

  logSearch(body: unknown, signal?: AbortSignal): Promise<unknown> {
    return this.http.request({
      path: '/search/log',
      method: 'POST',
      body,
      unauthenticated: true,
      signal,
    });
  }

  trackSearchClick(body: unknown, signal?: AbortSignal): Promise<unknown> {
    return this.http.request({
      path: '/search/click',
      method: 'POST',
      body,
      unauthenticated: true,
      signal,
    });
  }
}
