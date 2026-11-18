import { Endpoints } from './api/endpoints.js';
import { ConsentManager } from './core/consent.js';
import {
  CONSENT_CHANNEL_CATEGORIES,
  consentCategoryOfEvent,
  type ConsentChannel,
} from './vendor/consent-categories.js';
import { generateId, IdentityManager } from './core/ids.js';
import { messageMedium, readDeepLinkAttribution, type DeepLinkAttribution } from './core/deep-link.js';
import { PushDeviceRegistrar, normalizePushRegistration, pushLinkOf } from './core/push-device.js';
import { readQaLink, type QaOverride } from './core/qa-link.js';
import { isEphemeralStorage, MemoryStorage, SafeStorage } from './core/storage.js';
import {
  DismissalStore,
  normalizePlacement,
  normalizeSurface,
  normalizeSurfaces,
  resolveConflicts,
  resolveSurfaceContent,
  selectSurfaces,
  type Surface,
  type SurfaceFilter,
} from './core/surfaces.js';
import { normalizeProductInput, type ProductInput } from './core/product.js';
import { Emitter, type Unsubscribe } from './core/events.js';
import {
  NO_SCREEN,
  type ProductState,
  type ScreenInfo,
  type ScreenState,
  type SelwiseEvents,
} from './core/state.js';
import { StripService } from './core/strips.js';
import {
  describeNotShown,
  NotShownLedger,
  type NotShownDetail,
  type NotShownInput,
  type NotShownReport,
} from './core/not-shown.js';
import type { AppExplainReason } from './vendor/app-not-shown.js';
import {
  applyScreenSlotArms,
  screenSlotArmAt,
  screenSlotArmsOn,
  slotArmStrip,
  type ScreenSlotArm,
} from './core/screen-slot.js';
import { CartStore, withCartSignals, type CartInput } from './core/cart.js';
import { VisitorSignals } from './core/visitor-signals.js';
import { ProductCountCache, type ProductCountQuestion } from './core/product-counts.js';
import {
  GoalReachedStore,
  HIDDEN_GOAL_BAR_VIEW,
  normalizeGoalReachedDetail,
  type GoalReachedDetail,
} from './core/goal-bar.js';
import {
  normalizeGoalBarContent,
  resolveGoalBar as resolveGoalBarView,
  withProductSignals,
  type DynamicCart,
  type GoalBarView,
} from './vendor/dynamic-content.js';
import { normalizeRemoteConfig, type RemoteConfig } from './core/remote-config.js';
import { AppPresence, isActiveAppState } from './core/presence.js';
import { isInControlGroup } from './vendor/control-group.js';
import type { SearchBehavior, SearchSettings } from './vendor/search-settings.js';
import { SearchService, type SearchResolution } from './core/search.js';
import { SingleFlight } from './core/single-flight.js';
import { evaluatePageTypeTargeting, type BehaviorSnapshot } from './vendor/page-targeting.js';
import {
  ScenarioSeenStore,
  normalizeScenarioInbox,
  type ScenarioInboxAcknowledgement,
  type ScenarioInboxEntry,
} from './core/scenario-inbox.js';
import {
  EnrichmentCache,
  itemsForSlot,
  keepSlotWinners,
  normalizeEnrichment,
  normalizePlacementKeys,
  selectByTestMode,
  EMPTY_ENRICHMENT,
  type EnrichmentItem,
  type EnrichmentResult,
} from './core/enrichment.js';
import {
  deepMerge,
  ExperimentGate,
  FrequencyCapStore,
  heldOutCapKey,
  SegmentGate,
  type ExperimentAssignment,
  type FrequencyCapConfig,
} from './core/eligibility.js';
import { isRecord } from './core/records.js';
import {
  resolveRecommendationArm,
  toResolvedRecommendationWidget,
  controlGroupArm,
  type RecommendationArm,
} from './core/recommendation-arms.js';
import { EventQueue, type QueuedEvent } from './transport/queue.js';
import { HttpClient } from './transport/http.js';
import { appScreenOfUrl } from './vendor/app-surfaces.js';
import {
  SelwiseApiError,
  type ConsentSnapshot,
  type OrderInput,
  type PushPermission,
  type PushPlatform,
  type PushProvider,
  type RecommendationCartContext,
  type RecommendationContext,
  type RecommendationProductsResult,
  type RecommendationWidgetSummary,
  type ResolvedRecommendationWidget,
  type SearchOpenTrigger,
  type SearchOptions,
  type SearchResult,
  type SearchSuggestionKind,
  type SearchSuggestionSections,
  type SelwiseProduct,
  type SelwiseInitOptions,
  type SelwiseStorage,
  type TrackOptions,
} from './types.js';

export const SDK_VERSION = '2.0.0';

/** How many links opened before init() resolves are kept for it. */
const PENDING_DEEP_LINKS_MAX = 5;

const DEFAULT_API_URL = 'https://api.selwise.com/api/v1';

/** The longest `appVersion` / `appLocale` the segment request carries (the server's `APP_ATTRIBUTE_MAX_LENGTH`). */
const APP_FACT_MAX_LENGTH = 32;

/**
 * How many requests one `flush()` may make.
 *
 * A flush drains one batch per screen, so a visitor who moved through many
 * screens offline produces several. The cap keeps a queue that keeps growing
 * from turning a single flush into an unbounded loop; whatever is left goes
 * out on the next one.
 */
const MAX_FLUSH_ROUNDS = 20;
const DEFAULT_BATCH_SIZE = 20;
/** Server hard cap; see EVENT_BATCH_MAX_HARD in the ingest DTO. */
const MAX_BATCH_SIZE = 200;
const DEFAULT_FLUSH_INTERVAL_MS = 5000;
const DEFAULT_TIMEOUT_MS = 10000;
/** How long collected scenario claims are kept before the inbox is asked again. */
const SCENARIO_CLAIMS_TTL_MS = 60_000;
/**
 * How old the read `/config` may get before a return to the foreground or a new
 * screen reads it again — the server keeps its answer for the same five minutes,
 * so asking sooner would only get the same list back.
 */
export const CONFIG_REFRESH_AFTER_MS = 5 * 60_000;
/** After a failed re-read, how long until the next trigger may try again. */
const CONFIG_RETRY_AFTER_MS = 30_000;
/** How many distinct screens and points one session reports: what the API keeps (`CHANNEL_INTEGRATION_MAX_ENTRIES`). */
const INTEGRATION_NAMES_MAX = 64;

/** The scenario provenance an impression, click or close carries (the browser widget's keys). */
function scenarioMetadata(scenario: Surface['scenario']): Record<string, string> {
  return scenario
    ? { scenarioId: scenario.scenarioId, scenarioRunId: scenario.runId, scenarioNodeId: scenario.nodeId }
    : {};
}

/** A scenario claim turned into a surface a host can draw. */
export interface ScenarioSurface {
  deliveryId: string;
  surface: Surface;
}
/** How long a new screen or point waits for company before the dashboard is told. */
const INTEGRATION_REPORT_DELAY_MS = 3000;
const DEFAULT_MAX_QUEUE_SIZE = 500;

/**
 * Selwise client for React Native.
 *
 * One instance per app. `init()` resolves identity and replays anything the
 * previous launch left queued; everything after that is safe to call from
 * render paths — `track()` never awaits the network.
 *
 * ```ts
 * import AsyncStorage from '@react-native-async-storage/async-storage';
 * import { Selwise } from '@selwise/react-native';
 *
 * export const selwise = new Selwise();
 * await selwise.init({ channelKey: '...', apiKey: '...', storage: AsyncStorage });
 * ```
 */
export class Selwise {
  /**
   * The RESOLVED options. `siteKey` here is always populated — `init()` folds
   * `channelKey` and `siteKey` into this one field, so no caller downstream has
   * to know both spellings exist.
   */
  private options!: Required<
    Pick<
      SelwiseInitOptions,
      'apiKey' | 'apiUrl' | 'batchSize' | 'flushIntervalMs' | 'timeoutMs' | 'maxQueueSize' | 'clientPlatform' | 'clientVersion'
    >
  > & { siteKey: string; debug: boolean; pluginVersion?: string; appVersion?: string; platform?: 'ios' | 'android' };

  private storage: SelwiseStorage = new MemoryStorage();
  private dismissals!: DismissalStore;
  private segments!: SegmentGate;
  private experiments!: ExperimentGate;
  private caps!: FrequencyCapStore;
  private goalReached!: GoalReachedStore;
  /** The clock and session signals the SDK fills itself (`core/visitor-signals.ts`). */
  private visitor!: VisitorSignals;
  /**
   * The basket the host reported. Memory only, and usable before `init()`: a
   * host's basket subscription may fire first, and a stale cart from a previous
   * launch must never read as measured (see `core/cart.ts`).
   */
  private readonly cart = new CartStore((error) => this.log('Cart listener failed', error));
  private surfaces: Surface[] | null = null;
  private remote: RemoteConfig | null = null;
  private enrichmentCache!: EnrichmentCache;
  /**
   * Claims this install has already drawn.
   *
   * In memory only, deliberately. Persisting it would turn a reminder the
   * shopper never actually saw — app killed during the draw — into one they
   * can never be shown again, and the server already bounds repetition with
   * the claim's TTL.
   */
  private readonly scenarioSeen = new ScenarioSeenStore();
  private configPromise: Promise<Record<string, unknown> | null> | null = null;
  /** When `/config` was last read (0: not yet), and what it said — a re-read is judged against it. */
  private configLoadedAt = 0;
  private configSignature = '';
  private configVersion = 0;
  private readonly configRefresh = new SingleFlight<'config', void>();
  /** The option keys the host passed explicitly. Those never lose to /config. */
  private explicitOptions = new Set<string>();
  private testMode = false;
  // What the dashboard has not been told yet: screens shown and named points
  // mounted since the last report. See `noteIntegration`.
  private pendingScreens = new Set<string>();
  private pendingSlots = new Set<string>();
  private reportedScreens = new Set<string>();
  private reportedSlots = new Set<string>();
  private integrationTimer: ReturnType<typeof setTimeout> | null = null;
  private integrationReportingOn = true;
  /** `qaLinks: true` — a link may put this session in test mode and force arms. */
  private qaLinksOn = false;
  /** experimentId → variantId, forced by a QA link for this session. */
  private qaVariants: Record<string, string> = {};
  /** Claims collected from the scenario inbox, kept briefly so each SCREEN can judge them without a request. */
  private scenarioClaims: { at: number; entries: ScenarioInboxEntry[] } | null = null;
  /** The inbox request in flight, shared by every caller that arrives meanwhile. */
  private scenarioInboxPending: Promise<ScenarioInboxEntry[]> | null = null;
  private searchService: SearchService | null = null;
  /**
   * Experiment arms this process has already reported an exposure for. The
   * server's primary key counts a visitor once whatever is sent; this only
   * saves a request per screen.
   */
  private readonly exposedArms = new Set<string>();
  private identity!: IdentityManager;
  private consent!: ConsentManager;
  /** An `identify()` the consent answer did not yet allow; `setConsent()` sends it. */
  private identifyAwaitingConsent: {
    siteUserId: string;
    traits?: Record<string, unknown>;
    options?: { userHash?: string; userHashTs?: number };
  } | null = null;
  private queue!: EventQueue;
  private http!: HttpClient;
  private endpointsApi!: Endpoints;

  /** The OS's notification permission as the host reported it (`setPushPermission`). */
  private pushPermission: PushPermission | undefined;
  /** The phone's registration for app push (`registerPushToken`); built once `init()` has resolved. */
  private pushDevices: PushDeviceRegistrar | null = null;

  private initialized = false;
  private destroyed = false;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  /** The live heartbeat (`core/presence.ts`); configured by `/config`. */
  private presence: AppPresence | null = null;
  private flushInFlight: Promise<void> | null = null;
  private currentPageUrl: string | undefined;
  /** The screen the host named, with its page type — what `on('screen')` reports. */
  private screenState: ScreenState = NO_SCREEN;
  /** The product on the current product screen, and the key that says whether it changed. */
  private productState: { product: ProductState; key: string } = { product: null, key: 'null' };
  /** The social-proof counters' numbers (`getProductCount`). */
  private productCounts: ProductCountCache | null = null;
  private readonly emitter = new Emitter<SelwiseEvents>((event, error) =>
    this.log(`A listener of "${event}" failed`, error)
  );
  private stripService: StripService | null = null;
  /**
   * Why each campaign and strip the API sent is not on the current screen
   * (`explain()`). Written by the code that decides, never read to decide.
   */
  private readonly notShown = new NotShownLedger((report) => this.log(describeNotShown(report)));
  /**
   * Deep-link landings already recorded in the CURRENT session (`trackDeepLink`).
   * A new session starts an empty set, so the set never outgrows one session.
   */
  private readonly recordedLandings = new Set<string>();
  private recordedLandingsSession: string | null = null;
  /** Links handed over before init() resolved, recorded when it does. */
  private readonly pendingDeepLinks: string[] = [];

  /** Typed access to the raw endpoints, for calls the convenience methods do not cover. */
  get endpoints(): Endpoints {
    this.assertReady();
    return this.endpointsApi;
  }

  get isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Whether the host started this client with `debug: true`, which is what draws
   * the on-device diagnostics button (`SelwiseDebugOverlay`). Only an explicit
   * `true` counts: the dashboard may switch the SDK's log on remotely for a
   * merchant chasing a problem, but never puts a button on a visitor's screen.
   */
  get debugOverlayEnabled(): boolean {
    return this.explicitOptions.has('debug') && this.options?.debug === true;
  }

  async init(options: SelwiseInitOptions): Promise<void> {
    if (this.initialized) {
      this.log('init() called twice; ignoring the second call');
      return;
    }
    // `channelKey` is the dashboard's name for this value; `siteKey` is the
    // published one and stays supported forever. Either is accepted, the new
    // name wins when both are given.
    const channelKey = options?.channelKey ?? options?.siteKey;
    if (!channelKey) {
      throw new Error('[Selwise] init() requires a channelKey (or siteKey)');
    }
    if (!options.apiKey) {
      throw new Error(
        '[Selwise] init() requires an apiKey. A native fetch sends no Origin, so the API ' +
          'authenticates app-channel requests by key — and an app channel has no domain to ' +
          'validate an Origin against, so the key is the ONLY credential. Create one under ' +
          'Channels → the channel card → API keys, with BOTH mobile_read and mobile_write ' +
          'scopes (the recommendation products endpoint is a POST, so a read-only key is ' +
          'rejected there).'
      );
    }

    // Which knobs the host stated. An explicitly passed option beats the
    // dashboard: the host knows things the dashboard cannot (that this is a
    // release build, that its storage is ephemeral).
    this.explicitOptions = new Set(
      (['batchSize', 'flushIntervalMs', 'maxQueueSize', 'debug'] as const).filter(
        (key) => options[key] !== undefined
      )
    );

    const requestedBatchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;

    this.options = {
      siteKey: channelKey,
      apiKey: options.apiKey,
      apiUrl: (options.apiUrl ?? DEFAULT_API_URL).replace(/\/+$/, ''),
      batchSize: Math.min(Math.max(1, requestedBatchSize), MAX_BATCH_SIZE),
      flushIntervalMs: options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS,
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxQueueSize: options.maxQueueSize ?? DEFAULT_MAX_QUEUE_SIZE,
      clientPlatform: options.clientPlatform ?? 'react-native',
      clientVersion: options.clientVersion ?? SDK_VERSION,
      debug: options.debug === true,
      ...(options.pluginVersion ? { pluginVersion: options.pluginVersion } : {}),
      ...(options.appVersion ? { appVersion: options.appVersion } : {}),
      ...(options.platform === 'ios' || options.platform === 'android' ? { platform: options.platform } : {}),
    };

    if (requestedBatchSize > MAX_BATCH_SIZE) {
      this.log(`batchSize ${requestedBatchSize} exceeds the server cap; clamped to ${MAX_BATCH_SIZE}`);
    }

    this.storage = new SafeStorage(options.storage ?? new MemoryStorage(), (error) =>
      this.log('Storage error', error)
    );

    if (isEphemeralStorage(this.storage)) {
      this.log(
        'No storage passed to init(): visitor id, session and the offline queue are ' +
          'in-memory only. Pass AsyncStorage for returning-visitor recommendations.'
      );
    }

    this.identity = new IdentityManager(this.storage);
    this.consent = new ConsentManager(this.storage, options.consent);
    this.dismissals = new DismissalStore(this.storage, () => this.identity.getSessionId());
    this.caps = new FrequencyCapStore(this.storage);
    this.goalReached = new GoalReachedStore(this.storage);
    // On the device only while the visitor's answer allows measuring them.
    this.visitor = new VisitorSignals(
      this.storage,
      () => this.identity.getSessionId(),
      () => this.consent.hasCategory('analytics')
    );
    this.enrichmentCache = new EnrichmentCache();
    this.experiments = new ExperimentGate();
    this.segments = new SegmentGate(async (segmentIds, context) => {
      // Reading the visitor's segments is personalization: without that
      // consent they are in no segment, and their ids are not sent.
      if (!this.consentAllows('personalization')) return {};
      const siteUserId = this.identity.getSiteUserId();
      const pageUrl = context?.pageUrl ?? this.currentPageUrl;
      const response = await this.endpointsApi.evaluateSegments({
        segmentIds,
        visitorId: this.identity.getVisitorId(),
        ...(siteUserId ? { siteUserId } : {}),
        sessionId: this.identity.getSessionId(),
        // 'mobile', not 'mobile_app': the route validates this with
        // @IsIn(['desktop','mobile','tablet']) and rejects the WHOLE body
        // otherwise, which the include-mode gate then reads as "member of
        // nothing" — every segment-targeted surface silently hidden.
        deviceType: 'mobile',
        ...(pageUrl ? { pageUrl } : {}),
        // What an app segment (platform, release, push permission, opened
        // screens) is judged on. This request already waits on the
        // personalization answer, and the screen history was written only
        // with the analytics one (`VisitorSignals`).
        ...this.appFacts(),
        screenDaysAgo: this.visitor.screenDaysAgo(),
      });
      return response?.results ?? {};
    }, undefined, undefined, () => this.identity.getSiteUserId() || undefined);
    this.testMode = options.testMode === true;
    this.integrationReportingOn = options.reportIntegration !== false;
    this.qaLinksOn = options.qaLinks === true;
    this.queue = new EventQueue({
      storage: this.storage,
      maxQueueSize: this.options.maxQueueSize,
      onLog: (message, detail) => this.log(message, detail),
    });

    this.http = new HttpClient({
      apiUrl: this.options.apiUrl,
      siteKey: this.options.siteKey,
      apiKey: this.options.apiKey,
      timeoutMs: this.options.timeoutMs,
      clientPlatform: this.options.clientPlatform,
      clientVersion: this.options.clientVersion,
      debug: this.options.debug,
      onLog: (message, detail) => this.log(message, detail),
    });
    this.http.setLocale(options.locale);
    this.endpointsApi = new Endpoints(this.http);
    this.presence = new AppPresence({
      allowed: () => this.consent.isGranted() && this.consentAllows('presence'),
      send: async () => {
        try {
          const answer = await this.endpointsApi.sendPresence({
            consentSnapshot: this.consent.get(),
            visitorId: this.identity.getVisitorId(),
            sessionId: this.identity.getSessionId(),
          });
          return { status: 200, intervalMs: answer?.intervalMs, live: answer?.live };
        } catch (error) {
          if (error instanceof SelwiseApiError) return { status: error.status };
          throw error;
        }
      },
    });

    await Promise.all([
      this.identity.ready(),
      this.consent.hydrate(options.consent !== undefined),
      this.queue.hydrate(),
      this.dismissals.hydrate(),
      this.caps.hydrate(),
      this.goalReached.hydrate(),
      this.visitor.hydrate(),
    ]);

    if (options.siteUserId) {
      await this.identity.setSiteUserId(options.siteUserId);
    }

    this.initialized = true;
    this.destroyed = false;
    // After consent and identity are hydrated and `ready` is true: the stored
    // token's restore may revoke at once when consent was withdrawn.
    this.pushDevices = new PushDeviceRegistrar({
      storage: () => this.storage,
      register: (body) => this.endpointsApi.registerPushDevice(body),
      revoke: (body) => this.endpointsApi.revokePushDevice(body),
      ready: () => this.initialized && !this.destroyed,
      visitorId: () => this.identity.getVisitorId(),
      siteUserId: () => this.identity.getSiteUserId() ?? null,
      permission: () => this.pushPermission,
      appVersion: () => this.appFacts().appVersion,
      locale: () => this.appFacts().appLocale,
      defaultPlatform: () => this.options.platform,
      consentAllows: () => this.consentAllows('pushDevice'),
      log: (message, detail) => this.log(message, detail),
    });
    this.startFlushTimer();
    // A screen the host named before `init()` resolved is a screen shown: say so
    // now that there is somewhere to say it.
    if (this.currentPageUrl) this.noteIntegration('screen', this.currentPageUrl);
    // The first report is the versions alone: it tells the dashboard the app is
    // there before the shopper has opened a single screen.
    this.scheduleIntegrationReport();

    this.log(
      `Initialised (channel ${this.options.siteKey}, ${this.queue.size()} queued event(s))`
    );

    // The link that cold-started the app usually arrives before init()
    // resolves (`Linking.getInitialURL()` beside it); it was kept, and is the
    // one a push or an e-mail is credited by.
    for (const url of this.pendingDeepLinks.splice(0)) this.trackDeepLink(url);

    // Replay whatever the previous launch could not send. Not awaited: init()
    // must not block the first screen on a network round-trip.
    if (this.queue.size() > 0) {
      void this.flush();
    }

    // Everything that drew nothing while it waited for the client draws now.
    this.emitter.emit('ready', true);

    // `/config` carries the dashboard's tracking settings and the server's geo
    // lookup, both of which have to be in effect before the first flush and the
    // first targeting decision. Started here and NOT awaited: the settings are
    // an improvement on working defaults, not a precondition, and awaiting them
    // would put a request in front of the first screen.
    void this.loadRemoteConfig();
  }

