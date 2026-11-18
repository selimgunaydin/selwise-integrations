import {
  normalizeSearchSettings,
  type SearchSettings,
  type SearchTextKey,
} from '../vendor/search-settings.js';
import { searchSettingsForDevice } from '../vendor/search-device-settings.js';
import { searchExperimentPatch } from '../vendor/search-experiment-fields.js';
import type { ExperimentAssignment } from './eligibility.js';
import { asRecord, isRecord } from './records.js';

/**
 * Reading `/search-config`: the settings document the dashboard saves, as an
 * app draws it.
 *
 * The reader is the contract's tolerant one (`normalizeSearchSettings`): what
 * this build does not know is dropped and what it cannot draw falls back to the
 * default, so an API ahead of the app never turns search off for a key it has
 * not heard of. An app is always a phone, so the document is the one the phone
 * draws (`searchSettingsForDevice`).
 */

export type SearchTextVars = Record<string, string | number>;

/** What `/search-config` delivers, read — or null when search is not on. */
export interface SearchConfigDocument {
  /** `test`: only a client started with `testMode` searches. */
  mode: 'test' | 'live';
  /** The channel's document before the phone layer and any arm: what an arm is applied over. */
  base: SearchSettings;
  /** Who search is for. An audience with no segments is everyone. */
  audience: { mode: 'all' | 'include' | 'exclude'; segmentIds: string[] };
  /**
   * The channel's product card (Search → Results), as the API delivers it, or
   * null when it sent none. The grid draws a hit with it.
   */
  productCard: Record<string, unknown> | null;
  /** The phone's own card, when the channel set one (an app is always a phone, so it comes first). */
  mobileProductCard: Record<string, unknown> | null;
}

/**
 * The delivered configuration, or null when the channel's search is off (the API
 * says `enabled: false` for a mode of `off` and for a search never set up).
 * Throws for a body that is not a configuration at all: that is a fault to ask
 * again after, not an answer.
 */
export function readSearchConfig(body: unknown): SearchConfigDocument | null {
  if (!isRecord(body)) throw new Error('[Selwise] /search-config did not answer with a configuration');
  const payload = body;
  if (payload.enabled === false) return null;
  const audience = asRecord(payload.audience);
  const segmentIds = Array.isArray(audience.segmentIds)
    ? Array.from(
        new Set(audience.segmentIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0))
      )
    : [];
  const mode = audience.mode === 'include' || audience.mode === 'exclude' ? audience.mode : 'all';
  return {
    mode: payload.mode === 'test' ? 'test' : 'live',
    base: normalizeSearchSettings(payload.settings),
    audience: { mode: segmentIds.length === 0 ? 'all' : mode, segmentIds },
    // The card travels with the settings but is not one of them: the API
    // presents it beside the document (`presentPublicSearchConfig`), and a
    // build that did not read it drew every grid as rows, whatever card the
    // merchant had chosen (2026-11-18).
    productCard: isRecord(payload.productCard) ? payload.productCard : null,
    mobileProductCard: isRecord(payload.mobileProductCard) ? payload.mobileProductCard : null,
  };
}

/**
 * The card a search result is drawn with in the grid: the phone's own, else the
 * channel's — the strips' order (`RecommendationStrip`). An app is always a
 * phone, so the dashboard's one picker writes the channel's card and the phone's
 * stays empty; it is read first only so a record that has one is honoured.
 */
export function searchCardOf(
  config: Pick<SearchConfigDocument, 'productCard' | 'mobileProductCard'>
): Record<string, unknown> | null {
  return config.mobileProductCard ?? config.productCard ?? null;
}

/**
 * An experiment arm's override as a partial settings document, or null when it
 * changes nothing this build understands. Only the paths an arm may change
 * survive (`searchExperimentPatch`), and the arm's own phone layer
 * (`devices.mobile`) is filtered the same way.
 */
export function searchArmPatch(override: unknown): Record<string, unknown> | null {
  if (!isRecord(override)) return null;
  const raw = override;
  const source = isRecord(raw.settings) ? raw.settings : raw;
  const patch: Record<string, unknown> = searchExperimentPatch(source);
  const phone = searchExperimentPatch(asRecord(asRecord(source.devices).mobile));
  if (Object.keys(phone).length > 0) patch.devices = { mobile: phone };
  return Object.keys(patch).length > 0 ? patch : null;
}

/**
 * The override a `search_config` assignment carries. A `different_module` arm
 * has none: a channel has one search configuration, so there is no other module
 * to draw, and an override left on the row from before the mode was switched
 * must not be applied to the control.
 */
export function searchArmOverride(assignment: ExperimentAssignment | null | undefined): unknown {
  if (!assignment || assignment.experimentMode === 'different_module') return null;
  return assignment.variantConfig ?? assignment.config ?? null;
}

/** The document an app draws: the phone's, with the visitor's arm over it. */
export function searchSettingsOf(
  config: Pick<SearchConfigDocument, 'base'>,
  armPatch: Record<string, unknown> | null
): SearchSettings {
  return searchSettingsForDevice(config.base, 'mobile', armPatch);
}

/**
 * Something the search says: the merchant's words, already in the visitor's
 * language (the API resolved them, and for an app channel filled every one the
 * merchant left empty with the platform's own sentence), with `{tokens}` filled.
 * An empty string when there is no text at all — draw nothing then rather than
 * a made-up sentence.
 */
export function searchText(
  settings: Pick<SearchSettings, 'texts'> | null | undefined,
  key: SearchTextKey,
  vars?: SearchTextVars
): string {
  const raw = settings?.texts?.[key];
  let said = '';
  if (typeof raw === 'string') said = raw;
  else if (raw && typeof raw === 'object') {
    // Not resolved to one language (an older API): the first one present beats
    // an empty box.
    const first = Object.values(raw.$i18n || {}).find((value) => typeof value === 'string' && value.trim());
    said = typeof first === 'string' ? first : '';
  }
  const text = said.trim();
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (vars[name] === undefined ? match : String(vars[name])));
}

export type { SearchSettings, SearchTextKey };
