// GENERATED FILE — DO NOT EDIT.
//
// Vendored from packages/widget-contract/src/dynamic-content.ts by
// scripts/sync-vendored-page-targeting.js. Edit the source, then run:
//
//   node scripts/sync-vendored-page-targeting.js
//
// It is copied rather than imported because @selwise/widget-contract is private
// and this SDK is published: a dependency on it would not resolve for anyone
// who installs @selwise/react-native from npm.

/**
 * Dynamic campaign content — a surface whose words depend on what the shopper
 * is doing right now.
 *
 * The first one is the goal bar (`goal_bar`): "₺120 more for free shipping",
 * with a bar that fills as the cart grows and a different sentence once the
 * goal is reached. Insider calls it the Purchase Progress Bar.
 *
 * ## Three layers, one direction
 *
 *   data (a snapshot of the cart)  →  derivation (a typed GOAL: thresholds,
 *   remaining, percent)  →  content (a STATE picks the sentence, and
 *   `{placeholders}` in it are filled from the derivation)
 *
 * There is deliberately no expression language. A template engine produces
 * HTML, which would have to go through the sanitizer; it cannot be vendored
 * into the React Native SDK the way a pure function can; and the person
 * writing these sentences is a marketer. A placeholder here is filled with
 * TEXT and written with `textContent` — nothing in this file builds markup.
 *
 * ## Why this lives in the contract
 *
 * Four places have to agree on what a goal bar says for a given cart: the
 * widget that draws it, the dashboard preview with its cart-value slider, the
 * API that validates what the builder saves, and (later) the app SDK. A
 * second implementation of "which state is this" would be a second answer to
 * "what does the shopper see", so all of them call `resolveGoalBar`.
 *
 * ## The one rule that shaped everything
 *
 * **An unmeasured cart is not an empty cart.** A bar that says "₺750 to free
 * shipping" to a shopper with ₺900 in their basket is worse than no bar, so a
 * cart the widget has not actually measured (`known: false`) resolves to the
 * `unknown` state, which is never drawn — and a placeholder that has a name
 * but no value hides its sentence instead of printing a blank or a brace.
 *
 * Imported by subpath (`@selwise/widget-contract/dynamic-content`), never
 * through the barrel: the widget reaches it only from the lazy renderers
 * chunk.
 */

import { CAMPAIGN_SCHEDULE_TIMEZONE, wallClockToInstant } from './campaign-schedule.js';
import {
  PRODUCT_BEHAVIOR_SIGNALS,
  decideBehaviorTargeting,
  evaluateBehaviorTargeting,
  isConsentBehaviorSignal,
  isProductBehaviorSignal,
  normalizeBehaviorTargeting,
  type BehaviorSnapshot,
  type BehaviorTargeting,
} from './page-targeting.js';

// ===========================================
// THE DATA A DYNAMIC SURFACE READS
// ===========================================

/**
 * The shopper's cart as a dynamic surface sees it.
 *
 * `known` is the whole point. The widget's cart signal can be a running tally
 * of add/remove events, which drifts (a quantity read as 1, a removal without a
 * price, a fresh tab starting at zero while the store's own cart persists).
 * That tally is good enough for "has the shopper added something", and it
 * still feeds targeting rules — but it is not good enough to print an amount.
 * `known` is true only when the WHOLE basket was handed over, by the
 * storefront's data layer or by reading the platform's own cart.
 */
export interface DynamicCart {
  known: boolean;
  total: number;
  itemCount: number;
  /** ISO 4217, when the basket carried one. The channel's currency is the fallback. */
  currency?: string | null;
}

export interface DynamicSnapshot {
  cart: DynamicCart;
}

export const UNKNOWN_CART: DynamicCart = Object.freeze({
  known: false,
  total: 0,
  itemCount: 0,
  currency: null,
});

// ===========================================
// GOAL — the derivation
// ===========================================

/**
 * What a goal counts. Named for the panel, not for the signal: `cart_total` is
 * the basket's value after the store's own discounts, which is what a free
 * shipping rule is almost always written against.
 */
export const GOAL_METRICS = ['cart_total', 'cart_item_count'] as const;
export type GoalMetric = (typeof GOAL_METRICS)[number];
export const DEFAULT_GOAL_METRIC: GoalMetric = 'cart_total';

/** Insider allows four; more than four markers on one bar stop being readable. */
export const GOAL_MAX_THRESHOLDS = 4;
export const GOAL_LABEL_MAX_LENGTH = 60;
export const GOAL_TEXT_MAX_LENGTH = 200;
/** An upper bound so one field cannot carry a number no basket will ever reach. */
export const GOAL_THRESHOLD_MAX = 100_000_000;

export interface GoalThreshold {
  /** The metric value at which this step is reached. Always > 0. */
  at: number;
  /** "Ücretsiz kargo", "Hediye çanta". Optional, but `{goal.label}` hides its sentence without it. */
  label: string;
}

export type GoalValueKind = 'money' | 'count';

export function goalMetricKind(metric: GoalMetric): GoalValueKind {
  return metric === 'cart_item_count' ? 'count' : 'money';
}

export function isGoalMetric(value: unknown): value is GoalMetric {
  return typeof value === 'string' && (GOAL_METRICS as readonly string[]).includes(value);
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * Stored text in more than one language — `LocalizedText` in
 * `@selwise/locale-contract`: `{ "$i18n": { "tr": "…", "en": "…" } }`.
 *
 * Restated here rather than imported: this file is vendored into the
 * published app SDK, which cannot depend on a private package
 * (scripts/sync-vendored-page-targeting.js). `localized-text.parity.spec.ts`
 * holds the two readings equal.
 *
 * It matters only where STORED content is normalized — a campaign save. Every
 * renderer reads a payload the API has already resolved to one language
 * (`forClientLocale` / `PublicLocaleInterceptor`), where it is a string again.
 */
export type StoredText = string | { $i18n: Record<string, string> };

export function storedTextMap(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const inner = (value as Record<string, unknown>).$i18n;
  if (!inner || typeof inner !== 'object' || Array.isArray(inner)) return null;
  const map: Record<string, string> = {};
  for (const [locale, text] of Object.entries(inner as Record<string, unknown>)) {
    if (typeof text === 'string') map[locale] = text;
  }
  return map;
}

/** Does a stored text say anything, in any language? */
function textSaid(value: unknown): boolean {
  if (typeof value === 'string') return value.trim() !== '';
  const map = storedTextMap(value);
  return map !== null && Object.values(map).some((text) => text.trim() !== '');
}

/**
 * A stored text trimmed and cut to `max`, kept in every language it has; ''
 * when it says nothing. Typed `string` for the renderer's sake (see above):
 * what it returns for a translated value only ever reaches storage.
 */
function storedText(value: unknown, max: number): string {
  if (typeof value === 'string') return value.trim().slice(0, max);
  const map = storedTextMap(value);
  if (!map) return '';
  const kept: Record<string, string> = {};
  for (const [locale, text] of Object.entries(map)) {
    const trimmed = text.trim().slice(0, max);
    if (trimmed) kept[locale] = trimmed;
  }
  return (Object.keys(kept).length > 0 ? { $i18n: kept } : '') as unknown as string;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Thresholds as the builder may send them: in any order, with blanks, with
 * strings for numbers. Returned ascending, de-duplicated on `at` (the first
 * label wins), positive, and at most `GOAL_MAX_THRESHOLDS` long.
 *
 * An item-count goal is rounded UP: "3 items" written as 2.5 means the shopper
 * needs a third, never that two and a half is reachable.
 */
export function normalizeGoalThresholds(
  value: unknown,
  metric: GoalMetric = DEFAULT_GOAL_METRIC,
): GoalThreshold[] {
  if (!Array.isArray(value)) return [];

  const byAt = new Map<number, GoalThreshold>();
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const record = raw as Record<string, unknown>;
    const parsed = Number(record.at);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > GOAL_THRESHOLD_MAX) continue;
    const at = metric === 'cart_item_count' ? Math.ceil(parsed) : roundMoney(parsed);
    if (at <= 0 || byAt.has(at)) continue;
    byAt.set(at, {
      at,
      label: storedText(record.label, GOAL_LABEL_MAX_LENGTH),
    });
  }

  return Array.from(byAt.values())
    .sort((a, b) => a.at - b.at)
    .slice(0, GOAL_MAX_THRESHOLDS);
}

// ===========================================
// CHANNEL REFERENCES — a step that points at a channel setting
// ===========================================