  /**
   * Stops the timer and persists the queue. Call from an app-state listener when
   * the app backgrounds, or on teardown in tests.
   */
  async destroy(): Promise<void> {
    if (!this.initialized) return;
    this.destroyed = true;
    this.productCounts = null;
    this.notShown.reset();
    this.stopFlushTimer();
    if (this.integrationTimer) {
      clearTimeout(this.integrationTimer);
      this.integrationTimer = null;
    }
    this.presence?.stop();
    await this.flush().catch(() => undefined);
    await this.queue.flushWrites();
    await this.visitor.flush().catch(() => undefined);
    this.initialized = false;
    this.emitter.emit('ready', false);
  }

  // ---- identity & consent ----

  /** Associates subsequent events with a logged-in merchant user id. */
  /**
   * `options.userHash` / `options.userHashTs` are the signed-identity proof:
   * HMAC-SHA256 of `siteUserId` (or of `siteUserId:userHashTs`) computed by
   * YOUR backend with the channel's identity secret and handed to the app at
   * sign-in. The secret never goes into the app.
   */
  async identify(
    siteUserId: string,
    traits?: Record<string, unknown>,
    options?: { userHash?: string; userHashTs?: number },
  ): Promise<void> {
    this.assertReady();
    const previousId = this.identity.getSiteUserId();
    await this.identity.setSiteUserId(siteUserId);
    // `setSiteUserId` normalises (a literal 'false' or an empty id is no id),
    // so "changed" is read back from the store, not from the argument.
    const currentId = this.identity.getSiteUserId();
    const changed = currentId !== null && currentId !== previousId;

    // Then tell the server, so the anonymous history collected before the
    // login is merged into the identified user and a `site_users` row exists.
    // Setting the id locally is not enough: events and orders would carry the
    // id while the person appeared in no segment and on no customer profile.
    //
    // `traits` are passed through rather than typed field by field: what a
    // merchant knows about their customer is theirs to decide, and `email` is
    // lifted out only because the server has a column for it.
    //
    // A phone number is lifted out for the same reason, and is NOT sent: the
    // identify route has no door for one (a trait would store it in clear text,
    // readable by every segment and export). A number reaches Selwise as a
    // consent decision — the order's `marketingConsent`, the newsletter form.
    const { email, phone, ...rest } = traits ?? {};
    const appTraits = this.appFacts();
    const sentTraits = { ...rest, ...appTraits };

    // Joining the device to the merchant's customer is processing the
    // visitor's data (`CONSENT_CHANNEL_CATEGORIES.identify`). Without that
    // consent the id stays local — events keep carrying it only if THEIR
    // category is allowed — and `setConsent()` sends it once allowed.
    if (!this.consentAllows('identify')) {
      this.identifyAwaitingConsent = { siteUserId, traits, options };
      this.log('Identify held: consent does not allow it');
      return;
    }
    this.identifyAwaitingConsent = null;

    let merged = false;
    try {
      const result = await this.endpointsApi.identifyUser({
        externalId: siteUserId,
        visitorId: this.identity.getVisitorId(),
        sessionId: this.identity.getSessionId(),
        ...(typeof email === 'string' && email ? { email } : {}),
        // The app's own facts ride with the login so a segment's MEMBERS —
        // which have no request to read them from — can be judged on them.
        ...(Object.keys(sentTraits).length > 0 ? { traits: sentTraits } : {}),
        ...(this.currentPageUrl ? { pageUrl: this.currentPageUrl } : {}),
        ...(options?.userHash && /^[0-9a-f]{64}$/i.test(options.userHash)
          ? {
              userHash: options.userHash,
              ...(Number.isInteger(options.userHashTs) ? { userHashTs: options.userHashTs } : {}),
            }
          : {}),
      });
      merged = result?.merged === true;
      this.log('Identified ' + siteUserId);
    } catch (error) {
      // Never throw at a caller: `identify()` is called from a login handler,
      // and the local id is already set, so events keep carrying it.
      this.log('Identify call failed', error);
    }
    // The phone now belongs to this customer (the server keeps the link only
    // for a visitor the identify bound to it).
    void this.pushDevices?.onIdentityChange();

    // The web widget writes an `identify` event here, and a scenario's
    // "identified" starter (`starter.on_event`) listens for it. The server's
    // identify route only re-stamps old events, so without this an app login
    // never started that journey. Same rule as the widget: a repeat call for
    // the person already known is not a new identification, and the event is
    // written even when the request failed — the id is set locally and the
    // login did happen. Traits stay out of the event: an address belongs to
    // the identity, not to a row every analytics reader can see.
    if (changed || merged) {
      this.track('identify', {
        entityType: 'user',
        entityId: currentId ?? siteUserId,
        metadata: {
          hasEmail: typeof email === 'string' && email.length > 0,
          hasPhone: typeof phone === 'string' && phone.length > 0,
          previousId: previousId ?? null,
          visitorId: this.identity.getVisitorId() ?? null,
          merged,
        },
      });
    }
  }

  /**
   * Tell the SDK whether the OS lets the app notify this person:
   *
   * ```ts
   * selwise.setPushPermission(status === 'authorized' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined');
   * ```
   *
   * Call it at launch and whenever the answer changes. It decides nothing about
   * delivery (push itself is a later phase); it lets a segment say "has not
   * allowed notifications" (`pushPermission`). Kept in memory for this launch
   * and sent with every segment request and, for an identified customer, to
   * the server so a segment's members can be judged on it too. A segment's
   * answer is kept for five minutes, so a change is reflected on a surface
   * within that time.
   */
  setPushPermission(state: PushPermission): void {
    if (state !== 'granted' && state !== 'denied' && state !== 'undetermined') return;
    if (this.pushPermission === state) return;
    this.pushPermission = state;
    // A phone already registered takes the new answer (`push_devices.permission`).
    void this.pushDevices?.onPermissionChange();
    const siteUserId = this.identity?.getSiteUserId();
    if (!this.initialized || this.destroyed || !siteUserId || !this.consentAllows('identify')) return;
    // Fail-soft: the next identify() carries it anyway.
    void this.endpointsApi
      .setUserTraits({
        externalId: siteUserId,
        visitorId: this.identity.getVisitorId(),
        traits: { pushPermission: state },
      })
      .catch((error) => this.log('Push permission not sent', error));
  }

  /**
   * Register this phone for notifications from the merchant's scenarios.
   *
   * The token is the app's own — `@react-native-firebase/messaging`'s
   * `getToken()`, `expo-notifications`' `getDevicePushTokenAsync()` /
   * `getExpoPushTokenAsync()`, or the APNs device token — and `provider` says
   * which family it is, because the merchant connects FCM, APNs and Expo
   * separately and each phone is sent through its own:
   *
   * ```ts
   * const token = await messaging().getToken();
   * await selwise.registerPushToken({ token, provider: 'fcm', platform: Platform.OS === 'ios' ? 'ios' : 'android' });
   * selwise.setPushPermission('granted');
   * ```
   *
   * Call it at every launch and whenever the library reports a refreshed
   * token; registering the same token twice is one phone. It does nothing
   * without the person's marketing consent (`setConsent`), and a later
   * withdrawal revokes the phone. Resolves `true` when the server has the
   * phone, `false` when the registration was withheld or could not be sent (the
   * next launch tries again). Throws only for a call that cannot be right: no
   * token, an unknown provider, no platform.
   */
  async registerPushToken(input: {
    token: string;
    provider: PushProvider;
    /** Needed for FCM and Expo tokens unless `init({ platform })` named it; APNs is always iOS. */
    platform?: PushPlatform;
  }): Promise<boolean> {
    this.assertReady();
    const registration = normalizePushRegistration(input, this.options.platform);
    return (await this.pushDevices?.register(registration)) ?? false;
  }

  /**
   * Stop notifying this phone — the app's own "turn notifications off", or a
   * logout from push. Revokes the registered token at the server and forgets it.
   * (A logout of the CUSTOMER is `logout()`, which keeps the phone and unlinks
   * the person.)
   */
  async unregisterPushToken(): Promise<boolean> {
    this.assertReady();
    return (await this.pushDevices?.unregister()) ?? false;
  }

  /**
   * Call when the person taps a notification. Hand it whatever the push library
   * gives you (FCM's `RemoteMessage`, Expo's notification response, the data
   * object, or the link itself); it records the open as a messaging click when
   * the notification carries Selwise's attribution and returns the link to open
   * — `app://basket`, the app's own deep link or an https address — or `null`
   * for a notification Selwise did not send. Opening it is the host's
   * (`navigate`): the SDK never navigates.
   *
   * ```ts
   * messaging().onNotificationOpenedApp((message) => {
   *   const link = selwise.trackPushOpen(message);
   *   if (link) Linking.openURL(link);
   * });
   * ```
   */
  trackPushOpen(payload: unknown): string | null {
    const link = pushLinkOf(payload);
    if (!link) return null;
    this.trackDeepLink(link);
    return link;
  }

  /** Clears the logged-in id and starts a new session. Call on logout. */
  async logout(): Promise<void> {
    this.assertReady();
    await this.flush().catch(() => undefined);
    await this.identity.resetSession();
    // The phone stays reachable as this install; it no longer belongs to the
    // customer who left.
    void this.pushDevices?.onIdentityChange();
  }

  async setConsent(snapshot: ConsentSnapshot): Promise<void> {
    this.assertReady();
    const experimentsBefore = this.consentAllows('experimentEvents');
    await this.consent.set(snapshot);
    this.emitter.emit('consent', this.consent.get());
    // Marketing withdrawn revokes the registered phone; granted sends a withheld one.
    void this.pushDevices?.onConsentChange();
    // Assignments are fetched once per launch; a decision that changes
    // whether this visitor may be in an experiment at all starts that over.
    if (this.consentAllows('experimentEvents') !== experimentsBefore) {
      this.experiments = new ExperimentGate();
      // A point that resolved its screen experiment asks again.
      this.emitter.emit('experiments', ++this.experimentsVersion);
    }
    const held = this.identifyAwaitingConsent;
    if (held && this.consentAllows('identify')) {
      void this.identify(held.siteUserId, held.traits, held.options);
    }
    // A visitor who just granted consent may have queued events from before the
    // decision; send them now that they are permitted.
    if (this.consent.isGranted() && this.queue.size() > 0) {
      void this.flush();
    }
  }

  getConsent(): ConsentSnapshot {
    this.assertReady();
    return this.consent.get();
  }

  /**
   * Whether this channel waits for the app's consent decision — the dashboard's
   * "ask for consent before tracking" (Cookie Consent → Policy). Reads `/config`
   * once, so it is a promise; an earlier launch's answer stands in when the read
   * fails. While it is `true` and `setConsent()` has not been called, every event
   * is held and every figure in the dashboard stays at zero.
   */
  async isConsentRequired(): Promise<boolean> {
    this.assertReady();
    if (!this.remote) await this.loadRemoteConfig();
    return this.consent.isDecisionRequired();
  }

  /**
   * The channel requires a decision and none has been given: nothing is being
   * sent. Judged from what is known now (`isConsentRequired` reads `/config`
   * first).
   */
  isAwaitingConsent(): boolean {
    this.assertReady();
    return this.consent.isAwaitingDecision();
  }

  /**
   * Sets the synthetic page URL reported with subsequent events.
   *
   * A native app has no location, but page targeting, funnels and journeys are
   * all URL-shaped server-side. Use one stable value per screen — `app://product`,
   * `app://category`, `app://basket` — and target those in the dashboard.
   */
  setScreen(pageUrl: string, info: ScreenInfo = {}): void {
    // No flush needed: every event carries the screen it was tracked on and
    // `EventQueue.take()` never mixes screens into one batch. Flushing here
    // instead would cost a request per screen and still get it wrong whenever
    // a flush was already in flight.
    this.currentPageUrl = pageUrl;
    if (this.initialized && !this.destroyed) {
      this.presence?.noteActivity();
      this.noteIntegration('screen', pageUrl);
    }

    // The state is the host's to set whenever it knows the screen — often before
    // `init()` resolves — and is what the components draw from (`on('screen')`).
    const next: ScreenState = {
      pageUrl,
      screenName: info.screenName ?? null,
      pageType: info.pageType ?? null,
    };
    const before = this.screenState;
    if (
      before.pageUrl === next.pageUrl &&
      before.screenName === next.screenName &&
      before.pageType === next.pageType
    ) {
      return;
    }
    this.screenState = next;
    this.emitter.emit('screen', next);
    if (this.initialized && !this.destroyed) this.refreshRemoteConfigIfStale();
  }

  /**
   * The screen the host last named with `setScreen` / `trackScreenView`:
   * `pageUrl: null` until it has. Read it, then subscribe with `on('screen')`.
   */
  getScreen(): ScreenState {
    return this.screenState;
  }

  /**
   * The product the current product screen shows, for `{product.*}` in a
   * campaign's words and for product conditions (see `ProductInput`): its facts,
   * `{ pending: true }` while the screen is still loading it — never the
   * previous product's facts — and `null` on any other screen or when it is
   * unknown. The HOST decides what is "the current screen's product" and calls
   * this on every change, including with `null` when the shopper leaves the
   * product screen; the components ask for their surfaces again when it moves.
   *
   * `key` says whether the product is a different one: without it the facts
   * themselves are compared. Pass your own when the same facts refetched should
   * still count as a change.
   */
  setProduct(product: ProductState, key?: string): void {
    const next = product ?? null;
    const nextKey = key ?? JSON.stringify(next);
    const changed = nextKey !== this.productState.key;
    this.productState = { product: next, key: nextKey };
    if (changed) this.emitter.emit('product', next);
  }

