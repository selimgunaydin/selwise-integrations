import type { SelwiseStorage } from '../types.js';
import { STORAGE_KEYS } from './storage.js';
import { evaluateTargeting, type DeviceType, type BehaviorSnapshot } from '../vendor/page-targeting.js';

/**
 * Everything that decides whether a surface may show, beyond page targeting.
 *
 * ## Why this is not optional polish
 *
 * `selectSurfaces` used to answer the question with page targeting, test mode
 * and dismissal alone. That is not the same question the browser widget asks,
 * and each missing part fails in the direction of showing too much:
 *
 *  - **Segments.** A campaign aimed at "cart abandoners" was shown to every
 *    app visitor. Not a missing feature — a wrong audience.
 *  - **Experiments.** A surface inside an A/B test rendered without an
 *    assignment, so the app's traffic entered no arm and the merchant's
 *    experiment was measuring a mixture.
 *  - **Frequency caps.** A popup capped at once per session reappeared on every
 *    navigation, because in an app the process outlives the screen.
 *
 * The semantics mirror `apps/client/src/core/{segments,experiments,frequency-caps}.ts`
 * deliberately, including the failure directions: the same campaign on two
 * surfaces has to reach the same person.
 */

const SEGMENT_CACHE_TTL_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Segments
// ---------------------------------------------------------------------------

export type SegmentTargetingMode = 'all' | 'include' | 'exclude';

/** What the evaluated segments are being asked ABOUT, beyond the visitor. */
export interface SegmentContext {
  pageUrl?: string;
}

export interface SegmentEvaluator {
  (segmentIds: string[], context?: SegmentContext): Promise<Record<string, boolean>>;
}

/**
 * Segment membership, cached.
 *
 * Fails CLOSED for `include` and OPEN for `exclude`, because an unreachable
 * evaluator returns "member of nothing" — the same fallback the browser widget
 * uses (`getFallbackResults`). Inverting either one would either hide a
 * merchant's campaign from its whole audience or show a suppressed one.
 */
export class SegmentGate {
  private readonly evaluate: SegmentEvaluator;
  private readonly cache = new Map<string, { value: boolean; at: number }>();
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly readIdentity: () => string | undefined;

  /**
   * `now` is injectable so the expiry is testable without a wall-clock race.
   *
   * `readIdentity` answers who is signed in RIGHT NOW. An answer belongs to
   * the identity it was computed for: keyed on the segment alone, a shopper
   * who signed in kept the anonymous answer ("not a high spender") for five
   * minutes, and on a shared device the next person inherited the previous
   * one's. The browser widget keys it the same way.
   */
  constructor(
    evaluate: SegmentEvaluator,
    ttlMs: number = SEGMENT_CACHE_TTL_MS,
    now: () => number = Date.now,
    readIdentity: () => string | undefined = () => undefined
  ) {
    this.evaluate = evaluate;
    this.ttlMs = ttlMs;
    this.now = now;
    this.readIdentity = readIdentity;
  }

  private key(segmentId: string): string {
    return `${this.readIdentity() ?? ''}|${segmentId}`;
  }

  async shouldShow(
    mode: string | undefined,
    segmentIds: unknown,
    context?: SegmentContext
  ): Promise<boolean> {
    const ids = normalizeIds(segmentIds);
    if (mode !== 'include' && mode !== 'exclude') return true;
    if (ids.length === 0) return true;

    const results = await this.resolve(ids, context);
    const matched = ids.filter((id) => results[id] === true);

    return mode === 'include' ? matched.length > 0 : matched.length === 0;
  }

