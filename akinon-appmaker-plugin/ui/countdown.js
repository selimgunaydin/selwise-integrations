'use strict';

/**
 * Countdown formatting.
 *
 * Its own module, with no React Native import, so it can be tested in plain
 * Node — the same split as `styles.js` and `triggers.js`. Anything that
 * requires `react-native` can only be exercised in a running app.
 */

/**
 * A fixed `endDate`, as epoch ms. The whole countdown before daily cutoffs, and
 * the fallback when the app's SDK predates `countdownTarget`.
 */
function fixedCountdownTarget(content) {
  const end = Date.parse(String((content && content.endDate) || ''));
  return Number.isFinite(end) ? end : null;
}

/**
 * Where a countdown counts to right now, as epoch ms.
 *
 * `resolve` is the SDK's `countdownTarget(content, now)` — the contract's one
 * answer to "fixed end date, or the next time the STORE's clock reads the
 * daily cutoff". It is passed in rather than required here so this file stays
 * plain Node: the SDK is the app's dependency, not the plugin's. Asked on
 * EVERY tick, because a daily cutoff moves: once 14:00 passes, the target is
 * tomorrow's 14:00, and a target computed once at mount would end the
 * countdown for good instead.
 */
function countdownTargetOf(content, now, resolve) {
  if (typeof resolve !== 'function') return fixedCountdownTarget(content);
  try {
    const target = resolve(content || {}, typeof now === 'number' ? now : Date.now());
    return typeof target === 'number' && Number.isFinite(target) ? target : null;
  } catch (error) {
    return null;
  }
}

/**
 * @param target epoch ms (from `countdownTargetOf`), or an ISO date string.
 * @returns {string[]|null} `['02','05','09']`, or `['3g','02','05','09']` when
 * more than a day remains. Null once the deadline has passed — a finished
 * countdown must render as finished, not as `00:00:00` forever.
 */
function remainingParts(target, now) {
  const end = typeof target === 'number' ? target : Date.parse(String(target || ''));
  if (!Number.isFinite(end)) return null;

  const ms = end - (typeof now === 'number' ? now : Date.now());
  if (ms <= 0) return null;

  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (value) => String(value).padStart(2, '0');
  return days > 0
    ? [String(days) + 'g', pad(hours), pad(minutes), pad(seconds)]
    : [pad(hours), pad(minutes), pad(seconds)];
}

module.exports = { remainingParts, countdownTargetOf, fixedCountdownTarget };
