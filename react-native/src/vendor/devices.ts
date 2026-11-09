// GENERATED FILE — DO NOT EDIT.
//
// Vendored from packages/widget-contract/src/devices.ts by
// scripts/sync-vendored-page-targeting.js. Edit the source, then run:
//
//   node scripts/sync-vendored-page-targeting.js
//
// It is copied rather than imported because @selwise/widget-contract is private
// and this SDK is published: a dependency on it would not resolve for anyone
// who installs @selwise/react-native from npm.

/**
 * ONE DEFINITION OF "PHONE", AND ONE WAY TO SAY "DIFFERENT ON A PHONE".
 *
 * `@selwise/widget-contract/devices` — imported by its subpath, never through
 * the barrel (the widget entry must not pull the style catalogue in).
 *
 * Until 2026-11-09 every surface decided "mobile" on its own: the campaign
 * stylesheet at 480 and 640px, the product card and content blocks at 640 and
 * 1024, the legacy card sheet at 768, the recommendation strip at 639 and
 * 1023, search at a per-channel 768 — and the builder preview's "desktop" was
 * exactly 1024px, so it drew every card and block with its TABLET rules. A
 * 768px tablet was desktop for search, tablet for the card and nothing for a
 * campaign. This module is the only list of those widths.
 *
 * (Copied verbatim into `@selwise/react-native`, where an app is always a
 * phone: it resolves every setting with `resolveForDevice(…, 'mobile')`.)
 *
 * Two words, kept apart on purpose:
 *   - LAYOUT device — how a surface LOOKS — is decided by the viewport WIDTH
 *     (`layoutDeviceOf`). A narrow desktop window gets the phone layout; that
 *     is what the shopper sees.
 *   - TARGETING device — WHO sees a surface — stays on the user agent
 *     (`apps/client/src/core/device.ts`), because segments, analytics and the
 *     API's audience counters already count it that way.
 *
 * A setting that differs on a phone is a PARTIAL document under
 * `devices.mobile`: desktop is the base, the phone carries only what differs.
 * Each module lists the paths a phone may change (`*_DEVICE_FIELDS`) and every
 * reader resolves through `resolveForDevice` — the widget at draw time, the
 * dashboard's form and preview, the API's validation and the React Native SDK
 * (which is always `mobile`).
 */

export const LAYOUT_DEVICES = ['desktop', 'mobile'] as const;
export type LayoutDevice = (typeof LAYOUT_DEVICES)[number];

/** Widths up to this many CSS pixels are a phone. */
export const MOBILE_MAX_WIDTH = 767;
/**
 * Widths up to this are a tablet. Only the product card and content blocks
 * have a tablet tier (node-level `responsive.tablet`); every other surface
 * draws a tablet with its desktop settings.
 */
export const TABLET_MAX_WIDTH = 1023;

/** The first desktop width (a tablet draws the desktop's settings). */
export const DESKTOP_MIN_WIDTH = MOBILE_MAX_WIDTH + 1;

export const MOBILE_MEDIA_QUERY = `(max-width: ${MOBILE_MAX_WIDTH}px)`;
export const DESKTOP_MEDIA_QUERY = `(min-width: ${DESKTOP_MIN_WIDTH}px)`;
export const TABLET_MEDIA_QUERY = `(max-width: ${TABLET_MAX_WIDTH}px)`;

/** The layout device for a viewport (or container) width. Unknown or zero width is desktop. */
export function layoutDeviceOf(width: number): LayoutDevice {
  return Number.isFinite(width) && width > 0 && width <= MOBILE_MAX_WIDTH ? 'mobile' : 'desktop';
}

export function isLayoutDevice(value: unknown): value is LayoutDevice {
  return value === 'desktop' || value === 'mobile';
}

/** The layout device of the window the code runs in (the storefront, the preview frame). */
export function currentLayoutDevice(): LayoutDevice {
  // Read through `globalThis` so the module compiles where there is no DOM
  // (the React Native SDK, the API), where it answers "desktop".
  const scope = globalThis as unknown as {
    innerWidth?: number;
    document?: { documentElement?: { clientWidth?: number } };
  };
  const width = scope.innerWidth || scope.document?.documentElement?.clientWidth || 0;
  return layoutDeviceOf(width);
}

