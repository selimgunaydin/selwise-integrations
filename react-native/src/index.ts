export {
  Selwise,
  SDK_VERSION,
  type ScenarioSurface,
} from './client.js';
export { Endpoints } from './api/endpoints.js';
export { WebViewBridge, WEBVIEW_BRIDGE_SCRIPT } from './bridge/webview.js';
export { DEFAULT_CONSENT } from './core/consent.js';
export { generateId, SESSION_TIMEOUT_MS } from './core/ids.js';
export { MemoryStorage, STORAGE_KEYS } from './core/storage.js';
export {
  DismissalStore,
  normalizePlacement,
  normalizeSurface,
  normalizeSurfaces,
  resolveConflicts,
  resolveSurfaceContent,
  selectSurfaces,
} from './core/surfaces.js';
export { normalizeCartInput, withCartSignals } from './core/cart.js';
export { normalizeProductInput } from './core/product.js';
export { readDeepLinkAttribution, MESSAGE_ATTRIBUTION_PARAM } from './core/deep-link.js';
export { goalStepsCrossed } from './core/goal-bar.js';
/**
 * The strips of a screen — which ones the visitor's A/B arm draws and what is in
 * them, with the requests a screen's points share (`Selwise.strips` is the one
 * service of a client). What `@selwise/react-native/ui`'s components draw from.
 */
export { filterByPlacement, normalizeContext, SHARED_LOAD_MS, StripService } from './core/strips.js';
export { Emitter } from './core/events.js';
/**
 * One recommendation strip's products, kept current — what
 * `useRecommendationWidget` runs on, React-free, so a host that draws strips
 * without the hook (`Selwise.strips.follow`) keeps a "complete to free
 * shipping" strip in step with the basket the same way.
 */
export {
  CART_REFRESH_DEBOUNCE_MS,
  EMPTY_RECOMMENDATION_WIDGET_STATE,
  RecommendationWidgetLoader,
} from './core/recommendation-widget.js';
export {
  deepMerge,
  ExperimentGate,
  FrequencyCapStore,
  SegmentGate,
  normalizeSegmentIds,
} from './core/eligibility.js';
export { normalizeRemoteConfig } from './core/remote-config.js';
export { ScenarioSeenStore, normalizeScenarioInbox } from './core/scenario-inbox.js';
export {
  EnrichmentCache,
  EMPTY_ENRICHMENT,
  itemsForSlot,
  keepSlotWinners,
  normalizeEnrichment,
  normalizeEnrichmentItem,
  normalizePlacementKey,
  normalizePlacementKeys,
  selectByTestMode,
} from './core/enrichment.js';
export { evaluateTargeting, evaluatePageTargeting, matchUrlPattern } from './vendor/page-targeting.js';
/**
 * Where a `countdown_timer` counts to right now, as epoch ms: its fixed
 * `endDate`, or — with `countdownMode: 'daily_cutoff'` — the next time the
 * STORE's clock reads `dailyCutoff` (rolling over to tomorrow once passed).
 * Call it on every tick; the browser widget and the dashboard use the same one.
 */
export {
  COUNTDOWN_MODES,
  CUTOFF_TIME_ZONES,
  countdownTarget,
  nextDailyCutoff,
  parseDailyCutoff,
} from './vendor/dynamic-content.js';
export { SelwiseApiError } from './types.js';

export type {
  Surface,
  SurfaceFilter,
  SurfaceKind,
  SurfacePlacement,
  TriggerStrategy,
} from './core/surfaces.js';

export type { Unsubscribe } from './core/events.js';
/**
 * `Selwise.explain()`: why a campaign or a strip the API sent is not on the screen.
 * `reason` is one of the codes the dashboard's "Why is this not in my app?" uses.
 */
export type { NotShownDetail, NotShownKind, NotShownReport } from './core/not-shown.js';
export { APP_EXPLAIN_REASONS, isWaitingReason, type AppExplainReason } from './vendor/app-not-shown.js';
/**
 * The search settings the dashboard saves, as `getSearchSettings()` returns them
 * — and the pure helpers a host drawing its own search screen reads them with.
 */
export type {
  SearchSettings,
  SearchSuggestionSection,
  SearchTextKey,
} from './vendor/search-settings.js';
export type { SearchResolution } from './core/search.js';
export { searchText, type SearchTextVars } from './core/search-config.js';
export {
  categoriesFromHits,
  formatCategoryName,
  highlightSegments,
  type TextSegment,
} from './core/search-format.js';
export { primaryTopCategory } from './vendor/category-list.js';
export type { ProductState, ScreenInfo, ScreenState, SelwiseEvents } from './core/state.js';
export type { Strip, StripClient, StripContext, StripEntry, StripOptions } from './core/strips.js';
/** A screen experiment's arm at a point of a screen (`Selwise.resolveScreenSlot`). */
export type { ScreenSlotArm, ScreenSlotModuleKind } from './core/screen-slot.js';

export type { CartInput } from './core/cart.js';
export type { ProductInput } from './core/product.js';
export type { DeepLinkAttribution } from './core/deep-link.js';
export type { GoalReachedDetail } from './core/goal-bar.js';
export type {
  RecommendationWidgetSource,
  RecommendationWidgetState,
} from './core/recommendation-widget.js';
export type {
  CountdownMode,
  DynamicCart,
  DynamicProduct,
  GoalBarState,
  GoalBarView,
  GoalMetric,
  GoalProgress,
} from './vendor/dynamic-content.js';

export type {
  ExperimentAssignment,
  FrequencyCapConfig,
  SegmentContext,
  SegmentTargetingMode,
} from './core/eligibility.js';

export type { RemoteConfig, RemoteTrackingConfig } from './core/remote-config.js';

export type {
  ScenarioInboxAcknowledgement,
  ScenarioInboxEntry,
  ScenarioInboxOutcome,
} from './core/scenario-inbox.js';

export type { EnrichmentItem, EnrichmentResult } from './core/enrichment.js';

export type {
  ConsentCategory,
  ConsentSnapshot,
  EntityType,
  OrderInput,
  OrderItemInput,
  OrderMarketingConsent,
  PushPermission,
  PushPlatform,
  PushProvider,
  RecommendationCartContext,
  RecommendationContext,
  RecommendationExperiment,
  RecommendationProductsResult,
  RecommendationWidgetSummary,
  ResolvedRecommendationWidget,
  SearchCategoryFacet,
  SearchOpenTrigger,
  SearchOptions,
  SearchResult,
  SearchSort,
  SearchSuggestionKind,
  SearchSuggestionSections,
  SelwiseInitOptions,
  SelwiseProduct,
  SelwiseProductSwatch,
  SelwiseProductVariant,
  SelwiseStorage,
  TrackOptions,
} from './types.js';

export { Selwise as default } from './client.js';