/**
 * A goal step can name a CHANNEL value instead of an amount: "the channel's
 * free-shipping threshold".
 * The merchant enters it once, on the channel, and every bar that points at
 * it moves with it — a free-shipping rule that changes in the store's own
 * admin is then one edit here, not one per campaign.
 *
 * Stored as `{ ref: 'channel_free_shipping', label }` — no `at`. It is
 * resolved on the SERVER, by the presenter that hands campaigns to clients
 * (`/config`, `/campaigns`, the scenario inbox, an experiment's arm, the
 * editor preview), with `resolveGoalBarContentRefs`. So the browser widget,
 * the app SDK and a CDN-cached old `client.js` all receive a plain `at` and
 * none of them needs to know a reference exists. A reference to a value the
 * channel does not have DROPS its step, and a bar left with no step is not
 * delivered: an amount is never made up.
 */
export const GOAL_THRESHOLD_REFS = ['channel_free_shipping'] as const;
export type GoalThresholdRef = (typeof GOAL_THRESHOLD_REFS)[number];

/** What each reference measures. A reference is only valid on a goal that counts the same thing. */
export const GOAL_THRESHOLD_REF_KIND: Readonly<Record<GoalThresholdRef, GoalValueKind>> = {
  channel_free_shipping: 'money',
};

/** The channel's values, by reference. Absent or null means "not set on this channel". */
export type GoalThresholdRefValues = Partial<Record<GoalThresholdRef, number | null>>;

/** A stored step that points at a channel value. */
export interface GoalThresholdRefStep {
  ref: GoalThresholdRef;
  label: string;
}

/** A step as it is STORED: a fixed amount, or a reference. */
export type GoalThresholdStep = GoalThreshold | GoalThresholdRefStep;

export function isGoalThresholdRef(value: unknown): value is GoalThresholdRef {
  return typeof value === 'string' && (GOAL_THRESHOLD_REFS as readonly string[]).includes(value);
}

/** The reference a raw step carries, or null for a fixed step (or not a step at all). */
export function goalStepRef(raw: unknown): GoalThresholdRef | null {
  if (!raw || typeof raw !== 'object') return null;
  const ref = (raw as Record<string, unknown>).ref;
  return isGoalThresholdRef(ref) ? ref : null;
}

function refFitsMetric(ref: GoalThresholdRef, metric: GoalMetric): boolean {
  return GOAL_THRESHOLD_REF_KIND[ref] === goalMetricKind(metric);
}

/**
 * A channel amount as a goal can use it — or null. Positive, finite, under
 * `GOAL_THRESHOLD_MAX`, rounded to cents.
 *
 * Reads a number, a numeric string, or a decimal object (Prisma's `Decimal`
 * serialises to a STRING in JSON, and the API's site cache is JSON, so the
 * same column arrives in all three shapes depending on the path).
 */
export function parseGoalAmount(value: unknown): number | null {
  let parsed: number;
  if (typeof value === 'number') parsed = value;
  else if (typeof value === 'string') parsed = value.trim() ? Number(value) : NaN;
  else if (value && typeof value === 'object') parsed = Number(String(value));
  else return null;
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > GOAL_THRESHOLD_MAX) return null;
  const rounded = roundMoney(parsed);
  return rounded > 0 ? rounded : null;
}

/**
 * Steps as they are STORED: the fixed steps exactly as
 * `normalizeGoalThresholds` returns them, then the reference steps — one per
 * reference, only references that measure what the goal counts — and at most
 * `GOAL_MAX_THRESHOLDS` in all.
 *
 * A reference step keeps no `at`: an amount stored beside a reference would be
 * a second copy of the channel's value, and the stale one.
 */
export function normalizeGoalThresholdSteps(
  value: unknown,
  metric: GoalMetric = DEFAULT_GOAL_METRIC,
): GoalThresholdStep[] {
  if (!Array.isArray(value)) return [];
  const fixed = normalizeGoalThresholds(
    value.filter((raw) => goalStepRef(raw) === null),
    metric,
  );
  const refs: GoalThresholdRefStep[] = [];
  for (const raw of value) {
    const ref = goalStepRef(raw);
    if (!ref || !refFitsMetric(ref, metric) || refs.some((step) => step.ref === ref)) continue;
    refs.push({
      ref,
      label: storedText((raw as Record<string, unknown>).label, GOAL_LABEL_MAX_LENGTH),
    });
  }
  return [...fixed, ...refs].slice(0, GOAL_MAX_THRESHOLDS);
}

/** Whether any step points at a channel value. */
export function goalStepsUseRefs(value: unknown): boolean {
  return Array.isArray(value) && value.some((raw) => goalStepRef(raw) !== null);
}

/**
 * Steps with every reference replaced by the channel's value — `{ at, label,
 * ref }`, the `ref` kept so a reader can tell where the amount came from. A
 * reference the channel has no value for, or one that does not measure what
 * the goal counts, is DROPPED. Fixed steps pass through untouched;
 * `normalizeGoalThresholds` still has the last word on them.
 */
export function resolveGoalThresholdRefs(
  value: unknown,
  values: GoalThresholdRefValues,
  metric: GoalMetric = DEFAULT_GOAL_METRIC,
): unknown[] {
  if (!Array.isArray(value)) return [];
  const resolved: unknown[] = [];
  for (const raw of value) {
    const ref = goalStepRef(raw);
    if (!ref) {
      resolved.push(raw);
      continue;
    }
    const at = refFitsMetric(ref, metric) ? parseGoalAmount(values[ref]) : null;
    if (at === null) continue;
    resolved.push({ ...(raw as Record<string, unknown>), at, ref });
  }
  return resolved;
}

/**
 * A goal bar's content with its references resolved against the channel.
 *
 * - No reference: the SAME object, untouched (today's bars cost nothing).
 * - References resolved: a copy with `thresholds` rewritten.
 * - No drawable step left (the only step pointed at a value the channel has
 *   not set): `null` — the caller does not deliver the bar.
 */
export function resolveGoalBarContentRefs(
  content: Record<string, unknown> | null | undefined,
  values: GoalThresholdRefValues,
): Record<string, unknown> | null {
  if (!content || typeof content !== 'object') return null;
  if (!goalStepsUseRefs(content.thresholds)) return content;
  const metric = isGoalMetric(content.metric) ? content.metric : DEFAULT_GOAL_METRIC;
  const thresholds = resolveGoalThresholdRefs(content.thresholds, values, metric);
  if (normalizeGoalThresholds(thresholds, metric).length === 0) return null;
  return { ...content, thresholds };
}

export interface GoalProgress {
  /** The metric right now. */
  value: number;
  /** The next unreached threshold — or the last one, once every step is reached. */
  target: number;
  /** `target - value`, never negative. Zero once complete. */
  remaining: number;
  /**
   * Progress toward the LAST threshold, 0–100, floored: 99.6 must not read as
   * 100 while there is still something left to add.
   */
  percent: number;
  reachedCount: number;
  /** Label of the next unreached step; the last step's label once complete. */
  label: string;
  /** Label of the highest step already reached; '' when none is. */
  reachedLabel: string;
  complete: boolean;
  /** Where each threshold sits on the bar, 0–100. The last is always 100. */
  markers: number[];
}

/** `null` when there is no threshold to measure against. */
export function computeGoalProgress(
  rawValue: number,
  thresholds: readonly GoalThreshold[],
): GoalProgress | null {
  // Written to compile under `noUncheckedIndexedAccess`: the React Native SDK
  // vendors this file and builds with that flag on.
  const last = thresholds[thresholds.length - 1];
  if (!last) return null;
  const value = Number.isFinite(rawValue) && rawValue > 0 ? roundMoney(rawValue) : 0;

  let reachedCount = 0;
  for (const step of thresholds) {
    if (value < step.at) break;
    reachedCount += 1;
  }
  const complete = reachedCount === thresholds.length;
  const next = (complete ? last : thresholds[reachedCount]) ?? last;
  const reached = reachedCount > 0 ? thresholds[reachedCount - 1] : undefined;

  return {
    value,
    target: next.at,
    remaining: complete ? 0 : roundMoney(Math.max(0, next.at - value)),
    percent: complete ? 100 : Math.min(99, Math.floor((value / last.at) * 100)),
    reachedCount,
    label: next.label,
    reachedLabel: reached?.label ?? '',
    complete,
    markers: thresholds.map((t) => Math.round((t.at / last.at) * 1000) / 10),
  };
}

// ===========================================
// PLACEHOLDERS
// ===========================================

export type DynamicValueKind = GoalValueKind | 'percent' | 'text';

/**
 * Everything a goal bar's sentences may say, and what kind of value each is.
 *
 * `metric` means "whatever the goal counts": money for a cart-total goal, a
 * count for an item-count goal. The panel's "insert value" menu reads this
 * list; the renderer fills from it; nothing else names a placeholder.
 */
