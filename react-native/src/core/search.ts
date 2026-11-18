import type {
  SearchOpenTrigger,
  SearchOptions,
  SearchResult,
  SearchSuggestionKind,
  SearchSuggestionSections,
  SelwiseProduct,
  SelwiseStorage,
  TrackOptions,
} from '../types.js';
import { primaryTopCategory } from '../vendor/category-list.js';
import type { SearchSettings } from '../vendor/search-settings.js';
import type { ExperimentAssignment } from './eligibility.js';
import {
  readSearchConfig,
  searchArmOverride,
  searchArmPatch,
  searchCardOf,
  searchSettingsOf,
  type SearchConfigDocument,
} from './search-config.js';
import { asRecord, isRecord } from './records.js';
import { categoriesFromHits, foldText } from './search-format.js';
import { RecentSearches } from './search-history.js';

/**
 * The app's search: the channel's settings as this visitor gets them, the
 * empty box's suggestions, the search itself, and the events that say what the
 * visitor did with it.
 *
 * ## Who reports what
 *
 * The app reports through the event batch ONLY. The browser widget also posts
 * `/search/log` and `/search/click`; the API turns an app's `search_query` and
 * `product_click` (entity `search`) events into the same `search_logs` rows, so
 * calling those two routes from here would count every search twice. Consent is
 * judged once, where an event leaves the device (the queue).
 */

/** How long the settings a screen resolved are reused, so a keystroke does not judge audience and arm again. */
const RESOLUTION_TTL_MS = 30_000;
/** How long the popular lists are reused: they change over days, not seconds. */
const SUGGESTIONS_TTL_MS = 60_000;

type Section = SearchSuggestionSections['order'][number];

/** What the search asks of the client it belongs to. */
export interface SearchHost {
  getConfig(): Promise<Record<string, unknown>>;
  getSuggestions(): Promise<Record<string, unknown>>;
  search(query: string, options: SearchOptions, signal?: AbortSignal): Promise<SearchResult>;
  /** Waits until `/config` is read, and says whether search is in test mode there while this client is not. */
  blockedByTestMode(): Promise<boolean>;
  testMode(): boolean;
  /** The app's language: the configuration and the words in it are read in it. */
  locale(): string;
  /** The screen the host is on: the audience and the arm are judged for it. */
  screen(): string;
  /** Is the visitor inside the channel's search audience (segments)? */
  inAudience(mode: 'include' | 'exclude', segmentIds: string[]): Promise<boolean>;
  /** The `search_config` arm this visitor may enter on the screen they are on, judged by the experiment gate. */
  arm(): Promise<ExperimentAssignment | null>;
  /** Reports the exposure of an arm (once per arm; never in test mode, only with consent). */
  expose(assignment: ExperimentAssignment): void;
  track(name: string, options: TrackOptions): void;
  /** May the visitor's past terms be kept on the device (`searchHistory`)? */
  mayKeepHistory(): boolean;
  storage(): SelwiseStorage;
  channelKey(): string;
  log(message: string, detail?: unknown): void;
}

/**
 * - `ready`: search is on for this visitor; `settings` is the document they draw.
 * - `off`: search is off for the channel, outside this visitor's audience, or
 *   held out by an experiment's holdout arm.
 * - `test`: search is in test mode and this client was not started with it.
 * - `unknown`: the configuration could not be read (a network fault). Nothing
 *   is known, so nothing is blocked; it is asked again next time.
 */
export type SearchResolution =
  | {
      state: 'ready';
      settings: SearchSettings;
      arm: ExperimentAssignment | null;
      /** The product card the grid draws a result with (the phone's, else the channel's), or null when the channel has none. */
      card: Record<string, unknown> | null;
    }
  | { state: 'off'; settings: null; arm: ExperimentAssignment | null }
  | { state: 'test' | 'unknown'; settings: null; arm: null };

/** The popular lists, as `/search/suggestions` sends them. */
interface SuggestionsBody {
  popularSearches: string[];
  popularSearchesOn: boolean;
  popularCategories: Array<{ name: string; imageUrl?: string }>;
  popularCategoriesOn: boolean;
  popularProducts: SelwiseProduct[];
  popularProductsOn: boolean;
}

