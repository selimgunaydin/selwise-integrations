// GENERATED FILE — DO NOT EDIT.
//
// Vendored from packages/search-contract/src/devices.ts by
// scripts/sync-vendored-page-targeting.js. Edit the source, then run:
//
//   node scripts/sync-vendored-page-targeting.js
//
// It is copied rather than imported because @selwise/search-contract is private
// and this SDK is published: a dependency on it would not resolve for anyone
// who installs @selwise/react-native from npm.

/**
 * THE PHONE'S OWN SEARCH — a partial document over the desktop one.
 *
 * Until 2026-11-09 the only thing a phone could do differently was open
 * another surface (`placement.mobile.surface`). Columns, layout, fields,
 * suggestion sections, colours, sizes, texts and the product card were one
 * value for both, so a merchant who wanted four columns on a 1920px desktop
 * got four slivers on a 390px phone, or chose two and wasted the desktop.
 *
 * Now `settings.devices.mobile` holds only what differs on a phone — any path
 * under `SEARCH_DEVICE_FIELDS` — and every reader resolves through
 * `resolveSearchSettingsForDevice`: the widget on each opening, the
 * dashboard's form and preview, the API's validation. What stays one value
 * for both (`SEARCH_SHARED_FIELDS`) is identity and integration: the cart
 * script, the "view all" address, the per-device surface pair itself.
 *
 * The phone is a LAYOUT device — the viewport width, below
 * `SEARCH_PHONE_BREAKPOINT` — and "phone", the merge and the width are the
 * widget contract's (`@selwise/widget-contract/devices`): one threshold, one
 * merge rule for every surface's phone layer.
 */

import { DESKTOP_MIN_WIDTH, mergeOverride, readPath, type LayoutDevice } from './devices.js';
import type { SearchSettings } from './search-settings.js';

/** The first desktop width; `placement.mobile.breakpoint` is always this since 2026-11-09. */
export const SEARCH_PHONE_BREAKPOINT = DESKTOP_MIN_WIDTH;

export type SearchLayoutDevice = LayoutDevice;

/**
 * What a phone may change. A listed path covers everything under it. The
 * placement's FIELD and OPENERS are here because many storefronts draw a
 * separate header on a phone with its own search box or icon.
 */
export const SEARCH_DEVICE_FIELDS = [
  'placement.input',
  'placement.openers',
  'placement.anchorSelector',
  'behavior',
  'results.layout',
  'results.fields',
  'results.highlight',
  'results.excludeOutOfStock',
  'results.categories',
  'results.viewAll.enabled',
  'results.viewAll.newTab',
  'suggestions',
  'appearance',
  'texts',
] as const;

/**
 * One value on every device, said so in the dashboard: the cart (one shop, one
 * basket), the "view all" ADDRESS (one results page), and the per-device
 * surface pair, which already answers per device.
 */
export const SEARCH_SHARED_FIELDS = [
  'cart',
  'results.viewAll.url',
  'results.viewAll.param',
  'placement.desktop',
  'placement.mobile',
] as const;

/** A partial settings document: only the paths that differ on a phone. */
export type SearchDevicePatch = Record<string, unknown>;

export interface SearchDevices {
  mobile: SearchDevicePatch;
}

type Rec = Record<string, unknown>;

