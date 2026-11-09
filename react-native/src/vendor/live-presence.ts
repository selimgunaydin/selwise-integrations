// GENERATED FILE — DO NOT EDIT.
//
// Vendored from packages/tracking-contract/src/live-presence.ts by
// scripts/sync-vendored-page-targeting.js. Edit the source, then run:
//
//   node scripts/sync-vendored-page-targeting.js
//
// It is copied rather than imported because @selwise/tracking-contract is private
// and this SDK is published: a dependency on it would not resolve for anyone
// who installs @selwise/react-native from npm.

import type { TrafficSource } from './traffic-source.js';

/**
 * Live presence — who is on a channel right now, and how far they got.
 *
 * The one list the ingest path (`LivePresenceWriter`), the live read and the
 * dashboard's Live View agree on: what "live" means, which events move a
 * visitor to which stage, and how long each record lives. Nothing restates
 * these numbers.
 *
 * Deliberately dependency-free and published as its own subpath
 * (`@selwise/tracking-contract/live-presence`), like `consent-categories`: the
 * widget's heartbeat and the app SDK read the interval from here, and neither
 * may import this package's barrel.
 *
 * ## The definitions
 *
 * - **Live** is a visitor with an accepted event or a heartbeat in the last
 *   `LIVE_WINDOW_MS` — the same five minutes Shopify's "visitors right now"
 *   uses. Only visitors whose analytics consent let their events in can be
 *   live: the ingest endpoint drops everyone else before anything is written.
 * - **Stage** is how far the visitor got in THIS session (journey): browsing →
 *   cart → checkout → purchased. It never moves back inside a session — a
 *   shopper who removes an item after adding it still had an active cart — and
 *   a new journey starts again at browsing.
 * - The customer-behaviour figures read a stage reached within
 *   `LIVE_STAGE_WINDOW_MS`, not the stage alone, so a purchase an hour ago is
 *   not "bought just now".
 */

/** A visitor is live while their last activity is this recent. */
export const LIVE_WINDOW_MS = 5 * 60 * 1000;

/** Active carts / checking out / purchased count a stage reached this recently. */
export const LIVE_STAGE_WINDOW_MS = 10 * 60 * 1000;

/**
 * How long a visitor's presence record outlives their last activity. Equal to
 * the default session timeout, so a returning visitor inside it is recognised
 * as the same session (and not counted as a new one by location).
 */
export const LIVE_PRESENCE_TTL_SECONDS = 30 * 60;

/** The heartbeat's default interval; the server may answer with a longer one. */
export const LIVE_HEARTBEAT_INTERVAL_MS = 60 * 1000;

/** A heartbeat stops after this long without the visitor touching the page. */
export const LIVE_HEARTBEAT_IDLE_STOP_MS = 30 * 60 * 1000;

/** The shortest interval a client accepts from the server. */
export const LIVE_HEARTBEAT_MIN_INTERVAL_MS = 30 * 1000;

/** The interval a client adopts from a server answer: the server's, never below the floor; anything else keeps `current`. */
export function liveHeartbeatInterval(value: unknown, current: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(LIVE_HEARTBEAT_MIN_INTERVAL_MS, value)
    : current;
}

/** The wait before the next beat: the interval ±1/6, so clients opened together drift apart. */
export function liveHeartbeatDelay(intervalMs: number, random: number): number {
  const spread = intervalMs / 6;
  return Math.round(intervalMs - spread + random * spread * 2);
}

export type LiveStage = 'browsing' | 'product' | 'cart' | 'checkout' | 'purchased';

/** In order: a later stage outranks an earlier one. */
export const LIVE_STAGES: readonly LiveStage[] = ['browsing', 'product', 'cart', 'checkout', 'purchased'];

/**
 * The stages the Live View counts past browsing, in order. Browsing is
 * counted too (`LiveSnapshot.browsing`) but is always measured: every live
 * visitor sent at least one event.
 *
 * Each count is the FURTHEST stage a visitor reached in the last
 * `LIVE_STAGE_WINDOW_MS` — positions, not a funnel. They do not add up to the
 * stage before them, so no screen may divide one by another.
 */
export type LiveCountedStage = Exclude<LiveStage, 'browsing'>;
export const LIVE_COUNTED_STAGES: readonly LiveCountedStage[] = ['product', 'cart', 'checkout', 'purchased'];

/** The canonical events that move a visitor INTO each stage past browsing. */
export const LIVE_STAGE_EVENTS: Readonly<Record<LiveCountedStage, readonly string[]>> = {
  product: ['product_view'],
  cart: ['add_to_cart', 'update_cart', 'cart_add_all', 'cart_restore'],
  checkout: ['checkout_begin', 'checkout_progress', 'checkout_option'],
  purchased: ['purchase'],
};

