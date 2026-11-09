// GENERATED FILE — DO NOT EDIT.
//
// Vendored from packages/widget-contract/src/campaign-schedule.ts by
// scripts/sync-vendored-page-targeting.js. Edit the source, then run:
//
//   node scripts/sync-vendored-page-targeting.js
//
// It is copied rather than imported because @selwise/widget-contract is private
// and this SDK is published: a dependency on it would not resolve for anyone
// who installs @selwise/react-native from npm.

/**
 * A campaign's schedule: when it may be delivered, and what its status says.
 *
 * Until October 2026 `startDate` / `endDate` were decoration. The time of day
 * was dropped on save (only the UTC date survived), delivery filtered on
 * `status = 'active'` alone, and nothing ever moved a campaign to `active` or
 * `expired` by date — so a merchant who scheduled a weekend sale saw it never
 * start, and one who set an end date saw it run past it, with the dashboard
 * claiming the opposite in both cases.
 *
 * The rules, read by the API (delivery, transitions, the per-minute sweep) and
 * by the dashboard (the form and the list), so the two cannot disagree:
 *
 * - The dates are absolute INSTANTS. Delivered while `startDate <= now <=
 *   endDate`; an absent bound is no bound.
 * - `scheduled` and `active` are the two values of one published lifecycle,
 *   and which of them a campaign is follows from the window
 *   (`resolveCampaignScheduleStatus`). `expired` is where it ends. The other
 *   statuses (`draft`, `pending_review`, `paused`, `archived`) are a person's
 *   decision and no date moves them.
 * - A stored `expired` stays expired on READ even if its window reopens: only
 *   a person editing the dates revives it, never the clock.
 *
 * NOT re-exported from the barrel — it is a dashboard/API concern and the
 * widget never reads it (the API decides what reaches `/config`). Subpath:
 *   import { … } from '@selwise/widget-contract/campaign-schedule'
 */

/**
 * The zone a campaign's wall-clock times are written and read in.
 *
 * A channel carries no timezone of its own, so "the channel's zone" is a
 * promise nothing could keep — the reason `SCENARIO_DEFAULT_TIMEZONE` is this
 * same zone. The platform sells to one market, and a "Friday 18:00" sale is
 * Friday 18:00 for that market's shoppers, whoever schedules it from wherever.
 * The browser's zone was the alternative, and it would let an operator in
 * Berlin schedule a Turkish store's sale an hour off without either of them
 * seeing it, so the panel states the zone beside the inputs instead.
 *
 * The API reads a zoneless value (`2026-10-05T09:00`, what a cached dashboard
 * bundle or a merchant script sends) in this zone too — never in the server's,
 * which is UTC in production and the developer's own everywhere else.
 */
export const CAMPAIGN_SCHEDULE_TIMEZONE = 'Europe/Istanbul';

/** The statuses whose value follows from the window. */
export const CAMPAIGN_SCHEDULE_DRIVEN_STATUSES = ['scheduled', 'active'] as const;

/** What the window says a published campaign is right now. */
export type CampaignScheduleStatus = 'scheduled' | 'active' | 'expired';

export interface CampaignScheduleWindow {
  startDate?: Date | string | null;
  endDate?: Date | string | null;
}

type Clock = Date | number;

