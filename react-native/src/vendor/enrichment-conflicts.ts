// GENERATED FILE — DO NOT EDIT.
//
// Vendored from packages/widget-contract/src/enrichment-conflicts.ts by
// scripts/sync-vendored-page-targeting.js. Edit the source, then run:
//
//   node scripts/sync-vendored-page-targeting.js
//
// It is copied rather than imported because @selwise/widget-contract is private
// and this SDK is published: a dependency on it would not resolve for anyone
// who installs @selwise/react-native from npm.

/**
 * Which enrichment rule wins a placement — one implementation for the widget,
 * the server renderers and the app SDK.
 *
 * Self-contained on purpose: it imports only `./devices`, so the SDK (published,
 * and unable to depend on this private package) carries it as a generated copy
 * (`scripts/sync-vendored-page-targeting.js`) instead of a restatement.
 */

import { normalizeDeviceVisibility } from './devices.js';

/**
 * Is this rule's visibility independent of WHO is asking?
 *
 * The one predicate that decides what may go into a cacheable server-rendered
 * response. A segment-targeted rule is a per-visitor answer; writing one into
 * a page a CDN will hand to everybody pins one shopper's targeting onto the
 * whole audience — which is both wrong and, for a segment built on purchase
 * history, a disclosure.
 *
 * `mode === 'all'` OR an empty id list, deliberately matching the widget's own
 * `filterBySegments` short-circuit exactly. A stricter server-side rule would
 * mean a rule the widget renders for everyone is silently skipped by SSR, and
 * the merchant would see content that appears on some page loads and not
 * others with nothing to explain it.
 */
export function isVisitorIndependentEnrichment(rule: {
  segmentTargetingMode?: string | null;
  segmentIds?: readonly string[] | null;
}): boolean {
  const mode = rule.segmentTargetingMode || 'all';
  const ids = Array.isArray(rule.segmentIds) ? rule.segmentIds : [];
  return mode === 'all' || ids.length === 0;
}

// ---------------------------------------------------------------------------
// Conflict resolution — one implementation for the widget, the server renderers
// and (restated, since it depends on nothing) the app SDK.
// ---------------------------------------------------------------------------

/** What conflict resolution reads of a rule. */
export interface EnrichmentConflictRule {
  conflictBehavior?: string | null;
  deviceVisibility?: string | null;
  segmentTargetingMode?: string | null;
  segmentIds?: readonly string[] | null;
  isTestMode?: boolean | null;
}

/** Is a rule drawn on this device? `deviceVisibility` absent means every device. */
export function enrichmentVisibleOnDevice(
  rule: { deviceVisibility?: unknown },
  device: 'desktop' | 'mobile',
): boolean {
  const visibility = normalizeDeviceVisibility(rule.deviceVisibility);
  return visibility === 'all' || visibility === device;
}

/**
 * A rule no viewer can filter out, and which keeps its scope to itself.
 *
 * It settles the scope for everybody, so nothing ranked below it can ever be
 * shown to anyone and the server may stop collecting candidates there. A rule
 * that a segment, a device or the test-mode gate can still remove is NOT one:
 * for the visitors it is removed for, the next rule is the winner.
 */
export function isUnconditionalEnrichmentWinner(rule: EnrichmentConflictRule): boolean {
  return (
    rule.conflictBehavior === 'exclusive' &&
    rule.isTestMode !== true &&
    normalizeDeviceVisibility(rule.deviceVisibility) === 'all' &&
    isVisitorIndependentEnrichment(rule)
  );
}

/**
 * Which of one scope's rules survive, for ONE viewer.
 *
 * `eligible` is what this viewer is eligible for — segment, test mode, device
 * and window already applied — in priority order. The winner is the first of
 * them whatever its behaviour; `exclusive` only decides whether the rest come
 * with it. Choosing the winner BEFORE those filters made a higher-priority
 * `exclusive` rule that the viewer was filtered out of blank the whole scope.
 */
export function keepEnrichmentWinners<T extends { conflictBehavior?: string | null }>(
  eligible: readonly T[],
): T[] {
  const [winner] = eligible;
  return winner && winner.conflictBehavior === 'exclusive' ? [winner] : [...eligible];
}

/**
 * The scope a WEB rule competes in: one placement, which is a selector and where
 * relative to it. The widget and the dashboard preview settle winners per this
 * key, so they must spell it the same way.
 */
export function webEnrichmentScope(item: { selector: string; insertPosition: string }): string {
  return `${item.selector}|${item.insertPosition}`;
}

/**
 * `keepEnrichmentWinners` over every scope of a response, for a viewer whose
 * device is known. Items keep their relative order; the caller has already
 * applied its segment and test-mode gates.
 */
export function resolveEnrichmentConflicts<
  T extends EnrichmentConflictRule & { order?: number },
>(items: readonly T[], scopeOf: (item: T) => string, device: 'desktop' | 'mobile'): T[] {
  const scopes = new Map<string, T[]>();
  for (const item of items) {
    if (!enrichmentVisibleOnDevice(item, device)) continue;
    const key = scopeOf(item);
    const bucket = scopes.get(key);
    if (bucket) {
      bucket.push(item);
    } else {
      scopes.set(key, [item]);
    }
  }

  const winners = new Set<T>();
  for (const bucket of scopes.values()) {
    const ordered = [...bucket].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    for (const item of keepEnrichmentWinners(ordered)) winners.add(item);
  }
  return items.filter((item) => winners.has(item));
}

// ---------------------------------------------------------------------------
// What an enrichment client tells the API it can do.
// ---------------------------------------------------------------------------

/**
 * Capabilities a client announces with `capabilities=` on the enrichment reads.
 *
 *  - `conflicts` — the client settles each placement's winner itself, after its
 *    segment, device and test-mode gates. The API then ships every candidate
 *    that gate could leave as the winner, flagged with `conflictBehavior`.
 *  - `tokens` — the client's block pass knows the price tokens
 *    (`formattedOriginalPrice`, `discountRate`, `savings`) and the
 *    `data-selwise-hide-when-empty` marker. Without it the server applies both
 *    itself, so an older client never shows a token as written.
 *
 * A client that does not announce it (a CDN-cached widget, an older SDK) gets
 * the response it always got: the winner already chosen on the server, nothing
 * extra on the wire. Shipping it the candidates would make it draw all of them
 * on top of each other.
 */
export const ENRICHMENT_CLIENT_CAPABILITIES = ['conflicts', 'tokens'] as const;
export type EnrichmentClientCapability = (typeof ENRICHMENT_CLIENT_CAPABILITIES)[number];

/** `capabilities=conflicts,other` or repeated; anything unknown is ignored. */
export function readEnrichmentCapabilities(raw: unknown): Set<EnrichmentClientCapability> {
  const values = (Array.isArray(raw) ? raw : [raw])
    .filter((value): value is string => typeof value === 'string')
    .flatMap((value) => value.split(','))
    .map((value) => value.trim().toLowerCase());
  return new Set(
    ENRICHMENT_CLIENT_CAPABILITIES.filter((capability) => values.includes(capability)),
  );
}