function isPlainObject(value: unknown): value is Rec {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** A `{ $i18n }` text is one value, not a branch of the document. */
function isLeaf(value: unknown): boolean {
  return !isPlainObject(value) || '$i18n' in value;
}

export function isSearchDevicePath(path: string): boolean {
  return SEARCH_DEVICE_FIELDS.some((prefix) => path === prefix || path.startsWith(`${prefix}.`));
}

/** Every leaf path a patch sets (`results.layout`, `texts.placeholder`, `placement.openers`). */
export function searchDevicePatchPaths(patch: unknown, prefix = ''): string[] {
  if (isLeaf(patch)) return prefix ? [prefix] : [];
  const out: string[] = [];
  for (const [key, value] of Object.entries(patch as Rec)) {
    if (value === undefined) continue;
    out.push(...searchDevicePatchPaths(value, prefix ? `${prefix}.${key}` : key));
  }
  return out;
}

/** Keep the paths a phone may change; name the rest. */
export function filterSearchDevicePatch(raw: unknown): { patch: SearchDevicePatch; dropped: string[] } {
  const dropped: string[] = [];
  const walk = (node: unknown, prefix: string): Rec => {
    const out: Rec = {};
    if (!isPlainObject(node)) return out;
    for (const [key, value] of Object.entries(node)) {
      if (value === undefined) continue;
      const path = prefix ? `${prefix}.${key}` : key;
      if (isSearchDevicePath(path)) out[key] = value;
      else if (!isLeaf(value) && SEARCH_DEVICE_FIELDS.some((entry) => entry.startsWith(`${path}.`))) {
        const inner = walk(value, path);
        if (Object.keys(inner).length > 0) out[key] = inner;
      } else dropped.push(path);
    }
    return out;
  };
  return { patch: walk(raw, ''), dropped };
}

function writeInto(target: Rec, path: string, value: unknown): void {
  const keys = path.split('.');
  let cursor = target;
  keys.slice(0, -1).forEach((key) => {
    if (!isPlainObject(cursor[key])) cursor[key] = {};
    cursor = cursor[key] as Rec;
  });
  cursor[keys[keys.length - 1] as string] = value;
}

/**
 * The stored phone layer: the allowed paths, each with the value the phone's
 * NORMALIZED document has there (a clamped number, a known enum), and nothing
 * the phone does not change. `normalize` is the settings reader (passed in to
 * keep this file free of a cycle).
 */
export function normalizeSearchDevicePatch(
  base: SearchSettings,
  raw: unknown,
  normalize: (raw: unknown) => SearchSettings,
): SearchDevicePatch {
  const { patch } = filterSearchDevicePatch(raw);
  const paths = searchDevicePatchPaths(patch);
  if (paths.length === 0) return {};
  const phone = normalize(mergeOverride(stripDevices(base), patch));
  const out: Rec = {};
  for (const path of paths) {
    const value = readPath(phone, path);
    // A text the phone cleared is `undefined` on the phone document: keep the
    // clearing (an empty string) rather than silently falling back.
    writeInto(out, path, value === undefined && path.startsWith('texts.') ? '' : value);
  }
  return out;
}

const PHONE_COLUMNS_PATH = 'appearance.grid.columns';
/** What a phone draws when only the desktop chose a fixed column count. */
export const PHONE_DEFAULT_MAX_COLUMNS = 2;

function stripDevices(settings: SearchSettings): SearchSettings {
  const { devices: _devices, ...rest } = settings as SearchSettings & { devices?: unknown };
  return rest as SearchSettings;
}

/**
 * The document `device` draws. On a phone: the desktop document, then its
 * phone layer, then — when an experiment arm applies — the arm, then the arm's
 * own phone layer (K3: an arm's change reaches the phone too; an arm that
 * tests something phone-only carries it under its own `devices.mobile`).
 */
export function resolveSearchSettingsForDevice(
  settings: SearchSettings,
  device: SearchLayoutDevice,
  normalize: (raw: unknown) => SearchSettings,
  armPatch?: Rec | null,
): SearchSettings {
  // A desktop with no arm draws the settings as they are: `settings` is already
  // a normalized document, and normalizing it again on every /search request
  // and widget start changed nothing.
  if (device !== 'mobile' && !isPlainObject(armPatch)) {
    return { ...settings, devices: { mobile: {} } } as SearchSettings;
  }
  const devices = (settings as SearchSettings & { devices?: SearchDevices }).devices;
  let doc: Rec = stripDevices(settings) as unknown as Rec;
  let phoneSetColumns = false;
  // Only a merged layer can need the reader again: `settings` is normalized,
  // and the column cap below writes a value the reader accepts.
  let merged = false;
  if (device === 'mobile' && devices && isPlainObject(devices.mobile) && Object.keys(devices.mobile).length > 0) {
    doc = mergeOverride(doc, devices.mobile);
    merged = true;
    phoneSetColumns = readPath(devices.mobile, PHONE_COLUMNS_PATH) !== undefined;
  }
  if (isPlainObject(armPatch)) {
    merged = true;
    const { devices: armDevices, ...arm } = armPatch as Rec & { devices?: unknown };
    doc = mergeOverride(doc, arm);
    const armPhone = isPlainObject(armDevices) ? (armDevices as Rec).mobile : undefined;
    if (device === 'mobile' && isPlainObject(armPhone)) {
      const phonePatch = filterSearchDevicePatch(armPhone).patch;
      doc = mergeOverride(doc, phonePatch);
      phoneSetColumns = phoneSetColumns || readPath(phonePatch, PHONE_COLUMNS_PATH) !== undefined;
    }
  }
  /*
    A phone that chose no columns of its own draws at most two: a desktop's
    four fixed columns in 390px are slivers. This was a CSS rule in the
    widget's phone media query until 2026-11-09 — which also overrode a
    phone's OWN choice, and which the dashboard could not show. As part of
    the resolver, the panel, the preview and the storefront all draw the
    same number.
  */
  if (device === 'mobile' && !phoneSetColumns) {
    const columns = readPath(doc, PHONE_COLUMNS_PATH);
    if (columns !== 'auto' && Number(columns) > PHONE_DEFAULT_MAX_COLUMNS) {
      doc = mergeOverride(doc, { appearance: { grid: { columns: String(PHONE_DEFAULT_MAX_COLUMNS) } } });
    }
  }
  const resolved = merged ? normalize(doc) : (doc as unknown as SearchSettings);
  return { ...resolved, devices: { mobile: {} } } as SearchSettings;
}

/** The paths the phone changes, for "Telefonda 4 fark". */
export function searchDeviceOverridePaths(settings: SearchSettings): string[] {
  const devices = (settings as SearchSettings & { devices?: SearchDevices }).devices;
  return devices ? searchDevicePatchPaths(devices.mobile) : [];
}