export const GOAL_BAR_PLACEHOLDERS = [
  { name: 'goal.remaining', kind: 'metric' },
  { name: 'goal.target', kind: 'metric' },
  { name: 'goal.label', kind: 'text' },
  { name: 'goal.reachedLabel', kind: 'text' },
  { name: 'goal.percent', kind: 'percent' },
  { name: 'cart.total', kind: 'money' },
  { name: 'cart.itemCount', kind: 'count' },
] as const;

export type GoalBarPlaceholder = (typeof GOAL_BAR_PLACEHOLDERS)[number]['name'];

const GOAL_BAR_PLACEHOLDER_NAMES: ReadonlySet<string> = new Set(
  GOAL_BAR_PLACEHOLDERS.map((placeholder) => placeholder.name),
);

/**
 * `{namespace.field}` — a dot is required. That is what keeps a merchant's
 * literal braces ("{yeni sezon}") and the count widgets' bare `{count}` out of
 * this grammar entirely.
 */
const PLACEHOLDER_PATTERN = /\{([A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)+)\}/g;

/** The placeholder names a template uses, in order of first appearance. */
export function placeholdersIn(template: string): string[] {
  const seen: string[] = [];
  for (const match of template.matchAll(PLACEHOLDER_PATTERN)) {
    const name = match[1];
    if (name && !seen.includes(name)) seen.push(name);
  }
  return seen;
}

/**
 * Fill `{name}` placeholders from `values`.
 *
 * - A name that is not in `known` is NOT a placeholder: it stays as typed.
 * - A known name whose value is missing or empty makes the whole sentence
 *   unrenderable, and the function returns `null`. The caller hides the
 *   sentence; the shopper never sees `{goal.remaining}` or a gap where an
 *   amount should be.
 */
export function fillPlaceholders(
  template: string,
  values: Readonly<Record<string, string | null | undefined>>,
  known: ReadonlySet<string>,
): string | null {
  let missing = false;
  const filled = template.replace(PLACEHOLDER_PATTERN, (whole, name: string) => {
    if (!known.has(name)) return whole;
    const value = values[name];
    if (value === null || value === undefined || value === '') {
      missing = true;
      return whole;
    }
    return value;
  });
  return missing ? null : filled;
}

export interface DynamicFormat {
  /**
   * The VIEWER's locale (the storefront's `<html lang>`, the dashboard's
   * language). Never pinned in code: grouping and symbol placement follow
   * whoever is reading (`pnpm currency:check`).
   */
  locale?: string;
  /** The channel's currency, used when the basket did not carry its own. */
  currency?: string | null;
}

const CURRENCY_CODE = /^[A-Z]{3}$/;

function numberFormat(locale: string | undefined, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  try {
    return new Intl.NumberFormat(locale, options);
  } catch {
    // An unrecognised locale tag is a RangeError; the viewer's default is the
    // honest fallback. An invalid currency throws here too and is caught by
    // the caller, which treats it as "no currency".
    return new Intl.NumberFormat(undefined, options);
  }
}

/**
 * One value as the shopper reads it, or `null` when it cannot be said
 * honestly — money with no currency to say it in is the case that matters.
 */
export function formatDynamicValue(
  kind: DynamicValueKind,
  value: number | string | null | undefined,
  format: DynamicFormat & { currency?: string | null },
): string | null {
  if (value === null || value === undefined) return null;
  if (kind === 'text') return typeof value === 'string' ? value : String(value);

  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return null;

  try {
    if (kind === 'money') {
      const currency = (format.currency || '').toUpperCase();
      if (!CURRENCY_CODE.test(currency)) return null;
      const whole = Number.isInteger(number);
      return numberFormat(format.locale, {
        style: 'currency',
        currency,
        minimumFractionDigits: whole ? 0 : 2,
        maximumFractionDigits: 2,
      }).format(number);
    }
    if (kind === 'percent') {
      return numberFormat(format.locale, { style: 'percent', maximumFractionDigits: 0 }).format(
        number / 100,
      );
    }
    return numberFormat(format.locale, { maximumFractionDigits: 0 }).format(number);
  } catch {
    return null;
  }
}

// ===========================================
// GOAL BAR — the first dynamic surface
// ===========================================

/**
 * The four states a goal bar can be in. Fixed for this type; the general
 * "content per condition" of plan phase 3 is a different, later shape.
 *
 * - `unknown`  — the cart has not been measured. Never drawn (plan K3).
 * - `empty`    — measured, and empty. Drawn only if the merchant asked.
 * - `progress` — on the way; the main sentence.
 * - `complete` — every threshold reached; the reward sentence.
 */
export const GOAL_BAR_STATES = ['unknown', 'empty', 'progress', 'complete'] as const;
export type GoalBarState = (typeof GOAL_BAR_STATES)[number];