  /** The product `setProduct` last set, or `null`. */
  getProduct(): ProductState {
    return this.productState.product;
  }

  /**
   * The number behind a social-proof counter surface: how many people viewed
   * `question.product` in the period, or have it in a basket. Read from the same
   * public routes the browser widget reads, with the channel's key; cached a minute
   * per product and period and shared while in flight (`ProductCountCache`).
   * `null` when it could not be read — a counter never prints that as a zero.
   *
   * It is aggregate, with no visitor in it, so it needs no consent.
   */
  getProductCount(question: ProductCountQuestion): Promise<number | null> {
    this.assertReady();
    if (!this.productCounts) {
      this.productCounts = new ProductCountCache(async (asked) => {
        try {
          const answer = await this.endpointsApi.getProductMetric(asked);
          return Number(answer?.count) || 0;
        } catch (error) {
          this.log('Could not read a product count', error);
          return null;
        }
      });
    }
    return this.productCounts.ask(question);
  }

  /**
   * Subscribe to a state change (`SelwiseEvents`): `ready`, `screen`,
   * `product`, `cart`, `theme`, `consent`, `locale`, `experiments`, `config`. Returns the unsubscribe.
   * The listener is not called with the current value — read it first.
   */
  on<K extends keyof SelwiseEvents & string>(event: K, listener: (value: SelwiseEvents[K]) => void): Unsubscribe {
    // The cart has its own subscription: `onCartChange` was there first.
    if (event === 'cart') return this.cart.subscribe(listener as (value: SelwiseEvents['cart']) => void);
    return this.emitter.on(event, listener);
  }

  /**
   * The recommendation strips of a screen: the list with the visitor's A/B arm
   * applied, each strip's products, and the shared requests behind them (see
   * `StripService`). One service per client, so every component and every host
   * call that asks about the same screen rides on the same answer.
   */
  get strips(): StripService {
    if (!this.stripService) {
      this.stripService = new StripService(this, (message, error) => this.log(message, error), this.notShown);
    }
    return this.stripService;
  }

  /**
   * Why a campaign or a recommendation strip the API sent is not on the screen
   * the app is on — the device's answer to the dashboard's "Why is this not in my
   * app?". Without an argument: every one that is not shown, with its reason;
   * with a campaign id or a strip's widget id: that one's (an empty list means
   * nothing is on record against it — it is drawn, or it was never sent).
   *
   * ```ts
   * selwise.explain();
   * // [{ id: 'c1', kind: 'campaign', type: 'announcement_bar', screen: 'app://home',
   * //    reason: 'segment', waiting: false, detail: {}, at: 1763376000000 }]
   * ```
   *
   * `reason` is one of the codes of `@selwise/widget-contract/app-not-shown` the
   * dashboard's checklist uses too (`screens`, `segment`, `frequency_cap`,
   * `campaignSlot`, `below_min_count`…). `waiting: true` is a surface armed for a
   * trigger (`trigger_armed`): it will show, it has not failed. The SDK records a
   * reason where it decides, so this is what the screen did, never a second guess;
   * debug mode (`init({ debug: true })`) prints each as it is recorded.
   *
   * What it cannot say: a campaign outside its schedule, or with delivery off, is
   * never sent to the device, so there is nothing on record for it.
   */
  explain(surfaceOrStripId?: string): NotShownReport[] {
    const id = typeof surfaceOrStripId === 'string' ? surfaceOrStripId.trim() : '';
    return this.notShown.list({ screen: this.currentPageUrl ?? null, ...(id ? { id } : {}) });
  }

  /**
   * The overlay's side of `explain()`: what it left off the screen after the client
   * had delivered it (a point it does not mount, a counter under its threshold, a
   * trigger not yet fired). Replaces the overlay's previous answer for the screen
   * as a whole. Not for a host's own use.
   *
   * @internal
   */
  noteDrawn(screen: string, kind: 'campaign' | 'strip', inputs: readonly NotShownInput[]): void {
    this.notShown.replace('draw', kind, screen, inputs);
  }

  /**
   * What a product-content slot (`pdp-specs`) did on the current screen: the reason
   * it draws nothing, or `null` once something is drawn. Written by the code that
   * decides (`getEnrichment`, `<SelwiseEnrichment>`), read by `explain()`.
   *
   * @internal
   */
  noteEnrichment(slot: string, reason: AppExplainReason | null, detail?: NotShownDetail): void {
    if (!slot) return;
    if (reason === null) {
      this.notShown.clear('enrichment', slot);
      return;
    }
    this.notShown.note('draw', this.currentPageUrl ?? '', {
      id: slot,
      kind: 'enrichment',
      reason,
      ...(detail ? { detail } : {}),
    });
  }

  /**
   * Apply a QA link (`?selwise_test=1&selwise_variant=<experiment>:<arm>`) to this
   * session: test mode, and the chosen arms forced. Only for a client started with
   * `qaLinks: true`; `trackDeepLink` does it for every link that opens the app.
   * Returns what the link asked for, or null.
   */
  applyQaLink(url: string): QaOverride | null {
    this.assertReady();
    if (!this.qaLinksOn) {
      this.log('QA link ignored: init({ qaLinks: true }) is off');
      return null;
    }
    const qa = readQaLink(url);
    if (qa) this.applyQa(qa);
    return qa;
  }

  private applyQa(qa: QaOverride): void {
    if (qa.testMode !== undefined) this.testMode = qa.testMode;
    // Test mode off is the way back: it drops the forced arms with it.
    this.qaVariants = qa.testMode === false ? {} : { ...this.qaVariants, ...qa.variants };
    // Everything decided under the old mode is decided again: the arms (a fresh
    // fetch with the forced ones), the surfaces, the enrichment and the claims.
    this.experiments = new ExperimentGate();
    this.emitter.emit('experiments', ++this.experimentsVersion);
    this.invalidateSurfaces();
    this.invalidateEnrichment();
    this.stripService?.invalidate();
    this.scenarioClaims = null;
    this.scenarioInboxPending = null;
    this.log(
      `QA link applied: test mode ${this.testMode ? 'on' : 'off'}, ${Object.keys(this.qaVariants).length} forced arm(s)`
    );
    this.scheduleIntegrationReport();
  }

  /**
   * A named point (`pdp-under-info`) this app has mounted — what
   * `<SelwiseSlot>` calls on mount. The dashboard then shows the point as
   * "connected in your app" and a strip sent to a point the app never mounted
   * as the one that cannot appear. Safe to call before `init()` and on every
   * render: a name is reported once per session.
   */
  registerSlot(slot: string): void {
    this.noteIntegration('slot', slot);
  }

  /**
   * The inbox claims, from the short-lived copy or one request. A screen change, a
   * cart change and a foreground can all ask at once on a cold start: they share the
   * request that is already on its way instead of each sending their own.
   */
  private scenarioInboxEntries(refresh: boolean): Promise<ScenarioInboxEntry[]> {
    const held = this.scenarioClaims;
    if (!refresh && held && Date.now() - held.at <= SCENARIO_CLAIMS_TTL_MS) return Promise.resolve(held.entries);
    if (this.scenarioInboxPending) return this.scenarioInboxPending;
    const request: Promise<ScenarioInboxEntry[]> = this.getScenarioInbox()
      .then((entries) => {
        // A QA link may have reset the claims while this was in flight: its answer is stale.
        if (this.scenarioInboxPending === request) this.scenarioClaims = { at: Date.now(), entries };
        return entries;
      })
      .finally(() => {
        if (this.scenarioInboxPending === request) this.scenarioInboxPending = null;
      });
    this.scenarioInboxPending = request;
    return request;
  }

  /**
   * Queue a screen or a point for the next report. Reported ONCE per session
   * each and batched for a few seconds, so a screen flicker or a re-render never
   * becomes a request; and never awaited — a report is a courtesy.
   */
  private noteIntegration(kind: 'screen' | 'slot', value: string): void {
    if (!this.integrationReportingOn) return;
    const name = value.trim();
    if (!name) return;
    const [reported, pending] =
      kind === 'screen'
        ? [this.reportedScreens, this.pendingScreens]
        : [this.reportedSlots, this.pendingSlots];
    if (reported.has(name) || pending.has(name)) return;
    // The server keeps this many; a host that names a screen per product would only
    // push the real screens out of it, one request at a time.
    if (reported.size + pending.size >= INTEGRATION_NAMES_MAX) return;
    pending.add(name);
    this.scheduleIntegrationReport();
  }

  private scheduleIntegrationReport(): void {
    if (!this.integrationReportingOn || !this.initialized || this.integrationTimer) return;
    this.integrationTimer = setTimeout(() => {
      this.integrationTimer = null;
      void this.sendIntegrationReport();
    }, INTEGRATION_REPORT_DELAY_MS);
  }

  private async sendIntegrationReport(): Promise<void> {
    if (!this.initialized || this.destroyed || !this.integrationReportingOn) return;
    const screens = [...this.pendingScreens];
    const slots = [...this.pendingSlots];
    // Marked sent before the request: a failure is retried by the NEXT new
    // name, not by a loop, and a name is never sent twice in a session.
    for (const name of screens) this.reportedScreens.add(name);
    for (const name of slots) this.reportedSlots.add(name);
    this.pendingScreens.clear();
    this.pendingSlots.clear();
    try {
      await this.endpointsApi.reportClient({
        screens,
        slots,
        libraryVersion: SDK_VERSION,
        ...(this.options.pluginVersion ? { pluginVersion: this.options.pluginVersion } : {}),
        ...(this.options.appVersion ? { appVersion: this.options.appVersion } : {}),
        testMode: this.testMode,
      });
    } catch (error) {
      this.log('Integration report not sent', error);
    }
  }

  /**
   * Report the app's `AppState`, so the Live View counts this user only while
   * the app is on screen:
   *
   * ```ts
   * AppState.addEventListener('change', (state) => selwise.setAppState(state));
   * ```
   *
   * `'active'` keeps the live heartbeat going (and sends one at once when the
   * app comes back); anything else stops it, flushes the event queue and writes
   * the visitor's session counters, as the app may not get another chance.
   */
  setAppState(state: string): void {
    if (!this.initialized || this.destroyed) return;
    const active = isActiveAppState(state);
    this.presence?.setForeground(active);
    if (active) this.refreshRemoteConfigIfStale();
    if (!active) {
      void this.flush();
      void this.visitor.flush().catch(() => undefined);
    }
  }

  // ---- tracking ----

  /**
   * Queues an event. Never throws and never awaits the network, so it is safe
   * to call directly from a render or a gesture handler.
   */
  track(name: string, options: TrackOptions = {}): void {
    // Stamped now, not read at flush time: the visitor may be three screens
    // further on by the time this is sent.
    this.enqueue(name, options, this.currentPageUrl);
  }

  private enqueue(name: string, options: TrackOptions, pageUrl: string | undefined): void {
    if (!this.initialized || this.destroyed) {
      // Losing an event is strictly better than throwing inside a merchant's
      // screen because init() has not resolved yet.
      return;
    }

    const now = Date.now();
    const event: QueuedEvent = {
      eventId: generateId(),
      entityType: options.entityType ?? 'custom',
      name,
      timestamp: options.timestamp ?? now,
      eventTs: options.timestamp ?? now,
      ...(pageUrl ? { pageUrl } : {}),
    };

    if (options.entityId !== undefined) event.entityId = options.entityId;
    if (options.productItemCode !== undefined) event.productItemCode = options.productItemCode;
    if (options.metadata !== undefined) event.metadata = options.metadata;
    // Debugging only: the API recomputes the group from `visitor_id`.
    if (this.inControlGroup()) event.metadata = { ...(event.metadata ?? {}), controlGroup: true };
    if (options.correlationId !== undefined) event.correlationId = options.correlationId;
    if (options.parentEventId !== undefined) event.parentEventId = options.parentEventId;

    this.queue.add(event);
    // The session counters a targeting rule reads (`searchesThisSession`, …).
    this.visitor.recordEvent(name, options.metadata);
    this.presence?.noteActivity();

    if (this.queue.size() >= this.options.batchSize) {
      void this.flush();
    }
  }

  /** `product_view`. `itemCode` must match `item_code` in the product feed. */
  trackProductView(itemCode: string, metadata?: TrackOptions['metadata']): void {
    this.track('product_view', {
      entityType: 'product',
      entityId: itemCode,
      productItemCode: itemCode,
      ...(metadata ? { metadata } : {}),
    });
  }

  trackAddToCart(itemCode: string, metadata?: TrackOptions['metadata']): void {
    this.track('add_to_cart', {
      entityType: 'product',
      entityId: itemCode,
      productItemCode: itemCode,
      ...(metadata ? { metadata } : {}),
    });
  }

  trackRemoveFromCart(itemCode: string, metadata?: TrackOptions['metadata']): void {
    this.track('remove_from_cart', {
      entityType: 'product',
      entityId: itemCode,
      productItemCode: itemCode,
      ...(metadata ? { metadata } : {}),
    });
  }

  trackScreenView(pageUrl: string, metadata?: TrackOptions['metadata'], info?: ScreenInfo): void {
    this.setScreen(pageUrl, info);
    // `cartSource: 'host'` when the app has told us its cart — the channel
    // overview's "is the cart measured here", the same stamp the browser
    // widget puts on its page views.
    // `referrer: ''` is what makes a screen view that no deep link opened read as
    // `direct`: an app has no referring page, and a view with no `referrer` key
    // at all is one whose source nobody measured. The host's own value wins.
    const measured: NonNullable<TrackOptions['metadata']> = { referrer: '', ...(metadata || {}) };
    const stamped: TrackOptions['metadata'] = this.cart.get().known
      ? { ...measured, cartSource: 'host' }
      : measured;
    if (this.initialized && !this.destroyed) this.visitor.recordPageView(Date.now(), appScreenOfUrl(pageUrl)?.key);
    this.track('page_view', {
      entityType: 'page',
      entityId: pageUrl,
      ...(stamped ? { metadata: stamped } : {}),
    });
  }

  /**
   * Report the link that opened the app — a push, an e-mail, an ad, another
   * app. Call it with every URL the app is opened with, cold start included:
   *
   * ```ts
   * Linking.getInitialURL().then((url) => url && selwise.trackDeepLink(url));
   * Linking.addEventListener('url', ({ url }) => selwise.trackDeepLink(url));
   * ```
   *
   * What it records is what the browser widget records on landing, so a
   * message or a campaign gets the same credit whether it opened a page or
   * the app:
   *
   * - a `page_view` of the link, reduced to its path and its campaign
   *   parameters (`utm_*`, ad-click ids) — the visit's traffic source;
   * - when the link is a Selwise message link (`sw_sc`), a `click` on entity
   *   type `messaging` keyed by the scenario — the touch that lets the message
   *   own the order that follows.
   *
   * Every other parameter is dropped: a deep link may carry a token or an
   * address. A link with no attribution parameter records nothing (the screen
   * view does the rest), and the same link is recorded once per app session,
   * so a re-render calling this twice is one landing. A link handed over
   * before `init()` resolves is kept and recorded when it does. Returns what
   * was read, or null.
   */
  trackDeepLink(url: string): DeepLinkAttribution | null {
    const attribution = readDeepLinkAttribution(url);
    const qa = readQaLink(url);
    // A QA link carries no attribution; it is still a link worth keeping until
    // `init()` has said whether QA links are on.
    if (!attribution && !qa) return null;
    if (!this.initialized) {
      // Before init() resolves — the cold-start link nearly always is. Kept
      // (a few, once each) and recorded when init() finishes.
      if (!this.destroyed && this.pendingDeepLinks.length < PENDING_DEEP_LINKS_MAX && !this.pendingDeepLinks.includes(url)) {
        this.pendingDeepLinks.push(url);
      }
      return attribution;
    }
    if (this.destroyed) return null;
    if (qa && this.qaLinksOn) this.applyQa(qa);
    if (!attribution) return null;
    const sessionId = this.identity.getSessionId();
    if (this.recordedLandingsSession !== sessionId) {
      this.recordedLandings.clear();
      this.recordedLandingsSession = sessionId;
    }
    if (this.recordedLandings.has(attribution.landingUrl)) return attribution;
    this.recordedLandings.add(attribution.landingUrl);

    const metadata: Record<string, string> = {
      landing: 'deep_link',
      // A link opened from a notification, an e-mail client or another app
      // has no referring page — `direct` on the web, the same here.
      referrer: '',
      ...attribution.utm,
    };
    this.enqueue('page_view', { entityType: 'page', entityId: attribution.landingUrl, metadata }, attribution.landingUrl);

    if (attribution.scenarioId) {
      const medium = messageMedium(attribution);
      // On the landing, like the browser widget's: one batch, one page.
      this.enqueue(
        'click',
        {
          entityType: 'messaging',
          entityId: attribution.scenarioId,
          metadata: medium ? { source: 'message_link', medium } : { source: 'message_link' },
        },
        attribution.landingUrl,
      );
    }
    // An app is often opened from a link and closed again: send it now.
    void this.flush();
    return attribution;
  }

  /**
   * Flushes the queue. Concurrent callers share one in-flight flush, so a
   * size-triggered flush and the timer cannot double-send.
   */
  async flush(): Promise<void> {
    if (!this.initialized) return;

    // Awaiting `flush()` means "make sure what I tracked is sent". Simply
    // joining a flush already in flight broke that promise: it had already
    // taken its batch, so anything queued afterwards stayed behind — which on
    // `appOnBackground` is the tail of a session the OS is about to kill.
    // Chaining re-flushes only while there is something left, and each round
    // removes at least one batch, so it terminates.
    if (this.flushInFlight) {
      const inFlight = this.flushInFlight;
      return inFlight.then(() => (this.queue.size() > 0 ? this.flush() : undefined));
    }

    this.flushInFlight = this.doFlush().finally(() => {
      this.flushInFlight = null;
    });
    return this.flushInFlight;
  }

