// GENERATED FILE — DO NOT EDIT.
//
// Vendored from packages/search-contract/src/device-settings.ts by
// scripts/sync-vendored-page-targeting.js. Edit the source, then run:
//
//   node scripts/sync-vendored-page-targeting.js
//
// It is copied rather than imported because @selwise/search-contract is private
// and this SDK is published: a dependency on it would not resolve for anyone
// who installs @selwise/react-native from npm.

/**
 * `resolveSearchSettingsForDevice` with the settings reader bound — the one
 * call every reader makes (`./devices` takes the reader as an argument so it
 * does not import `./settings`, which imports it).
 */

import { normalizeSearchSettings, type SearchSettings } from './search-settings.js';
import { resolveSearchSettingsForDevice, type SearchLayoutDevice } from './search-devices.js';

export function searchSettingsForDevice(
  settings: SearchSettings,
  device: SearchLayoutDevice,
  armPatch?: Record<string, unknown> | null,
): SearchSettings {
  return resolveSearchSettingsForDevice(settings, device, normalizeSearchSettings, armPatch);
}