export interface GoalBarSpec {
  metric: GoalMetric;
  thresholds: GoalThreshold[];
  /** The `progress` sentence. Also the `empty` one, when that state is shown. */
  text: string;
  /** The `complete` sentence. Empty means the bar steps aside once the goal is met. */
  completeText: string;
  showWhenEmpty: boolean;
  showBar: boolean;
  buttonText: string;
  buttonUrl: string;
  completeButtonText: string;
  completeButtonUrl: string;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

function asText(value: unknown): string {
  return asString(value).trim().slice(0, GOAL_TEXT_MAX_LENGTH);
}

/**
 * The stored `contentJson` of a goal bar, read into a spec — or `null` when
 * there is nothing to measure (no threshold) or nothing to say (no sentence).
 * The same function decides "is this configurable to save" in the API and
 * "is this drawable" in the widget, so the two cannot disagree.
 */
export function normalizeGoalBarContent(
  content: Record<string, unknown> | null | undefined,
): GoalBarSpec | null {
  if (!content || typeof content !== 'object') return null;

  const metric = isGoalMetric(content.metric) ? content.metric : DEFAULT_GOAL_METRIC;
  const thresholds = normalizeGoalThresholds(content.thresholds, metric);
  const text = asText(content.text);
  if (thresholds.length === 0 || !text) return null;

  return {
    metric,
    thresholds,
    text,
    completeText: asText(content.completeText),
    showWhenEmpty: asBoolean(content.showWhenEmpty, false),
    showBar: asBoolean(content.showBar, true),
    buttonText: asText(content.buttonText),
    buttonUrl: asString(content.buttonUrl).trim(),
    completeButtonText: asText(content.completeButtonText),
    completeButtonUrl: asString(content.completeButtonUrl).trim(),
  };
}

/**
 * What is wrong with a goal bar's content, for the API's 400 and the
 * builder's inline message. `null` means it can be saved.
 */
export type GoalBarContentProblem =
  | 'no_threshold'
  | 'no_text'
  | 'too_many_thresholds'
  | 'ref_wrong_metric';

/**
 * A step that points at a channel value counts as a step here even when the
 * channel has not set that value yet: saving is a promise about the CONTENT,
 * and the channel's value can be set (or cleared) at any time after. Whether
 * the bar is drawable today is the presenter's question
 * (`resolveGoalBarContentRefs`), asked on every delivery.
 *
 * A reference on a goal that counts something else — the channel's
 * free-shipping amount on an item-count bar — is refused rather than quietly
 * dropped, so the merchant is not told "saved" about a step that never runs.
 */
export function goalBarContentProblem(
  content: Record<string, unknown> | null | undefined,
): GoalBarContentProblem | null {
  const source = content && typeof content === 'object' ? content : {};
  const metric = isGoalMetric(source.metric) ? source.metric : DEFAULT_GOAL_METRIC;
  if (Array.isArray(source.thresholds) && source.thresholds.length > GOAL_MAX_THRESHOLDS) {
    return 'too_many_thresholds';
  }
  if (
    Array.isArray(source.thresholds) &&
    source.thresholds.some((raw) => {
      const ref = goalStepRef(raw);
      return ref !== null && !refFitsMetric(ref, metric);
    })
  ) {
    return 'ref_wrong_metric';
  }
  if (normalizeGoalThresholdSteps(source.thresholds, metric).length === 0) return 'no_threshold';
  if (!textSaid(source.text)) return 'no_text';
  return null;
}

export interface GoalBarView {
  state: GoalBarState;
  /** False for `unknown`, for an unasked-for `empty`, and for a sentence with an unfillable placeholder. */
  visible: boolean;
  text: string;
  buttonText: string;
  buttonUrl: string;
  progress: GoalProgress | null;
}

const HIDDEN_VIEW = (state: GoalBarState, progress: GoalProgress | null): GoalBarView => ({
  state,
  visible: false,
  text: '',
  buttonText: '',
  buttonUrl: '',
  progress,
});

function goalBarValues(
  spec: GoalBarSpec,
  progress: GoalProgress,
  cart: DynamicCart,
  format: DynamicFormat,
): Record<GoalBarPlaceholder, string | null> {
  const metricKind = goalMetricKind(spec.metric);
  const money = { ...format, currency: cart.currency || format.currency };
  return {
    'goal.remaining': formatDynamicValue(metricKind, progress.remaining, money),
    'goal.target': formatDynamicValue(metricKind, progress.target, money),
    'goal.label': progress.label || null,
    'goal.reachedLabel': progress.reachedLabel || null,
    'goal.percent': formatDynamicValue('percent', progress.percent, money),
    'cart.total': formatDynamicValue('money', cart.total, money),
    'cart.itemCount': formatDynamicValue('count', cart.itemCount, money),
  };
}

/**
 * The goal bar for this cart: which state, which sentence, which button.
 *
 * Pure. The widget calls it on every cart change, the dashboard preview on
 * every slider move, and both get the same answer for the same input.
 */
export function resolveGoalBar(
  spec: GoalBarSpec,
  snapshot: DynamicSnapshot,
  format: DynamicFormat = {},
): GoalBarView {
  const cart = snapshot.cart;
  if (!cart.known) return HIDDEN_VIEW('unknown', null);

  const value = spec.metric === 'cart_item_count' ? cart.itemCount : cart.total;
  const progress = computeGoalProgress(value, spec.thresholds);
  if (!progress) return HIDDEN_VIEW('unknown', null);

  const state: GoalBarState = progress.complete
    ? 'complete'
    : progress.value <= 0
      ? 'empty'
      : 'progress';

  if (state === 'empty' && !spec.showWhenEmpty) return HIDDEN_VIEW(state, progress);

  const template = state === 'complete' ? spec.completeText : spec.text;
  if (!template) return HIDDEN_VIEW(state, progress);

  const values = goalBarValues(spec, progress, cart, format);
  const text = fillPlaceholders(template, values, GOAL_BAR_PLACEHOLDER_NAMES);
  if (text === null) return HIDDEN_VIEW(state, progress);

  const buttonTemplate = state === 'complete' ? spec.completeButtonText : spec.buttonText;
  const buttonText = buttonTemplate
    ? (fillPlaceholders(buttonTemplate, values, GOAL_BAR_PLACEHOLDER_NAMES) ?? '')
    : '';

  return {
    state,
    visible: true,
    text,
    buttonText,
    buttonUrl: buttonText
      ? state === 'complete'
        ? spec.completeButtonUrl
        : spec.buttonUrl
      : '',
    progress,
  };
}

/**
 * A cart for previews: the dashboard's slider and the visual editor's
 * placement preview. `known` is always true — a preview is showing the
 * merchant what a MEASURED cart would read, which is the question they asked.
 */
export function goalBarPreviewSnapshot(
  spec: Pick<GoalBarSpec, 'metric'>,
  value: number,
  currency?: string | null,
): DynamicSnapshot {
  const amount = Number.isFinite(value) && value > 0 ? value : 0;
  return {
    cart: {
      known: true,
      total: spec.metric === 'cart_total' ? amount : 0,
      itemCount: spec.metric === 'cart_item_count' ? Math.round(amount) : 0,
      currency: currency ?? null,
    },
  };
}

/**
 * The value a placement preview starts at: halfway to the first step, so the
 * merchant sees the main sentence and a part-filled bar rather than an empty
 * state they may have chosen to hide.
 */
export function goalBarPreviewValue(spec: Pick<GoalBarSpec, 'metric' | 'thresholds'>): number {
  const first = spec.thresholds[0]?.at ?? 0;
  const half = first / 2;
  return spec.metric === 'cart_item_count' ? Math.max(1, Math.floor(half)) : roundMoney(half);
}

// ===========================================
// CONTENT STATES — the same campaign, different words per situation
// ===========================================

/**
 * A campaign's content can carry STATES: "when the cart is worth 750 or more,
 * say this instead", "when the shopper is signed in, say that", "when it is
 * after 18:00, do not show at all".
 *
 * The condition is a behaviour rule set — the SAME shape and the SAME
 * evaluator as a campaign's own targeting (`./page-targeting`), so the panel
 * builds it with the editor it already has, and "is this state on" can never
 * mean something different from "does this rule match". The first state whose
 * rules match wins; with none matching, the base content stands.
 *
 * A state overrides only TEXT-like fields (`contentStateFields` in
 * `./configs`), never structure: a select, a toggle or a list changes what
 * the surface IS, and a surface that changes shape mid-page is not a message.
 *
 * Old clients ignore `states` and draw the base content — the safe answer,
 * which is why states as such need no version handshake. A state whose
 * condition reads the product on screen does (`CONFIG_PROTOCOL_PRODUCT_CONDITIONS`):
 * a client that knows states but not the product signals would drop that rule
 * and match the state more widely than it was written.
 */

/** The types a merchant can give states. Everything else is absent on purpose:
 *  `goal_bar` has its own four; `custom` is the merchant's own code; the two
 *  count types are templates around a fetched number; the consent banner is
 *  not a campaign. */
export const CONTENT_STATE_TYPES = [
  'announcement_bar',
  'inline_banner',
  'floating_button',
  'exit_intent_popup',
  'slide_in',
  'embedded_card',
  'sticky_footer',
  'countdown_timer',
  'newsletter',
  'tab_talk',
] as const;

/**
 * The types whose state is re-chosen WHILE they are on screen, redrawn in
 * place when the shopper's signals move. The others choose once, when they
 * are shown: a modal, a slide-in and a newsletter form may be mid-interaction
 * (a half-typed email address would be wiped by a redraw), and a tab talk is
 * read in another tab.
 */
export const CONTENT_STATE_LIVE_TYPES = [
  'announcement_bar',
  'inline_banner',
  'floating_button',
  'embedded_card',
  'sticky_footer',
  'countdown_timer',
] as const;

export const CONTENT_STATE_MAX = 5;
export const CONTENT_STATE_NAME_MAX_LENGTH = 60;
export const CONTENT_STATE_VALUE_MAX_LENGTH = 500;

export function typeSupportsContentStates(type: unknown): boolean {
  return typeof type === 'string' && (CONTENT_STATE_TYPES as readonly string[]).includes(type);
}

export function typeHasLiveContentStates(type: unknown): boolean {
  return typeof type === 'string' && (CONTENT_STATE_LIVE_TYPES as readonly string[]).includes(type);
}

export interface ContentState {
  /** Stable within the campaign: the panel's list key and the preview's choice. */
  id: string;
  name: string;
  when: BehaviorTargeting;
  /** True: in this situation the campaign is not shown at all. */
  hide: boolean;
  /** Overrides of the type's text fields. Empty means "keep the base". */
  content: Record<string, string>;
}

const STATE_ID = /^[A-Za-z0-9_-]{1,40}$/;

/**
 * States as the builder may send them, cleaned. A state with no usable rule is
 * DROPPED, not kept as "always": a state that always matches would silently
 * replace the base content for everybody, which is what the base is for.
 *
 * `fields` is the type's overridable field list; a key outside it is dropped.
 * Pass `null` to keep every string key (the widget does, because the API
 * already cleaned what it stored and the widget must not need the catalogue).
 */
export function normalizeContentStates(
  value: unknown,
  fields: readonly string[] | null,
): ContentState[] {
  if (!Array.isArray(value)) return [];
  const allowed = fields ? new Set(fields) : null;
  const seen = new Set<string>();
  const states: ContentState[] = [];

  for (const [index, raw] of value.entries()) {
    if (states.length >= CONTENT_STATE_MAX) break;
    if (!raw || typeof raw !== 'object') continue;
    const record = raw as Record<string, unknown>;

    const when = normalizeBehaviorTargeting(record.when);
    if (!when) continue;

    let id = typeof record.id === 'string' && STATE_ID.test(record.id) ? record.id : `state-${index + 1}`;
    while (seen.has(id)) id = `${id}-x`;
    seen.add(id);

    const content: Record<string, string> = {};
    const source =
      record.content && typeof record.content === 'object'
        ? (record.content as Record<string, unknown>)
        : {};
    for (const [key, fieldValue] of Object.entries(source)) {
      if (allowed && !allowed.has(key)) continue;
      // A state's override may be translated like the field it overrides.
      const text = storedText(fieldValue, CONTENT_STATE_VALUE_MAX_LENGTH);
      if (text) content[key] = text;
    }

    const hide = record.hide === true;
    // A state that neither hides nor changes anything is a no-op the merchant
    // did not mean; keeping it would make "this state is on" a lie in the panel.
    if (!hide && Object.keys(content).length === 0) continue;

    states.push({
      id,
      name: asString(record.name).trim().slice(0, CONTENT_STATE_NAME_MAX_LENGTH),
      when,
      hide,
      content: hide ? {} : content,
    });
  }
  return states;
}

/**
 * What is wrong with a list of states, for the API's 400 and the builder's
 * inline message — the same answer in both, as with `goalBarContentProblem`.
 * `normalizeContentStates` would quietly DROP each of these; saving should not.
 */
export type ContentStatesProblem = 'too_many' | 'no_rule' | 'no_change';

export function contentStatesProblem(
  value: unknown,
  fields: readonly string[],
): ContentStatesProblem | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value)) return 'no_rule';
  if (value.length > CONTENT_STATE_MAX) return 'too_many';
  for (const raw of value) {
    const one = normalizeContentStates([raw], fields);
    if (one.length === 1) continue;
    const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    return normalizeBehaviorTargeting(record.when) ? 'no_change' : 'no_rule';
  }
  return null;
}