  private async doFlush(): Promise<void> {
    // Drains screen by screen, because `EventQueue.take()` stops at a screen
    // change: one flush can therefore be several requests. Awaiting `flush()`
    // has to mean "what I tracked is sent", and a single request would leave
    // everything after the visitor's last navigation behind — on
    // `appOnBackground` that is the tail of a session the OS is about to kill.
    //
    // Bounded so a producer faster than the network cannot make one flush run
    // forever, and it stops on the first failure rather than hammering a
    // server that just rejected us.
    // Nobody has decided yet: whether the `app_managed` default may stand is
    // the CHANNEL's call (`/config` → `consentRequired`). Asked once per
    // flush, and not at all when an earlier launch stored the answer. A
    // channel never read before whose /config fails keeps the old default, so
    // an outage does not stop every app that never asked for consent.
    if (this.queue.size() > 0 && this.consent.isUndecided() && !this.remote && !this.consent.hasStoredPolicy()) {
      await this.loadRemoteConfig();
    }

    for (let round = 0; round < MAX_FLUSH_ROUNDS; round += 1) {
      if (this.queue.size() === 0) return;

      // Consent is evaluated at SEND time, not at track time: a visitor who
      // accepts after browsing should have that browsing counted, and one who
      // declines should have it held rather than silently discarded.
      if (!this.consent.isGranted()) {
        this.log(`Holding ${this.queue.size()} event(s): consent not granted`);
        return;
      }

      const taken = this.queue.take(this.options.batchSize);
      if (taken.length === 0) return;
      // Only what the answer allows leaves: the server drops an event whose
      // category the snapshot refuses, so sending it would only be a refusal
      // round trip. Refused events are discarded, not held — a later grant is
      // consent from then on.
      const batch = taken.filter((event) => this.consent.hasCategory(consentCategoryOfEvent(event.name)));
      if (batch.length < taken.length) {
        this.log(`Dropped ${taken.length - batch.length} event(s): their consent category is refused`);
      }
      if (batch.length === 0) continue;

      // Every event in `batch` shares one screen, so the batch's url is the url
      // the events were stamped with, not wherever the visitor is now.
      const batchPageUrl = batch[0]?.pageUrl ?? this.currentPageUrl;

      const sessionId = this.identity.getSessionId();
      const payload = {
        requestId: generateId(),
        sessionId,
        visitorId: this.identity.getVisitorId(),
        consentSnapshot: this.consent.get(),
        // The journey IS the visit: the 30-minute inactivity session, the
        // same unit the web widget's journey is. The API reads it as the
        // "same visit" key of revenue attribution (the rest of a basket is
        // credited only inside the visit of the owning touch). It used to be
        // one id per app PROCESS, so a backgrounded app resumed a day later
        // was still "the same visit".
        journeyId: sessionId,
        ...(this.identity.getSiteUserId() ? { siteUserId: this.identity.getSiteUserId() as string } : {}),
        ...(batchPageUrl ? { pageUrl: batchPageUrl } : {}),
        // The web widget sends this from `selwise_test_mode`. A test-mode
        // scenario admits only a test-mode visitor, so without it no app event
        // could ever enter one — a merchant could not try an app scenario
        // before publishing it to every shopper.
        ...(this.testMode ? { testMode: true } : {}),
        // `pageUrl` is internal to the queue. The ingest DTO runs
        // `forbidNonWhitelisted`, so leaving it on an event is a hard 400 for
        // the whole batch.
        events: batch.map(({ pageUrl: _pageUrl, ...event }) => event),
      };

      try {
        const response = await this.endpointsApi.trackEventsBatch(payload);
        // A 200 is not "every event stored": the body says how many the
        // server refused (an invalid event, consent off). Those will be
        // refused again, so they are not requeued — but they are SAID, outside
        // debug mode, because a silent drop is how an app loses its tracking.
        const rejected = readRejectedCount(response);
        if (rejected > 0) {
          this.warn(`${rejected} of ${batch.length} event(s) were refused by the server`, response);
        }
        this.presence?.noteDelivered();
        this.log(`Sent ${batch.length} event(s)`);
      } catch (error) {
        // 4xx other than 408/429 means the server will reject this payload
        // again; requeueing it would block every event behind it until retries
        // run out. Always reported: a wrong channel key (404) or an unverified
        // channel (403) loses every event, and debug mode is off in the field.
        if (error instanceof SelwiseApiError && isPermanentRejection(error.status)) {
          this.warn(`Dropped ${batch.length} event(s): server rejected with ${error.status}`, error.body);
          return;
        }
        this.queue.requeue(batch);
        this.log(`Flush failed, requeued ${batch.length} event(s)`, error);
        return;
      }
    }
  }

  // ---- recommendations ----

  async getRecommendationWidgets(pageUrl?: string): Promise<RecommendationWidgetSummary[]> {
    this.assertReady();
    if (await this.controlGroupDecided()) return [];
    const widgets = await this.endpointsApi.getRecommendationWidgets(pageUrl ?? this.currentPageUrl);
    // Which strips answer the live cart, as the API flags them — so the cart
    // rides only with those (see `recommendationCart`).
    for (const widget of widgets) {
      const flags = (widget as { eligibilityFlags?: { liveCartRequired?: unknown } }).eligibilityFlags;
      if (!widget?.id) continue;
      this.liveCartWidgets.set(widget.id, flags?.liveCartRequired === true);
      // What an experiment arm's title or display type is applied over.
      this.listedWidgets.set(widget.id, widget);
    }
    // The browser widget's two gates, in its order. The list carries every
    // active strip, drafts in test mode and segment-targeted ones included,
    // and the SDK returned it as it came: a test-mode draft went to every
    // shopper and a strip for "VIP customers" to everyone.
    const visible: RecommendationWidgetSummary[] = [];
    const screen = pageUrl ?? this.currentPageUrl ?? '';
    const screenPageType = this.pageTypeOfScreen(screen);
    const rejections: NotShownInput[] = [];
    const isDraft = (widget: RecommendationWidgetSummary) =>
      widget.isTestMode === true || (widget as { testMode?: unknown }).testMode === true;
    // Every segment the strips that get that far name, asked in ONE request.
    const audienceOf = (widget: RecommendationWidgetSummary) => ({
      mode: typeof widget.segmentTargetingMode === 'string' ? widget.segmentTargetingMode : undefined,
      segmentIds: widget.segmentIds,
    });
    // The API filters the list by the screen's address only; a strip's page
    // types (a basket strip on `cart`) are judged here, as the browser widget
    // does. A screen whose type is unknown still shows the strip.
    const offPageType = (widget: RecommendationWidgetSummary) => {
      const types = (widget as { pageTypes?: unknown }).pageTypes;
      const named = Array.isArray(types) ? types.filter((t): t is string => typeof t === 'string') : [];
      return named.length > 0 && !evaluatePageTypeTargeting({ types: named as never }, screenPageType);
    };
    const asked = widgets.filter(
      (widget) => widget?.id && !(isDraft(widget) && !this.testMode) && !offPageType(widget)
    );
    const verdicts = await this.segments.shouldShowMany(asked.map(audienceOf), { pageUrl: screen });
    const inSegmentById = new Map(asked.map((widget, index) => [widget.id, verdicts[index]] as const));
    for (const widget of widgets) {
      if (!widget?.id) continue;
      if (isDraft(widget) && !this.testMode) {
        this.log(`Recommendation strip is in test mode: ${widget.id}`);
        rejections.push({ id: widget.id, kind: 'strip', reason: 'test' });
        continue;
      }
      if (offPageType(widget)) {
        this.log(`Recommendation strip is for other page types: ${widget.id}`);
        rejections.push({
          id: widget.id,
          kind: 'strip',
          reason: 'screens',
          detail: { pageType: screenPageType ?? null },
        });
        continue;
      }
      const inSegment = inSegmentById.get(widget.id) !== false;
      if (!inSegment) {
        this.log(`Recommendation strip outside segment targeting: ${widget.id}`);
        rejections.push(
          this.consentAllows('personalization')
            ? { id: widget.id, kind: 'strip', reason: 'segment' }
            : {
                id: widget.id,
                kind: 'strip',
                reason: 'consent',
                detail: { channel: 'personalization', awaiting: this.isAwaitingConsent() },
              }
        );
        continue;
      }
      visible.push(widget);
    }
    // The first step of a screen's strips: what an earlier pass said is stale, the arm
    // and cap steps that follow (`StripService`) add theirs.
    this.notShown.replace('decision', 'strip', screen, rejections);
    return visible;
  }

  /** Widget id → whether its strategy reads the live cart, from the last widget list. */
  private readonly liveCartWidgets = new Map<string, boolean>();
  /** Widget id → the strip as last listed, for `ResolvedRecommendationWidget.widget`. */
  private readonly listedWidgets = new Map<string, RecommendationWidgetSummary>();

  /**
   * A strip as THIS visitor gets it: the widget with the visitor's A/B arm
   * applied — the module a `different_module` arm draws in its place, a
   * `config_override` arm's title, subtitle and display type, or nothing at
   * all (`hidden`). Asks for no products, so a host can decide how to draw a
   * strip before asking — whether it follows the basket, which heading it
   * carries. `getRecommendationProducts` applies the same answer itself; see
   * `core/recommendation-arms.ts` for the rules.
   *
   * Waits for the visitor's arms (one request per launch, shared with
   * `getSurfaces`): a strip resolved before them would be the control for
   * everyone. An experiment with an Audience admits the strip only if the
   * current screen matches it (`stripGate`).
   */
  async resolveRecommendationWidget(
    widget: string | RecommendationWidgetSummary
  ): Promise<ResolvedRecommendationWidget> {
    this.assertReady();
    await this.loadExperiments();
    const listed = typeof widget === 'object' && widget?.id ? widget : null;
    if (await this.controlGroupDecided()) {
      return toResolvedRecommendationWidget(controlGroupArm(listed ? listed.id : String(widget ?? '')));
    }
    const arm = this.recommendationArm(listed ? listed.id : String(widget ?? ''), listed, await this.stripGate());
    this.rememberStripArm(arm);
    return toResolvedRecommendationWidget(arm);
  }

  /** The arm for a strip under `gate` — the arms without an audience unless a screen's gate is passed. */
  private recommendationArm(
    widgetId: string,
    listed?: RecommendationWidgetSummary | null,
    gate: ExperimentGate = this.experiments
  ): RecommendationArm {
    const id = String(widgetId ?? '').trim();
    // The strip a screen experiment's point is drawing right now is its arm's:
    // its exposure and its clicks are the experiment's (`registerSlotArmStrip`).
    const atPoint = this.slotArmStrips.get(id);
    if (atPoint) return atPoint;
    return resolveRecommendationArm(gate, id, listed ?? this.listedWidgets.get(id) ?? null);
  }

  /**
   * The arms a strip on the CURRENT screen may enter: every arm without an
   * audience, plus each one whose experiment's Audience this screen matches —
   * judged on what `getSurfaces` judges a screen on and the app always
   * knows: the screen set with `setScreen` / `trackScreenView`, a mobile
   * device, the server's country, the measured basket, segments and test
   * mode. A rule on something only a host passes to `getSurfaces` (the page
   * kind, the product on screen) does not match here, so such an experiment
   * keeps its strips out: the live strip, nothing counted. Costs nothing
   * while no arm has an audience.
   */
  private stripGate(): Promise<ExperimentGate> {
    const behavior = this.withOwnSignals(withCartSignals(undefined, this.cart.get()));
    return this.experiments.forScreen({
      pageUrl: this.currentPageUrl ?? '',
      deviceType: 'mobile',
      ...(this.remote?.country ? { country: this.remote.country } : {}),
      ...(behavior ? { behavior } : {}),
      testMode: this.testMode,
      segments: this.segments,
    });
  }

  /**
   * The verdict each strip was last ANSWERED under, by the id asked for and
   * by the id drawn. The track calls read it rather than judging again: they
   * have no screen to judge on, and a click must be recorded against the
   * answer the shopper is looking at — never re-resolved against a different
   * one. Hosts that report the drawn id (`result.widgetId`, the hook's and
   * the ready-made strips' choice) get exactly the strip's own verdict.
   */
  private readonly stripArms = new Map<string, RecommendationArm>();

  private rememberStripArm(arm: RecommendationArm): void {
    this.stripArms.set(arm.sourceWidgetId, arm);
    this.stripArms.set(arm.widgetId, arm);
  }

  /** What a track call is recorded against: the strip's answered verdict, else the arms without an audience. */
  private trackedArm(widgetId: string): RecommendationArm {
    const id = String(widgetId ?? '').trim();
    return this.slotArmStrips.get(id) ?? this.stripArms.get(id) ?? this.recommendationArm(widgetId);
  }

  // ---- screen experiments ----

  /** Bumped whenever the visitor's arms are dropped (`on('experiments')`). */
  private experimentsVersion = 0;
  /**
   * The strips that screen experiments' points are drawing now, by strip id,
   * each as the arm that draws it. Present only while a `<SelwiseSlot>` shows the
   * strip (`registerSlotArmStrip`), so the same strip drawn natively elsewhere is
   * not attributed to the experiment.
   */
  private readonly slotArmStrips = new Map<string, RecommendationArm>();

  /**
   * The page type a screen is judged as: the one the host passed with
   * `setScreen` when `screen` is the screen it last named, otherwise the
   * catalogue's type for the address (`app://basket` is a `cart`). Undefined for
   * an address the catalogue does not know, which targeting lets through.
   */
  private pageTypeOfScreen(screen: string | null | undefined): string | undefined {
    const named = appScreenOfUrl(screen);
    const onCurrent = !!named && appScreenOfUrl(this.currentPageUrl)?.url === named.url;
    return (onCurrent ? (this.screenState.pageType ?? named?.pageType) : named?.pageType) ?? undefined;
  }

  /**
   * The arms a point on `screen` may enter, judged as a strip on that screen is
   * (`stripGate`) but on the screen the POINT is on, which a screen that stays
   * mounted behind another is not the one the host last named.
   */
  private slotGate(screen: string): Promise<ExperimentGate> {
    const behavior = this.withOwnSignals(withCartSignals(undefined, this.cart.get()));
    const pageType = this.pageTypeOfScreen(screen);
    return this.experiments.forScreen({
      pageUrl: screen,
      ...(pageType ? { pageType } : {}),
      deviceType: 'mobile',
      ...(this.remote?.country ? { country: this.remote.country } : {}),
      ...(behavior ? { behavior } : {}),
      testMode: this.testMode,
      segments: this.segments,
    });
  }

  /**
   * The visitor's arm of the screen experiment that owns a POINT of a screen
   * (`<SelwiseSlot screen slot>` asks), or `null` when none does — the point is
   * then drawn as its own targeting says. The arm carries the module to draw
   * (`arm.module`, `none` for the arm that shows nothing) and the module's data.
   *
   * Nothing is counted here: resolving is not showing. The exposure is recorded
   * when the point is on the shopper's screen (`trackScreenSlotExposure`), the
   * same moment for every arm, the one that shows nothing included. Waits for
   * the visitor's arms (one request per launch, shared with every other reader).
   */
  async resolveScreenSlot(screen: string, slot: string): Promise<ScreenSlotArm | null> {
    this.assertReady();
    if (await this.controlGroupDecided()) return null;
    await this.loadExperiments();
    const gate = await this.slotGate(screen);
    return screenSlotArmAt(gate.screenSlotAssignments(), screen, slot);
  }

  /**
   * The point is on the shopper's screen (visible, with the app in front): the
   * arm's exposure, once per arm per process — the denominator of every rate on
   * the experiment's results page. Never in test mode (a QA link forces arms and
   * counts nothing) and only with consent to experiments.
   */
  trackScreenSlotExposure(arm: Pick<ScreenSlotArm, 'assignment'>): void {
    if (!this.initialized || this.destroyed) return;
    this.recordExperimentExposure(arm.assignment);
  }

  /** A tap on the arm's module (a strip's product, a campaign's button, a block's link): the arm's click goal. */
  trackScreenSlotClick(arm: Pick<ScreenSlotArm, 'assignment'>): void {
    if (!this.initialized || this.destroyed) return;
    this.recordExperimentClick(arm.assignment);
  }

  /**
   * A point is drawing this arm's strip: until the returned function is called,
   * the strip's impressions and clicks are recorded under the experiment (the
   * strip's arm is the screen experiment's, whatever the strip's own experiments
   * say). Returns the release.
   */
  registerSlotArmStrip(arm: ScreenSlotArm): () => void {
    const summary = slotArmStrip(arm);
    if (!summary) return () => undefined;
    const slotArm: RecommendationArm = {
      widgetId: summary.id,
      sourceWidgetId: summary.id,
      widget: summary,
      experiment: { experimentId: arm.experimentId, variantId: arm.variantId },
      hidden: false,
      ...(arm.assignment.liveCartRequired === true ? { liveCartRequired: true } : {}),
      assignment: arm.assignment,
      strategyOverridden: false,
    };
    this.slotArmStrips.set(summary.id, slotArm);
    return () => {
      if (this.slotArmStrips.get(summary.id) === slotArm) this.slotArmStrips.delete(summary.id);
      // The strip's own answer was remembered with the arm's verdict: forget it,
      // or a click on the same strip drawn natively would still be the experiment's.
      if (this.stripArms.get(summary.id) === slotArm) this.stripArms.delete(summary.id);
    };
  }

