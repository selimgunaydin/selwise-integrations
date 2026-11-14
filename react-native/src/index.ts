export { Selwise, SDK_VERSION, readSearchBehavior, type SearchBehavior } from './client.js';
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
 * One recommendation strip's products, kept current — what
 * `useRecommendationWidget` runs on, React-free, so a host that draws strips
 * without the hook (the App Maker plugin's `RecommendationStrips`) keeps a
 * "complete to free shipping" strip in step with the basket the same way.
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
  RecommendationCartContext,
  RecommendationContext,
  RecommendationExperiment,
  RecommendationProductsResult,
  RecommendationWidgetSummary,
  ResolvedRecommendationWidget,
  SearchOptions,
  SearchResult,
  SelwiseInitOptions,
  SelwiseProduct,
  SelwiseStorage,
  TrackOptions,
} from './types.js';

export { Selwise as default } from './client.js';