export interface ResolvedContentState {
  /** The state that won, or null for the base content. */
  stateId: string | null;
  /** True when the winning state says "do not show". */
  hidden: boolean;
  /** The content to draw: the base with the winning state's fields over it, `states` removed. */
  content: Record<string, unknown>;
}

/**
 * Which state applies for these signals, and the content to draw. Pure; the
 * widget calls it at render time and again on every signal change for a live
 * type, the panel's preview with the state the merchant picked, the app SDK
 * with its own snapshot.
 */
export function resolveContentState(
  content: Record<string, unknown> | null | undefined,
  signals: BehaviorSnapshot | undefined,
): ResolvedContentState {
  const base: Record<string, unknown> = { ...(content ?? {}) };
  const states = normalizeContentStates(base.states, null);
  delete base.states;

  for (const state of states) {
    if (!evaluateBehaviorTargeting(state.when, signals)) continue;
    if (state.hide) return { stateId: state.id, hidden: true, content: base };
    return { stateId: state.id, hidden: false, content: { ...base, ...state.content } };
  }
  return { stateId: null, hidden: false, content: base };
}

/** The content a preview draws for one chosen state (`null` = the base). */
export function contentForState(
  content: Record<string, unknown> | null | undefined,
  stateId: string | null,
): ResolvedContentState {
  const base: Record<string, unknown> = { ...(content ?? {}) };
  const states = normalizeContentStates(base.states, null);
  delete base.states;
  const state = stateId ? states.find((candidate) => candidate.id === stateId) : undefined;
  if (!state) return { stateId: null, hidden: false, content: base };
  if (state.hide) return { stateId: state.id, hidden: true, content: base };
  return { stateId: state.id, hidden: false, content: { ...base, ...state.content } };
}

// ===========================================
// CAMPAIGN PLACEHOLDERS — live values in any campaign's words
// ===========================================

/**
 * The values any campaign that can have states may SAY — "Sepetinde
 * {cart.itemCount} ürün var", "Bu üründe {product.discountAmount} tasarruf",
 * "Son {product.stock} ürün". The goal bar has its own, richer list
 * (`GOAL_BAR_PLACEHOLDERS`).
 *
 * Two SOURCES, and each is a value the platform actually has, never a guess:
 *
 * - `cart.*` — the shopper's MEASURED cart (`DynamicCart`).
 * - `product.*` — the product on screen, as the channel's CATALOGUE describes
 *   it (`DynamicProduct`). The widget reads it with one cached request per
 *   product page, made only when a campaign there says one
 *   (`/public/sites/:siteKey/product-facts`); the app SDK takes it from the
 *   product its host hands to `getSurfaces`. Anywhere but a product page there
 *   is no product to speak of.
 *
 * The goal bar's rule, applied per sentence: a known placeholder that cannot
 * be filled — the cart was not measured, money has no currency, the product
 * has no original price — makes THAT content unsayable, never a gap or a brace
 * on screen. A content state that cannot be said yields to the next matching
 * state and finally to the base (`resolveCampaignContent`), which is how a
 * merchant gives a sentence an alternative; with nothing sayable left the
 * campaign is not drawn for now.
 *
 * `protocol` is the `/config` protocol that introduced the name. An OLD client
 * would print the braces, so `/config` withholds a campaign from a client
 * that has not announced the protocol its words need
 * (`contentPlaceholderProtocol`).
 */
export const CAMPAIGN_PLACEHOLDERS = [
  { name: 'cart.total', kind: 'money', source: 'cart', protocol: 2 },
  { name: 'cart.itemCount', kind: 'count', source: 'cart', protocol: 2 },
  { name: 'product.title', kind: 'text', source: 'product', protocol: 3 },
  { name: 'product.price', kind: 'money', source: 'product', protocol: 3 },
  { name: 'product.originalPrice', kind: 'money', source: 'product', protocol: 3 },
  { name: 'product.discountAmount', kind: 'money', source: 'product', protocol: 3 },
  { name: 'product.discountRate', kind: 'percent', source: 'product', protocol: 3 },
  { name: 'product.stock', kind: 'count', source: 'product', protocol: 3 },
] as const;

export type CampaignPlaceholder = (typeof CAMPAIGN_PLACEHOLDERS)[number]['name'];

export const CAMPAIGN_PLACEHOLDER_NAMES: readonly string[] = CAMPAIGN_PLACEHOLDERS.map(
  (placeholder) => placeholder.name,
);

/** The `product.*` half: what a campaign may say about the product on screen. */
export const PRODUCT_PLACEHOLDERS = CAMPAIGN_PLACEHOLDERS.filter(
  (placeholder) => placeholder.source === 'product',
);

export const PRODUCT_PLACEHOLDER_NAMES: readonly string[] = PRODUCT_PLACEHOLDERS.map(
  (placeholder) => placeholder.name,
);

const CAMPAIGN_PLACEHOLDER_SET: ReadonlySet<string> = new Set(CAMPAIGN_PLACEHOLDER_NAMES);
const PRODUCT_PLACEHOLDER_SET: ReadonlySet<string> = new Set(PRODUCT_PLACEHOLDER_NAMES);
const PLACEHOLDER_PROTOCOL: ReadonlyMap<string, number> = new Map(
  CAMPAIGN_PLACEHOLDERS.map((placeholder): [string, number] => [placeholder.name, placeholder.protocol]),
);

/**
 * The `/config` protocol a client announces (`?p=`). Version 2 understands the
 * cart placeholders, version 3 the product placeholders too, version 4 the
 * product CONDITIONS (`PRODUCT_BEHAVIOR_SIGNALS` in a state's or the
 * targeting's rules); a client that sends nothing is version 1. A campaign is
 * handed only to a client whose version covers everything its words and rules
 * carry. A CDN keeps `client.js` for hours, so "deployed" never means "every
 * shopper runs it".
 *
 * Why conditions need a version when states did not: a client that ignores
 * `states` draws the base content, which is safe. A client that knows states
 * but not a product signal is NOT safe — `normalizeBehaviorTargeting` drops a
 * rule on an unknown signal, so "stock below 5 AND signed in" becomes "signed
 * in", and a targeting rule set left with no rule at all matches EVERYONE.
 * The same name read as a signal it does not know widens the rule; it never
 * narrows it.
 */
export const CONFIG_PROTOCOL_PLACEHOLDERS = 2;
export const CONFIG_PROTOCOL_PRODUCT_PLACEHOLDERS = 3;
export const CONFIG_PROTOCOL_PRODUCT_CONDITIONS = 4;
/**
 * Version 5 knows the CONSENT conditions (`CONSENT_BEHAVIOR_SIGNALS`). A rule
 * on consent is usually there because the law requires it, so the widening an
 * older client would do — dropping the rule and showing the content to every
 * visitor, consenting or not — is exactly the outcome the rule forbids.
 */
export const CONFIG_PROTOCOL_CONSENT_CONDITIONS = 5;
/** What a current client announces: every placeholder and every condition signal. */
export const CONFIG_PROTOCOL_CURRENT = CONFIG_PROTOCOL_CONSENT_CONDITIONS;

/** Content keys that are code or markup, never words: placeholders are not filled there. */
const NOT_WORDS = new Set(['html', 'css', 'javascript', 'customCode', 'states', 'thresholds']);

function wordsOf(content: Record<string, unknown>): Array<[string, string]> {
  return Object.entries(content).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string' && !NOT_WORDS.has(entry[0]),
  );
}

/** Every campaign placeholder this content — or any of its states — says. */
function placeholdersSaid(content: Record<string, unknown> | null | undefined): string[] {
  if (!content || typeof content !== 'object') return [];
  const names = new Set<string>();
  const collect = (record: Record<string, unknown>) => {
    for (const [, text] of wordsOf(record)) {
      for (const name of placeholdersIn(text)) {
        if (CAMPAIGN_PLACEHOLDER_SET.has(name)) names.add(name);
      }
    }
  };
  collect(content);
  const states = Array.isArray(content.states) ? content.states : [];
  for (const state of states) {
    const stateContent = state && typeof state === 'object' ? (state as Record<string, unknown>).content : null;
    if (stateContent && typeof stateContent === 'object') collect(stateContent as Record<string, unknown>);
  }
  return Array.from(names);
}

