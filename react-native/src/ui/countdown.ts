/**
 * Countdown formatting.
 *
 * Its own module, with no React Native import, so it can be tested in plain
 * Node — the same split as `styles.ts` and `triggers.ts`.
 */

/** What reads a countdown's content: a fixed end date, or a daily cutoff. */
export type CountdownContent = Record<string, unknown>;

/** The contract's `countdownTarget(content, now)`: epoch ms, or null. */
export type CountdownResolver = (content: CountdownContent, now: number) => number | null;

/**
 * A fixed `endDate`, as epoch ms. The whole countdown before daily cutoffs, and
 * the answer when no resolver is handed over.
 */
export function fixedCountdownTarget(content: CountdownContent | null | undefined): number | null {
  const end = Date.parse(String((content && content['endDate']) || ''));
  return Number.isFinite(end) ? end : null;
}

/**
 * Where a countdown counts to right now, as epoch ms.
 *
 * `resolve` is the contract's `countdownTarget(content, now)` — the one answer
 * to "fixed end date, or the next time the STORE's clock reads the daily
 * cutoff". Asked on EVERY tick, because a daily cutoff moves: once 14:00
 * passes, the target is tomorrow's 14:00, and a target computed once at mount
 * would end the countdown for good instead.
 */
export function countdownTargetOf(
  content: CountdownContent | null | undefined,
  now: number | undefined,
  resolve?: CountdownResolver | null
): number | null {
  if (typeof resolve !== 'function') return fixedCountdownTarget(content);
  try {
    const target = resolve(content || {}, typeof now === 'number' ? now : Date.now());
    return typeof target === 'number' && Number.isFinite(target) ? target : null;
  } catch {
    return null;
  }
}

/** The four units a countdown draws, zero-padded: `{ days: '03', hours: '02', minutes: '05', seconds: '09' }`. */
export interface CountdownUnits {
  days: string;
  hours: string;
  minutes: string;
  seconds: string;
}

/**
 * The countdown as the web draws it: always the four units (days, hours,
 * minutes, seconds) each with its label beneath, so `00` days is shown as
 * `00`. Null once the deadline has passed — a finished countdown is not a
 * surface (`shouldRender` agrees), never `00:00:00:00` forever.
 */
export function countdownUnits(target: number | string | null | undefined, now?: number): CountdownUnits | null {
  const end = typeof target === 'number' ? target : Date.parse(String(target || ''));
  if (!Number.isFinite(end)) return null;
  const ms = end - (typeof now === 'number' ? now : Date.now());
  if (ms <= 0) return null;

  const totalSeconds = Math.floor(ms / 1000);
  const pad = (value: number) => String(value).padStart(2, '0');
  return {
    days: pad(Math.floor(totalSeconds / 86400)),
    hours: pad(Math.floor((totalSeconds % 86400) / 3600)),
    minutes: pad(Math.floor((totalSeconds % 3600) / 60)),
    seconds: pad(totalSeconds % 60),
  };
}

/** The separator character between the units: the dashboard's `separatorStyle` (`colon` by default). */
export function countdownSeparator(style: unknown): string {
  switch (style) {
    case 'dot':
      return '•';
    case 'slash':
      return '/';
    case 'none':
      return '';
    default:
      return ':';
  }
}

/**
 * @param target epoch ms (from `countdownTargetOf`), or an ISO date string.
 * @returns `['02','05','09']`, or `['3g','02','05','09']` when more than a day
 * remains. Null once the deadline has passed — a finished countdown must render
 * as finished, not as `00:00:00` forever.
 */
export function remainingParts(target: number | string | null | undefined, now?: number): string[] | null {
  const end = typeof target === 'number' ? target : Date.parse(String(target || ''));
  if (!Number.isFinite(end)) return null;

  const ms = end - (typeof now === 'number' ? now : Date.now());
  if (ms <= 0) return null;

  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (value: number) => String(value).padStart(2, '0');
  return days > 0
    ? [String(days) + 'g', pad(hours), pad(minutes), pad(seconds)]
    : [pad(hours), pad(minutes), pad(seconds)];
}