/** The stage one canonical event signals; every other event is browsing. */
export function liveStageOfEvent(eventName: string): LiveStage {
  // A lookup over eight names, not a module-level table: the widget's entry
  // imports this file for its timing helpers, and a top-level computation is
  // code no bundler may drop. Stages run in order, so the last match is the
  // furthest.
  return LIVE_COUNTED_STAGES.reduce<LiveStage>(
    (found, stage) => (LIVE_STAGE_EVENTS[stage].includes(eventName) ? stage : found),
    'browsing',
  );
}

/** The later of two stages. */
export function laterLiveStage(a: LiveStage, b: LiveStage): LiveStage {
  return LIVE_STAGES.indexOf(b) > LIVE_STAGES.indexOf(a) ? b : a;
}

/** The furthest stage a set of canonical events reaches. */
export function liveStageOfEvents(eventNames: readonly string[]): LiveStage {
  return eventNames.reduce<LiveStage>(
    (stage, name) => laterLiveStage(stage, liveStageOfEvent(name)),
    'browsing',
  );
}

export type LiveDevice = 'desktop' | 'mobile' | 'tablet' | 'app';

export const LIVE_DEVICES: readonly LiveDevice[] = ['desktop', 'mobile', 'tablet', 'app'];

/** The notable events the live feed names, most telling first. */
export const LIVE_FEED_KINDS = [
  'purchase',
  'checkout_begin',
  'add_to_cart',
  'product_view',
  'category_view',
  'search_query',
  'page_view',
] as const;

export type LiveFeedKind = (typeof LIVE_FEED_KINDS)[number];

/**
 * One entry of the live feed: what happened, where, when — never who.
 *
 * The object of the event (a product code, a page type), the visit's source
 * and the device class are facts about the store and the visit, not the
 * shopper; a visitor id, an address or an order number never ride along, so
 * the feed cannot be grouped by visitor (and is not).
 */
export interface LiveFeedEntry {
  at: number;
  kind: LiveFeedKind;
  country: string | null;
  /** ISO 3166-2 (`TR-34`), from `liveRegionOf`; null when the edge sent none. */
  regionCode?: string | null;
  /** The region's display name (Turkish for Türkiye). */
  region?: string | null;
  city: string | null;
  lat: number | null;
  lon: number | null;
  /** The product a `product_view` / `add_to_cart` was about (feed `item_code`). */
  productCode?: string | null;
  /** Filled by the dashboard endpoint from the catalogue; never stored. */
  productName?: string | null;
  /** The page type of a `page_view` (the detector's `PAGE_TYPES`, `@selwise/widget-contract/page-type`). */
  pageType?: string | null;
  /** The visit's source, on the first entry of a visit. */
  source?: TrafficSource | null;
  device?: LiveDevice | null;
}

/** Live visitors in one place: a city (with its coordinates) or a country alone — a dot on the map. */
export interface LiveLocation {
  country: string | null;
  regionCode?: string | null;
  region?: string | null;
  city: string | null;
  lat: number | null;
  lon: number | null;
  visitors: number;
  /** Of them, purchased within `LIVE_STAGE_WINDOW_MS`. */
  purchased: number;
}

/**
 * Live visitors in one region — the LIST of places (`live-regions.ts` says
 * why a list is by region, not city). `city` is set only when the edge
 * resolved no region, so the place is still named.
 */
export interface LiveRegionCount {
  country: string | null;
  regionCode: string | null;
  region: string | null;
  city: string | null;
  visitors: number;
  purchased: number;
}

/** Sessions started today (report day, Europe/Istanbul) in one region. */
export interface LiveTodayLocation {
  country: string | null;
  regionCode?: string | null;
  region?: string | null;
  /** Only when no region is known. */
  city: string | null;
  sessions: number;
}

/** How long the product and surface counters look back. */
export const LIVE_ACTIVITY_WINDOW_MS = 10 * 60 * 1000;

/**
 * The width of one product / surface activity bucket — and how often one
 * process dates a channel's anonymous page counts. The window is a whole
 * number of buckets.
 */
export const LIVE_ACTIVITY_BUCKET_MS = 60 * 1000;

/** A product's events in the last `LIVE_ACTIVITY_WINDOW_MS` — events, not people. */
export interface LiveProductActivity {
  code: string;
  /** Filled by the dashboard endpoint from the catalogue. */
  name: string | null;
  views: number;
  adds: number;
}