/** Does this content — or any of its states — say a campaign placeholder? */
export function contentUsesPlaceholders(content: Record<string, unknown> | null | undefined): boolean {
  return placeholdersSaid(content).length > 0;
}

/**
 * Does this content — or any of its states — say something about the product
 * on screen? The widget asks this BEFORE it requests the product's facts: a
 * page whose campaigns never say one never makes the request.
 */
export function contentUsesProductPlaceholders(content: Record<string, unknown> | null | undefined): boolean {
  return placeholdersSaid(content).some((name) => PRODUCT_PLACEHOLDER_SET.has(name));
}

/**
 * The lowest `/config` protocol that can draw this content: 1 when it says no
 * placeholder, otherwise the highest protocol among the names it says.
 */
export function contentPlaceholderProtocol(content: Record<string, unknown> | null | undefined): number {
  let protocol = 1;
  for (const name of placeholdersSaid(content)) {
    protocol = Math.max(protocol, PLACEHOLDER_PROTOCOL.get(name) ?? 1);
  }
  return protocol;
}

// ===========================================
// PRODUCT CONDITIONS — rules that read the product on screen
// ===========================================

/** The raw rules of a stored rule set (`{ match, rules }`), or `[]`. Read as stored: nothing normalized away. */
function rawRules(behavior: unknown): unknown[] {
  const rules = behavior && typeof behavior === 'object' ? (behavior as { rules?: unknown }).rules : null;
  return Array.isArray(rules) ? rules : [];
}

/**
 * Does this rule set read a product signal? Asked of the STORED value, not a
 * normalized one: a rule an older reader would drop is exactly the one that
 * matters here.
 */
export function behaviorRulesReadProduct(behavior: unknown): boolean {
  return rawRules(behavior).some(
    (rule) => !!rule && typeof rule === 'object' && isProductBehaviorSignal((rule as { signal?: unknown }).signal),
  );
}

/** The `when` of each stored state, as stored. */
function stateConditions(content: Record<string, unknown> | null | undefined): unknown[] {
  const states = content && typeof content === 'object' && Array.isArray(content.states) ? content.states : [];
  return states.map((state) =>
    state && typeof state === 'object' ? (state as Record<string, unknown>).when : undefined,
  );
}

/** Does any of this content's states choose its words by the product on screen? */
export function contentUsesProductConditions(content: Record<string, unknown> | null | undefined): boolean {
  return stateConditions(content).some(behaviorRulesReadProduct);
}

/**
 * Does this content need the product on screen — a `{product.*}` it says, or a
 * state whose condition reads one? The widget asks this BEFORE it requests the
 * product's facts.
 */
export function contentUsesProduct(content: Record<string, unknown> | null | undefined): boolean {
  return contentUsesProductPlaceholders(content) || contentUsesProductConditions(content);
}

/**
 * Does this campaign need the product on screen: in its words, its states, or
 * its own targeting (`pageTargetingJson.behavior`)?
 */
export function campaignUsesProduct(
  campaign: { contentJson?: unknown; pageTargetingJson?: unknown } | null | undefined,
): boolean {
  if (!campaign) return false;
  const content =
    campaign.contentJson && typeof campaign.contentJson === 'object'
      ? (campaign.contentJson as Record<string, unknown>)
      : null;
  const targeting =
    campaign.pageTargetingJson && typeof campaign.pageTargetingJson === 'object'
      ? (campaign.pageTargetingJson as { behavior?: unknown })
      : null;
  return contentUsesProduct(content) || behaviorRulesReadProduct(targeting?.behavior);
}

/** Does this rule set read the visitor's consent? Asked of the stored value, as `behaviorRulesReadProduct`. */
export function behaviorRulesReadConsent(behavior: unknown): boolean {
  return rawRules(behavior).some(
    (rule) => !!rule && typeof rule === 'object' && isConsentBehaviorSignal((rule as { signal?: unknown }).signal),
  );
}

/** The lowest `/config` protocol that evaluates this rule set as written. */
export function conditionsProtocol(behavior: unknown): number {
  if (behaviorRulesReadConsent(behavior)) return CONFIG_PROTOCOL_CONSENT_CONDITIONS;
  return behaviorRulesReadProduct(behavior) ? CONFIG_PROTOCOL_PRODUCT_CONDITIONS : 1;
}

/**
 * The lowest `/config` protocol that draws this content as written: what its
 * words say (`contentPlaceholderProtocol`) and what its states' conditions
 * read. Also what an experiment arm's content override is measured with.
 */
export function contentDrawProtocol(content: Record<string, unknown> | null | undefined): number {
  let protocol = contentPlaceholderProtocol(content);
  for (const when of stateConditions(content)) protocol = Math.max(protocol, conditionsProtocol(when));
  return protocol;
}

/** The lowest `/config` protocol that evaluates this targeting (`pageTargetingJson`) as written. */
export function targetingDrawProtocol(targeting: unknown): number {
  return targeting && typeof targeting === 'object'
    ? conditionsProtocol((targeting as { behavior?: unknown }).behavior)
    : 1;
}

/**
 * The product on screen, as a campaign's words read it — the CATALOGUE's
 * facts about it (the feed row behind the page's product code), in the
 * channel's currency.
 *
 * `known` is false when there is no product to speak of: not a product page,
 * a code the catalogue does not carry, a request that failed. `pending` is the
 * one state between: the widget has asked and not heard back. A sentence that
 * needs the product WAITS while it is pending — falling back to an
 * alternative sentence for the hundred milliseconds the request takes would
 * show the shopper one sentence and swap it for another.
 *
 * Every fact is optional on its own: a product with no original price is not
 * on sale, and a stock the feed does not carry is unknown, not zero.
 */
export interface DynamicProduct {
  known: boolean;
  pending?: boolean;
  title?: string | null;
  /** What the shopper pays now. */
  price?: number | null;
  /** The list price before a discount. Above `price` only when the product is on sale. */
  originalPrice?: number | null;
  stock?: number | null;
  /** ISO 4217. The channel's currency is the fallback. */
  currency?: string | null;
}

export const UNKNOWN_PRODUCT: DynamicProduct = Object.freeze({ known: false });

/** While the widget is still reading the product's facts. */
export const PENDING_PRODUCT: DynamicProduct = Object.freeze({ known: false, pending: true });

const PRODUCT_TITLE_MAX_LENGTH = 200;

