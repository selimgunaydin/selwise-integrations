/**
 * Product enrichment, normalized for a channel with no DOM.
 *
 * ## What enrichment is, and why the app path looks different
 *
 * A merchant writes their own HTML for a product surface — a spec table, a
 * shipping note, a care guide — with `${title}` / `${attr.garanti_suresi}`
 * tokens the server fills in from the catalogue. It is the most-used module on
 * the web, and it was the one module the app did not have.
 *
 * On the web the widget receives RAW blocks plus a token map, interpolates
 * locally and scopes the CSS against the merchant's own page. The app receives
 * markup that is already interpolated, sanitized and scoped, for two reasons
 * that both point the same way: there is no foreign stylesheet to defend
 * against inside a WebView, and the alternative is a vendored copy of a CSS
 * SANITIZER living in a React Native package.
 *
 * ## What is still decided here
 *
 * Placement, test mode and segment membership — the three per-visitor or
 * per-screen calls the server deliberately leaves to the client, so that one
 * product-keyed response serves every visitor.
 */

import { resolveEnrichmentConflicts } from '../vendor/enrichment-conflicts.js';

/** One rule, rendered. Mirrors `AppEnrichmentItem` in the shared contract. */
export interface EnrichmentItem {
  assignmentId: string;
  /** The named slot this rule belongs in. */
  placementKey: string;
  /** Stacking order within the slot; ascending. */
  order: number;
  /** Interpolated, sanitized markup for the whole rule. */
  html: string;
  /** Sanitized CSS, scoped to this rule's own blocks. Empty when none. */
  css: string;
  /** Space to hold open while the WebView measures itself, when declared. */
  reservedHeightPx?: number;
  segmentTargetingMode?: string;
  segmentIds?: string[];
  isTestMode?: boolean;
  /**
   * `exclusive` when this rule, if it is the first one left in its slot after
   * segment and test-mode targeting, keeps the slot's other rules off the
   * screen. Absent means the rule stacks with the others.
   */
  conflictBehavior?: 'exclusive';
}

export interface EnrichmentResult {
  /** Digest stamp. Changes whenever any rule or block changes. */
  v: string;
  code: string;
  /** Did the catalogue carry the code — i.e. did the product tokens resolve. */
  resolved: boolean;
  slots: string[];
  items: EnrichmentItem[];
}

export const EMPTY_ENRICHMENT: EnrichmentResult = {
  v: '',
  code: '',
  resolved: false,
  slots: [],
  items: [],
};

const PLACEMENT_KEY_MAX_LENGTH = 64;
const PLACEMENT_KEY_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

/**
 * The slot name, folded the way the server folds it.
 *
 * A screen writing `PDP Specs` and a merchant typing `pdp-specs` must reach
 * the same rule. The server normalizes on the way in, so the SDK has to send
 * the folded form or the request asks for a slot that cannot exist — the fold
 * is deliberately identical to `normalizeEnrichmentPlacementKey`.
 */
export function normalizePlacementKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const folded = value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!folded || folded.length > PLACEMENT_KEY_MAX_LENGTH) return null;
  return PLACEMENT_KEY_PATTERN.test(folded) ? folded : null;
}

export function normalizePlacementKeys(values: readonly unknown[]): string[] {
  const keys: string[] = [];
  for (const value of values) {
    const key = normalizePlacementKey(value);
    if (key && !keys.includes(key)) keys.push(key);
  }
  return keys;
}

/** One `app/enrichments` item into the shape a host renders. */
export function normalizeEnrichmentItem(raw: unknown): EnrichmentItem | null {
  const entry = asRecord(raw);
  const assignmentId = asString(entry.assignmentId).trim();
  const placementKey = normalizePlacementKey(entry.placementKey);
  const html = asString(entry.html);

  // No markup is not a rule to render. The server never sends one, and an item
  // with an empty body would still count an impression for a blank space.
  if (!assignmentId || !placementKey || !html.trim()) return null;

  const reserved = Number.parseInt(String(entry.reservedHeightPx ?? ''), 10);
  const order = Number.parseInt(String(entry.order ?? ''), 10);

  return {
    assignmentId,
    placementKey,
    order: Number.isFinite(order) ? order : 0,
    html,
    css: asString(entry.css),
    ...(Number.isFinite(reserved) && reserved > 0 ? { reservedHeightPx: reserved } : {}),
    ...(typeof entry.segmentTargetingMode === 'string'
      ? { segmentTargetingMode: entry.segmentTargetingMode }
      : {}),
    ...(Array.isArray(entry.segmentIds)
      ? {
          segmentIds: entry.segmentIds.filter(
            (id): id is string => typeof id === 'string' && id.length > 0
          ),
        }
      : {}),
    ...(entry.isTestMode === true ? { isTestMode: true } : {}),
    ...(entry.conflictBehavior === 'exclusive' ? { conflictBehavior: 'exclusive' as const } : {}),
  };
}