  /**
   * The cart a products request carries: the host's own `context.cart` when it
   * passed one (`null` sends none), else the basket `setCart` measured — but
   * only for a strip whose strategy reads it (`free_shipping_complement`, from
   * the widget list's `liveCartRequired`), or one this SDK has not seen listed
   * (the server ignores the cart for every other strategy). An unknown cart is
   * not sent: the server reads that as "not measured" and the strip is empty,
   * which is the honest answer.
   *
   * Judged on the strip the visitor's arm DRAWS: a `different_module` arm can
   * put a cart strip in the slot of one that never reads the cart, and the
   * arm's own flag says so before any answer has. An arm that overrides the
   * strategy is not judged by the listed widget's flag at all.
   */
  private recommendationCart(
    arm: RecommendationArm,
    context: RecommendationContext
  ): RecommendationCartContext | undefined {
    if (context.cart !== undefined) return context.cart ?? undefined;
    const reads = this.liveCartWidgets.get(arm.widgetId) ?? arm.liveCartRequired;
    if (reads === false && !arm.strategyOverridden) return undefined;
    const cart = this.cart.get();
    if (!cart.known) return undefined;
    return {
      known: true,
      total: cart.total,
      currency: cart.currency ?? null,
      codes: this.cart.getCodes(),
    };
  }

  /**
   * Products for one recommendation widget, with visitor context attached so
   * history-based strategies (`recently_viewed`, `user_history`) resolve.
   *
   * The visitor's A/B arm is applied first (`resolveRecommendationWidget`):
   * in a `different_module` arm the products are the arm's strip's, asked for
   * under its id, and `result.widgetId` / `result.widget` describe that strip
   * (`result.sourceWidgetId` is the one asked for); a `config_override` arm's
   * title and display type arrive on `result.widget`; a strip the arm draws
   * nothing for is answered `hidden` without a request.
   */
  async getRecommendationProducts(
    widgetId: string,
    context: RecommendationContext = {},
    signal?: AbortSignal
  ): Promise<RecommendationProductsResult> {
    this.assertReady();
    if (await this.controlGroupDecided()) {
      // Answered `hidden` without a request: asking would record a strip
      // nobody is shown.
      return { widgetId: String(widgetId ?? '').trim(), products: [], productCard: null, meta: null, hidden: true };
    }
    // Which strip to ask for depends on the arm, so the arms come first — the
    // browser widget waits for them too. One request per launch.
    await this.loadExperiments();
    const arm = this.recommendationArm(widgetId, null, await this.stripGate());
    this.rememberStripArm(arm);
    const shaped = {
      widgetId: arm.widgetId,
      ...(arm.widgetId !== arm.sourceWidgetId ? { sourceWidgetId: arm.sourceWidgetId } : {}),
      ...(arm.widget ? { widget: arm.widget } : {}),
      ...(arm.experiment ? { experiment: arm.experiment } : {}),
    };
    if (arm.hidden) {
      this.log(`Recommendation strip drawn as nothing for this visitor's experiment arm: ${arm.sourceWidgetId}`);
      return { ...shaped, products: [], productCard: null, meta: null, hidden: true };
    }

    const siteUserId = this.identity.getSiteUserId();
    // `undefined` drops out of the JSON body: no cart is "not measured".
    const cart = this.recommendationCart(arm, context);
    const result = await this.endpointsApi.getRecommendationProducts(
      arm.widgetId,
      {
        ...context,
        cart,
        // A `config_override` arm's strategy and count are applied by the API
        // from the stored arm this names; `undefined` drops out of the body.
        experimentVariantId: arm.requestVariantId,
        // Who the visitor is goes only with consent to personalization; the
        // strip is still answered from the screen's product and cart.
        ...(this.consentAllows('personalization')
          ? {
              sessionId: this.identity.getSessionId(),
              visitorId: this.identity.getVisitorId(),
              ...(siteUserId ? { userId: siteUserId } : {}),
            }
          : {}),
      },
      signal
    );
    // Whether the strip follows the basket: the products answer says so (a
    // host may draw a strip by id without the list), else the list or the
    // arm did.
    const live =
      typeof result.liveCartRequired === 'boolean'
        ? result.liveCartRequired
        : (this.liveCartWidgets.get(arm.widgetId) ?? arm.liveCartRequired);
    if (typeof live !== 'boolean') return { ...result, ...shaped };
    this.liveCartWidgets.set(arm.widgetId, live);
    return { ...result, ...shaped, liveCartRequired: live };
  }

  // ---- the basket ----

  /**
   * The shopper's basket, as the app measured it. Call it on EVERY basket
   * change — and once with the basket the app restored at launch.
   *
   * Absolute, not a delta: `{ total, itemCount, currency? }` is the whole
   * basket. `total` is the products after the store's own discounts and BEFORE
   * shipping and fees (GA4's `value`) — a grand total counts the shipping fee
   * toward free shipping. `currency` is ISO 4217; without it the channel's
   * currency stands in.
   *
   * Feeds the goal bar (`resolveGoalBar`), `{cart.total}` / `{cart.itemCount}`
   * in campaign copy, and the `cartValue` / `cartItemCount` targeting signals.
   * Kept in memory only: a launch starts with an UNKNOWN cart, and an unknown
   * cart is never printed — a bar showing last week's amount is worse than no
   * bar.
   *
   * Pass `null` when the basket is no longer known (the store cleared it after
   * an order, the shopper logged out). An input that is not a basket (a
   * negative or non-numeric amount) is rejected, returns `false`, and also
   * makes the cart unknown: the previous amount is stale by then.
   */
  setCart(cart: CartInput | null): boolean {
    const accepted = this.cart.set(cart);
    if (!accepted) this.log('setCart() ignored an input that is not a basket; the cart is now unknown', cart);
    return accepted;
  }

  /** The basket as the SDK holds it. `known: false` until the host has set one. */
  getCart(): DynamicCart {
    return this.cart.get();
  }

  /**
   * Called with the new cart whenever it CHANGES — its amount, count, currency
   * or line codes (an identical `setCart` is not a change). Re-resolve a goal
   * bar here, and re-run `getSurfaces()` when a screen's campaigns speak about
   * the basket. `useRecommendationWidget` follows it on its own for a strip
   * that answers the cart. Returns the unsubscribe.
   */
  onCartChange(listener: (cart: DynamicCart) => void): () => void {
    return this.cart.subscribe(listener);
  }

  // ---- the goal bar ----

  /**
   * What a `goal_bar` surface says for the current cart — "₺120 more for free
   * shipping", a part-filled bar, a reward sentence once the goal is reached.
   *
   * The same pure resolver the browser widget and the dashboard preview call,
   * so a basket reads the same sentence on every channel. Call it on every
   * `onCartChange` and draw what it returns:
   *
   * - `visible: false` → draw NOTHING, and do not record an impression. That
   *   is the case for an unknown cart (`setCart` never called), an empty one
   *   the merchant did not ask to show, and a sentence whose value cannot be
   *   said (no currency).
   * - `text`, `buttonText` / `buttonUrl` → the words, already filled.
   * - `progress.percent` → the bar's fill, 0–100; `progress.markers` → where
   *   each intermediate step sits; `progress.complete` → the goal is met.
   *
   * Record the impression the first time a view is VISIBLE, not when the
   * surface is returned: an armed bar is not a shown one.
   */
  resolveGoalBar(
    surface: Pick<Surface, 'type' | 'content'>,
    options: { locale?: string } = {}
  ): GoalBarView {
    const spec = surface && surface.type === 'goal_bar' ? normalizeGoalBarContent(surface.content) : null;
    if (!spec) return { ...HIDDEN_GOAL_BAR_VIEW };
    return resolveGoalBarView(
      spec,
      { cart: this.cart.get() },
      { ...(options.locale ? { locale: options.locale } : {}), currency: this.remote?.currency ?? null }
    );
  }

  /**
   * `goal_reached`: the basket passed a step of the goal WHILE the bar was on
   * screen. Sent at most once per session per surface and step.
   *
   * Only the host knows what was on screen, so the host decides when to call
   * it — and the rule is the browser widget's, so the two channels count the
   * same thing:
   *
   * - Compare each new view with the previous one of the SAME mounted bar.
   *   When the previous view was `visible` and `progress.reachedCount` grew,
   *   report every step in between (`step` = the 0-based index).
   *   `goalStepsCrossed(previous, next)` is that comparison.
   * - Pass the surface as `getSurfaces()` returned it and `{ step }` is
   *   enough: the threshold and metric are read from its content. A host that
   *   kept only the id passes `threshold` (that step's `at`) and `metric`.
   * - A step already behind the shopper when the bar first appeared is NOT
   *   reported, and neither is one crossed while the bar was hidden or off
   *   screen. The new view need not be visible: completing the goal can hide a
   *   bar with no reward sentence, and that crossing happened in front of the
   *   shopper.
   *
   * It is not a click and earns no revenue credit — a shopper who would have
   * added the item anyway cannot be told apart. Returns whether it was sent.
   */
  trackGoalReached(
    surface: Pick<Surface, 'id' | 'type'> & { content?: Record<string, unknown> },
    detail: Pick<GoalReachedDetail, 'step'> & Partial<GoalReachedDetail>
  ): boolean {
    if (!this.initialized || this.destroyed || !surface?.id) return false;
    // The bar's own content is the truth about its steps when the host has it.
    const spec =
      surface.type === 'goal_bar' && surface.content ? normalizeGoalBarContent(surface.content) : null;
    const step = Number(detail?.step);
    const fromSpec = spec && Number.isInteger(step) && step >= 0 ? spec.thresholds[step] : undefined;
    const valid = normalizeGoalReachedDetail(
      spec ? (fromSpec ? { step, threshold: fromSpec.at, metric: spec.metric } : null) : detail
    );
    if (!valid) {
      this.log('trackGoalReached() ignored an invalid step', detail);
      return false;
    }
    if (!this.goalReached.claim(this.identity.getSessionId(), `${surface.id}:${valid.step}`)) {
      return false;
    }
    // The browser widget's exact metadata, so one report adds both channels up.
    this.track('goal_reached', {
      entityType: 'campaign',
      entityId: surface.id,
      metadata: { step: valid.step, threshold: valid.threshold, metric: valid.metric },
    });
    return true;
  }

  // ---- campaigns and widgets ----

  /**
   * The campaigns and widgets that belong on a screen.
   *
   * `/config` is cached for five minutes server-side and once per launch here:
   * a merchant's banner set does not change between two screens, and refetching
   * per navigation would put a request on every screen transition.
   *
   * Returns DATA, not UI: `<SelwiseSurfaces />` from `@selwise/react-native/ui`
   * draws it, and a host that wants its own look draws it from this.
   *
   * The words are already chosen: a campaign's content STATE is applied
   * (`surface.content` is the winning state's, `surface.stateId` names it),
   * `{cart.total}` / `{cart.itemCount}` are filled from the cart the host set
   * with `setCart()`, and `{product.price}` and the other product values from
   * `context.product` — the product a PRODUCT screen is showing
   * (`{ title, price, originalPrice, stock, currency }`). A state whose values
   * cannot be said yields to the next state and then to the base; a surface
   * with nothing sayable (no measured cart, no product, a product not on
   * sale) is not returned — so call this again after `onCartChange` fires, or
   * when the product on screen changes, if a screen's campaigns speak about
   * them. `context.locale` is the viewer's language for amounts; the device
   * default applies without it.
   *
   * The same product answers CONDITIONS: a content state or a targeting rule
   * on `productStock`, `productOnSale`, `productDiscountRate` or
   * `productPrice` reads it, and does not match on a screen with no product.
   * While the product screen is still loading its product, pass
   * `{ pending: true }`: a surface whose words or state depend on the product
   * is then held back instead of returned with its fallback and replaced a
   * moment later.
   */
  async getSurfaces(
    pageUrl?: string,
    context: Omit<SurfaceFilter, 'pageUrl' | 'testMode' | 'dismissedIds'> & {
      locale?: string;
      product?: ProductInput | null;
    } = {}
  ): Promise<Surface[]> {
    this.assertReady();
    const { locale, product, ...targetingContext } = context;

    if (!this.surfaces) {
      const config = await this.loadRemoteConfig();
      if (!config) return [];
      this.surfaces = normalizeSurfaces(config);
      this.log(`Loaded ${this.surfaces.length} surface(s)`);
    }

    const screen = pageUrl ?? this.currentPageUrl ?? '';
    // What `explain()` will say about this pass: every surface left out, and the
    // condition that left it out, written where that condition is evaluated.
    const rejections: NotShownInput[] = [];
    const reject = (surface: Surface, reason: AppExplainReason, detail?: NotShownDetail): void => {
      rejections.push({ id: surface.id, kind: 'campaign', type: surface.type, reason, ...(detail ? { detail } : {}) });
    };

    // A control-group visitor is shown no campaign on any screen.
    if (this.inControlGroup()) {
      for (const surface of this.surfaces) reject(surface, 'control_group');
      this.notShown.replace('decision', 'campaign', screen, rejections);
      return [];
    }

    await this.loadExperiments();

    const cart = this.cart.get();
    const onScreenProduct = normalizeProductInput(product);
    // The host's own behaviour snapshot, with the two cart signals filled from
    // the cart it set — so "basket worth 500 or more" targets in an app that
    // never passes `behavior` at all, and a host that does pass them wins —
    // and the product signals (`productStock`, `productOnSale`, …) from the
    // product it passed. Without a known product they stay absent, and a rule
    // on an absent product signal does not match: a campaign targeted at "stock
    // below 5" is never returned on a screen whose stock nobody measured.
    const behavior = this.withOwnSignals(
      withProductSignals(withCartSignals(targetingContext.behavior, cart), onScreenProduct),
    );
    const deviceType = targetingContext.deviceType ?? 'mobile';
    // The server resolves the country from the request ip and publishes it in
    // `/config.geo`, which is where the browser widget reads it too. An app
    // cannot know it, so a country-targeted campaign matched nothing until
    // this default existed.
    const country = targetingContext.country || this.remote?.country || undefined;
    // The arms THIS screen lets the visitor into: an experiment's own audience
    // is judged on the context its surfaces are judged on. Every reader below
    // uses this gate, so an arm the screen does not admit is applied nowhere
    // and counted nowhere.
    const arms = await this.experiments.forScreen({
      pageUrl: screen,
      pageType: targetingContext.pageType,
      deviceType,
      country,
      behavior,
      testMode: this.testMode,
      segments: this.segments,
    });
    // A screen experiment owns its point: the campaigns sent there natively are
    // withheld from the visitors it counts and the arm's own campaign is added
    // (`applyScreenSlotArms`).
    const candidates = applyScreenSlotArms(
      this.withVariantModules(this.surfaces, arms),
      screenSlotArmsOn(arms.screenSlotAssignments(), screen)
    );
    const onScreen = selectSurfaces(
      candidates,
      {
        ...targetingContext,
        ...(behavior ? { behavior } : {}),
        pageUrl: screen,
        deviceType,
        ...(country ? { country } : {}),
        testMode: this.testMode,
        dismissedIds: this.dismissals.heldIds(candidates),
      },
      (surface, reason) => reject(surface, reason)
    );
    const contentContext = {
      behavior,
      cart,
      product: onScreenProduct,
      format: { ...(locale ? { locale } : {}), currency: this.remote?.currency ?? null },
    };

    // The segments of every surface that reaches that step, asked in ONE request.
    const audienceCandidates = onScreen.filter((surface) => arms.shouldRenderTarget(surface.id));
    const audienceVerdicts = await this.segments.shouldShowMany(
      audienceCandidates.map((surface) => ({ mode: surface.segmentTargetingMode, segmentIds: surface.segmentIds })),
      { pageUrl: screen }
    );
    const inSegmentById = new Map(audienceCandidates.map((surface, index) => [surface.id, audienceVerdicts[index]] as const));

    const eligible: Surface[] = [];
    for (const surface of onScreen) {
      // The order is the browser widget's, and each step is load-bearing:
      // experiment exclusion first (a control the variant replaced must not
      // render alongside it), then segments, then empty content.
      if (!arms.shouldRenderTarget(surface.id)) {
        this.log(`Surface excluded by experiment: ${surface.id}`);
        const arm = arms.forTarget(surface.id);
        reject(surface, 'experiment_arm', arm ? { experimentId: arm.experimentId, variantId: arm.variantId } : undefined);
        continue;
      }

      const inSegment = inSegmentById.get(surface.id) !== false;
      if (!inSegment) {
        this.log(`Surface outside segment targeting: ${surface.id}`);
        // Without the consent that lets segments be read the visitor is in none: say that, not "you are not in it".
        reject(
          surface,
          this.consentAllows('personalization') ? 'segment' : 'consent',
          this.consentAllows('personalization') ? undefined : { channel: 'personalization', awaiting: this.isAwaitingConsent() }
        );
        continue;
      }

      if (Object.keys(surface.content).length === 0 && !surface.customCss && !surface.customJs) {
        reject(surface, 'content', { cause: 'empty' });
        continue;
      }

      // Last, and on the VARIANT's content: an experiment arm may carry its own
      // states and its own words. Before conflict resolution, so a campaign its
      // state hides does not take a dock from one that would have shown.
      const shaped = resolveSurfaceContent(this.applyExperiment(surface, arms), contentContext);
      if (!shaped) {
        this.log(`Surface not drawable for this shopper now (content state or unfillable value): ${surface.id}`);
        reject(surface, 'content', { cause: 'state_or_value' });
        continue;
      }

      eligible.push(shaped);
    }

    // Caps AFTER conflict resolution: a surface the resolver rejected was never
    // shown, so spending its allowance would be wrong.
    const resolved = resolveConflicts(eligible);
    const resolvedIds = new Set(resolved.map((surface) => surface.id));
    for (const surface of eligible) {
      if (!resolvedIds.has(surface.id)) reject(surface, 'conflict');
    }
    const sessionId = this.identity.getSessionId();

    const selected = resolved.filter((surface) => {
      // A held-out surface is capped on its own ledger: see `heldOutCapKey`.
      const capKey = arms.isHeldOut(surface.id) ? heldOutCapKey(surface.id) : surface.id;
      const blocked = this.caps.blockedBy(capKey, surface.placement.frequencyCap, sessionId);
      if (blocked) {
        this.log(`Surface blocked by frequency cap (${blocked}): ${surface.id}`);
        reject(surface, 'frequency_cap', { window: blocked });
        return false;
      }
      return true;
    });

    const settled = this.settleExperiments(selected, sessionId, arms, (surface, experimentId) =>
      reject(surface, 'experiment_holdout', { experimentId })
    );
    this.notShown.replace('decision', 'campaign', screen, rejections);
    return settled;
  }

