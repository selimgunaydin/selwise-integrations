import { evaluateTargeting, type BehaviorSnapshot, type TargetingContext } from '../vendor/page-targeting.js';
import {
  fillContentPlaceholders,
  resolveCampaignContent,
  typeSupportsContentStates,
  type DynamicCart,
  type DynamicFormat,
  type DynamicProduct,
} from '../vendor/dynamic-content.js';
import type { FrequencyCapConfig } from './eligibility.js';
import { resolveCampaignForDevice } from '../vendor/campaign-devices.js';
import {
  decodeDismissal,
  dismissalHolds,
  encodeDismissal,
  interactionVersionOf,
  readAfterClose,
} from '../vendor/campaign-interaction.js';
import type { SelwiseStorage } from '../types.js';
import { STORAGE_KEYS } from './storage.js';

/**
 * Campaigns and widgets — everything `/config` describes as something to put on
 * a screen.
 *
 * ## Why one module for both
 *
 * The API keeps them apart because a merchant thinks of them differently: a
 * campaign is a message with a schedule, a widget is furniture. The payload is
 * the SAME shape — `type`, `contentJson`, `stylesJson`, `placementConfigJson`,
 * `pageTargetingJson`, `segmentIds` — and every decision a client makes about
 * one it makes identically about the other: does it target this screen, has the
 * visitor dismissed it, when does it trigger, and report the impression. Two
 * modules would be two copies of that.
 *
 * ## What this deliberately does NOT do
 *
 * Render. The SDK has no UI (see `react/index.ts`): an Akinon App Maker app
 * owns its own themed components, and a Selwise-drawn banner would look foreign
 * beside them. This decides WHAT should be on screen and leaves the drawing to
 * the host.
 */

/**
 * `'widget'` is retained for source compatibility — a host app may switch on
 * it — but is never produced any more: widgets and campaigns merged into one
 * model in September 2026 and the bootstrap's `widgets` array is now always
 * empty.
 */
export type SurfaceKind = 'campaign' | 'widget';

export type TriggerStrategy = 'immediate' | 'delay' | 'scroll' | 'exit_intent' | 'event';

export interface SurfacePlacement {
  position: string;
  placementType: string;
  triggerStrategy: TriggerStrategy;
  triggerDelaySeconds: number;
  triggerScrollPercent: number;
  triggerEventName: string | null;
  /** `placementConfigJson.frequencyCap`, verbatim. Enforced by `FrequencyCapStore`. */
  frequencyCap: FrequencyCapConfig | null;
  /** `placementConfigJson.conflictResolution.behavior`. */
  conflictBehavior: string | null;
  priority: number;
}

export interface Surface {
  id: string;
  kind: SurfaceKind;
  type: string;
  isTestMode: boolean;
  content: Record<string, unknown>;
  styles: Record<string, unknown>;
  placement: SurfacePlacement;
  /** Raw targeting, kept so a host can inspect why something did or did not show. */
  targeting: unknown;
  segmentTargetingMode: string;
  segmentIds: string[];
  /**
   * The dashboard's own "Custom CSS" / "Custom JS" fields — separate columns
   * from `contentJson`, and the place a merchant's code actually lands.
   *
   * They were dropped here, so a `custom` widget written in those fields
   * rendered an empty box in the app while working on the web. A host renders
   * them for a `custom` surface; for a native type there is no DOM to apply
   * them to, which `ui/visibility.js` reports rather than silently ignores.
   */
  customCss: string;
  customJs: string;
  /**
   * The untouched `placementConfigJson`.
   *
   * Kept because a `config_override` experiment merges over the RAW block and
   * the result has to be re-normalized — merging over the normalized shape
   * would let a variant's `{position: 'bottom'}` land next to a default that
   * the merchant never chose.
   */
  rawPlacement: Record<string, unknown>;
  /** Set when a `config_override` variant shaped this surface. */
  experiment: { experimentId: string; variantId: string } | null;
  /**
   * The content STATE that chose this surface's words, or `null` for the base
   * content.
   *
   * A merchant can give a campaign states — "when the basket is worth 750 or
   * more, say this instead" — and `getSurfaces()` has already applied the
   * winning one: `content` IS the state's content, with `states` removed. This
   * is the state's id from the dashboard, for a host that wants to report or
   * debug which one won. A state that hides the campaign never reaches the
   * host: the surface is simply not returned.
   */
  stateId: string | null;
}

