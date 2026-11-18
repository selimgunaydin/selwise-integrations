// GENERATED FILE — DO NOT EDIT.
//
// Vendored from packages/search-contract/src/experiment-fields.ts by
// scripts/sync-vendored-page-targeting.js. Edit the source, then run:
//
//   node scripts/sync-vendored-page-targeting.js
//
// It is copied rather than imported because @selwise/search-contract is private
// and this SDK is published: a dependency on it would not resolve for anyone
// who installs @selwise/react-native from npm.

/**
 * What an experiment arm may change about a channel's search.
 *
 * An arm's override is a PARTIAL settings document, deep-merged onto the
 * channel's (`mergeSearchSettings`), so a path here is a path there. The
 * experiment contract's `search_config` section is `catalogueDriven`: the
 * dashboard draws its controls from this list and nothing restates it
 * (`pnpm experiments:override:check`).
 *
 * Deliberately absent: the field and the openers (an arm that moves the box
 * the shopper types into is two integrations, not two variants), the cart
 * script, and custom CSS.
 *
 * Also absent, since 2026-11-14: what the SERVER applies from the stored
 * document — `results.excludeOutOfStock` and the three automatic suggestion
 * sections' `enabled`. An arm's value never reaches `/search` or
 * `/search/suggestions` (the widget sends the term, the limit, the category
 * and the device only), so an arm testing them drew two identical searches and
 * still counted an exposure. Listing a field here is a promise that the arm
 * changes what the shopper sees; carry the arm to the server first, then list
 * it again.
 */

import {
  SEARCH_CATEGORY_DISPLAYS,
  SEARCH_DENSITIES,
  SEARCH_GRID_COLUMNS,
  SEARCH_RESULT_LAYOUTS,
  SEARCH_SETTINGS_BOUNDS,
  SEARCH_SUGGESTION_LAYOUTS,
  SEARCH_SURFACES,
} from './search-settings.js';

export type SearchExperimentField =
  | { path: string; type: 'select'; options: readonly string[] }
  | { path: string; type: 'number'; min: number; max: number }
  | { path: string; type: 'toggle' }
  | { path: string; type: 'text' };

const B = SEARCH_SETTINGS_BOUNDS;

export const SEARCH_EXPERIMENT_FIELDS: readonly SearchExperimentField[] = [
  { path: 'placement.desktop.surface', type: 'select', options: SEARCH_SURFACES },
  { path: 'placement.mobile.surface', type: 'select', options: ['same', ...SEARCH_SURFACES] },
  { path: 'behavior.minChars', type: 'number', ...B.minChars },
  { path: 'behavior.debounceMs', type: 'number', ...B.debounceMs },
  { path: 'behavior.maxResults', type: 'number', ...B.maxResults },
  { path: 'results.layout', type: 'select', options: SEARCH_RESULT_LAYOUTS },
  { path: 'results.categories.display', type: 'select', options: SEARCH_CATEGORY_DISPLAYS },
  { path: 'results.fields.description', type: 'toggle' },
  { path: 'results.fields.stock', type: 'toggle' },
  { path: 'suggestions.layout', type: 'select', options: SEARCH_SUGGESTION_LAYOUTS },
  { path: 'appearance.grid.columns', type: 'select', options: SEARCH_GRID_COLUMNS },
  { path: 'appearance.density', type: 'select', options: SEARCH_DENSITIES },
  { path: 'texts.placeholder', type: 'text' },
];

export const SEARCH_EXPERIMENT_FIELD_PATHS: ReadonlySet<string> = new Set(SEARCH_EXPERIMENT_FIELDS.map((field) => field.path));

/**
 * The part of an arm's override this build understands, as a partial
 * document. A path outside the list is dropped, so an arm written against a
 * newer catalogue cannot reach a field the widget does not expect to change.
 */
export function searchExperimentPatch(override: unknown): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const walk = (value: unknown, path: string) => {
    if (value && typeof value === 'object' && !Array.isArray(value) && !('$i18n' in (value as object))) {
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) walk(child, path ? `${path}.${key}` : key);
      return;
    }
    if (!SEARCH_EXPERIMENT_FIELD_PATHS.has(path)) return;
    const keys = path.split('.');
    let cursor = patch;
    keys.slice(0, -1).forEach((key) => {
      cursor[key] = (cursor[key] as Record<string, unknown>) || {};
      cursor = cursor[key] as Record<string, unknown>;
    });
    cursor[keys[keys.length - 1] as string] = value;
  };
  walk(override, '');
  return patch;
}