/**
 * Where a piece that cannot CHANGE per device runs: on every device, or on
 * one only. An enrichment rule (a CSS attribute on its root — server-side
 * rendering cannot know the device) and a page-experiment action (skipped and
 * unreported on the other device) are the two readers; one list for both.
 */
export const DEVICE_VISIBILITIES = ['all', 'desktop', 'mobile'] as const;
export type DeviceVisibility = (typeof DEVICE_VISIBILITIES)[number];

/** A stored or sent visibility; anything unknown (an old row, `tablet`) is `all`. */
export function normalizeDeviceVisibility(value: unknown): DeviceVisibility {
  return value === 'desktop' || value === 'mobile' ? value : 'all';
}

/* ------------------------------------------------------------------------ */
/* Targeting device (the user agent)                                         */
/* ------------------------------------------------------------------------ */

/**
 * The TARGETING device of a user agent — who a surface is shown to, what a
 * segment and the audience counters count. One pair of patterns, read by the
 * widget, the API and the API's SQL (as `.source`), so no two of them can
 * classify one visitor differently. Order matters: a tablet is asked first.
 */
export const TABLET_USER_AGENT_PATTERN = /(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i;
export const MOBILE_USER_AGENT_PATTERN =
  /Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/;

export type TargetingDevice = 'desktop' | 'tablet' | 'mobile';

export function targetingDeviceOfUserAgent(userAgent: string): TargetingDevice {
  if (TABLET_USER_AGENT_PATTERN.test(userAgent)) return 'tablet';
  if (MOBILE_USER_AGENT_PATTERN.test(userAgent)) return 'mobile';
  return 'desktop';
}

/* ------------------------------------------------------------------------ */
/* Partial overrides                                                         */
/* ------------------------------------------------------------------------ */

type Rec = Record<string, unknown>;

export type DeepPartial<T> = T extends readonly unknown[]
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

/** What a settings document carries for the devices that differ from its base. */
export interface DeviceOverrides<T> {
  mobile?: DeepPartial<T>;
}

function isPlainObject(value: unknown): value is Rec {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** A plain object that is not a localized text (`{ $i18n }` is one value, never merged per language). */
function isMergeable(value: unknown): value is Rec {
  return isPlainObject(value) && !('$i18n' in value);
}

/**
 * Lay a partial document over a complete one. Objects merge, arrays and
 * scalars replace, `undefined` keeps — the semantics of an experiment arm's
 * override (`deepMergeExperimentConfig`), so a device layer and an arm layer
 * read the same way. A localized text (`{ $i18n }`) is ONE value: a phone
 * headline written in Turkish only replaces the desktop's in every language,
 * as the search and recommendation layers do.
 */
export function mergeOverride<T>(base: T, patch: unknown): T {
  if (patch === undefined || patch === null) return base;
  if (!isMergeable(patch)) return patch as T;
  const out: Rec = isMergeable(base) ? { ...base } : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    out[key] = isMergeable(value) && isMergeable(out[key]) ? mergeOverride(out[key], value) : value;
  }
  return out as T;
}

/** The document as `device` draws it: the base, with the phone's layer on a phone. */
export function resolveForDevice<T>(
  base: T,
  devices: DeviceOverrides<T> | null | undefined,
  device: LayoutDevice,
): T {
  if (device !== 'mobile' || !devices || !isPlainObject(devices.mobile)) return base;
  return mergeOverride(base, devices.mobile);
}

/** The value at a dot-separated `path`, or `undefined` (a non-object on the way ends the walk). */
export function readPath(source: unknown, path: string): unknown {
  let node: unknown = source;
  for (const key of path.split('.')) {
    if (!isPlainObject(node)) return undefined;
    node = node[key];
  }
  return node;
}

/** A copy of `source` without `path`; objects left empty on the way are removed. */
export function clearPath<T extends object>(source: T | null | undefined, path: string): T {
  const keys = path.split('.');
  const clear = (node: unknown, index: number): Rec | undefined => {
    if (!isPlainObject(node)) return undefined;
    const out: Rec = { ...node };
    const key = keys[index] ?? '';
    if (index === keys.length - 1) {
      delete out[key];
    } else {
      const inner = clear(out[key], index + 1);
      if (inner && Object.keys(inner).length > 0) out[key] = inner;
      else delete out[key];
    }
    return out;
  };
  return (clear(source, 0) ?? {}) as T;
}