const DEFAULT_PLACEMENT: SurfacePlacement = {
  position: 'top',
  placementType: 'fixed',
  triggerStrategy: 'immediate',
  triggerDelaySeconds: 0,
  triggerScrollPercent: 0,
  triggerEventName: null,
  frequencyCap: null,
  conflictBehavior: null,
  priority: 0,
};

const TRIGGER_STRATEGIES: TriggerStrategy[] = [
  'immediate',
  'delay',
  'scroll',
  'exit_intent',
  'event',
];

/**
 * The dashboard's words for the same five triggers.
 *
 * The dashboard and the browser widget store a popup's trigger as
 * `MODAL_TRIGGER_STRATEGIES` in `@selwise/widget-contract` — `page_load`,
 * `time_delay`, `scroll_depth`, `custom_event`, `exit_intent`. This SDK was
 * written against its own shorter vocabulary and read anything else as
 * `immediate`, so every popup a merchant actually saved arrived wrong: "open
 * after 10 seconds" opened at once, and "open on my event" opened without the
 * event. Translated here, once, so the public `TriggerStrategy` a host switches
 * on stays the same.
 */
const DASHBOARD_TRIGGER_STRATEGIES: Readonly<Record<string, TriggerStrategy>> = {
  page_load: 'immediate',
  time_delay: 'delay',
  scroll_depth: 'scroll',
  custom_event: 'event',
};

/**
 * The browser widget's fallbacks for a popup whose trigger fields are blank —
 * `DEFAULT_MODAL_TRIGGER_*` in `@selwise/widget-contract`, restated because
 * this package is published and cannot depend on that private one. The same
 * popup must open at the same moment on both channels.
 */
const POPUP_TYPE = 'exit_intent_popup';
const POPUP_DEFAULT_TRIGGER: TriggerStrategy = 'exit_intent';
const POPUP_DEFAULT_DELAY_SECONDS = 5;
const POPUP_DEFAULT_SCROLL_PERCENT = 50;
const POPUP_DEFAULT_EVENT_NAME = 'selwise:open-modal';