function readSuggestions(body: unknown): SuggestionsBody {
  const root = asRecord(body);
  const section = (key: string) => asRecord(root[key]);
  const items = (key: string): unknown[] => {
    const list = section(key).items;
    return Array.isArray(list) ? list : [];
  };
  const on = (key: string) => section(key).enabled !== false;
  return {
    popularSearches: items('popularSearches').filter((item): item is string => typeof item === 'string' && !!item.trim()),
    popularSearchesOn: on('popularSearches'),
    popularCategories: items('popularCategories').flatMap((item) => {
      const entry = asRecord(item);
      if (typeof entry.name !== 'string' || !entry.name.trim()) return [];
      return [{ name: entry.name, ...(typeof entry.imageUrl === 'string' && entry.imageUrl ? { imageUrl: entry.imageUrl } : {}) }];
    }),
    popularCategoriesOn: on('popularCategories'),
    popularProducts: items('popularProducts').filter(
      (item): item is SelwiseProduct => isRecord(item) && typeof (item as { title?: unknown }).title === 'string'
    ),
    popularProductsOn: on('popularProducts'),
  };
}

/** The query's total matches when the API states it, else the hits returned. */
function resultCount(result: { hits: unknown[]; total?: unknown }): number {
  return typeof result.total === 'number' && Number.isFinite(result.total) ? result.total : result.hits.length;
}

export class SearchService {
  private readonly configs = new Map<string, Promise<SearchConfigDocument | null>>();
  private readonly resolutions = new Map<string, { at: number; value: Promise<SearchResolution> }>();
  private suggestionsCache: { key: string; at: number; value: Promise<SuggestionsBody | null> } | null = null;
  private history: RecentSearches | null = null;

  /** When the search was opened, and what the shopper last searched and found: what `search_close` reports. */
  private session: { openedAt: number; query: string; resultCount: number } | null = null;

  constructor(private readonly host: SearchHost) {}

  /** The settings a screen draws change with the language and the config: ask again. */
  invalidate(): void {
    this.configs.clear();
    this.resolutions.clear();
    this.suggestionsCache = null;
  }

  // ---- settings ----

  private config(): Promise<SearchConfigDocument | null> {
    const key = this.host.locale();
    let pending = this.configs.get(key);
    if (!pending) {
      pending = this.host.getConfig().then(readSearchConfig);
      this.configs.set(key, pending);
      // A failed read is not remembered.
      pending.catch(() => this.configs.delete(key));
    }
    return pending;
  }

  resolve(): Promise<SearchResolution> {
    const key = `${this.host.locale()}|${this.host.screen()}`;
    const cached = this.resolutions.get(key);
    if (cached && Date.now() - cached.at < RESOLUTION_TTL_MS) return cached.value;
    const value = this.judge();
    this.resolutions.set(key, { at: Date.now(), value });
    void value.then((resolution) => {
      // Not known is not an answer: ask again next time.
      if (resolution.state === 'unknown' && this.resolutions.get(key)?.value === value) this.resolutions.delete(key);
    });
    return value;
  }

  private async judge(): Promise<SearchResolution> {
    let document: SearchConfigDocument | null;
    try {
      document = await this.config();
    } catch (error) {
      this.host.log('Search configuration could not be read', error);
      return { state: 'unknown', settings: null, arm: null };
    }
    if (!document) return { state: 'off', settings: null, arm: null };
    if (document.mode === 'test' && !this.host.testMode()) return { state: 'test', settings: null, arm: null };

    if (document.audience.mode !== 'all') {
      const admitted = await this.host.inAudience(document.audience.mode, document.audience.segmentIds);
      if (!admitted) return { state: 'off', settings: null, arm: null };
    }

    const arm = await this.host.arm().catch(() => null);
    // The holdout arm is shown nothing, whichever search the app would draw.
    if (arm?.holdout === true) return { state: 'off', settings: null, arm };
    const patch = arm ? searchArmPatch(searchArmOverride(arm)) : null;
    return { state: 'ready', settings: searchSettingsOf(document, patch), arm, card: searchCardOf(document) };
  }

  // ---- suggestions ----

  private recent(): RecentSearches {
    if (!this.history) {
      this.history = new RecentSearches(
        this.host.storage(),
        `selwise_recent_searches_${this.host.channelKey()}`,
        () => this.host.mayKeepHistory()
      );
    }
    return this.history;
  }

  recentSearches(max: number): Promise<string[]> {
    return this.recent().list(max);
  }

  async removeRecentSearch(term: string): Promise<void> {
    await this.recent().remove(term);
  }

  async clearRecentSearches(): Promise<void> {
    await this.recent().clear();
  }

  private popular(): Promise<SuggestionsBody | null> {
    const key = this.host.locale();
    const cached = this.suggestionsCache;
    if (cached && cached.key === key && Date.now() - cached.at < SUGGESTIONS_TTL_MS) return cached.value;
    const value = this.host
      .getSuggestions()
      .then(readSuggestions)
      .catch((error: unknown) => {
        this.host.log('Search suggestions could not be read', error);
        return null;
      });
    this.suggestionsCache = { key, at: Date.now(), value };
    // A failed read is not remembered: the next time the box is empty it is tried again.
    void value.then((body) => {
      if (!body && this.suggestionsCache?.value === value) this.suggestionsCache = null;
    });
    return value;
  }