  /**
   * The cache is keyed by identity and segment id, exactly as the browser
   * widget keys it — so within one identity the FIRST screen's context is what
   * the answer reflects for the next five minutes. Passing the caller's page
   * rather than reading a field means that first answer is at least about the
   * screen being rendered.
   */
  private async resolve(
    ids: string[],
    context?: SegmentContext
  ): Promise<Record<string, boolean>> {
    const now = this.now();
    const missing = ids.filter((id) => {
      const entry = this.cache.get(this.key(id));
      return !entry || now - entry.at > this.ttlMs;
    });

    if (missing.length > 0) {
      let fresh: Record<string, boolean> = {};
      try {
        fresh = (await this.evaluate(missing, context)) || {};
      } catch {
        // Member of nothing, and not cached — a network blip must not pin a
        // visitor out of a segment for the whole session.
        fresh = {};
        for (const id of missing) fresh[id] = false;
        return { ...this.fromCache(ids), ...fresh };
      }
      for (const id of missing) {
        this.cache.set(this.key(id), { value: fresh[id] === true, at: now });
      }
    }

    return this.fromCache(ids);
  }

  private fromCache(ids: string[]): Record<string, boolean> {
    const out: Record<string, boolean> = {};
    for (const id of ids) out[id] = this.cache.get(this.key(id))?.value === true;
    return out;
  }
}

// ---------------------------------------------------------------------------
// Experiments
// ---------------------------------------------------------------------------

export interface ExperimentAssignment {
  experimentId: string;
  variantId: string;
  variantName?: string;
  experimentMode?: string;
  targetId?: string;
  effectiveTargetId?: string;
  targetType?: string;
  controlTargetId?: string;
  excludedTargetIds?: string[];
  /**
   * The variant's override block. `config` is what the server actually sends
   * (`variant.configOverride` renamed on the way out); `variantConfig` is the
   * alias the browser widget prefers, so both are accepted here for the same
   * reason it does.
   */
  config?: Record<string, unknown> | null;
  variantConfig?: Record<string, unknown> | null;
  /**
   * In `different_module` mode, the entity to render INSTEAD of the control.
   *
   * It arrives in the same shape `/config` uses, and it is frequently not in
   * `/config` at all — a variant module can be inactive on its own. Without
   * rendering it, a `different_module` experiment showed the app visitor
   * nothing while counting them into an arm.
   */
  moduleData?: unknown;
  /**
   * The HOLDOUT arm: this visitor is not shown the surface at all. The SDK
   * drops it from `getSurfaces()` after every other gate has selected it —
   * slot kept, so no other surface takes its dock — and records the exposure
   * at that moment. Sent only because the SDK declares the capability.
   */
  holdout?: boolean;
  /** The experiment has a holdout arm (it converts on orders in every arm). */
  hasHoldout?: boolean;
  /**
   * The module this arm DRAWS reads the shopper's live cart — a "complete to
   * free shipping" strip swapped in by a `different_module` arm. Set by the
   * API from the module itself (`moduleNeedsLiveCart`), so the SDK sends the
   * measured basket with that strip even when the control it replaces never
   * reads one.
   */
  liveCartRequired?: boolean;
  /**
   * Who may ENTER — the experiment's own Audience step (`ExperimentAudience`).
   * Absent means everyone the traffic percentage lets in. When present, the
   * arm applies only on a screen whose context matches
   * (`ExperimentGate.forScreen`); elsewhere the visitor gets the live surface
   * and is not counted.
   */
  audience?: ExperimentAudience;
}

/**
 * Who may enter an entity experiment, as `/experiments/assign` sends it — the
 * browser widget's `ExperimentAudience`, judged the same way: page, device,
 * country and behaviour through `evaluateTargeting`, segments through the
 * same gate a surface's are asked through, test mode as a test-mode surface.
 */
export interface ExperimentAudience {
  targeting?: Record<string, unknown>;
  segments?: { mode: 'include' | 'exclude'; ids: string[] };
  testMode?: true;
}

/** The screen an experiment's audience is judged on — what `getSurfaces` judges surfaces on. */
export interface ExperimentAudienceContext {
  pageUrl: string;
  pageType?: string;
  deviceType?: DeviceType;
  country?: string;
  behavior?: BehaviorSnapshot;
  testMode: boolean;
  segments: Pick<SegmentGate, 'shouldShow'> | null;
}