  /**
   * The experiment half of a screen's answer, decided LAST.
   *
   * Every surface in an experiment records its arm's EXPOSURE here — the
   * denominator of every rate on the results page — at the moment the SDK has
   * decided it belongs on this screen. That is this SDK's display moment: it
   * returns data and the host draws, so this is the last point at which it
   * knows anything, and the holdout arm (which the host never sees) has no
   * other. Both arms use the same moment, so the comparison is like for like.
   *
   * A HOLDOUT surface is then removed. It went through targeting, segments,
   * content states, conflict resolution and the cap first, so it is dropped
   * only where it would have been drawn, and the surfaces it beat for its dock
   * stay beaten: the slot is EMPTY, which is what makes the arm "this surface
   * against nothing" rather than "against whatever would have taken its
   * place". No impression, click or cap charge is ever made for it — the host
   * never receives it — except the would-be display on its own cap key.
   */
  private settleExperiments(
    surfaces: Surface[],
    sessionId: string,
    arms: ExperimentGate,
    onHeldOut: (surface: Surface, experimentId: string) => void = () => undefined
  ): Surface[] {
    const kept: Surface[] = [];
    for (const surface of surfaces) {
      const assignment = surface.experiment ? arms.forTarget(surface.id) : null;
      if (assignment) this.recordExperimentExposure(assignment);

      if (assignment?.holdout === true) {
        if (surface.placement.frequencyCap) {
          void this.caps.recordShown(heldOutCapKey(surface.id), sessionId).catch(() => undefined);
        }
        this.log(`Surface held out by experiment ${assignment.experimentId}: ${surface.id}`);
        onHeldOut(surface, assignment.experimentId);
        continue;
      }
      kept.push(surface);
    }
    return kept;
  }

  /**
   * The visitor's A/B arms, fetched once per launch and shared by every
   * caller — campaigns and recommendation strips await the same request.
   */
  private loadExperiments(): Promise<void> {
    // Without consent to experiments the visitor is in none — the control,
    // as for a visitor outside every experiment — and their id is not sent.
    return this.experiments.load(() =>
      this.consentAllows('experimentEvents')
        ? this.endpointsApi.getExperimentAssignments(this.identity.getVisitorId(), undefined, this.qaVariants)
        : Promise.resolve({})
    );
  }

  /** Once per arm per process; never in test mode (the merchant QAing is not a sample). */
  private recordExperimentExposure(assignment: ExperimentAssignment): void {
    if (this.testMode) return;
    if (!this.consentAllows('experimentEvents')) return;
    const key = `${assignment.experimentId}:${assignment.variantId}`;
    if (this.exposedArms.has(key)) return;
    this.exposedArms.add(key);

    void this.endpointsApi
      .trackExperimentEvent({
        experimentId: assignment.experimentId,
        variantId: assignment.variantId,
        eventType: 'exposure',
        visitorId: this.identity.getVisitorId(),
      })
      .catch((error) => {
        // Fail-soft, and retried on a later screen: a lost exposure is a
        // visitor missing from the sample, never an error for the host.
        this.exposedArms.delete(key);
        this.log('Could not record an experiment exposure', error);
      });
  }

  /**
   * One click on a tested surface or strip, for the arm's click goal. Every tap
   * is sent (the results page counts clicks, and distinct clickers from the
   * visitor id), never in test mode and only with the visitor's consent to
   * experiments — the same gates as the exposure. The API requires the channel's
   * key for an app, which the transport sends. Fail-soft: a lost click is a
   * lower count, never an error for the host.
   */
  private recordExperimentClick(arm: { experimentId: string; variantId: string }): void {
    if (this.testMode) return;
    if (!this.consentAllows('experimentEvents')) return;
    void this.endpointsApi
      .trackExperimentEvent({
        experimentId: arm.experimentId,
        variantId: arm.variantId,
        eventType: 'click',
        visitorId: this.identity.getVisitorId(),
      })
      .catch((error) => {
        this.log('Could not record an experiment click', error);
      });
  }

  /**
   * The config list plus whatever a `different_module` experiment substituted.
   *
   * A variant module is usually NOT in `/config` — it can be inactive on its
   * own, since the experiment is what activates it. Appended rather than
   * swapped in place: its control is already excluded by `excludedTargetIds`,
   * and the substitute still has to clear test mode and page targeting like
   * anything else, which it does by going through `selectSurfaces` with them.
   */
  private withVariantModules(surfaces: Surface[], arms: ExperimentGate): Surface[] {
    const modules = arms.variantModules();
    if (modules.length === 0) return surfaces;

    const known = new Set(surfaces.map((surface) => surface.id));
    const extra: Surface[] = [];

    for (const { assignment, moduleData } of modules) {
      // A recommendation arm's strip is not a surface: it is drawn where the
      // host draws strips (`getRecommendationProducts`).
      if (assignment.targetType === 'recommendation' || assignment.targetType === 'search_config') continue;
      // Every entity surface is a campaign since the merge; a stored variant
      // carrying the old `widget` targetType resolves to the same row.
      const kind = 'campaign' as const;
      const surface = normalizeSurface(moduleData, kind);
      if (!surface || known.has(surface.id)) continue;

      known.add(surface.id);
      extra.push(surface);
    }

    return extra.length > 0 ? [...surfaces, ...extra] : surfaces;
  }

  /**
   * A `config_override` variant's content, merged over the control's.
   *
   * Without this the app rendered the control while REPORTING the assignment —
   * the experiment looked like it ran and its numbers meant nothing.
   */
  private applyExperiment(surface: Surface, arms: ExperimentGate): Surface {
    const assignment = arms.forTarget(surface.id);
    const override = arms.configFor(surface.id);
    if (!assignment) return surface;

    const merged: Surface = {
      ...surface,
      experiment: { experimentId: assignment.experimentId, variantId: assignment.variantId },
    };
    if (!override) return merged;
    if (isRecord(override.content)) {
      merged.content = deepMerge(surface.content, override.content);
    }
    if (isRecord(override.styles)) {
      merged.styles = deepMerge(surface.styles, override.styles);
    }
    if (isRecord(override.placement)) {
      merged.rawPlacement = deepMerge(surface.rawPlacement, override.placement);
      merged.placement = normalizePlacement(merged.rawPlacement, merged.type);
    }
    return merged;
  }

  /**
   * Is this visitor in the channel's global CONTROL GROUP?
   *
   * The same rule as the browser widget and the API's SQL
   * (`vendor/control-group.ts`, generated from the shared contract), over
   * this install's visitor id and `/config`'s `controlGroup`. A held-out
   * visitor gets no campaign, no recommendation strip, no enrichment and no
   * scenario inbox claim — and every event is still tracked, because the
   * comparison is made on those events and orders. Search is untouched (it is
   * there in both groups). Test mode is exempt, so a merchant checking a
   * build never sees an empty app for this reason. Read on every call rather
   * than cached: `logout()` can change the visitor id.
   */
  private inControlGroup(): boolean {
    const group = this.remote?.controlGroup;
    if (!group || this.testMode) return false;
    return isInControlGroup(group.channelId, this.identity.getVisitorId(), group.percent);
  }

  /**
   * `inControlGroup`, after `/config` has been asked for. A failed bootstrap
   * answers false: a visitor we cannot classify is shown the personalisation.
   */
  private async controlGroupDecided(): Promise<boolean> {
    if (!this.remote) await this.loadRemoteConfig();
    return this.inControlGroup();
  }

  /**
   * `/config`, fetched at most once per launch.
   *
   * One request serves three purposes — the surface list, the dashboard's
   * tracking settings and the server's geo lookup — so it is shared rather than
   * repeated, and concurrent callers await the same promise instead of racing
   * three identical requests on the first screen.
   */
  private async loadRemoteConfig(): Promise<Record<string, unknown> | null> {
    if (!this.configPromise) {
      this.configPromise = this.endpointsApi
        .getConfig()
        .then((config) => {
          this.configLoadedAt = Date.now();
          this.configSignature = JSON.stringify(config ?? null);
          this.applyRemoteConfig(config);
          return config;
        })
        .catch((error) => {
          this.log('Could not load /config', error);
          // Cleared so a launch that started offline can succeed later, rather
          // than caching the failure for the life of the process.
          this.configPromise = null;
          return null;
        });
    }
    return this.configPromise;
  }

  /**
   * Read `/config` again when the copy in hand is older than
   * `CONFIG_REFRESH_AFTER_MS`: a campaign published while the app is open then
   * appears on the next screen instead of after a relaunch.
   *
   * Called when the app returns to the foreground and when the screen changes.
   * Never awaited and never in front of a draw — surfaces keep drawing from the
   * copy they have until the new one lands. A failure keeps the old copy and
   * waits `CONFIG_RETRY_AFTER_MS`. When the answer differs, what was cached from
   * the old one is dropped and `on('config')` fires, so drawn components ask again.
   */
  private refreshRemoteConfigIfStale(): void {
    if (!this.initialized || this.destroyed) return;
    // The first read is still on its way: it is the fresh one.
    if (this.configPromise && this.configLoadedAt === 0) return;
    if (Date.now() - this.configLoadedAt < CONFIG_REFRESH_AFTER_MS) return;
    void this.configRefresh.run('config', () => this.refreshRemoteConfig());
  }

  private async refreshRemoteConfig(): Promise<void> {
    try {
      const config = await this.endpointsApi.getConfig();
      if (this.destroyed) return;
      this.configLoadedAt = Date.now();
      const signature = JSON.stringify(config ?? null);
      if (signature === this.configSignature) return;
      this.configSignature = signature;
      this.applyRemoteConfig(config);
      // The next `getSurfaces()` reads the new list from here, without a request.
      this.configPromise = Promise.resolve(config);
      this.surfaces = null;
      this.invalidateEnrichment();
      this.searchService?.invalidate();
      this.stripService?.invalidate();
      this.log('/config changed: surfaces and strips are asked again');
      this.emitter.emit('config', ++this.configVersion);
    } catch (error) {
      this.log('Could not re-read /config', error);
      this.configLoadedAt = Math.max(this.configLoadedAt, Date.now() - CONFIG_REFRESH_AFTER_MS + CONFIG_RETRY_AFTER_MS);
    }
  }

  private applyRemoteConfig(config: Record<string, unknown> | null): void {
    const remote = normalizeRemoteConfig(config);
    const themeBefore = JSON.stringify(this.remote?.theme ?? {});
    this.remote = remote;
    if (JSON.stringify(remote.theme ?? {}) !== themeBefore) this.emitter.emit('theme', this.getTheme());
    this.consent.setRequiresDecision(remote.consentRequired);
    if (remote.consentRequired && this.consent.isUndecided()) {
      this.log(
        'This channel waits for the visitor\'s consent decision: nothing is sent until ' +
          'setConsent() is called with your consent dialog\'s answer.'
      );
    }

    // A web channel's key in an app is a 403 on every write with nothing in the
    // response that says why. The payload knows which kind it is, so say so.
    if (remote.channelType === 'web') {
      this.log(
        'This is a WEB channel key. App events are authenticated by API key and a web ' +
          'channel validates Origin instead, so writes will be rejected. Use the app ' +
          "channel's key (Dashboard -> Channels -> the app channel -> API keys)."
      );
    }

    const tuning = remote.tracking;
    if (tuning.batchSize !== undefined && !this.explicitOptions.has('batchSize')) {
      this.options.batchSize = Math.min(Math.max(1, tuning.batchSize), MAX_BATCH_SIZE);
    }
    if (tuning.maxQueueSize !== undefined && !this.explicitOptions.has('maxQueueSize')) {
      this.options.maxQueueSize = tuning.maxQueueSize;
    }
    if (tuning.debug !== undefined && !this.explicitOptions.has('debug') && tuning.debug) {
      // One-way: the dashboard can turn diagnostics ON for a merchant chasing a
      // problem, but must not silence a host that asked for them.
      this.options.debug = true;
    }
    this.queue.configure({
      ...(tuning.maxQueueSize !== undefined && !this.explicitOptions.has('maxQueueSize')
        ? { maxQueueSize: tuning.maxQueueSize }
        : {}),
      ...(tuning.maxRetries !== undefined ? { maxRetries: tuning.maxRetries } : {}),
      ...(tuning.offlinePersistence !== undefined
        ? { persistence: tuning.offlinePersistence }
        : {}),
    });

    if (tuning.flushIntervalMs !== undefined && !this.explicitOptions.has('flushIntervalMs')) {
      this.options.flushIntervalMs = tuning.flushIntervalMs;
      this.startFlushTimer();
    }

    // The server decides whether the live heartbeat runs and how often; an API
    // older than the heartbeat sends no setting, and then none is sent.
    if (!this.destroyed) this.presence?.configure(tuning.presence);

    if (remote.enrichmentSlots.length > 0) {
      this.log(
        `Product enrichment slots on this channel: ${remote.enrichmentSlots.join(', ')}. ` +
          'Ask for them with getEnrichment(code, [slot]).'
      );
    } else if (remote.hasEnrichment) {
      // Rules exist but none carries a placement key, so nothing here is
      // addressable by name. On a web channel that is ordinary — those rules
      // are placed by selector — and in an app it is the whole reason a
      // merchant's content would silently not appear.
      this.log(
        'Product enrichment is configured but no rule carries a placement key, so no ' +
          'app screen can ask for one. Set a placement key on the rule in the dashboard.'
      );
    }
  }

  /** The site brand theme's resolved tokens, for a host that styles its own views. */
  getTheme(): Record<string, string> {
    return { ...(this.remote?.theme ?? {}) };
  }

  /** Whether search is on for this channel, and whether it is in test mode. */
  getSearchStatus(): { enabled: boolean; testMode: boolean } {
    return {
      enabled: this.remote?.searchEnabled ?? false,
      testMode: this.remote?.searchTestMode ?? false,
    };
  }

  /**
   * The app's language changed. The merchant's text is read again in it: the
   * cached `/config` and enrichment are dropped, and the next `getSurfaces()`,
   * `getEnrichment()`, recommendation or search call asks in the new language.
   * Nothing a host already drew changes on its own — redraw after this.
   */
  setLocale(locale: string | undefined): void {
    if (!this.http) return;
    const previous = this.http.getLocale();
    this.http.setLocale(locale);
    if (this.http.getLocale() === previous) return;
    this.invalidateSurfaces();
    this.invalidateEnrichment();
    // The search labels and behaviour are the merchant's text too: read again.
    this.searchService?.invalidate();
    this.stripService?.invalidate();
    this.emitter.emit('locale', this.http.getLocale());
  }

  /** The language passed to `init({ locale })` or `setLocale`, if any. */
  getLocale(): string | undefined {
    return this.http?.getLocale();
  }

  /** Forget the cached `/config`, so the next `getSurfaces()` refetches. */
  invalidateSurfaces(): void {
    this.surfaces = null;
    this.configPromise = null;
    this.searchService?.invalidate();
  }

  /**
   * The surface was shown — spend its frequency-cap allowance.
   *
   * Separate from `getSurfaces` on purpose: a surface can pass every gate and
   * still not draw (a trigger that never fires, `shouldRender` returning
   * false), and charging it then would silence the next screen for nothing.
   */
  async recordSurfaceShown(surface: Pick<Surface, 'id' | 'placement'>): Promise<void> {
    if (!surface.placement?.frequencyCap) return;
    await this.caps.recordShown(surface.id, this.identity.getSessionId());
  }

  /** The visitor's A/B assignments, for a host that reports its own funnels. */
  getExperimentAssignments(): ExperimentAssignment[] {
    return this.experiments.list();
  }

  /**
   * The surface became visible.
   *
   * `impression` / `click` with `entityType: 'campaign'` — the exact pair the
   * browser widget sends (`selwise.ts`). Parity is the point: the same campaign
   * reported on two channels has to add up in one report, and `widget_click`,
   * the name that reads better, is not in CANONICAL_EVENTS — the ingest
   * pipeline would have dropped it with no error anywhere.
   */
  trackSurfaceView(
    surface: Pick<Surface, 'id' | 'kind' | 'type' | 'scenario'>,
    /**
     * `basis: 'visible'` — the host counted this impression when the surface was
     * SEEN (an overlay drawn while the app is in front, a point on screen), not
     * when it was fetched. The dashboard withholds a click rate over a window
     * that mixes the two bases, and can only do that when the event says which
     * it is (the browser widget sends the same `impressionBasis`).
     */
    options: { basis?: 'visible' } = {}
  ): void {
    this.track('impression', {
      entityType: 'campaign',
      entityId: surface.id,
      metadata: {
        surfaceType: surface.type,
        ...scenarioMetadata(surface.scenario),
        ...(options.basis === 'visible' ? { impressionBasis: 'visible' } : {}),
      },
    });
  }

  /**
   * A tap on the surface, as the `click` the reports count — and, when the
   * surface is the tested one of an experiment, the arm's CLICK GOAL: the
   * experiment's results page counts it per variant (`POST /experiments/track`,
   * `eventType: 'click'`).
   */
  trackSurfaceClick(
    surface: Pick<Surface, 'id' | 'kind' | 'type' | 'scenario'> & Partial<Pick<Surface, 'experiment'>>,
    metadata?: TrackOptions['metadata']
  ): void {
    this.track('click', {
      entityType: 'campaign',
      entityId: surface.id,
      metadata: { surfaceType: surface.type, ...scenarioMetadata(surface.scenario), ...(metadata ?? {}) },
    });
    if (surface.experiment) this.recordExperimentClick(surface.experiment);
  }