  async suggestions(options: { query?: string } = {}): Promise<SearchSuggestionSections> {
    const empty: SearchSuggestionSections = {
      recent: [],
      popularSearches: [],
      popularCategories: [],
      popularProducts: [],
      order: [],
    };
    const resolution = await this.resolve();
    const settings = resolution.settings;
    if (!settings) return empty;
    const config = settings.suggestions;
    const narrow = foldText(options.query ?? '').trim();
    const matching = (terms: string[]) => (narrow ? terms.filter((term) => foldText(term).includes(narrow)) : terms);

    const [recent, popular] = await Promise.all([
      config.recent.enabled ? this.recentSearches(config.recent.max) : Promise.resolve<string[]>([]),
      config.popularSearches.enabled || config.popularCategories.enabled || config.popularProducts.enabled
        ? this.popular()
        : Promise.resolve<SuggestionsBody | null>(null),
    ]);

    const sections: SearchSuggestionSections = {
      recent: matching(recent),
      popularSearches:
        popular && config.popularSearches.enabled && popular.popularSearchesOn
          ? matching(popular.popularSearches).slice(0, config.popularSearches.max)
          : [],
      popularCategories:
        popular && config.popularCategories.enabled && popular.popularCategoriesOn
          ? popular.popularCategories.slice(0, config.popularCategories.max)
          : [],
      popularProducts:
        popular && config.popularProducts.enabled && popular.popularProductsOn
          ? popular.popularProducts.slice(0, config.popularProducts.max)
          : [],
      order: [],
    };
    sections.order = config.order.filter((section: Section) => sections[section].length > 0);
    return sections;
  }

  // ---- searching ----

  async search(query: string, options: SearchOptions = {}, signal?: AbortSignal): Promise<SearchResult> {
    const term = String(query ?? '').trim();
    // Search in TEST MODE is the merchant trying it out: only a client started
    // with `testMode` searches, and its searches are not the shoppers'.
    if (await this.host.blockedByTestMode()) {
      this.host.log('Search is in test mode; only a client initialised with testMode searches');
      return { query, hits: [], total: 0, status: 'test' };
    }
    const resolution = await this.resolve();
    if (resolution.state === 'off' || resolution.state === 'test') {
      return { query, hits: [], total: 0, status: resolution.state };
    }
    const settings = resolution.settings;

    // Neither a term nor a category narrows the request: it is the whole
    // catalogue, which a listing screen is for.
    const narrowed =
      !!options.category?.trim() || options.minPrice !== undefined || options.maxPrice !== undefined || options.inStock !== undefined;
    if (!term && !narrowed) return { query, hits: [], total: 0, offset: options.offset ?? 0, status: 'ready' };

    const offset = Math.max(0, Math.floor(options.offset ?? 0));
    const { refinement, ...request } = options;
    const submit = options.submit === true;
    const raw = await this.host.search(
      term,
      { ...request, submit, limit: options.limit ?? settings?.behavior.maxResults, offset: offset || undefined },
      signal
    );
    // A typed term whose rule matched carries the ordinary results and the
    // rule's address: the address is not the host's to follow (the shopper is
    // still typing), only to know about (`submitRedirect`).
    const { redirect: matched, ...ordinary } = raw;
    const answer: SearchResult =
      submit || typeof matched !== 'string' || !matched.trim() ? raw : { ...ordinary, submitRedirect: matched };

    // A channel with search switched off answers `enabled: false` and no hits.
    // That is not a search that found nothing, so it is neither reported as a
    // zero-result query nor presented as one.
    if (answer.enabled === false) {
      this.host.log('Search is switched off for this channel');
      return { ...answer, hits: [], status: 'off' };
    }
    // An engine that failed did not find nothing either: the caller's error path.
    if (answer.strategy === 'error' || answer.strategy === 'service_unavailable') {
      throw new Error('[Selwise] Search is temporarily unavailable');
    }

    const result: SearchResult = {
      ...answer,
      query,
      offset: typeof answer.offset === 'number' ? answer.offset : offset,
      status: 'ready',
      categories:
        Array.isArray(answer.categories) && answer.categories.length > 0 ? answer.categories : categoriesFromHits(answer.hits),
    };

    if (offset === 0) {
      this.session = this.session ? { ...this.session, query: term, resultCount: resultCount(result) } : null;
    }
    // Reported once per search: the first page of a term the shopper typed. A
    // later page, a category or an order is the same search again, and a
    // browse (no term) is not the shopper's phrasing at all.
    const isNewSearch = !refinement && offset === 0 && !!term && term.length >= (settings?.behavior.minChars ?? 1);
    if (isNewSearch) this.report(term, result);
    // Only a SUBMITTED term enters the history — not every pause of the typing —
    // and not as part of the report: a submission of a term already searched
    // while typing is a refinement, which is not reported again.
    const minChars = settings?.behavior.minChars ?? 1;
    if (submit && offset === 0 && term.length >= minChars && resultCount(result) > 0 && !result.redirect) {
      void this.recent().add(term).catch((error) => this.host.log('Recent search not kept', error));
    }
    return result;
  }