/** The modules whose surfaces the live layer counts. */
export const LIVE_SURFACE_MODULES = ['campaign', 'recommendation'] as const;
export type LiveSurfaceModule = (typeof LIVE_SURFACE_MODULES)[number];

/** A surface's showings and clicks in the last `LIVE_ACTIVITY_WINDOW_MS`. */
export interface LiveSurfaceActivity {
  entityId: string;
  module: LiveSurfaceModule;
  /** Filled by the dashboard endpoint; null for a deleted surface. */
  name: string | null;
  shown: number;
  clicked: number;
}

/** How many products and surfaces a snapshot lists. */
export const LIVE_ACTIVITY_TOP = 5;

/**
 * `GET /analytics/sites/:siteId/live` — who is on a channel right now.
 *
 * `unavailable` means the live layer could not be read (Redis down): the
 * dashboard draws a dash, never a zero.
 */
export type LiveSnapshot =
  | { status: 'unavailable'; at: number }
  | {
      status: 'ok';
      /** When this was read (ms); the response may be up to a few seconds old. */
      at: number;
      /** Live now: activity in the last `LIVE_WINDOW_MS`. Exact. */
      visitors: number;
      /**
       * Visitors who reached each stage within `LIVE_STAGE_WINDOW_MS`. `null`
       * when the channel has not sent an event for that stage in 30 days — not
       * measured, which the dashboard draws as a dash, not 0.
       */
      stages: Record<LiveCountedStage, number | null>;
      /** Live visitors (5 minutes) who reached no counted stage in the stage window. */
      browsing: number;
      devices: Record<LiveDevice, number>;
      /** Live visitors by the source of their visit. */
      sources: Record<TrafficSource, number>;
      /** Largest first — the map's dots. */
      locations: LiveLocation[];
      /** Largest first — the list of places. */
      regions: LiveRegionCount[];
      /** Most viewed first, at most `LIVE_ACTIVITY_TOP`. */
      products: LiveProductActivity[];
      /** Most shown first, at most `LIVE_ACTIVITY_TOP`. */
      surfaces: LiveSurfaceActivity[];
      /** When the channel last had an event accepted / an anonymous page count (ms); null = not within 30 days. */
      lastEventAt: number | null;
      lastAudienceAt: number | null;
      /** Newest first. */
      feed: LiveFeedEntry[];
      /**
       * Sessions started today by place, largest first — counted once per
       * session by the live layer, so only visits with analytics consent.
       * Today is the report day (`REPORT_TIMEZONE`).
       */
      today: { day: string; locations: LiveTodayLocation[] };
      /**
       * True when there were more live visitors than the breakdowns read
       * (`visitors` stays exact; locations, devices and stages are a sample).
       */
      sampled: boolean;
    };

/** A readable snapshot — what every screen narrows `LiveSnapshot` to. */
export type LiveSnapshotOk = Extract<LiveSnapshot, { status: 'ok' }>;

/** Money in one currency: revenue net of refunds, and the orders it came from. */
export interface LiveMoney {
  currency: string;
  revenue: number;
  orders: number;
}

/** A product sold today, by the code its order lines carry; `name` is the catalogue title, else the line's. */
export interface LiveTodayProduct {
  code: string | null;
  name: string | null;
  quantity: number;
  /** In `LiveToday.hourly.currency`. */
  revenue: number;
}

/**
 * `GET /analytics/sites/:siteId/live/today` — the report day so far, beside
 * the same stretch of yesterday.
 *
 * Orders are the store's live revenue orders (cancelled, refunded, imported and
 * offline excluded; net of refunds) — the same definition as every other
 * revenue figure in the dashboard. Sessions are the visits the Analytics
 * screen counts; null when they could not be read.
 */