function asAmount(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * A product's facts as the API answers them or a host app hands them over,
 * cleaned. Numeric strings are accepted (Akinon serialises decimals as
 * `"379.80"`); anything that is not a number is left out rather than guessed.
 * An object that says `known: false` — or is not an object — is no product.
 * One that says `pending: true` is a product still being read (a host app's
 * product screen while it loads): what needs it waits, as on the web.
 */
export function normalizeDynamicProduct(value: unknown): DynamicProduct {
  if (!value || typeof value !== 'object') return { known: false };
  const record = value as Record<string, unknown>;
  if (record.pending === true) return { known: false, pending: true };
  if (record.known === false) return { known: false };
  const title = asString(record.title).trim().slice(0, PRODUCT_TITLE_MAX_LENGTH);
  const currency = asString(record.currency).trim().toUpperCase();
  const stock = asAmount(record.stock);
  return {
    known: true,
    title: title || null,
    price: asAmount(record.price),
    originalPrice: asAmount(record.originalPrice),
    stock: stock === null ? null : Math.floor(stock),
    currency: CURRENCY_CODE.test(currency) ? currency : null,
  };
}

/**
 * The `product.*` values for one product, each `null` when it cannot be said
 * honestly:
 *
 * - `price` — above zero.
 * - `originalPrice`, `discountAmount`, `discountRate` — only while the product
 *   is ON SALE (original price above the price). "Önceki fiyat ₺100" beside a
 *   ₺100 price would announce a discount that does not exist. The rate is
 *   rounded DOWN: 29.6% is "%29", never an overstated "%30".
 * - `stock` — above zero. An out-of-stock product has nothing left to count.
 */
export function productPlaceholderValues(
  product: DynamicProduct | null | undefined,
  format: DynamicFormat = {},
): Record<string, string | null> {
  const values: Record<string, string | null> = {};
  for (const name of PRODUCT_PLACEHOLDER_NAMES) values[name] = null;
  const figures = productFigures(product);
  if (!product || !figures) return values;

  const money = { ...format, currency: product.currency || format.currency };
  const { price, original, onSale, discount, rate, stock } = figures;

  values['product.title'] = product.title && product.title.trim() ? product.title.trim() : null;
  values['product.price'] = price === null ? null : formatDynamicValue('money', price, money);
  values['product.originalPrice'] = onSale && original !== null ? formatDynamicValue('money', original, money) : null;
  values['product.discountAmount'] = discount > 0 ? formatDynamicValue('money', discount, money) : null;
  values['product.discountRate'] = rate >= 1 ? formatDynamicValue('percent', rate, money) : null;
  values['product.stock'] = stock !== null && stock > 0 ? formatDynamicValue('count', stock, money) : null;
  return values;
}

/**
 * The product's numbers, computed ONCE for both readers — the words
 * (`productPlaceholderValues`) and the conditions (`productSignalValues`) — so
 * "on sale" and "%20" can never mean one thing in a sentence and another in
 * the rule that chose it. `null` for no known product.
 */
interface ProductFigures {
  /** Above zero, or null. */
  price: number | null;
  original: number | null;
  /** Original price above the price. */
  onSale: boolean;
  /** `original - price` while on sale, 0 otherwise. */
  discount: number;
  /** Whole percent off while on sale, rounded DOWN: 29.6% is 29, never an overstated 30. */
  rate: number;
  /** Zero is a measurement (sold out); null is "not counted". */
  stock: number | null;
}

function productFigures(product: DynamicProduct | null | undefined): ProductFigures | null {
  if (!product || !product.known) return null;
  const price = typeof product.price === 'number' && product.price > 0 ? product.price : null;
  const original = typeof product.originalPrice === 'number' ? product.originalPrice : null;
  const onSale = price !== null && original !== null && original > price;
  return {
    price,
    original,
    onSale,
    discount: onSale && original !== null && price !== null ? roundMoney(original - price) : 0,
    rate: onSale && original !== null && price !== null ? Math.floor(((original - price) / original) * 100) : 0,
    stock: typeof product.stock === 'number' && product.stock >= 0 ? Math.floor(product.stock) : null,
  };
}

/**
 * The product signals (`PRODUCT_BEHAVIOR_SIGNALS`) for one product — only the
 * ones that can be answered honestly; the rest stay ABSENT, and a rule on an
 * absent product signal does not match:
 *
 * - `productPrice` — a price above zero.
 * - `productOnSale`, `productDiscountRate` — whenever the price is known: a
 *   product with no original price above its price is not on sale (rate 0).
 * - `productStock` — when the catalogue counts it, zero included: "sold out"
 *   is a measurement, "not counted" is not.
 */
export function productSignalValues(product: DynamicProduct | null | undefined): BehaviorSnapshot {
  const figures = productFigures(product);
  if (!figures) return {};
  const values: BehaviorSnapshot = {};
  if (figures.price !== null) {
    values.productPrice = figures.price;
    values.productOnSale = figures.onSale;
    values.productDiscountRate = figures.rate;
  }
  if (figures.stock !== null) values.productStock = figures.stock;
  return values;
}

/**
 * A behaviour snapshot with the product signals filled from `product` — the
 * one way a reader adds them, used by the widget (targeting), the app SDK
 * (targeting) and `resolveCampaignContent` (states). A value the caller
 * already set wins, as with the cart signals: a host app that reports
 * `productStock` itself knows its product better.
 */
export function withProductSignals(
  behavior: BehaviorSnapshot | undefined,
  product: DynamicProduct | null | undefined,
): BehaviorSnapshot | undefined {
  const values = productSignalValues(product);
  const names = Object.keys(values) as Array<keyof BehaviorSnapshot>;
  if (names.length === 0) return behavior;
  const merged: BehaviorSnapshot = { ...(behavior ?? {}) };
  for (const name of names) {
    if (merged[name] === undefined) merged[name] = values[name];
  }
  return merged;
}

/** The product signals, as the set `decideBehaviorTargeting` holds open while the product is read. */
const PRODUCT_SIGNAL_SET: ReadonlySet<string> = new Set(PRODUCT_BEHAVIOR_SIGNALS);

// ===========================================
// THE PAGE'S OWN PRICE — fresher than the catalogue
// ===========================================

/**
 * The price the product page itself states, read by the widget with the SAME
 * reader that found the product's code (`extractProductFromDom` in the
 * widget's `core/product-code.ts`): the structured data's offer price
 * (`offers.price` in JSON-LD, `product:price:amount` in Open Graph) — the
 * price the store tells search engines the product sells for now.
 *
 * Only the structured data, and deliberately not the data layer's
 * `product_view` / `view_item` price:
 * that event reaches the widget behind the consent gate, at a time nothing
 * controls, with a code read by a different resolver, and our data layer
 * contract does not say whether its `price` is before or after a discount.
 */
export interface PagePrice {
  amount: number;
  /** ISO 4217 when the page stated one. */
  currency?: string | null;
}

/**
 * The product with the page's own price, when the page states one that can be
 * trusted for it — the catalogue is a feed, imported hours apart, and a price
 * changed in the store's admin reaches the page first.
 *
 * Never two sources in one sentence: when the page's price differs from the
 * catalogue's, the catalogue's ORIGINAL price is kept only if it is still
 * above the page's price (a discount that is consistent with what the shopper
 * pays); otherwise it is dropped, and with it every discount value — a
 * discount sentence then yields to its alternative instead of claiming a
 * reduction the page does not show.
 *
 * Ignored (the catalogue stands) when: the product is not known, the page
 * price is not a positive number, or the page names a currency other than the
 * product's (the catalogue's, else `channelCurrency`).
 */
export function withPagePrice(
  product: DynamicProduct,
  page: PagePrice | null | undefined,
  channelCurrency?: string | null,
): DynamicProduct {
  if (!product.known || !page) return product;
  const amount = typeof page.amount === 'number' && Number.isFinite(page.amount) && page.amount > 0 ? page.amount : null;
  if (amount === null) return product;
  const pageCurrency = asString(page.currency).trim().toUpperCase();
  const expected = (product.currency || asString(channelCurrency)).trim().toUpperCase();
  if (CURRENCY_CODE.test(pageCurrency) && CURRENCY_CODE.test(expected) && pageCurrency !== expected) return product;

  const price = roundMoney(amount);
  if (typeof product.price === 'number' && Math.abs(product.price - price) < 0.005) return product;
  const original = typeof product.originalPrice === 'number' && product.originalPrice > price ? product.originalPrice : null;
  return { ...product, price, originalPrice: original };
}

export interface FilledContent {
  content: Record<string, unknown>;
  /** True when a placeholder could not be said: draw nothing for now. */
  unfillable: boolean;
  /**
   * True when what is missing is still on its way — the product's facts are
   * being read. The caller holds the campaign rather than falling back.
   */
  waiting?: boolean;
}

/**
 * Fill every word field's campaign placeholders from the cart and, when the
 * content speaks about it, the product on screen.
 */
export function fillContentPlaceholders(
  content: Record<string, unknown>,
  cart: DynamicCart,
  format: DynamicFormat = {},
  product: DynamicProduct | null = null,
): FilledContent {
  const money = { ...format, currency: cart.currency || format.currency };
  const values: Record<string, string | null> = {
    ...(cart.known
      ? {
          'cart.total': formatDynamicValue('money', cart.total, money),
          'cart.itemCount': formatDynamicValue('count', cart.itemCount, money),
        }
      : { 'cart.total': null, 'cart.itemCount': null }),
    ...productPlaceholderValues(product, format),
  };

  const out: Record<string, unknown> = { ...content };
  for (const [key, text] of wordsOf(content)) {
    const said = placeholdersIn(text).filter((name) => CAMPAIGN_PLACEHOLDER_SET.has(name));
    if (said.length === 0) continue;
    const filled = fillPlaceholders(text, values, CAMPAIGN_PLACEHOLDER_SET);
    if (filled === null) {
      const waiting = product?.pending === true && said.some((name) => PRODUCT_PLACEHOLDER_SET.has(name));
      return waiting ? { content, unfillable: true, waiting: true } : { content, unfillable: true };
    }
    out[key] = filled;
  }
  return { content: out, unfillable: false };
}

/** What a campaign's words are filled from. */
export interface CampaignContentValues {
  cart: DynamicCart;
  /** The product on screen; absent or unknown anywhere but a product page. */
  product?: DynamicProduct | null;
}

export interface ResolvedCampaignContent {
  /** The state whose words are drawn — or that hid the campaign — or null for the base. */
  stateId: string | null;
  /** True when nothing is drawn for now. */
  hidden: boolean;
  /**
   * Why nothing is drawn: a state says "do not show" here, a value is still on
   * its way (`waiting`), or nothing the campaign could say can be said.
   */
  reason: 'state' | 'waiting' | 'unfillable' | null;
  /** The words to draw, placeholders filled, `states` removed. */
  content: Record<string, unknown>;
}

/**
 * The words a state-capable campaign says for these signals and values — the
 * one answer the widget, the app SDK and every test share.
 *
 * Matching states are tried top to bottom, then the base content:
 *
 * - A matching "do not show" state hides the campaign.
 * - A content whose placeholders can all be said is drawn.
 * - A content that cannot be said YIELDS to the next candidate. That is the
 *   alternative sentence: "Bu üründe {product.discountAmount} tasarruf" in a
 *   state, "Ücretsiz kargo" in the base — a product that is not on sale reads
 *   the base, never a gap.
 * - A content waiting on a value that is on its way (the product's facts) holds
 *   the campaign instead, so the shopper does not read the fallback and then
 *   watch it change. So does a state whose CONDITION reads the product while
 *   its facts are on their way and could still decide it
 *   (`decideBehaviorTargeting` answers null).
 *
 * A state's condition sees the product signals (`productStock`, …) of the
 * same `values.product` the words are filled from; with no known product a
 * rule on them does not match, so such a state yields as well.
 *
 * With every candidate unsayable the campaign is hidden (`unfillable`) — the
 * old rule, which still holds when there is no alternative to fall back to.
 */
export function resolveCampaignContent(
  content: Record<string, unknown> | null | undefined,
  signals: BehaviorSnapshot | undefined,
  values: CampaignContentValues,
  format: DynamicFormat = {},
): ResolvedCampaignContent {
  const base: Record<string, unknown> = { ...(content ?? {}) };
  const states = normalizeContentStates(base.states, null);
  delete base.states;
  const product = values.product ?? null;
  // The product signals come from the same product the words are filled
  // from, so a state chosen by "on sale" can always say the discount.
  const snapshot = withProductSignals(signals, product);
  const pending = product?.pending === true ? PRODUCT_SIGNAL_SET : null;

  const attempt = (stateId: string | null, candidate: Record<string, unknown>): ResolvedCampaignContent => {
    const filled = fillContentPlaceholders(candidate, values.cart, format, product);
    if (!filled.unfillable) return { stateId, hidden: false, reason: null, content: filled.content };
    return { stateId, hidden: true, reason: filled.waiting ? 'waiting' : 'unfillable', content: candidate };
  };

  for (const state of states) {
    const matches = decideBehaviorTargeting(state.when, snapshot, pending);
    if (matches === false) continue;
    // A state about the product while its facts are being read: WAIT rather
    // than draw the next candidate now and replace it when they land.
    if (matches === null) return { stateId: state.id, hidden: true, reason: 'waiting', content: base };
    if (state.hide) return { stateId: state.id, hidden: true, reason: 'state', content: base };
    const view = attempt(state.id, { ...base, ...state.content });
    if (!view.hidden || view.reason === 'waiting') return view;
  }
  return attempt(null, base);
}

// ===========================================
// DAILY CUTOFF — a countdown that starts again every day
// ===========================================

/**
 * "Orders before 14:00 ship today: 02:14:05". A countdown to a time of DAY,
 * which rolls over to tomorrow's once it passes — the shipping cutoff every
 * store has, where a fixed end date would need re-entering daily.
 *
 * The cutoff is in the STORE's time zone, not the visitor's: "14:00" is when
 * the warehouse stops, and a shopper abroad must see the same remaining time
 * as one in Istanbul. Nothing fakes urgency here — the time is real and the
 * same for everyone, which is the line this file holds (no per-visitor
 * "this offer expires in 10 minutes" clock that restarts for each shopper).
 */
export const COUNTDOWN_MODES = ['fixed_date', 'daily_cutoff'] as const;
export type CountdownMode = (typeof COUNTDOWN_MODES)[number];
export const DEFAULT_COUNTDOWN_MODE: CountdownMode = 'fixed_date';

/** The store time zones the builder offers; the first is the default. */
export const CUTOFF_TIME_ZONES = [
  'Europe/Istanbul',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Amsterdam',
  'Europe/Athens',
  'Asia/Dubai',
  'UTC',
] as const;

const HH_MM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/** `'14:00'` → minutes after midnight, or null for anything else. */
export function parseDailyCutoff(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = HH_MM.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Wall-clock parts of `instant` in `timeZone`. */
function zonedParts(instant: number, timeZone: string): { y: number; mo: number; d: number; h: number; mi: number; s: number } | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(new Date(instant));
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    const out = { y: get('year'), mo: get('month'), d: get('day'), h: get('hour'), mi: get('minute'), s: get('second') };
    return Object.values(out).every(Number.isFinite) ? out : null;
  } catch {
    return null;
  }
}

