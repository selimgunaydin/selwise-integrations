/**
 * The parts of `/config` that configure the SDK itself.
 *
 * The dashboard has a Tracking settings screen, and on the web it is the ONLY
 * place those numbers come from. In the app they were ignored entirely: a
 * merchant who set a batch size of 5 to see events arrive sooner during a demo
 * got the SDK's local default of 20 and concluded nothing was landing.
 *
 * Host options still win. The host knows things the dashboard cannot — that
 * this build is a release build, that its storage is ephemeral — so an
 * explicitly passed option is intent, and the dashboard fills in the rest.
 */

import { readControlGroupConfig, type ControlGroupConfig } from '../vendor/control-group.js';
import { consentDecisionRequired } from '../vendor/consent-categories.js';

export interface RemoteTrackingConfig {
  batchSize?: number;
  /** Milliseconds. The payload states this in SECONDS; converted on the way in. */
  flushIntervalMs?: number;
  maxQueueSize?: number;
  maxRetries?: number;
  offlinePersistence?: boolean;
  debug?: boolean;
  /** The live heartbeat (`tracking.presence`): present means send it, this often. */
  presence?: { intervalMs?: number };
}

export interface RemoteConfig {
  tracking: RemoteTrackingConfig;
  /**
   * The channel waits for the visitor's decision (Cookie Consent → Policy:
   * "Takipten önce onay iste" + "Cevaba kadar olayları beklet", and silence
   * is not consent). In an app this means: until the host calls
   * `setConsent()`, nothing that measures the visitor is sent — the
   * `app_managed` default no longer stands in for a decision.
   */
  consentRequired: boolean;
  /** Resolved server-side from the request ip. Feeds country page targeting. */
  country?: string;
  /** `'web'` here means the merchant pasted a web channel's key into the app. */
  channelType?: string;
  /**
   * The channel's currency, ISO 4217 (`/config` `channel.currency`).
   *
   * What an amount is said in when the host's basket did not carry its own
   * currency — the goal bar's "₺120 more" and a campaign's `{cart.total}`.
   * Absent when the channel has none configured, and then money is not said
   * at all: a number with a guessed currency is a wrong number.
   */
  currency?: string;
  /** True when this channel reads another channel's catalogue. */
  sharedCatalog: boolean;
  /**
   * The account's languages and the one this config was answered in
   * (`/config` `locale`). Until the SDK asks for a language (`?lang=`), the
   * answer is the account's default — which is also what every text in the
   * payload is written in.
   */
  locale?: { defaultLocale: string; locales: string[]; resolved: string };
  searchEnabled: boolean;
  searchTestMode: boolean;
  /** The site brand theme's resolved custom properties. */
  theme: Record<string, string>;
  /** True when the merchant configured product enrichment on this channel. */
  hasEnrichment: boolean;
  /**
   * Enrichment digest stamp. Moves on any rule or block change, so it is what
   * makes caching a product's rendered markup safe.
   */
  enrichmentVersion: string;
  /**
   * Every placement key a live rule carries.
   *
   * The addressable surface of this channel's enrichment. A screen can compare
   * its own declared slots against this and say — in debug — that a merchant
   * named a slot no screen renders, which is otherwise a silent blank.
   */
  enrichmentSlots: string[];
  /**
   * Does this channel run a scenario that can leave something for the app?
   *
   * A scenario cannot push to an app that is not open, so `action.onsite`
   * leaves a CLAIM and the SDK collects it on the next foreground. The flag is
   * here rather than discovered by asking, for the same reason `searchEnabled`
   * is: a channel with no scenarios must not pay for a request per session to
   * learn that.
   *
   * The API derives it at publish time from the graph, so it is false for a
   * scenario whose only actions are relays — those produce nothing an app
   * could ever collect.
   */
  scenariosEnabled: boolean;

  /**
   * Which modules this account bought.
   *
   * Nothing in the SDK branches on it — the payload already arrives filtered
   * (an account without `web_experience` gets no campaigns, without `search`
   * gets `searchEnabled: false`, without `product_enrichment` gets an empty
   * digest) — so every decision the client already makes is correct. It is
   * carried so a merchant debugging "why is nothing rendering in the app" can
   * read the answer off the config instead of guessing, which is the same
   * reason `channelType` is here.
   */
  modules: Record<string, boolean>;