  /**
   * Closing a surface, remembered.
   *
   * Persisted because the app process outlives the screen: without this the app
   * is the one surface where closing a popup accomplishes nothing, since the
   * next navigation re-evaluates the same list.
   */
  async dismissSurface(
    surface: Pick<Surface, 'id' | 'kind' | 'type' | 'content' | 'styles' | 'customCss' | 'customJs' | 'rawPlacement' | 'scenario'>,
  ): Promise<void> {
    this.assertReady();
    this.track('close', {
      entityType: 'campaign',
      entityId: surface.id,
      metadata: { surfaceType: surface.type, ...scenarioMetadata(surface.scenario) },
    });
    // How long the close holds is the surface's own `afterClose` (this
    // session by default, or a number of days that survives a relaunch).
    await this.dismissals.dismiss(surface);
  }

  /**
   * Newsletter signup.
   *
   * Records the canonical `user_signup` event too, so the widget's own report
   * shows the conversion rather than only the newsletter list growing.
   */
  async subscribeNewsletter(
    email: string,
    extra: {
      fullName?: string;
      locale?: string;
      surfaceId?: string;
      /**
       * An SMS opt-in, as on the web form: the number AND the shopper's own tick on
       * the consent line. A number without `smsConsent` is not sent — typing a
       * phone number is not consent to be texted.
       */
      phone?: string;
      smsConsent?: boolean;
      /**
       * The consent wording the form showed next to the field, exactly as shown,
       * and the version of that wording: the opt-in's evidence (a permission with
       * no wording is a claim, not a record). The components send them.
       */
      consentText?: string;
      consentTextVersion?: string;
      /** The screen the form was on. Defaults to the screen the host last named. */
      sourcePath?: string;
    } = {}
  ): Promise<{ success: boolean }> {
    this.assertReady();
    const phone = extra.smsConsent && extra.phone ? extra.phone.trim() : '';
    // The API's bounds (a longer value is a 400 that would lose the signup).
    const consentText = (extra.consentText ?? '').trim().slice(0, 1000);
    const sourcePath = extra.sourcePath ?? this.currentPageUrl;

    const siteUserId = this.identity.getSiteUserId();
    const response = await this.endpointsApi.subscribeNewsletter({
      email,
      ...(extra.fullName ? { fullName: extra.fullName } : {}),
      ...(phone ? { phone, channels: ['email', 'sms'] as Array<'email' | 'sms'> } : {}),
      ...(extra.locale ? { locale: extra.locale } : {}),
      visitorId: this.identity.getVisitorId(),
      ...(siteUserId ? { siteUserId } : {}),
      ...(sourcePath ? { sourcePath } : {}),
      ...(consentText ? { consentText } : {}),
      ...(consentText && extra.consentTextVersion
        ? { consentTextVersion: extra.consentTextVersion.slice(0, 40) }
        : {}),
    });

    const success = response?.success !== false && !response?.error;
    // A signup the server did not accept is not a conversion: the event used to be
    // recorded before the answer was read, so a rejected address still counted.
    if (success) {
      this.track('user_signup', {
        entityType: extra.surfaceId ? 'campaign' : 'custom',
        ...(extra.surfaceId ? { entityId: extra.surfaceId } : {}),
        metadata: { channel: 'newsletter' },
      });
    }

    return { success };
  }

  /** Clears every remembered dismissal. For a merchant testing their own app. */
  async resetDismissals(): Promise<void> {
    this.assertReady();
    await this.dismissals.clear();
  }

  /**
   * `widget_impression` for a recommendation widget that became visible.
   *
   * Recorded under the strip the visitor's arm DRAWS — a host that keeps the
   * listed widget's id is mapped to the arm's strip, as the browser widget
   * reports the arm's own id — and never for a strip the arm draws nothing
   * for. The arm's EXPOSURE rides with it: once per arm per process, the
   * first time the strip is on screen, which is the browser widget's moment
   * (`ExperimentManager.trackImpression`) and the same for every arm, so the
   * comparison is like for like. Never in test mode.
   */
  trackRecommendationImpression(
    widgetId: string,
    productItemCodes: string[] = [],
    /**
     * `basis: 'visible'` — the host counted this impression when the strip was
     * SEEN (on screen, the card half visible), not when it was drawn. The dashboard
     * withholds a click rate over a window that mixes the two bases, and can only
     * do that when the event says which it is (the browser widget sends the same
     * `impressionBasis`). Leave it out when the host counts at the draw.
     */
    options: { basis?: 'visible' } = {}
  ): void {
    if (!this.initialized || this.destroyed) return;
    const arm = this.trackedArm(widgetId);
    if (arm.hidden) {
      this.log(`Impression not recorded: the visitor's arm draws nothing for ${arm.sourceWidgetId}`);
      return;
    }
    this.track('widget_impression', {
      entityType: 'recommendation',
      entityId: arm.widgetId,
      metadata: {
        productCount: productItemCodes.length,
        ...(options.basis === 'visible' ? { impressionBasis: 'visible' } : {}),
      },
    });
    if (arm.assignment) this.recordExperimentExposure(arm.assignment);
  }

  /**
   * `product_click` inside a recommendation widget — the click attribution
   * depends on. Mapped to the drawn strip like the impression; a click is
   * proof the strip was on screen, so it records the arm's exposure too if
   * the impression never did (deduplicated, so this costs nothing otherwise).
   */
  trackRecommendationClick(widgetId: string, itemCode: string, position?: number): void {
    if (!this.initialized || this.destroyed) return;
    const arm = this.trackedArm(widgetId);
    if (arm.hidden) return;
    const drawnId = arm.widgetId;
    this.track('product_click', {
      entityType: 'recommendation',
      entityId: drawnId,
      productItemCode: itemCode,
      metadata: position === undefined ? { widgetId: drawnId } : { widgetId: drawnId, position },
    });
    if (arm.assignment) {
      this.recordExperimentExposure(arm.assignment);
      this.recordExperimentClick(arm.assignment);
    }
  }

  /**
   * `add_to_cart` from a recommendation strip: a product the shopper added from
   * the strip, which is what credits the strip with the add (the same event the
   * browser widget writes under the strip's id). Reported for an add the host's
   * basket took — never for one it refused.
   */
  trackRecommendationAddToCart(widgetId: string, itemCode: string, metadata?: TrackOptions['metadata']): void {
    if (!this.initialized || this.destroyed) return;
    const arm = this.trackedArm(widgetId);
    if (arm.hidden || !itemCode) return;
    this.track('add_to_cart', {
      entityType: 'recommendation',
      entityId: arm.widgetId,
      productItemCode: itemCode,
      ...(metadata ? { metadata } : {}),
    });
  }

  /**
   * One "add all" press on a look: what was asked and what each line came to
   * (`requested`, `added`, `failed`, `needsSize`), the figure the strip's add-all
   * button is judged by.
   */
  trackRecommendationAddAll(
    widgetId: string,
    outcome: { requested: number; added: number; failed: number; needsSize: number }
  ): void {
    if (!this.initialized || this.destroyed) return;
    const arm = this.trackedArm(widgetId);
    if (arm.hidden) return;
    this.track('cart_add_all', {
      entityType: 'recommendation',
      entityId: arm.widgetId,
      metadata: { ...outcome, platform: 'app' },
    });
  }

  /**
   * Whether a strip's frequency cap (`triggerConfig.frequencyCap`) keeps it off
   * this screen: null when it may be drawn, else the rule that blocked it.
   * The ledger is the surfaces' (`FrequencyCapStore`), counted on this device.
   */
  recommendationCapBlock(widgetId: string, cap: FrequencyCapConfig | null | undefined): keyof FrequencyCapConfig | null {
    if (!this.initialized || this.destroyed) return null;
    return this.caps.blockedBy(`display:recommendation:${widgetId}`, cap, this.identity.getSessionId());
  }

  /** A capped strip was SHOWN (seen): spend its allowance. A strip with no cap costs nothing. */
  async recordRecommendationShown(widgetId: string, cap: FrequencyCapConfig | null | undefined): Promise<void> {
    if (!this.initialized || this.destroyed || !cap || Object.keys(cap).length === 0) return;
    await this.caps.recordShown(`display:recommendation:${widgetId}`, this.identity.getSessionId());
  }

  // ---- product enrichment ----

  /**
   * The merchant's own markup for a product, for the named slots a screen has.
   *
   * Enrichment is the module a merchant touches most, and it was the one the
   * app did not have. The web widget places blocks by CSS selector; a screen
   * has no DOM, so it asks for a NAMED slot instead (`placementKey`, the same
   * name the merchant types in the dashboard) and receives markup the server
   * has already interpolated, sanitized and scoped.
   *
   * Returns DATA. `<SelwiseEnrichment />` renders it in the app's WebView with
   * height reporting; a host doing its own rendering gets `item.html` and
   * `item.css` and puts them wherever it likes.
   *
   * Test mode and segment membership are applied HERE, not on the server —
   * that is what lets one product-keyed response be cached for every visitor,
   * and it is the same split campaigns and widgets use.
   */
  /**
   * Collect the scenario deliveries waiting for this shopper.
   *
   * Call it on foreground, not per screen. A scenario delivery is a reminder
   * about something the shopper did on an earlier visit, so it is by
   * definition less urgent than whatever screen they just opened — and the
   * server holds the claim until its TTL either way.
   *
   * The SDK returns the claims and records the outcome; the HOST draws them,
   * with its own components, exactly as it draws any other surface. Frequency
   * caps are applied here because the counters live on this device, and only
   * when the step asked for them — a cap decided three days ago at claim time
   * is a cap decided against the wrong day.
   *
   * Nothing is drawn twice: a claim this install already showed is
   * acknowledged again rather than re-offered, which covers the case where the
   * app was killed before the first acknowledgement landed.
   */
  async getScenarioInbox(signal?: AbortSignal): Promise<ScenarioInboxEntry[]> {
    this.assertReady();

    // The bootstrap already said whether this channel runs a scenario that can
    // leave anything. Asking anyway would be a request per foreground on every
    // channel that has never published one.
    if (this.remote && !this.remote.scenariosEnabled) return [];
    if (await this.controlGroupDecided()) return [];

    const visitorId = this.identity.getVisitorId();
    if (!visitorId) return [];
    // A step chosen from the visitor's journey is personalization; without
    // that consent nothing is collected, and nothing is acknowledged.
    if (!this.consentAllows('personalization')) return [];

    const entries = normalizeScenarioInbox(
      await this.endpointsApi.getScenarioInbox(visitorId, signal, { testMode: this.testMode }).catch((error) => {
        this.log('Could not load scenario inbox', error);
        return null;
      })
    );
    if (entries.length === 0) return [];

    const alreadySeen: Array<{ deliveryId: string; outcome: string }> = [];
    const deliverable: ScenarioInboxEntry[] = [];

    for (const entry of entries) {
      if (this.scenarioSeen.has(entry.deliveryId)) {
        alreadySeen.push({ deliveryId: entry.deliveryId, outcome: 'shown' });
        continue;
      }
      deliverable.push(entry);
    }

    if (alreadySeen.length > 0) {
      void this.acknowledgeScenarioDeliveries(alreadySeen);
    }

    return deliverable;
  }

  /**
   * Record what the host did with each claim.
   *
   * `shown` marks the delivery locally too, so a failed acknowledgement cannot
   * make the same reminder reappear on the next foreground.
   */
  /**
   * The scenario claims that can be drawn on THIS screen, as surfaces — the app
   * counterpart of the browser widget's inbox pass, in its order and with its
   * rules, so a host that draws surfaces draws these the same way.
   *
   * A claim becomes one of three things:
   *
   * - **drawn here** — returned, with the step's merge fields laid over its
   *   content and the scenario's ids on it (`surface.scenario`), so its
   *   impression and click credit the scenario;
   * - **not for this screen, yet** — left OPEN and not returned: its page rules,
   *   test mode or words do not fit this screen, and a later screen inside the
   *   claim's lifetime may (the web keeps such a visitor "on hold" the same way);
   * - **never** — closed at once with its reason: the campaign is gone
   *   (`entity_missing`), a public campaign's own audience refused this visitor
   *   (`audience_mismatch`) or the step's frequency cap blocked it
   *   (`frequency_cap`). Reported, so the scenario report can say why nobody saw it.
   *
   * The host reports `shown` with `acknowledgeScenarioDeliveries` when it draws one
   * (`<SelwiseSurfaces />` does). The inbox is asked at most once a minute; pass
   * `refresh: true` when the app comes to the foreground.
   */
  async getScenarioSurfaces(
    pageUrl?: string,
    context: {
      pageType?: string;
      deviceType?: SurfaceFilter['deviceType'];
      product?: ProductInput | null;
    } = {},
    options: { refresh?: boolean } = {}
  ): Promise<ScenarioSurface[]> {
    this.assertReady();
    const claims = await this.scenarioInboxEntries(Boolean(options.refresh));
    if (claims.length === 0) return [];

    if (!this.surfaces) {
      const config = await this.loadRemoteConfig();
      this.surfaces = config ? normalizeSurfaces(config) : [];
    }

    const screen = pageUrl ?? this.currentPageUrl ?? '';
    const cart = this.cart.get();
    const product = normalizeProductInput(context.product);
    const behavior = this.withOwnSignals(withProductSignals(withCartSignals(undefined, cart), product));
    const sessionId = this.identity.getSessionId();
    const contentContext = {
      behavior,
      cart,
      product,
      format: { currency: this.remote?.currency ?? null },
    };

    const drawable: ScenarioSurface[] = [];
    const closed: ScenarioInboxAcknowledgement[] = [];
    const close = (entry: ScenarioInboxEntry, outcome: ScenarioInboxAcknowledgement['outcome']) =>
      closed.push({ deliveryId: entry.deliveryId, outcome });

    for (const entry of claims) {
      if (!entry.available) {
        close(entry, 'suppressed:entity_missing');
        continue;
      }
      const base = entry.scenarioOnly
        ? normalizeSurface(entry.campaign, 'campaign')
        : (this.surfaces ?? []).find((surface) => surface.id === entry.campaignId) ?? null;
      if (!base) {
        close(entry, 'suppressed:entity_missing');
        continue;
      }
      const personalised: Surface = {
        ...base,
        content: { ...base.content, ...entry.tokens },
        scenario: {
          scenarioId: entry.scenarioId,
          runId: entry.runId,
          nodeId: entry.nodeId,
          deliveryId: entry.deliveryId,
        },
      };

      // The campaign's own rules for THIS screen; a miss leaves the claim open.
      const [matched] = selectSurfaces([personalised], {
        pageUrl: screen,
        deviceType: context.deviceType ?? 'mobile',
        ...(context.pageType ? { pageType: context.pageType } : {}),
        ...(this.remote?.country ? { country: this.remote.country } : {}),
        ...(behavior ? { behavior } : {}),
        testMode: this.testMode,
      });
      if (!matched) continue;

      // A scenario campaign has no audience of its own: the scenario admitted this
      // shopper. A PUBLIC campaign keeps its own, and a refusal there is its own reason.
      if (
        !entry.scenarioOnly &&
        !(await this.segments.shouldShow(personalised.segmentTargetingMode, personalised.segmentIds, {
          pageUrl: screen,
        }))
      ) {
        close(entry, 'suppressed:audience_mismatch');
        continue;
      }

      const shaped = resolveSurfaceContent(personalised, contentContext);
      if (!shaped) continue;

      if (entry.respectFrequencyCaps && this.caps.blockedBy(shaped.id, shaped.placement.frequencyCap, sessionId)) {
        close(entry, 'suppressed:frequency_cap');
        continue;
      }
      drawable.push({ deliveryId: entry.deliveryId, surface: shaped });
    }

    if (closed.length > 0) void this.acknowledgeScenarioDeliveries(closed);
    return drawable;
  }

  async acknowledgeScenarioDeliveries(
    acknowledgements: ReadonlyArray<ScenarioInboxAcknowledgement>,
    signal?: AbortSignal
  ): Promise<void> {
    if (acknowledgements.length === 0) return;
    const visitorId = this.identity.getVisitorId();
    if (!visitorId) return;

    for (const ack of acknowledgements) {
      if (ack.outcome === 'shown') this.scenarioSeen.add(ack.deliveryId);
    }
    // A claim the host has answered is closed server-side; keeping it here would
    // draw it again on the next screen.
    if (this.scenarioClaims) {
      const answered = new Set(acknowledgements.map((ack) => ack.deliveryId));
      this.scenarioClaims = {
        ...this.scenarioClaims,
        entries: this.scenarioClaims.entries.filter((entry) => !answered.has(entry.deliveryId)),
      };
    }

    await this.endpointsApi
      .acknowledgeScenarioDeliveries(
        visitorId,
        acknowledgements.map((ack) => ({ deliveryId: ack.deliveryId, outcome: ack.outcome })),
        signal
      )
      .catch((error) => this.log('Could not acknowledge scenario deliveries', error));
  }