function instantMs(value: Date | string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function clockMs(now: Clock): number {
  return now instanceof Date ? now.getTime() : now;
}

export function isCampaignScheduleDrivenStatus(
  status: string | null | undefined,
): status is (typeof CAMPAIGN_SCHEDULE_DRIVEN_STATUSES)[number] {
  return (CAMPAIGN_SCHEDULE_DRIVEN_STATUSES as readonly string[]).includes(status ?? '');
}

/** Inclusive at both ends, like a scenario's `startsAt` / `endsAt`. */
export function isWithinCampaignWindow(window: CampaignScheduleWindow, now: Clock): boolean {
  return resolveCampaignScheduleStatus(window, now) === 'active';
}

/**
 * `expired` wins over `scheduled`: a window that closed before it opened is a
 * window that is over, not one that is still to come.
 */
export function resolveCampaignScheduleStatus(
  window: CampaignScheduleWindow,
  now: Clock,
): CampaignScheduleStatus {
  const at = clockMs(now);
  const end = instantMs(window.endDate);
  if (end !== null && end < at) return 'expired';
  const start = instantMs(window.startDate);
  if (start !== null && start > at) return 'scheduled';
  return 'active';
}

/**
 * The status a campaign truly has at `now`.
 *
 * The stored value can trail the clock by up to one sweep (a minute); this
 * closes that gap for everything that shows or validates a status. Only the
 * schedule-driven statuses move — see the file header for why `expired` does
 * not move back.
 */
export function effectiveCampaignStatus<S extends string>(
  campaign: { status: S } & CampaignScheduleWindow,
  now: Clock,
): S | CampaignScheduleStatus {
  if (!isCampaignScheduleDrivenStatus(campaign.status)) return campaign.status;
  return resolveCampaignScheduleStatus(campaign, now);
}

// ---------------------------------------------------------------------------
// Wall clock <-> instant
// ---------------------------------------------------------------------------

const WALL_CLOCK = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/;
const EXPLICIT_ZONE = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i;

const partFormatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = partFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      // `h23`, not `hour12: false`: the latter renders midnight as "24" on
      // some engines, which reads back as the next day.
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    partFormatters.set(timeZone, formatter);
  }
  return formatter;
}

function zonedParts(ms: number, timeZone: string) {
  const parts: Record<string, number> = {};
  for (const part of partsFormatter(timeZone).formatToParts(new Date(ms))) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  return parts as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

/** How far `timeZone`'s wall clock is ahead of UTC at the instant `ms`. */
function zoneOffsetMs(ms: number, timeZone: string): number {
  const whole = Math.floor(ms / 1000) * 1000;
  const p = zonedParts(whole, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - whole;
}

/**
 * Reads `value` as a wall-clock time in `timeZone` and returns the instant.
 *
 * Accepts what a `datetime-local` input produces (`2026-10-05T09:00`), with
 * optional seconds and milliseconds, and a bare date (midnight). A value that
 * already names its zone (`…Z`, `…+03:00`) is an instant and is returned as
 * one. Anything else — including `2026-02-30` — is `null`, never a silently
 * rolled-over date.
 */
export function wallClockToInstant(value: string, timeZone: string): Date | null {
  const trimmed = value.trim();
  const match = WALL_CLOCK.exec(trimmed);
  if (!match) {
    if (!EXPLICIT_ZONE.test(trimmed)) return null;
    const instant = new Date(trimmed);
    return Number.isNaN(instant.getTime()) ? null : instant;
  }

  const [, y = '', mo = '', d = '', h = '0', mi = '0', s = '0', frac = '0'] = match;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const hour = Number(h);
  const minute = Number(mi);
  const second = Number(s);
  const ms = Number(frac.padEnd(3, '0'));
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second, ms);

  // Date.UTC rolls 30 February over into March; a real wall-clock time
  // survives the round trip unchanged.
  const check = new Date(asUtc);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day ||
    check.getUTCHours() !== hour ||
    check.getUTCMinutes() !== minute ||
    check.getUTCSeconds() !== second
  ) {
    return null;
  }

  // The offset depends on the instant, which is what is being solved for.
  // Guess with the offset at the naive reading, then correct once: that is
  // exact everywhere except inside a DST gap, where no such wall-clock time
  // exists and the later offset is the conventional answer.
  const firstOffset = zoneOffsetMs(asUtc, timeZone);
  let instant = asUtc - firstOffset;
  const secondOffset = zoneOffsetMs(instant, timeZone);
  if (secondOffset !== firstOffset) instant = asUtc - secondOffset;
  return new Date(instant);
}

/**
 * The `datetime-local` value (`YYYY-MM-DDTHH:mm`) for `value` in `timeZone`,
 * or `''` when there is nothing to show. Handing the input a raw ISO string
 * silently empties it — the control rejects the `Z`.
 */
export function instantToWallClock(
  value: Date | string | null | undefined,
  timeZone: string,
): string {
  const ms = instantMs(value);
  if (ms === null) return '';
  const p = zonedParts(ms, timeZone);
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}