  /**
   * The channel's global control group (`/config` `controlGroup`), or null
   * when it is off. The client puts its own visitor in or out with
   * `isInControlGroup` — see `SelwiseClient.inControlGroup`.
   */
  controlGroup: ControlGroupConfig | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function positiveInt(value: unknown): number | undefined {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function bool(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function readLocale(raw: unknown): { locale?: RemoteConfig['locale'] } {
  const value = asRecord(raw);
  const defaultLocale = typeof value.default === 'string' ? value.default : '';
  if (!defaultLocale) return {};
  const locales = Array.isArray(value.available)
    ? value.available.filter((item): item is string => typeof item === 'string')
    : [defaultLocale];
  const resolved = typeof value.resolved === 'string' && value.resolved ? value.resolved : defaultLocale;
  return { locale: { defaultLocale, locales, resolved } };
}

export function normalizeRemoteConfig(config: Record<string, unknown> | null | undefined): RemoteConfig {
  const payload = asRecord(config);
  const tracking = asRecord(payload.tracking);
  const channel = asRecord(payload.channel);
  const search = asRecord(payload.search);
  // The API stamps the request's country under `tracking.geo`
  // (`public-config.controller.ts`). Reading `payload.geo` found nothing on
  // every response, so country targeting never matched in an app. The
  // top-level spelling is still read as a fallback.
  const geo = asRecord(tracking.geo ?? payload.geo);
  const theme = asRecord(payload.theme);

  // `flushInterval` is SECONDS on the wire and milliseconds everywhere in this
  // SDK. Taking it verbatim would turn a 30-second interval into 30ms and put
  // a request behind every event.
  const flushIntervalSeconds = positiveInt(tracking.flushInterval);

  const normalized: RemoteTrackingConfig = {};
  const batchSize = positiveInt(tracking.batchSize);
  if (batchSize !== undefined) normalized.batchSize = batchSize;
  if (flushIntervalSeconds !== undefined) normalized.flushIntervalMs = flushIntervalSeconds * 1000;
  const maxQueueSize = positiveInt(tracking.maxQueueSize);
  if (maxQueueSize !== undefined) normalized.maxQueueSize = maxQueueSize;
  const maxRetries = positiveInt(tracking.maxRetries);
  if (maxRetries !== undefined) normalized.maxRetries = maxRetries;
  const offlinePersistence = bool(tracking.offlinePersistence);
  if (offlinePersistence !== undefined) normalized.offlinePersistence = offlinePersistence;
  const debug = bool(tracking.debugMode);
  if (debug !== undefined) normalized.debug = debug;
  if (tracking.presence && typeof tracking.presence === 'object') {
    const intervalMs = positiveInt(asRecord(tracking.presence).intervalMs);
    normalized.presence = intervalMs !== undefined ? { intervalMs } : {};
  }

  // `tracking.dataLayerConfig.cookieConsent` is the channel's one consent
  // policy (`/dashboard/consent` is its only writer), for an app as for a site.
  const consentRequired = consentDecisionRequired(asRecord(asRecord(tracking.dataLayerConfig).cookieConsent));

  const country = typeof geo.country === 'string' && geo.country.trim() ? geo.country.trim() : undefined;
  const channelType = typeof channel.type === 'string' && channel.type.trim()
    ? channel.type.trim()
    : undefined;
  const currency =
    typeof channel.currency === 'string' && /^[A-Za-z]{3}$/.test(channel.currency.trim())
      ? channel.currency.trim().toUpperCase()
      : undefined;

  // The payload names tokens WITHOUT the leading `--` (`selwise-brand`), and
  // the browser widget adds it when writing them onto the root
  // (`apps/client/src/core/theme.ts`). Consumers resolve `var(--selwise-brand,
  // …)`, so the prefix is added here — without it every lookup missed and every
  // themed value fell back to its literal, which looks exactly like no theme.
  const themeTokens: Record<string, string> = {};
  for (const [key, value] of Object.entries(theme)) {
    if (typeof value !== 'string' || !value.trim()) continue;
    const name = key.startsWith('--') ? key : `--${key}`;
    themeTokens[name] = value.trim();
  }

  // `enrichment` is the digest. Its `enabled` flag answers a WEB question —
  // "are there CSS selectors to watch" — and is false for every app channel by
  // construction, so the app reads the keys instead: those are the slots a
  // screen can actually ask for.
  const enrichment = asRecord(payload.enrichment);
  const enrichmentSlots = Array.isArray(enrichment.keys)
    ? enrichment.keys.filter((key): key is string => typeof key === 'string' && key.length > 0)
    : [];
  const enrichmentVersion = typeof enrichment.v === 'string' ? enrichment.v : '';

  return {
    tracking: normalized,
    consentRequired,
    ...(country ? { country } : {}),
    ...(channelType ? { channelType } : {}),
    ...(currency ? { currency } : {}),
    sharedCatalog: channel.sharedCatalog === true,
    ...readLocale(payload.locale),
    searchEnabled: asRecord(payload.search).enabled === true || search.enabled === true,
    searchTestMode: search.isTestMode === true,
    theme: themeTokens,
    hasEnrichment: enrichmentSlots.length > 0 || enrichment.enabled === true,
    enrichmentVersion,
    enrichmentSlots,
    scenariosEnabled: asRecord(payload.scenarios).enabled === true,
    controlGroup: readControlGroupConfig(payload.controlGroup),
    modules: Object.fromEntries(
      Object.entries(asRecord(payload.modules)).map(([key, value]) => [key, value === true]),
    ),
  };
}