  async getEnrichment(
    code: string,
    slots: readonly string[],
    signal?: AbortSignal,
    /**
     * `probe`: the caller asks speculatively (a `<SelwiseSlot>` draws whatever
     * enrichment happens to carry its name). An empty answer is then the ordinary
     * case, not something `explain()` should list.
     */
    options: { probe?: boolean } = {}
  ): Promise<EnrichmentResult> {
    this.assertReady();

    const productCode = String(code ?? '').trim();
    const keys = normalizePlacementKeys(slots ?? []);
    if (!productCode || keys.length === 0) return { ...EMPTY_ENRICHMENT, code: productCode };
    // Decided before asking. Once the channel's config is in, a channel with no
    // enrichment — the module is not in its plan, or no rule is live — answers no
    // product screen with anything but an error or an empty list, so the request
    // is not sent. Before the config lands the answer is not known, and the
    // request goes out as it always did.
    //
    // The decision is recorded per slot (`explain()`): it used to be silent, and a
    // merchant whose block was not on the screen had nothing to read.
    const known = this.remote?.enrichmentSlots ?? [];
    if (this.remote && !this.remote.hasEnrichment) {
      if (!options.probe) for (const key of keys) this.noteEnrichment(key, 'unknown_slot', { known: '' });
      return { ...EMPTY_ENRICHMENT, code: productCode };
    }
    if (await this.controlGroupDecided()) {
      for (const key of keys) this.noteEnrichment(key, 'control_group');
      return { ...EMPTY_ENRICHMENT, code: productCode };
    }

    // The stamp comes from `/config`, so a screen that renders before the
    // bootstrap lands simply misses the cache once rather than serving stale
    // markup off an unknown version.
    const stamp = this.remote?.enrichmentVersion ?? '';
    const cached = this.enrichmentCache.get(productCode, keys, stamp, this.testMode ? 'test' : '');

    const result =
      cached ??
      normalizeEnrichment(
        await this.endpointsApi
          .getEnrichment(productCode, keys, { testMode: this.testMode }, signal)
          .catch((error) => {
            this.log('Could not load enrichment', error);
            return null;
          })
      );

    if (!cached && result.v) {
      this.enrichmentCache.set(productCode, keys, result, this.testMode ? 'test' : '');
    }

    const visible: EnrichmentItem[] = [];
    const candidates = selectByTestMode(result.items, this.testMode);
    // Why a slot is empty, by slot: the first reason that took a rule out of it.
    const left = new Map<string, { reason: AppExplainReason; detail?: NotShownDetail }>();
    for (const item of result.items) {
      if (!candidates.includes(item)) {
        if (!left.has(item.placementKey)) left.set(item.placementKey, { reason: 'test', detail: { assignmentId: item.assignmentId } });
      }
    }
    const verdicts = await this.segments.shouldShowMany(
      candidates.map((item) => ({ mode: item.segmentTargetingMode, segmentIds: item.segmentIds })),
      { pageUrl: this.currentPageUrl ?? '' }
    );
    for (const [index, item] of candidates.entries()) {
      const inSegment = verdicts[index];
      if (!inSegment) {
        this.log(`Enrichment rule outside segment targeting: ${item.assignmentId}`);
        if (!left.has(item.placementKey)) left.set(item.placementKey, { reason: 'segment', detail: { assignmentId: item.assignmentId } });
        continue;
      }
      visible.push(item);
    }

    // After targeting, so a slot's winner is the first rule this visitor can see.
    const winners = keepSlotWinners(visible);
    for (const key of keys) {
      if (winners.some((item) => item.placementKey === key)) {
        // Drawn from the SDK's side; `<SelwiseEnrichment>` says if the WebView then fails.
        this.noteEnrichment(key, null);
        continue;
      }
      const why = left.get(key);
      if (why) this.noteEnrichment(key, why.reason, why.detail);
      else if (visible.some((item) => item.placementKey === key)) this.noteEnrichment(key, 'conflict');
      // A name no live rule carries (asked anyway: the copy of `/config` may be older than the rule).
      else if (options.probe) continue;
      else if (known.length > 0 && !known.includes(key)) this.noteEnrichment(key, 'unknown_slot', { known: known.join(',') });
      // Nothing matched this product: the catalogue knows the code or it does not.
      else this.noteEnrichment(key, 'content', { code: productCode, resolved: result.resolved });
    }
    return { ...result, items: winners };
  }

  /** The rules for one slot, in stacking order. */
  enrichmentForSlot(result: EnrichmentResult, slot: string): EnrichmentItem[] {
    return itemsForSlot(result.items, slot);
  }

  /**
   * An enrichment rule became visible.
   *
   * One impression per RULE however many blocks it stacks — the server puts a
   * rule's blocks into one root for exactly this reason, and it is the same
   * `impression` / `entityType` pair the browser widget sends so the two
   * channels add up in one report.
   *
   * That pair is `enrichment`, not `widget`. This sent `widget` until
   * September 2026 while claiming parity in this very comment, so every app
   * enrichment impression and click landed in the campaign funnel and the
   * enrichment report undercounted by exactly the app's traffic.
   */
  trackEnrichmentView(item: Pick<EnrichmentItem, 'assignmentId' | 'placementKey'>): void {
    this.track('impression', {
      entityType: 'enrichment',
      entityId: item.assignmentId,
      metadata: { surfaceType: 'enrichment', placementKey: item.placementKey },
    });
  }

  trackEnrichmentClick(
    item: Pick<EnrichmentItem, 'assignmentId' | 'placementKey'>,
    metadata?: TrackOptions['metadata']
  ): void {
    this.track('click', {
      entityType: 'enrichment',
      entityId: item.assignmentId,
      metadata: {
        surfaceType: 'enrichment',
        placementKey: item.placementKey,
        ...(metadata ?? {}),
      },
    });
  }

  /**
   * The placement keys this channel's live rules carry.
   *
   * What makes the app side free-form: a screen can render whatever slots the
   * merchant has actually named, and say in debug that one is unrendered,
   * rather than both sides guessing at a shared convention.
   */
  getEnrichmentSlots(): string[] {
    return [...(this.remote?.enrichmentSlots ?? [])];
  }

  /** Forget cached enrichment markup, so the next call refetches. */
  invalidateEnrichment(): void {
    this.enrichmentCache.clear();
  }

  // ---- search ----

  /**
   * The search of this client: settings, suggestions, the search and its events
   * (see `SearchService`). One per client, built the first time it is asked.
   */
  private get searchSvc(): SearchService {
    if (!this.searchService) {
      this.searchService = new SearchService({
        getConfig: () => this.endpointsApi.getSearchConfig(),
        getSuggestions: () => this.endpointsApi.getSearchSuggestions(),
        search: (query, options, signal) => this.endpointsApi.search(query, options, signal),
        blockedByTestMode: async () => {
          if (!this.remote) await this.loadRemoteConfig();
          return this.remote?.searchTestMode === true && !this.testMode;
        },
        testMode: () => this.testMode,
        locale: () => this.http.getLocale() ?? '',
        screen: () => this.currentPageUrl ?? '',
        inAudience: (mode, segmentIds) =>
          this.segments.shouldShow(mode, segmentIds, { pageUrl: this.currentPageUrl ?? '' }),
        arm: async () => {
          await this.loadExperiments();
          // The arms THIS screen lets the visitor into, like a strip's.
          return (await this.stripGate()).forTargetType('search_config');
        },
        expose: (assignment) => this.recordExperimentExposure(assignment),
        track: (name, options) => this.track(name, options),
        mayKeepHistory: () => this.consentAllows('searchHistory'),
        storage: () => this.storage,
        channelKey: () => this.options.siteKey,
        log: (message, detail) => this.log(message, detail),
      });
    }
    return this.searchService;
  }

  /**
   * Whether search is on for this visitor, and the settings they draw — the one
   * answer behind `getSearchSettings()`, for a host that must tell "off" from
   * "not known yet": `off` (the channel's search is off, the visitor is outside
   * its audience or in an experiment's holdout), `test` (in test mode, and this
   * client was not started with `testMode`), `unknown` (the configuration could
   * not be read — nothing is blocked, and it is asked again next time).
   */
  getSearchState(): Promise<SearchResolution> {
    this.assertReady();
    return this.searchSvc.resolve();
  }

  /**
   * The channel's search settings as THIS visitor draws them: the dashboard's
   * document (`/search-config`) in the app's language, with the phone's own
   * layer over it and — when the visitor is in a search experiment — the arm's
   * changes over that. `null` when search is not on for them (see
   * `getSearchState` for why). Read once per language and screen; read again
   * after `setLocale` and after the configuration is refreshed.
   */
  async getSearchSettings(): Promise<SearchSettings | null> {
    return (await this.getSearchState()).settings;
  }

  /**
   * The channel's search behaviour as the dashboard set it: how many characters
   * start a search, how long to wait after typing, how many results a page
   * holds. `null` when the settings are not on or could not be read (the hook
   * keeps its own defaults).
   */
  async getSearchBehavior(): Promise<SearchBehavior | null> {
    return (await this.getSearchSettings())?.behavior ?? null;
  }

  /**
   * What the empty search box offers: this device's recent searches, the
   * channel's popular searches, categories and products — each cut to the
   * limit the settings say, in `order`. `query` narrows the two lists of terms to
   * those containing it. A section the merchant switched off is empty.
   *
   * Recent searches are kept on the device only while the visitor's consent
   * allows remembering them (the preferences category); without it they live in
   * memory until the app closes.
   */
  async getSearchSuggestions(options: { query?: string } = {}): Promise<SearchSuggestionSections> {
    this.assertReady();
    return this.searchSvc.suggestions(options);
  }

  /** This device's last searches, newest first (`max`: the channel's own limit by default). */
  async getRecentSearches(max?: number): Promise<string[]> {
    this.assertReady();
    const limit = max ?? (await this.getSearchSettings())?.suggestions.recent.max ?? 6;
    return this.searchSvc.recentSearches(limit);
  }

  removeRecentSearch(term: string): Promise<void> {
    this.assertReady();
    return this.searchSvc.removeRecentSearch(term);
  }

  /** Forgets this device's recent searches (the box's "clear" action). */
  clearRecentSearches(): Promise<void> {
    this.assertReady();
    return this.searchSvc.clearRecentSearches();
  }

  /**
   * Searches the channel's catalogue. A page is `options.limit` results (the
   * channel's `maxResults` by default) from `options.offset`; the next page
   * starts at `offset + hits.length`. An empty query with a `category` browses
   * that category.
   *
   * Reported once per search, from the first page: `search_query`, or
   * `search_zero_results` when nothing matched; a merchant's redirect is an
   * answer and is reported as a search. A page, a category or an order of the
   * same search is `options.refinement` and is not reported again. The click
   * and the add to cart are the view's to report (`trackSearchClick`,
   * `trackSearchAddToCart`).
   *
   * `status` says when the list is empty for a reason that is not "nothing
   * matched" (`off`, `test`).
   */
  async search(query: string, options: SearchOptions = {}, signal?: AbortSignal): Promise<SearchResult> {
    this.assertReady();
    return this.searchSvc.search(query, options, signal);
  }

  /**
   * The search was opened. The first open of a visitor who is in a search
   * experiment is their exposure to its arm. `trigger`: a button (`click`, the
   * default), the field taking focus (`focus`) or typing (`typing`).
   */
  trackSearchOpen(trigger: SearchOpenTrigger = 'click'): void {
    this.assertReady();
    void this.searchSvc.open(trigger).catch((error) => this.log('Search open not reported', error));
  }

  /**
   * The search was closed. Reports how long it was open and the last query and
   * count the SDK saw; pass `summary` to say them yourself. Nothing is sent for
   * a search that was not opened with `trackSearchOpen`.
   */
  trackSearchClose(summary?: { query?: string; resultCount?: number }): void {
    this.assertReady();
    this.searchSvc.close(summary);
  }

  /**
   * A suggestion was tapped: a recent search, a popular search or category (their
   * text), or a popular product (the product; the tap is also a click out of the
   * search).
   */
  trackSuggestionClick(kind: 'recent' | 'popularSearch' | 'popularCategory', term: string): void;
  trackSuggestionClick(kind: 'popularProduct', product: SelwiseProduct): void;
  trackSuggestionClick(kind: SearchSuggestionKind, value: string | SelwiseProduct): void {
    this.assertReady();
    this.searchSvc.suggestionClick(kind, value);
  }

  /**
   * A result was tapped. `query` is the term it came from and `category` the
   * category the result counts under (the one the shopper filtered by, else the
   * result's own top category — `primaryTopCategory(product.categories)`); the
   * API's search log is written from this event, so a popular product and a
   * popular category are counted from it.
   */
  trackSearchClick(query: string, itemCode: string, position?: number, category?: string): void {
    this.assertReady();
    this.searchSvc.click(query, itemCode, position, category);
  }

  /** A product was added to the basket from the search: the add is attributed to it. */
  trackSearchAddToCart(
    product: Pick<SelwiseProduct, 'itemCode' | 'title' | 'price' | 'currency'>,
    options?: { query?: string; quantity?: number }
  ): void {
    this.assertReady();
    this.searchSvc.addedToCart(product, options);
  }

  // ---- orders ----

  /**
   * Records a completed order. This is what campaign/widget revenue reporting
   * is built on, so it must fire for every order the app completes — including
   * ones finished inside the checkout WebView (forward them with `WebViewBridge`).
   *
   * Awaited on purpose: unlike `track()`, losing an order loses revenue
   * attribution, so callers should know whether it landed.
   */
  async trackOrder(order: OrderInput): Promise<{ success: boolean; created: boolean; id?: string }> {
    this.assertReady();

    // Any pending interaction must be recorded before the order so last-touch
    // attribution sees the click that led to it.
    await this.flush().catch(() => undefined);

    const siteUserId = this.identity.getSiteUserId();
    const sessionId = this.identity.getSessionId();
    // The order is the merchant's record and always goes; who placed it and
    // the visit it closes go only with the visitor's consent to being
    // measured. Without it the order is stored unattributed.
    const measured = this.consentAllows('orderAttribution');
    const { visitorId: _visitorId, siteUserId: _siteUserId, sessionId: _sessionId, ...anonymous } =
      order as OrderInput & { visitorId?: string; siteUserId?: string; sessionId?: string };
    // `originalPrice` is a typed convenience: the order route reads a line's
    // other facts from its `metadata`, where the list price is kept.
    const lines = order.items?.map(({ originalPrice, ...line }) =>
      typeof originalPrice === 'number' && Number.isFinite(originalPrice)
        ? { ...line, metadata: { ...(line.metadata ?? {}), originalPrice } }
        : line
    );
    return this.endpointsApi.ingestOrder({
      ...(measured
        ? {
            ...order,
            ...(lines ? { items: lines } : {}),
            sessionId,
            visitorId: this.identity.getVisitorId(),
            ...(siteUserId ? { siteUserId } : {}),
          }
        : { ...anonymous, ...(lines ? { items: lines } : {}) }),
      deviceType: 'mobile_app',
      metadata: {
        ...(order.metadata ?? {}),
        clientPlatform: this.options.clientPlatform,
        // The visit the order was placed in (see the event payload's
        // `journeyId`), so the API need not guess it from the latest event.
        ...(measured ? { journeyId: sessionId } : {}),
      },
    });
  }

  // ---- internals ----

  /**
   * What the app knows about the person that a segment can be built on: the OS,
   * the release, the language, the notification permission. Only what the host
   * gave (an absent fact is "unknown", never a default), and bounded to what the
   * server accepts — one value too long would be a 400 for the WHOLE segment
   * request, which the include-mode gate reads as "member of nothing".
   */
  private appFacts(): {
    platform?: 'ios' | 'android';
    appVersion?: string;
    appLocale?: string;
    pushPermission?: PushPermission;
  } {
    const clip = (value: string | undefined): string | undefined => {
      const text = (value ?? '').trim();
      return text.length > 0 && text.length <= APP_FACT_MAX_LENGTH ? text : undefined;
    };
    const appVersion = clip(this.options.appVersion);
    const appLocale = clip(this.http?.getLocale());
    return {
      ...(this.options.platform ? { platform: this.options.platform } : {}),
      ...(appVersion ? { appVersion } : {}),
      ...(appLocale ? { appLocale } : {}),
      ...(this.pushPermission ? { pushPermission: this.pushPermission } : {}),
    };
  }

  /** Does the visitor's consent answer allow this request (`CONSENT_CHANNEL_CATEGORIES`)? */
  private consentAllows(channel: ConsentChannel): boolean {
    return this.consent.hasCategory(CONSENT_CHANNEL_CATEGORIES[channel]);
  }

  /**
   * The behaviour snapshot with every signal the SDK knows itself filled in:
   * the consent answer (`consentMarketing`, …) — so a surface or an experiment
   * the merchant restricted to consenting visitors is judged in the app as on
   * the web — and the clock and session signals (`hourOfDay`, `visitCount`,
   * `pageViewsThisSession`, …, `core/visitor-signals.ts`). A host that passes its
   * own values wins, as for the cart signals.
   */
  private withOwnSignals(behavior: BehaviorSnapshot | undefined): BehaviorSnapshot {
    return {
      ...this.visitor.snapshot(),
      consentAnalytics: this.consent.hasCategory('analytics'),
      consentMarketing: this.consent.hasCategory('marketing'),
      consentPreferences: this.consent.hasCategory('preferences'),
      ...(behavior ?? {}),
    };
  }

  private startFlushTimer(): void {
    if (this.options.flushIntervalMs <= 0) return;
    this.stopFlushTimer();
    this.flushTimer = setInterval(() => {
      void this.flush();
    }, this.options.flushIntervalMs);
  }

  private stopFlushTimer(): void {
    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  private assertReady(): void {
    if (!this.initialized) {
      throw new Error('[Selwise] call init() before using the SDK');
    }
  }

  /** Reported whatever `debug` says: a problem the integrator must see. */
  private warn(message: string, detail?: unknown): void {
    if (detail === undefined) {
      console.warn(`[Selwise] ${message}`);
    } else {
      console.warn(`[Selwise] ${message}`, detail);
    }
  }

  private log(message: string, detail?: unknown): void {
    if (!this.options?.debug) return;
    if (detail === undefined) {
      console.log(`[Selwise] ${message}`);
    } else {
      console.log(`[Selwise] ${message}`, detail);
    }
  }
}

/** How many events of a batch the server refused, from its 200 answer. */
function readRejectedCount(response: unknown): number {
  if (!response || typeof response !== 'object') return 0;
  const body = response as { rejected?: unknown; results?: unknown };
  const fromCount = typeof body.rejected === 'number' && Number.isFinite(body.rejected) ? body.rejected : 0;
  const fromResults = Array.isArray(body.results)
    ? body.results.filter((r) => r && typeof r === 'object' && (r as { success?: unknown }).success === false).length
    : 0;
  return Math.max(fromCount, fromResults);
}

function isPermanentRejection(status: number): boolean {
  if (status === 408 || status === 429) return false;
  return status >= 400 && status < 500;
}