export interface LiveToday {
  day: string;
  /**
   * Visits today over the WHOLE traffic, from the anonymous audience counter
   * (`audience_daily.entries`) — the denominator of today's conversion rate,
   * the same population as the orders. Never shown as a count of its own and
   * never added to `sessions`. Null on an app channel or a day the counter
   * has no row.
   */
  audienceEntries: number | null;
  /** Of today's anonymous page counts, the share counted with analytics consent (0–1); null when unmeasured. */
  consentedShare: number | null;
  /**
   * Today's orders ÷ `audienceEntries`, as a percentage — both over the whole
   * traffic (dividing by the consented `sessions` would mix two populations and
   * overstate it). Null without anonymous visits. Daily, so no comparison.
   */
  conversionRate: number | null;
  /** When this was computed (ms). */
  at: number;
  /** Today from 00:00 (report zone) to `at`. */
  revenueByCurrency: LiveMoney[];
  orders: number;
  sessions: number | null;
  /** Yesterday from 00:00 to the same time of day — what "today" is compared with. */
  previous: {
    revenueByCurrency: LiveMoney[];
    orders: number;
    sessions: number | null;
    /** Yesterday's sessions in the hour of day it is now — what the health check expects (`liveHealthOf`). */
    sessionsThisHour: number | null;
  };
  hourly: {
    /** The currency `revenue` and the products are in: today's largest. Null without orders. */
    currency: string | null;
    /** One value per elapsed hour of today, hour 0 first. */
    orders: number[];
    revenue: number[];
    sessions: number[] | null;
  };
  /**
   * Today's orders by buyer: `returning` had a revenue order before today,
   * `unknown` carried neither a customer nor a browser id.
   */
  customers: { new: number; returning: number; unknown: number };
  /** Largest revenue first, at most five, in `hourly.currency`. */
  products: LiveTodayProduct[];
}

/** A recent order of today, for the Live View's list — never the buyer. */
export interface LiveRecentOrder {
  orderId: string;
  at: string;
  total: number;
  currency: string;
  items: number;
  /**
   * The surface that owns it, from the same measurement as `LiveSelwise`;
   * `null` = owned by no surface; `'pending'` = newer than the measurement,
   * so not judged yet (an owned order is never shown before it is counted).
   */
  owner: { module: string; entityId: string | null; name: string | null } | null | 'pending';
}

/**
 * `GET /analytics/sites/:siteId/live/selwise` — today's orders and the share
 * Selwise surfaces own, from the day's conversion snapshot (the home page's
 * "Today", one measurement), plus the latest orders with their owner.
 */
export interface LiveSelwise {
  measuredAt: string;
  windowOrders: number;
  windowRevenueByCurrency: LiveMoney[];
  ownedOrders: number;
  ownedRevenueByCurrency: LiveMoney[];
  modules: Array<{ module: string; orders: number; revenueByCurrency: LiveMoney[] }>;
  recentOrders: LiveRecentOrder[];
}

/** No event or page count for this long, against a busy hour yesterday, is a silent channel. */
export const LIVE_SILENT_AFTER_MS = 30 * 60 * 1000;
/** A page count this recent means shoppers ARE arriving. */
export const LIVE_AUDIENCE_RECENT_MS = 10 * 60 * 1000;
/** The fewest sessions yesterday in this hour for silence to mean anything. */
export const LIVE_HEALTH_MIN_EXPECTED_SESSIONS = 10;

export type LiveHealthStatus = 'ok' | 'silent' | 'unmeasured';

/**
 * Whether a channel's measurement looks broken right now — one rule for every
 * screen that says so.
 *
 * - `silent`: neither an accepted event nor an anonymous page count for
 *   `LIVE_SILENT_AFTER_MS`, while yesterday this hour had at least
 *   `LIVE_HEALTH_MIN_EXPECTED_SESSIONS` sessions — the snippet is gone or broken.
 * - `unmeasured`: page counts are arriving but no event has been accepted for
 *   `LIVE_SILENT_AFTER_MS` — consent or verification is refusing everything.
 *   Only where a page count can exist (a web channel).
 * - otherwise `ok` — including every case the rule cannot judge (a quiet hour,
 *   no history), because a false alarm teaches a merchant to ignore the bar.
 */
export function liveHealthOf(input: {
  now: number;
  lastEventAt: number | null;
  lastAudienceAt: number | null;
  /** Yesterday's sessions in the current hour; null when unknown. */
  expectedSessions: number | null;
  /** False on an app channel, which sends no anonymous page count. */
  countsPages: boolean;
}): LiveHealthStatus {
  if (input.expectedSessions === null || input.expectedSessions < LIVE_HEALTH_MIN_EXPECTED_SESSIONS) return 'ok';
  const eventSilent = input.lastEventAt === null || input.now - input.lastEventAt > LIVE_SILENT_AFTER_MS;
  if (!eventSilent) return 'ok';
  const pagesRecent = input.countsPages && input.lastAudienceAt !== null && input.now - input.lastAudienceAt <= LIVE_AUDIENCE_RECENT_MS;
  if (pagesRecent) return 'unmeasured';
  const pagesSilent = !input.countsPages || input.lastAudienceAt === null || input.now - input.lastAudienceAt > LIVE_SILENT_AFTER_MS;
  return pagesSilent ? 'silent' : 'ok';
}