export function normalizeEnrichment(raw: unknown): EnrichmentResult {
  const payload = asRecord(raw);
  const items = Array.isArray(payload.items) ? payload.items : [];

  return {
    v: asString(payload.v),
    code: asString(payload.code),
    resolved: payload.resolved === true,
    slots: Array.isArray(payload.slots)
      ? payload.slots.filter((slot): slot is string => typeof slot === 'string')
      : [],
    items: items
      .map((entry) => normalizeEnrichmentItem(entry))
      .filter((item): item is EnrichmentItem => item !== null)
      .sort((a, b) => a.order - b.order),
  };
}

/**
 * Test mode is a GATE, not a filter — the same rule campaigns and widgets
 * follow. A test-mode rule is invisible to a real visitor and the only thing a
 * tester sees, so getting it backwards puts a merchant's unfinished markup on
 * every product screen.
 *
 * A tester sees ONLY the test-mode rules, on purpose: one slot shows one rule,
 * so a live rule left in the list could win the slot and hide the draft being
 * tried. (The storefront's `?test=1` shows both because a page can hold many
 * placements; a screen slot cannot.)
 */
export function selectByTestMode(
  items: readonly EnrichmentItem[],
  testMode: boolean
): EnrichmentItem[] {
  return items.filter((item) => (item.isTestMode === true) === testMode);
}

/**
 * Settle each slot among the rules this visitor can actually see.
 *
 * Call it AFTER segment and test-mode targeting. A slot's winner is the first
 * rule left in stacking order whatever its behaviour; `exclusive` only decides
 * whether the others come with it. Deciding the winner before targeting would
 * let an `exclusive` rule that the visitor is outside of leave the slot empty.
 * Items keep their original order. An app is always a phone, so a rule for the
 * desktop never reaches this point.
 */
export function keepSlotWinners(items: readonly EnrichmentItem[]): EnrichmentItem[] {
  return resolveEnrichmentConflicts(items, (item) => item.placementKey, 'mobile');
}

/** The rules for one slot, in stacking order. */
export function itemsForSlot(items: readonly EnrichmentItem[], slot: string): EnrichmentItem[] {
  const key = normalizePlacementKey(slot);
  if (!key) return [];
  return items.filter((item) => item.placementKey === key).sort((a, b) => a.order - b.order);
}

/**
 * Content cached per (code, slots, stamp).
 *
 * A product screen re-mounts constantly — a back navigation, a variant switch,
 * a tab change — and the answer for one product does not change between them.
 * Keyed on the digest stamp so a merchant's edit is picked up on the next
 * fetch rather than held for the life of the process, and bounded because a
 * visitor who browses fifty products must not accumulate fifty documents.
 */
const MAX_CACHED_CODES = 20;

export class EnrichmentCache {
  private readonly entries = new Map<string, EnrichmentResult>();

  /**
   * `scope` separates audiences that are shipped different item sets for the
   * same product and slots (test mode shows drafts, live does not).
   */
  private keyOf(code: string, slots: readonly string[], scope = ''): string {
    return `${scope}|${code} ${[...slots].sort().join(',')}`;
  }

  get(code: string, slots: readonly string[], stamp: string, scope = ''): EnrichmentResult | null {
    const entry = this.entries.get(this.keyOf(code, slots, scope));
    if (!entry) return null;
    // An empty stamp means "nothing fetched yet", not "matches".
    if (!stamp || entry.v !== stamp) return null;
    return entry;
  }

  set(code: string, slots: readonly string[], value: EnrichmentResult, scope = ''): void {
    const key = this.keyOf(code, slots, scope);
    // Re-insert so eviction order is least-recently-written.
    this.entries.delete(key);
    this.entries.set(key, value);

    while (this.entries.size > MAX_CACHED_CODES) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}