/**
 * The next instant the store's clock reads `cutoff` — today's if it is still
 * ahead, tomorrow's otherwise. Null for an unreadable cutoff or time zone.
 *
 * Computed from the zone's own wall clock rather than a fixed offset, so a
 * daylight-saving change between now and the cutoff is honoured.
 */
export function nextDailyCutoff(now: number, cutoff: unknown, timeZone: string): number | null {
  const minutes = parseDailyCutoff(cutoff);
  if (minutes === null) return null;
  const wall = zonedParts(now, timeZone);
  if (!wall) return null;

  const nowMinutes = wall.h * 60 + wall.mi + wall.s / 60;
  const dayOffset = nowMinutes < minutes ? 0 : 1;
  // The cutoff's wall time expressed as if it were UTC, then corrected by the
  // zone's offset AT that moment (which may differ from now's across DST).
  const asUtc = Date.UTC(wall.y, wall.mo - 1, wall.d + dayOffset, Math.floor(minutes / 60), minutes % 60, 0);
  const offsetAt = (instant: number) => {
    const parts = zonedParts(instant, timeZone);
    if (!parts) return 0;
    return Date.UTC(parts.y, parts.mo - 1, parts.d, parts.h, parts.mi, parts.s) - instant;
  };
  const guess = asUtc - offsetAt(asUtc);
  return asUtc - offsetAt(guess);
}

/** Where a countdown counts to right now: its fixed end date, or the next daily cutoff. */
export function countdownTarget(content: Record<string, unknown> | null | undefined, now: number): number | null {
  const source = content ?? {};
  if (source.countdownMode === 'daily_cutoff') {
    const zone =
      typeof source.cutoffTimeZone === 'string' &&
      (CUTOFF_TIME_ZONES as readonly string[]).includes(source.cutoffTimeZone)
        ? source.cutoffTimeZone
        : CUTOFF_TIME_ZONES[0];
    return nextDailyCutoff(now, source.dailyCutoff, zone);
  }
  if (typeof source.endDate !== 'string' || !source.endDate) return null;
  // The panel's `datetime-local` field stores a WALL-CLOCK time with no zone
  // ("2026-10-12T18:00"). `new Date()` read it in each VISITOR's zone, so one
  // countdown ended at a different moment for every shopper — three hours
  // early in London for a sale that ends at 18:00 in Istanbul. It is the
  // merchant's time, in the zone every merchant-facing time is edited in.
  const end = wallClockToInstant(source.endDate, CAMPAIGN_SCHEDULE_TIMEZONE)?.getTime();
  return end !== undefined && Number.isFinite(end) ? end : null;
}

/**
 * The unit words under a countdown's digits, in the STOREFRONT's language
 * (`<html lang>`), not the panel's. They were English literals ("Days",
 * "Hours") on every store, Turkish ones included. A language not listed reads
 * English, the platform's agreed fallback.
 */
const COUNTDOWN_UNIT_LABELS: Readonly<Record<string, readonly [string, string, string, string]>> = {
  tr: ['Gün', 'Saat', 'Dk', 'Sn'],
  en: ['Days', 'Hours', 'Mins', 'Secs'],
  de: ['Tage', 'Std', 'Min', 'Sek'],
  fr: ['Jours', 'Heures', 'Min', 'Sec'],
  es: ['Días', 'Horas', 'Min', 'Seg'],
  it: ['Giorni', 'Ore', 'Min', 'Sec'],
  nl: ['Dagen', 'Uur', 'Min', 'Sec'],
};

export function countdownUnitLabels(locale: string | null | undefined): {
  days: string;
  hours: string;
  minutes: string;
  seconds: string;
} {
  const language = String(locale || '').trim().toLowerCase().split(/[-_]/)[0] ?? '';
  const labels = COUNTDOWN_UNIT_LABELS[language] ?? COUNTDOWN_UNIT_LABELS.en ?? ['', '', '', ''];
  return { days: labels[0], hours: labels[1], minutes: labels[2], seconds: labels[3] };
}
