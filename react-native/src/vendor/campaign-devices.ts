// GENERATED FILE — DO NOT EDIT.
//
// Vendored from packages/widget-contract/src/campaign-devices.ts by
// scripts/sync-vendored-page-targeting.js. Edit the source, then run:
//
//   node scripts/sync-vendored-page-targeting.js
//
// It is copied rather than imported because @selwise/widget-contract is private
// and this SDK is published: a dependency on it would not resolve for anyone
// who installs @selwise/react-native from npm.

/**
 * A campaign on a PHONE (viewport below 768px): what may differ from the
 * desktop, and how the two are laid together.
 *
 * `@selwise/widget-contract/campaign-devices` — light on purpose (it imports
 * only `./devices`), because the widget entry resolves the layer at draw time
 * and must not pull the style catalogue in. The checks that need the
 * catalogue (which style keys a type has, which content fields) are
 * `campaignDeviceLayerProblems` in `./campaign-devices-validation`.
 *
 * Stored as `campaigns.devices_json = { mobile: { content?, styles?,
 * placement? } }` — the shape of an experiment arm's override, so a phone
 * layer and an arm read the same way. The desktop is the base; the phone
 * carries only what differs:
 *
 *   - content   — the type's own content fields (a shorter headline, another
 *                 image, another button text);
 *   - styles    — the type's style keys (`TYPE_STYLE_CONFIGS`);
 *   - placement — WHERE a floating surface sits and WHEN a popup opens
 *                 (`CAMPAIGN_DEVICE_PLACEMENT_KEYS`). Where an inline campaign
 *                 is wired into the page (selector, insert position), its
 *                 conflict scope and its frequency cap stay one value: the
 *                 page is the same page, and a cap counted per device would
 *                 let one shopper see a "once a day" popup twice.
 *
 * Resolution order: the campaign, its phone layer, an experiment arm's
 * override, the arm's own phone layer (an arm wins over the phone).
 */

import { mergeOverride, type LayoutDevice } from './devices.js';

export const CAMPAIGN_DEVICE_SECTIONS = ['content', 'styles', 'placement'] as const;
export type CampaignDeviceSection = (typeof CAMPAIGN_DEVICE_SECTIONS)[number];

/** The placement keys a phone may change. Everything else in placement is shared. */
export const CAMPAIGN_DEVICE_PLACEMENT_KEYS = [
  'position',
  'triggerStrategy',
  'triggerDelaySeconds',
  'triggerScrollPercent',
] as const;

/**
 * Content fields that are BEHAVIOUR, not words or looks, and so stay one
 * value: what a countdown counts to, what a counter or goal bar measures and
 * at which steps, whether a form collects a phone number. A phone that counted
 * to another time, or promised free shipping at another amount, would be a
 * second campaign under one name.
 */
export const CAMPAIGN_SHARED_CONTENT_FIELDS = [
  'countdownMode',
  'endDate',
  'dailyCutoff',
  'cutoffTimeZone',
  'metric',
  'metricType',
  'thresholds',
  'timePeriod',
  'minCount',
  'productId',
  'collectPhone',
  'states',
] as const;

/**
 * Types with no phone layer: a tab talk is painted by the browser's tab, which
 * a phone does not show; the cookie banner belongs to the consent screen.
 */
export const CAMPAIGN_TYPES_WITHOUT_PHONE_LAYER = ['tab_talk', 'cookie_consent'] as const;

type Rec = Record<string, unknown>;

export interface CampaignDeviceLayer {
  content?: Rec;
  styles?: Rec;
  placement?: Rec;
}

export interface CampaignDevices {
  mobile: CampaignDeviceLayer;
}

function isRecord(value: unknown): value is Rec {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * The phone layer of a stored or delivered `devices_json`, kept to its
 * shape: the three sections, each an object with at least one key, and the
 * placement section to the keys a phone may change. Which style and content
 * keys a TYPE has is not decided here (see the validation module); a reader
 * that draws ignores a key it does not know, as it ignores one on the desktop.
 */
export function readCampaignDevices(raw: unknown): CampaignDevices {
  const source = isRecord(raw) && isRecord(raw.mobile) ? raw.mobile : {};
  const mobile: CampaignDeviceLayer = {};
  for (const section of CAMPAIGN_DEVICE_SECTIONS) {
    const value = source[section];
    if (!isRecord(value)) continue;
    const kept: Rec = {};
    for (const [key, entry] of Object.entries(value)) {
      if (entry === undefined) continue;
      if (section === 'placement' && !(CAMPAIGN_DEVICE_PLACEMENT_KEYS as readonly string[]).includes(key)) continue;
      kept[key] = entry;
    }
    if (Object.keys(kept).length > 0) mobile[section] = kept;
  }
  return { mobile };
}

/** How many settings the phone changes (one per key, across the three sections). */
export function campaignPhoneOverrideCount(devices: CampaignDevices | null | undefined): number {
  if (!devices) return 0;
  return CAMPAIGN_DEVICE_SECTIONS.reduce(
    (total, section) => total + Object.keys(devices.mobile[section] ?? {}).length,
    0,
  );
}

export interface CampaignParts {
  content: Rec;
  styles: Rec;
  placement: Rec;
}

/**
 * The campaign as `device` draws it: on a phone, each section with the phone's
 * keys laid over it. Same references back on the desktop or with no layer.
 */
export function resolveCampaignForDevice(
  parts: CampaignParts,
  devices: unknown,
  device: LayoutDevice,
): CampaignParts {
  if (device !== 'mobile') return parts;
  const layer = readCampaignDevices(devices).mobile;
  if (!layer.content && !layer.styles && !layer.placement) return parts;
  return {
    content: layer.content ? mergeOverride(parts.content, layer.content) : parts.content,
    styles: layer.styles ? mergeOverride(parts.styles, layer.styles) : parts.styles,
    placement: layer.placement ? mergeOverride(parts.placement, layer.placement) : parts.placement,
  };
}