  private report(term: string, result: SearchResult): void {
    const redirect = typeof result.redirect === 'string' ? result.redirect.trim() : '';
    if (redirect) {
      // A redirect is an ANSWER, not a failed search: "kargo" sends the visitor
      // to the shipping page, usually with zero hits. Reported as
      // `search_zero_results` it would fill the merchant's zero-results report
      // with the rules they wrote themselves.
      this.host.track('search_query', {
        entityType: 'search',
        entityId: term,
        metadata: { query: term, resultsCount: resultCount(result), redirect },
      });
      return;
    }
    // A request the API refused (a term past its length cap) found nothing and
    // was not a search either.
    if (result.strategy === 'validation_error') return;

    const count = resultCount(result);
    this.host.track(result.hits.length === 0 ? 'search_zero_results' : 'search_query', {
      entityType: 'search',
      entityId: term,
      // `resultsCount` is the key the search report and the API's search log read.
      metadata: { query: term, resultsCount: count },
    });
  }

  // ---- events ----

  /**
   * The search was opened. The first open of an arm's visitor is its exposure:
   * recorded here, not when the configuration is read — an app that reads the
   * settings and never draws the search has not shown the arm to anybody.
   */
  async open(trigger: SearchOpenTrigger = 'click'): Promise<void> {
    const resolution = await this.resolve();
    if (resolution.arm) this.host.expose(resolution.arm);
    if (resolution.state !== 'ready') return;
    this.session = { openedAt: Date.now(), query: '', resultCount: 0 };
    this.host.track('search_instant_open', { entityType: 'search', metadata: { trigger } });
  }

  close(summary: { query?: string; resultCount?: number } = {}): void {
    const session = this.session;
    if (!session) return;
    this.session = null;
    this.host.track('search_close', {
      entityType: 'search',
      metadata: {
        query: summary.query ?? session.query,
        resultCount: summary.resultCount ?? session.resultCount,
        dwellTimeMs: Math.max(0, Date.now() - session.openedAt),
      },
    });
  }

  suggestionClick(kind: SearchSuggestionKind, value: string | SelwiseProduct): void {
    if (kind === 'popularProduct' && typeof value !== 'string') {
      const code = value.itemCode;
      this.host.track('popular_product_click', {
        entityType: 'search',
        entityId: code,
        productItemCode: code,
        metadata: { productItemCode: code },
      });
      // The tap is also a click out of the search: the one the popular-products
      // list itself is counted from.
      this.click('', code, undefined, primaryTopCategory(value.categories) ?? undefined);
      return;
    }
    const text = typeof value === 'string' ? value : value.title;
    if (kind === 'popularCategory') {
      this.host.track('popular_category_click', { entityType: 'search', metadata: { categoryName: text } });
      return;
    }
    this.host.track(kind === 'recent' ? 'recent_search_click' : 'popular_search_click', {
      entityType: 'search',
      metadata: { query: text },
    });
  }

  click(query: string, itemCode: string, position?: number, category?: string): void {
    this.host.track('product_click', {
      entityType: 'search',
      entityId: query || itemCode,
      productItemCode: itemCode,
      // `query` and `category` are what the API's search log reads off this
      // event: the term the click came from and the category its row counts under.
      metadata: {
        query,
        ...(position === undefined ? {} : { position }),
        ...(category ? { category } : {}),
      },
    });
  }

  addedToCart(
    product: Pick<SelwiseProduct, 'itemCode' | 'title' | 'price' | 'currency'>,
    options: { query?: string; quantity?: number } = {}
  ): void {
    this.host.track('add_to_cart', {
      entityType: 'search',
      entityId: product.itemCode,
      productItemCode: product.itemCode,
      metadata: {
        ...(options.query ? { query: options.query } : {}),
        quantity: options.quantity ?? 1,
        price: product.price,
        currency: product.currency,
        productName: product.title,
      },
    });
  }
}