function normalizeTriggerStrategy(value: unknown, surfaceType?: string): TriggerStrategy {
  const raw = asString(value, '');
  if ((TRIGGER_STRATEGIES as string[]).includes(raw)) return raw as TriggerStrategy;
  const translated = DASHBOARD_TRIGGER_STRATEGIES[raw];
  if (translated) return translated;
  // A popup saved before the trigger picker existed has no strategy, and the
  // browser widget opens it on exit intent — not immediately.
  return surfaceType === POPUP_TYPE ? POPUP_DEFAULT_TRIGGER : 'immediate';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * The frequency-cap block, with only the keys the store enforces.
 *
 * Copied key by key rather than passed through: an unknown key would look like
 * a rule the app honours and silently would not.
 */
function normalizeFrequencyCap(value: unknown): FrequencyCapConfig | null {
  const raw = asRecord(value);
  const cap: FrequencyCapConfig = {};

  for (const key of ['perSession', 'perDay', 'perWeek', 'total'] as const) {
    const parsed = Number.parseInt(String(raw[key] ?? ''), 10);
    if (Number.isFinite(parsed) && parsed >= 0) cap[key] = parsed;
  }
  if (typeof raw.minInterval === 'string' && raw.minInterval.trim()) {
    cap.minInterval = raw.minInterval.trim();
  }

  return Object.keys(cap).length > 0 ? cap : null;
}

export function normalizePlacement(value: unknown, surfaceType?: string): SurfacePlacement {
  const raw = asRecord(value);
  const conflict = asRecord(raw.conflictResolution);
  const triggerStrategy = normalizeTriggerStrategy(raw.triggerStrategy, surfaceType);
  const isPopup = surfaceType === POPUP_TYPE;
  const eventName = typeof raw.triggerEventName === 'string' && raw.triggerEventName.trim()
    ? raw.triggerEventName.trim()
    : null;

  return {
    position: asString(raw.position, DEFAULT_PLACEMENT.position),
    placementType: asString(raw.placementType, DEFAULT_PLACEMENT.placementType),
    triggerStrategy,
    triggerDelaySeconds: Math.max(
      0,
      asNumber(raw.triggerDelaySeconds, isPopup ? POPUP_DEFAULT_DELAY_SECONDS : 0),
    ),
    triggerScrollPercent: Math.min(
      100,
      Math.max(0, asNumber(raw.triggerScrollPercent, isPopup ? POPUP_DEFAULT_SCROLL_PERCENT : 0)),
    ),
    triggerEventName:
      eventName ?? (isPopup && triggerStrategy === 'event' ? POPUP_DEFAULT_EVENT_NAME : null),
    frequencyCap: normalizeFrequencyCap(raw.frequencyCap),
    conflictBehavior: typeof conflict.behavior === 'string' && conflict.behavior.trim()
      ? conflict.behavior.trim()
      : null,
    priority: asNumber(raw.priority ?? conflict.priority, 0),
  };
}

/** One `/config` entry into the shape a host can render. */
export function normalizeSurface(raw: unknown, kind: SurfaceKind): Surface | null {
  const entry = asRecord(raw);
  const id = asString(entry.id, '');
  const type = asString(entry.type, '');
  if (!id || !type) return null;

  // An app is always a phone: a campaign is read as a phone-width page draws
  // it, with its phone settings (`devices.mobile`) laid over the base. The
  // same resolver the web widget uses below 768px.
  const onPhone = resolveCampaignForDevice(
    {
      content: asRecord(entry.contentJson),
      styles: asRecord(entry.stylesJson),
      placement: asRecord(entry.placementConfigJson),
    },
    entry.devices,
    'mobile',
  );

  return {
    id,
    kind,
    type,
    isTestMode: entry.isTestMode === true,
    content: onPhone.content,
    styles: onPhone.styles,
    placement: normalizePlacement(onPhone.placement, type),
    targeting: entry.pageTargetingJson,
    segmentTargetingMode: asString(entry.segmentTargetingMode, 'all'),
    segmentIds: Array.isArray(entry.segmentIds)
      ? entry.segmentIds.filter((value): value is string => typeof value === 'string')
      : [],
    customCss: asString(entry.customCss ?? entry.customCSS, ''),
    customJs: asString(entry.customJs ?? entry.customJS, ''),
    rawPlacement: onPhone.placement,
    experiment: null,
    stateId: null,
  };
}

export function normalizeSurfaces(config: Record<string, unknown> | null | undefined): Surface[] {
  const payload = asRecord(config);
  const campaigns = Array.isArray(payload.campaigns) ? payload.campaigns : [];

  // The bootstrap's `widgets` key is deprecated and always empty (the two
  // merged); every entity arrives in `campaigns`. Mapping it would only add a
  // pass over nothing.
  return campaigns
    .map((entry) => normalizeSurface(entry, 'campaign'))
    .filter((surface): surface is Surface => surface !== null);
}

export interface SurfaceFilter extends TargetingContext {
  /** When false, test-mode entities are hidden. Mirrors `selwise_test_mode` on the web. */
  testMode?: boolean;
  dismissedIds?: string[];
}

/**
 * The surfaces that belong on this screen right now.
 *
 * Test mode is a gate, not a filter: a test-mode entity is invisible to a real
 * visitor and the ONLY thing visible to a tester, exactly as the browser widget
 * behaves. Getting that backwards means a merchant's unfinished campaign goes
 * live to everyone.
 */
export function selectSurfaces(surfaces: Surface[], filter: SurfaceFilter): Surface[] {
  const dismissed = new Set(filter.dismissedIds ?? []);
  const testMode = filter.testMode === true;

  return surfaces.filter((surface) => {
    if (surface.isTestMode !== testMode) return false;
    if (dismissed.has(surface.id)) return false;
    return evaluateTargeting(surface.targeting, {
      pageUrl: filter.pageUrl,
      // Forwarded, never derived. On the web the widget resolves a page KIND
      // from the URL and then the DOM; an app has neither, so the only thing
      // that can say "this is a product screen" is the host that built it.
      // Leaving it undefined fails open, which is why a rule targeting page
      // types keeps showing in an app that has not adopted this yet.
      pageType: filter.pageType,
      deviceType: filter.deviceType,
      country: filter.country,
      behavior: filter.behavior,
    });
  });
}

export interface SurfaceContentContext {
  /** The snapshot targeting evaluated — the same one decides the state. */
  behavior: BehaviorSnapshot | undefined;
  cart: DynamicCart;
  /** The product on screen, from the host — unknown on any other screen. */
  product?: DynamicProduct | null;
  format: DynamicFormat;
}

/**
 * The words this surface says for this shopper, right now — or `null` when it
 * must not be drawn at all.
 *
 * The browser widget's answer, from the same contract function
 * (`resolveCampaignContent`):
 *
 * 1. **Content state.** For a type that can have states, the first matching
 *    state whose words can be SAID wins; a state that cannot be said yields to
 *    the next one and finally to the base content. A state that hides the
 *    campaign drops it here, before conflict resolution and caps: it was not
 *    shown, so it must neither take a dock nor spend an allowance.
 * 2. **Campaign placeholders.** `{cart.total}` / `{cart.itemCount}` are filled
 *    from the cart the host set, `{product.price}` and the other product values
 *    from the product it passed to `getSurfaces`. When nothing the surface
 *    could say can be said — the cart is not measured, money has no currency,
 *    the product is not on sale — the surface is dropped the same way. A host
 *    is never handed raw braces to print. The goal bar is skipped: its
 *    sentences are filled by `resolveGoalBar`, from its own richer list.
 */
export function resolveSurfaceContent(
  surface: Surface,
  context: SurfaceContentContext
): Surface | null {
  let content = surface.content;
  let stateId: string | null = null;

  if (typeSupportsContentStates(surface.type)) {
    const resolved = resolveCampaignContent(
      content,
      context.behavior,
      { cart: context.cart, product: context.product ?? null },
      context.format
    );
    if (resolved.hidden) return null;
    content = resolved.content;
    stateId = resolved.stateId;
  } else if (surface.type !== 'goal_bar') {
    const filled = fillContentPlaceholders(content, context.cart, context.format, context.product ?? null);
    if (filled.unfillable) return null;
    content = filled.content;
  }

  if (content === surface.content && stateId === surface.stateId) return surface;
  return { ...surface, content, stateId };
}

/**
 * Two surfaces competing for the same spot.
 *
 * On the web the contested resource is a DOM selector; in an app it is a dock
 * position, and the consequence of skipping this is worse rather than milder —
 * two announcement bars pinned to `top` overlap, and two popups open at once.
 *
 * Same rules as `apps/client/src/core/conflict-resolver.ts`: group by scope,
 * `all` on any member shows the whole group, `random` on every member picks
 * one, otherwise the highest priority wins with the id as a stable tie-break.
 */
export function resolveConflicts(
  surfaces: Surface[],
  random: () => number = Math.random
): Surface[] {
  const groups = new Map<string, Surface[]>();

  for (const surface of surfaces) {
    // A selector-placed surface has no rendered position in an app, so its own
    // id is the scope — it competes with nothing.
    const position = surface.placement.placementType === 'selector'
      ? ''
      : surface.placement.position.trim().toLowerCase();
    const scope = position ? `fixed:${position}` : `entity:${surface.id}`;

    const group = groups.get(scope);
    if (group) group.push(surface);
    else groups.set(scope, [surface]);
  }

  const kept = new Set<string>();
  for (const group of groups.values()) {
    const [first] = group;
    if (!first) continue;
    if (group.length === 1) {
      kept.add(first.id);
      continue;
    }

    if (group.some((surface) => surface.placement.conflictBehavior === 'all')) {
      for (const surface of group) kept.add(surface.id);
      continue;
    }

    if (group.every((surface) => surface.placement.conflictBehavior === 'random')) {
      const picked = group[Math.floor(random() * group.length)] ?? first;
      kept.add(picked.id);
      continue;
    }

    const sorted = [...group].sort((a, b) =>
      b.placement.priority - a.placement.priority || a.id.localeCompare(b.id)
    );
    kept.add((sorted[0] ?? first).id);
  }

  // Input order, not group order: the host stacks what it is handed.
  return surfaces.filter((surface) => kept.has(surface.id));
}

/**
 * What a close keeps away, remembered.
 *
 * Closing a surface is remembered for the campaign's `afterClose`: for the
 * session (the default, kept in memory under the session it was made in) or
 * for a number of days (persisted, so it survives a relaunch). A tap on the
 * surface's own button stores nothing. The record is a digest of what the
 * visitor saw and a time — the surface returns when its words or design change.
 */
export class DismissalStore {
  private readonly storage: SelwiseStorage;
  /** Closes that last days: surface id -> `<version>.<time>`, persisted. */
  private records = new Map<string, string>();
  /** Closes that last the SESSION they were made in; memory only. */
  private sessionRecords = new Map<string, Map<string, string>>();
  private hydrated = false;
  private readonly currentSession: () => string;

  constructor(storage: SelwiseStorage, currentSession: () => string = () => '') {
    this.storage = storage;
    this.currentSession = currentSession;
  }

  async hydrate(): Promise<void> {
    if (this.hydrated) return;
    this.hydrated = true;

    const raw = await this.storage.getItem(STORAGE_KEYS.DISMISSED_SURFACES);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as unknown;
      // The earlier format was a bare list of ids kept for good: it is dropped,
      // once — those surfaces come back and each close is remembered afresh.
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [id, record] of Object.entries(parsed as Record<string, unknown>)) {
          if (typeof record === 'string' && decodeDismissal(record)) this.records.set(id, record);
        }
        return;
      }
      await this.storage.removeItem(STORAGE_KEYS.DISMISSED_SURFACES);
    } catch {
      await this.storage.removeItem(STORAGE_KEYS.DISMISSED_SURFACES);
    }
  }

  /** The ids, among `surfaces`, whose close still holds them back. */
  heldIds(surfaces: ReadonlyArray<DismissableSurface>, now: number = Date.now()): string[] {
    const session = this.sessionRecords.get(this.currentSession());
    return surfaces
      .filter((surface) => {
        const afterClose = readAfterClose(surface.rawPlacement?.afterClose);
        const version = versionOf(surface);
        const raw = afterClose === 'session' ? session?.get(surface.id) : this.records.get(surface.id);
        const held = dismissalHolds(decodeDismissal(raw), version, afterClose, now);
        // A days close also holds within the session it was made in.
        return held || dismissalHolds(decodeDismissal(session?.get(surface.id)), version, afterClose, now);
      })
      .map((surface) => surface.id);
  }

  async dismiss(surface: DismissableSurface, now: number = Date.now()): Promise<void> {
    if (!surface.id) return;
    const record = encodeDismissal(versionOf(surface), now);
    const afterClose = readAfterClose(surface.rawPlacement?.afterClose);
    if (afterClose === 'session') {
      const session = this.currentSession();
      // Only the current session is ever read; older ones are dropped here.
      const records = this.sessionRecords.get(session) ?? new Map<string, string>();
      records.set(surface.id, record);
      this.sessionRecords = new Map([[session, records]]);
      return;
    }
    this.records.set(surface.id, record);
    await this.storage.setItem(STORAGE_KEYS.DISMISSED_SURFACES, JSON.stringify(Object.fromEntries(this.records)));
  }

  async clear(): Promise<void> {
    this.records = new Map();
    this.sessionRecords = new Map();
    await this.storage.removeItem(STORAGE_KEYS.DISMISSED_SURFACES);
  }
}

/** The fields a close is remembered against. */
export type DismissableSurface = Pick<
  Surface,
  'id' | 'content' | 'styles' | 'customCss' | 'customJs' | 'rawPlacement'
>;

function versionOf(surface: DismissableSurface): string {
  return interactionVersionOf({
    contentJson: surface.content,
    stylesJson: surface.styles,
    customCss: surface.customCss,
    customJs: surface.customJs,
  });
}
