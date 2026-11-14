// GENERATED FILE — DO NOT EDIT.
//
// Vendored from packages/widget-contract/src/campaign-interaction.ts by
// scripts/sync-vendored-page-targeting.js. Edit the source, then run:
//
//   node scripts/sync-vendored-page-targeting.js
//
// It is copied rather than imported because @selwise/widget-contract is private
// and this SDK is published: a dependency on it would not resolve for anyone
// who installs @selwise/react-native from npm.

/**
 * What a visitor's CLOSE of a campaign does to its next appearance.
 *
 * `@selwise/widget-contract/campaign-interaction` — light on purpose (no
 * imports), because the widget entry and the app SDK both read it at draw time.
 *
 * ## The rule, in four lines
 *
 * - A CLICK stores nothing. Showing a campaign again is the frequency cap's
 *   question, not a memory of what the visitor pressed.
 * - A CLOSE is remembered, for `afterClose`: `'session'` (the default) or
 *   `{ days: N }`. Closing is the visitor's own answer about this surface,
 *   like the goal bar's, so a session-long close is kept whatever the
 *   analytics consent says; a close that outlives the session is a persistent
 *   key and needs the channel's persistence to be allowed.
 * - The memory belongs to a VERSION of the campaign: `interactionVersionOf`
 *   digests what the visitor SEES (content, styles, custom code, the phone's
 *   layer). Changing the words or the design brings the bar back to those who
 *   closed the old one; changing its targeting, its dates or its cap does not.
 * - The record carries a version digest and a time, never an identity.
 */

/**
 * The DOM event a renderer dispatches on `document` when the visitor closes a
 * campaign (`detail: { id }`). A renderer only ANNOUNCES the close; what is
 * remembered, where and for how long is decided in one place, so a preview —
 * which is never registered there — writes nothing.
 */
export const DISMISS_EVENT = 'selwise:dismiss';

/** The longest a close may last. A year is already "never" for a campaign. */
export const AFTER_CLOSE_DAYS_MAX = 365;
export const AFTER_CLOSE_DAYS_MIN = 1;

export type AfterClose = 'session' | { days: number };

export const DEFAULT_AFTER_CLOSE: AfterClose = 'session';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Whole days within bounds, or null. */
function wholeDays(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  return value >= AFTER_CLOSE_DAYS_MIN && value <= AFTER_CLOSE_DAYS_MAX ? value : null;
}

/** What a stored `placementConfigJson.afterClose` means; anything unreadable is the default. */
export function readAfterClose(value: unknown): AfterClose {
  if (isRecord(value)) {
    const days = wholeDays(value.days);
    if (days !== null) return { days };
  }
  return DEFAULT_AFTER_CLOSE;
}

/** A problem with a value the API was sent, or null when it is storable. */
export function afterCloseProblem(value: unknown): { code: string; message: string } | null {
  if (value === undefined || value === 'session') return null;
  if (isRecord(value) && wholeDays(value.days) !== null && Object.keys(value).length === 1) return null;
  return {
    code: 'AFTER_CLOSE_INVALID',
    message: `afterClose must be "session" or { days: a whole number from ${AFTER_CLOSE_DAYS_MIN} to ${AFTER_CLOSE_DAYS_MAX} }.`,
  };
}

/** `stringify` with the keys in a fixed order, so equal values digest equally. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (isRecord(value)) {
    const keys = Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** FNV-1a, 32 bit, as 8 hex digits. */
function fnv1a32(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** What a campaign must carry for its version: the parts a visitor sees. */
export interface InteractionVersionSource {
  contentJson?: unknown;
  stylesJson?: unknown;
  customCss?: unknown;
  customJs?: unknown;
  devices?: unknown;
}

/**
 * The digest a close is remembered against. Targeting, dates, priority, the
 * cap and the name are NOT in it — editing them must not bring back a bar
 * somebody closed; editing what the bar says or looks like must.
 */
export function interactionVersionOf(source: InteractionVersionSource): string {
  return fnv1a32(
    stableStringify({
      c: source.contentJson ?? null,
      s: source.stylesJson ?? null,
      css: source.customCss ?? null,
      js: source.customJs ?? null,
      d: source.devices ?? null,
    }),
  );
}

/** `<version>.<time in ms>` — one string, no identity. */
export function encodeDismissal(version: string, at: number): string {
  return `${version}.${Math.max(0, Math.floor(at))}`;
}

export function decodeDismissal(raw: string | null | undefined): { version: string; at: number } | null {
  if (typeof raw !== 'string') return null;
  const match = /^([0-9a-f]{8})\.(\d{1,15})$/.exec(raw);
  const version = match?.[1];
  const at = match?.[2];
  return version !== undefined && at !== undefined ? { version, at: Number(at) } : null;
}

/**
 * Does a remembered close still hold the campaign back?
 *
 * `session` is held by the store the record sits in (sessionStorage ends with
 * the tab), so any record of this version holds. `days` holds for that long
 * from the close.
 */
export function dismissalHolds(
  record: { version: string; at: number } | null,
  version: string,
  afterClose: AfterClose,
  now: number,
): boolean {
  if (!record || record.version !== version) return false;
  if (afterClose === 'session') return true;
  return now - record.at < afterClose.days * 86_400_000;
}