/**
 * Does this screen admit the visitor into the experiment? Every failure is
 * CLOSED — including a dimension the audience narrows on that the screen did
 * not answer (no `pageType` from the host, no country), which
 * `evaluateTargeting` lets through for a surface: a visitor wrongly kept out
 * sees the live surface uncounted, one wrongly let in is somebody the merchant
 * excluded, inside the comparison.
 */
export async function audienceAdmits(
  audience: ExperimentAudience | null | undefined,
  ctx: ExperimentAudienceContext
): Promise<boolean> {
  if (!audience || typeof audience !== 'object') return true;
  if (audience.testMode === true && !ctx.testMode) return false;
  if (audience.targeting) {
    const narrows = (value: unknown) => Array.isArray(value) && value.length > 0;
    const t = audience.targeting as {
      pageTypes?: { types?: unknown };
      device?: { types?: unknown };
      geo?: { countries?: unknown };
    };
    if (
      (narrows(t.pageTypes?.types) && !ctx.pageType) ||
      (narrows(t.device?.types) && !ctx.deviceType) ||
      (narrows(t.geo?.countries) && !ctx.country)
    ) {
      return false;
    }
    let matches = false;
    try {
      matches = evaluateTargeting(audience.targeting, {
        pageUrl: ctx.pageUrl,
        pageType: ctx.pageType,
        deviceType: ctx.deviceType,
        country: ctx.country,
        behavior: ctx.behavior,
      });
    } catch {
      matches = false;
    }
    if (!matches) return false;
  }
  if (audience.segments) {
    if (!ctx.segments) return false;
    try {
      return await ctx.segments.shouldShow(audience.segments.mode, audience.segments.ids, {
        pageUrl: ctx.pageUrl,
      });
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * What this SDK honours on `/experiments/assign` — `holdout` (see
 * `ExperimentAssignment.holdout`) and `audience` (`ExperimentGate.forScreen`).
 * The API keeps a client that does not declare one out of every experiment
 * that needs it.
 */
export const EXPERIMENT_CLIENT_CAPABILITIES = 'holdout,audience';

/**
 * The frequency-cap key a held-out surface's would-be displays are counted
 * under. The surface's own cap is never spent on a shopper who never saw it;
 * its slot still frees up when a shown arm's capped-out surface would.
 */
export function heldOutCapKey(surfaceId: string): string {
  return `holdout:${surfaceId}`;
}

/**
 * A/B assignments for this visitor.
 *
 * Two things it does, both of which the app was missing:
 *
 *  1. **Excludes a control target** that a `different_module` experiment has
 *     replaced. Rendering it anyway shows the visitor both arms.
 *  2. **Supplies the variant's `configOverride`**, so a `config_override`
 *     experiment actually changes what the visitor sees. Without it the app
 *     always rendered the control while REPORTING an assignment, which is the
 *     worst of the three outcomes: the experiment looks like it ran and its
 *     numbers mean nothing.
 */
export class ExperimentGate {
  /**
   * The arms every reader below sees: those with NO audience. An arm with one
   * is entered only on a screen that admits it, and only `forScreen` knows the
   * screen — `getSurfaces` and the strips (`stripGate`) ask it; a reader that
   * asks this gate directly treats such an arm as not assigned: the live
   * entity, nothing counted.
   */
  private assignments: Record<string, ExperimentAssignment> = {};
  /** Arms whose experiment has an audience, judged per screen by `forScreen`. */
  private gated: ExperimentAssignment[] = [];
  private excluded = new Set<string>();
  private loading: Promise<void> | null = null;

  /** A gate over exactly these arms — what `forScreen` hands a screen. */
  static of(assignments: ExperimentAssignment[]): ExperimentGate {
    const gate = new ExperimentGate();
    gate.loading = Promise.resolve();
    for (const assignment of assignments) gate.adopt(assignment);
    return gate;
  }

  /**
   * The arms this screen lets the visitor into: every arm without an
   * audience, plus each audience-gated arm whose audience this screen
   * matches. Asked per `getSurfaces` call, because an app's screen is the
   * browser's page — the same experiment can admit the visitor on the product
   * screen and not on the home screen, and their arm stays the same (a hash
   * of the visitor) wherever they are admitted.
   */
  async forScreen(ctx: ExperimentAudienceContext): Promise<ExperimentGate> {
    if (this.gated.length === 0) return this;
    const verdicts = await Promise.all(
      this.gated.map((assignment) => audienceAdmits(assignment.audience, ctx).catch(() => false))
    );
    const admitted = this.gated.filter((_, index) => verdicts[index]);
    if (admitted.length === 0) return this;
    return ExperimentGate.of([...Object.values(this.assignments), ...admitted]);
  }

  private adopt(assignment: ExperimentAssignment): void {
    if (!assignment || typeof assignment !== 'object') return;
    this.assignments[assignment.experimentId] = assignment;
    for (const targetId of assignment.excludedTargetIds ?? []) {
      this.excluded.add(targetId);
    }
  }

  /**
   * Assignments are per visitor and stable, so one fetch per launch is enough.
   *
   * Every caller awaits the SAME fetch. A flag set before the await let the
   * second caller of a launch — a recommendation strip asking while
   * `getSurfaces()` was already waiting — return before any arm had arrived
   * and draw the control for a visitor in another arm: the browser widget's
   * "a new visitor gets the control on the first page" defect, in the app.
   */
  load(fetchAssignments: () => Promise<Record<string, ExperimentAssignment>>): Promise<void> {
    if (!this.loading) this.loading = this.fetchOnce(fetchAssignments);
    return this.loading;
  }

  private async fetchOnce(
    fetchAssignments: () => Promise<Record<string, ExperimentAssignment>>
  ): Promise<void> {
    let fetched: Record<string, ExperimentAssignment>;
    try {
      fetched = (await fetchAssignments()) || {};
    } catch {
      // No assignments means no experiment gating — the control renders, which
      // is the same thing that happens for a visitor outside every experiment.
      this.assignments = {};
      return;
    }

    for (const assignment of Object.values(fetched)) {
      if (!assignment || typeof assignment !== 'object') continue;
      if (assignment.audience) this.gated.push(assignment);
      else this.adopt(assignment);
    }
  }

  shouldRenderTarget(targetId: string): boolean {
    return !this.excluded.has(targetId);
  }

  /** Is this surface held out from this visitor — the arm shown nothing? */
  isHeldOut(targetId: string): boolean {
    return this.forTarget(targetId)?.holdout === true;
  }

  /** The assignment covering a surface, if any. */
  forTarget(targetId: string): ExperimentAssignment | null {
    for (const assignment of Object.values(this.assignments)) {
      if (
        assignment.effectiveTargetId === targetId ||
        assignment.targetId === targetId ||
        assignment.controlTargetId === targetId
      ) {
        return assignment;
      }
    }
    return null;
  }

  /**
   * Every arm this visitor was given, audience-gated ones included — each
   * carries its `audience`, and such an arm applies only on a screen it
   * matches.
   */
  list(): ExperimentAssignment[] {
    return [...Object.values(this.assignments), ...this.gated];
  }

  /**
   * The `different_module` arm that draws ANOTHER module in this control's
   * place, with that module — or null.
   *
   * Asked BEFORE `shouldRenderTarget`: the control is in the arm's own
   * `excludedTargetIds`, so the exclusion check alone answers "draw nothing"
   * for every visitor the arm was meant to reach. The control arm of the same
   * experiment carries its own module too (the API fetches the effective
   * target of every arm), which is the control again and not a replacement.
   */
  replacementFor(targetId: string): ExperimentAssignment | null {
    for (const assignment of Object.values(this.assignments)) {
      if (
        assignment.controlTargetId === targetId &&
        assignment.experimentMode === 'different_module' &&
        assignment.effectiveTargetId &&
        assignment.effectiveTargetId !== targetId &&
        assignment.moduleData
      ) {
        return assignment;
      }
    }
    return null;
  }

  /** The substitute entities `different_module` assignments want rendered. */
  variantModules(): Array<{ assignment: ExperimentAssignment; moduleData: unknown }> {
    return Object.values(this.assignments)
      .filter((assignment) => assignment.moduleData)
      .map((assignment) => ({ assignment, moduleData: assignment.moduleData }));
  }

  /** The variant's override, under whichever of the two names it arrived. */
  configFor(targetId: string): Record<string, unknown> | null {
    const assignment = this.forTarget(targetId);
    if (!assignment) return null;

    const raw = assignment.variantConfig ?? assignment.config;
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
  }
}

// ---------------------------------------------------------------------------
// Frequency caps
// ---------------------------------------------------------------------------

export interface FrequencyCapConfig {
  perSession?: number;
  perDay?: number;
  perWeek?: number;
  total?: number;
  /** `'30m'`, `'2h'`, `'1d'`. */
  minInterval?: string;
}

interface CapRecord {
  sessionId: string;
  sessionCount: number;
  dayStamp: string;
  dayCount: number;
  weekStamp: string;
  weekCount: number;
  totalCount: number;
  lastShownAt: number;
}

const DAY_MS = 86400000;

function parseInterval(value: string | undefined): number {
  if (!value) return 0;
  const match = /^(\d+)\s*(m|h|d)$/i.exec(value.trim());
  if (!match) return 0;
  const amount = Number(match[1]);
  const unit = (match[2] || '').toLowerCase();
  if (!Number.isFinite(amount)) return 0;
  if (unit === 'm') return amount * 60000;
  if (unit === 'h') return amount * 3600000;
  return amount * DAY_MS;
}

/**
 * The day and week a cap counts in are the SHOPPER's calendar, as the panel
 * says ("resets at the visitor's midnight", "resets on Monday") and as the web
 * widget counts them (`apps/client/src/core/frequency-caps.ts`).
 *
 * Until 2026-10-22 these were the UTC date and "weeks since the epoch". The
 * epoch began on a Thursday, so in Türkiye a daily cap reset at 03:00 and a
 * weekly one on Thursday at 03:00 — the same campaign was capped on different
 * windows in the app and on the website.
 */
function dayStamp(now: number): string {
  const date = new Date(now);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** ISO week (Monday–Sunday) of the local date, with its ISO week-year. */
function weekStamp(now: number): string {
  const local = new Date(now);
  const d = new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()));
  const dayNum = d.getUTCDay() || 7;
  // The week's Thursday decides the week number and its year.
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const weekYear = d.getUTCFullYear();
  const week = Math.ceil(((d.getTime() - Date.UTC(weekYear, 0, 1)) / DAY_MS + 1) / 7);
  return `${weekYear}-W${week}`;
}

/**
 * How often a surface has been shown, persisted.
 *
 * On the web a "once per session" cap is enforced by a page that reloads; in an
 * app the queue and the process outlive the screen, so without this a capped
 * popup reappears on every navigation. That is the single most annoying thing a
 * personalisation SDK can do to a shopper.
 */
export class FrequencyCapStore {
  private readonly storage: SelwiseStorage;
  private records: Record<string, CapRecord> = {};
  private hydrated = false;

  constructor(storage: SelwiseStorage) {
    this.storage = storage;
  }

  async hydrate(): Promise<void> {
    if (this.hydrated) return;
    this.hydrated = true;

    const raw = await this.storage.getItem(STORAGE_KEYS.FREQUENCY_CAPS);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        this.records = parsed as Record<string, CapRecord>;
      }
    } catch {
      await this.storage.removeItem(STORAGE_KEYS.FREQUENCY_CAPS);
    }
  }

  /** @returns null when allowed, else the rule that blocked it. */
  blockedBy(
    surfaceId: string,
    config: FrequencyCapConfig | null | undefined,
    sessionId: string,
    now: number = Date.now()
  ): keyof FrequencyCapConfig | null {
    if (!config || Object.keys(config).length === 0) return null;

    const record = this.current(surfaceId, sessionId, now);

    if (config.perSession !== undefined && record.sessionCount >= config.perSession) return 'perSession';
    if (config.perDay !== undefined && record.dayCount >= config.perDay) return 'perDay';
    if (config.perWeek !== undefined && record.weekCount >= config.perWeek) return 'perWeek';
    if (config.total !== undefined && record.totalCount >= config.total) return 'total';

    const interval = parseInterval(config.minInterval);
    if (interval > 0 && record.lastShownAt > 0 && now - record.lastShownAt < interval) {
      return 'minInterval';
    }
    return null;
  }

  async recordShown(surfaceId: string, sessionId: string, now: number = Date.now()): Promise<void> {
    const record = this.current(surfaceId, sessionId, now);
    record.sessionCount += 1;
    record.dayCount += 1;
    record.weekCount += 1;
    record.totalCount += 1;
    record.lastShownAt = now;
    this.records[surfaceId] = record;

    await this.storage.setItem(STORAGE_KEYS.FREQUENCY_CAPS, JSON.stringify(this.records));
  }

  /** Rolls the per-session, per-day and per-week counters when their window turned over. */
  private current(surfaceId: string, sessionId: string, now: number): CapRecord {
    const today = dayStamp(now);
    const thisWeek = weekStamp(now);
    const existing = this.records[surfaceId];

    if (!existing) {
      return {
        sessionId,
        sessionCount: 0,
        dayStamp: today,
        dayCount: 0,
        weekStamp: thisWeek,
        weekCount: 0,
        totalCount: 0,
        lastShownAt: 0,
      };
    }

    const rolled: CapRecord = { ...existing };
    if (rolled.sessionId !== sessionId) {
      rolled.sessionId = sessionId;
      rolled.sessionCount = 0;
    }
    if (rolled.dayStamp !== today) {
      rolled.dayStamp = today;
      rolled.dayCount = 0;
    }
    if (rolled.weekStamp !== thisWeek) {
      rolled.weekStamp = thisWeek;
      rolled.weekCount = 0;
    }
    return rolled;
  }

  async clear(): Promise<void> {
    this.records = {};
    await this.storage.removeItem(STORAGE_KEYS.FREQUENCY_CAPS);
  }
}

// ---------------------------------------------------------------------------

function normalizeIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  // Deduped and sorted, exactly as the browser widget does it: the ids reach a
  // route that validates them as UUIDs and rejects the WHOLE body on one bad
  // entry, so a duplicated id is wasted payload and an ordering difference is
  // a needless cache miss.
  return Array.from(
    new Set(
      value
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
    )
  ).sort();
}

/**
 * `override` over `base`, the way an experiment variant expects.
 *
 * Same three rules as `apps/client/src/core/experiment-overrides.ts`, and each
 * one changes what a merchant sees: `undefined` is skipped so a partial
 * override cannot blank a field, an array REPLACES rather than concatenates
 * (a variant's three slides must not become six), and a nested object merges
 * so `{styles: {color}}` does not drop the rest of the block.
 */
export function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...(base ?? {}) };
  if (!isRecord(override)) return result;

  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;

    if (Array.isArray(value)) {
      result[key] = [...value];
      continue;
    }
    if (isRecord(value)) {
      result[key] = deepMerge(isRecord(result[key]) ? result[key] : {}, value);
      continue;
    }
    result[key] = value;
  }

  return result;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export { normalizeIds as normalizeSegmentIds, parseInterval };
