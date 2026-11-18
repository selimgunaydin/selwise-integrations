import type { PushPermission, PushPlatform, PushProvider, SelwiseStorage } from '../types.js';
import { STORAGE_KEYS } from './storage.js';
import { SingleFlight } from './single-flight.js';

/**
 * The app's phone, registered for notifications — the SDK's half of app push.
 *
 * The HOST owns the token: FCM, APNs and Expo each hand it to the app through
 * their own library, and the SDK never mints, refreshes or reads one. What it
 * owns is the rest of the registration's life, which a host that only calls
 * `registerPushToken()` at launch would otherwise have to get right alone:
 *
 *   1. **Consent comes first.** A token is a way to message the person
 *      (`CONSENT_CHANNEL_CATEGORIES.pushDevice`, marketing). Without that
 *      category the token is not sent and not stored; a WITHDRAWAL revokes the
 *      one already registered — across launches, which is why the token is kept
 *      on the device (`selwise_push_device`, a `device-state` key: the push
 *      address the host's own library already holds, no visitor id).
 *   2. **The permission is the person's answer, not ours.** It rides with every
 *      registration (`setPushPermission`) and a change re-sends it. A token
 *      registered while the permission is unknown is `undetermined` — kept, and
 *      never notified — rather than guessed `granted`.
 *   3. **The customer follows the login.** `identify()` links the phone to the
 *      customer (the server keeps the link only for a visitor it can bind to
 *      that customer), `logout()` unlinks it — the phone stays reachable as
 *      this install, but no longer belongs to the person who left.
 *   4. **A refresh needs no ceremony.** A new token from the host is simply
 *      registered; the server revokes the install's older ones.
 *   5. **A registration says consent is on.** Every registration carries
 *      `marketingConsent: true`, and the server needs it to bring back a phone
 *      that was revoked because consent was withdrawn: the OS permission alone
 *      (what a new launch or a refreshed token has) never does.
 *
 *   6. **An unchanged registration is not sent again.** A host that calls
 *      `registerPushToken()` at every launch, or an `identify()` that names the
 *      customer already linked, would otherwise POST the same phone each time.
 *      What the server last accepted is kept (a signature of the token, the
 *      permission, who the phone belongs to, the language and the app version,
 *      with the time) and the same registration inside `RESEND_AFTER_MS` is
 *      answered `true` without a request; after that it is sent once, so the
 *      server still hears from a phone that has not changed. Anything that
 *      revokes the phone (withdrawn consent, `unregisterPushToken()`) forgets it.
 *
 * Fail-soft like the rest of the SDK: a request that fails is logged and
 * returns `false`, and the host's next launch registers again.
 */

export interface PushDeviceRegistration {
  token: string;
  provider: PushProvider;
  platform: PushPlatform;
}

const PUSH_PROVIDERS: readonly PushProvider[] = ['fcm', 'apns', 'expo'];
const PUSH_PLATFORMS: readonly PushPlatform[] = ['ios', 'android'];

/** The longest token the server accepts (`PUSH_DEVICE_BOUNDS.tokenMax`). */
const PUSH_TOKEN_MAX_LENGTH = 512;
/** The shortest a real token is (an Expo token is the shortest family). */
const PUSH_TOKEN_MIN_LENGTH = 20;

/** The data key a Selwise notification carries its link in (`APP_PUSH_LINK_DATA_KEY`). */
const PUSH_LINK_DATA_KEY = 'sw_link';

/** How long an accepted registration stands in for another request. */
const RESEND_AFTER_MS = 24 * 60 * 60 * 1000;

interface SentRecord {
  /** What the server was told (`signatureOf`). */
  signature: string;
  /** When it accepted it, on the device's clock. */
  at: number;
}

interface Stored extends PushDeviceRegistration {
  /** Consent did not allow it when it was registered; sent once consent does. */
  withheld?: boolean;
  /** The registration the server last accepted, so an unchanged one is not sent again. */
  sent?: SentRecord;
}

export interface PushDeviceDeps {
  storage: () => SelwiseStorage;
  register: (body: {
    visitorId: string;
    siteUserId: string | null;
    token: string;
    provider: PushProvider;
    platform: PushPlatform;
    permission: PushPermission;
    appVersion?: string;
    locale?: string;
    /** Always `true`: a registration is only ever sent while marketing consent allows it. */
    marketingConsent: true;
  }) => Promise<unknown>;
  revoke: (body: {
    visitorId: string;
    token: string;
    provider: PushProvider;
    reason: 'app_unregistered' | 'consent_withdrawn';
  }) => Promise<unknown>;
  ready: () => boolean;
  visitorId: () => string | undefined;
  siteUserId: () => string | null;
  permission: () => PushPermission | undefined;
  appVersion: () => string | undefined;
  locale: () => string | undefined;
  /** The `init()` platform, used when the host's call names none. */
  defaultPlatform: () => PushPlatform | undefined;
  /** The clock, for the resend window; the device's by default. */
  now?: () => number;
  /** Does the visitor's consent answer allow registering a device (`pushDevice`)? */
  consentAllows: () => boolean;
  log: (message: string, error?: unknown) => void;
}

/** What a host hands over: a registration payload's shape, validated. Throws for a programmer error. */
export function normalizePushRegistration(
  input: { token: string; provider: PushProvider; platform?: PushPlatform },
  defaultPlatform: PushPlatform | undefined,
): PushDeviceRegistration {
  const token = typeof input?.token === 'string' ? input.token.trim() : '';
  if (token.length < PUSH_TOKEN_MIN_LENGTH || token.length > PUSH_TOKEN_MAX_LENGTH) {
    throw new TypeError('[Selwise] registerPushToken() needs the device token the push library gave the app.');
  }
  if (!PUSH_PROVIDERS.includes(input.provider)) {
    throw new TypeError(`[Selwise] registerPushToken() provider must be one of: ${PUSH_PROVIDERS.join(', ')}.`);
  }
  // An APNs token is an iPhone's by definition; the other two work on both
  // systems, so the host says (or `init({ platform })` did).
  const platform =
    input.provider === 'apns' ? 'ios' : (input.platform ?? defaultPlatform);
  if (!platform || !PUSH_PLATFORMS.includes(platform)) {
    throw new TypeError(
      "[Selwise] registerPushToken() needs a platform ('ios' or 'android'): pass it, or pass `platform` to init().",
    );
  }
  if (input.provider === 'apns' && input.platform && input.platform !== 'ios') {
    throw new TypeError('[Selwise] An APNs token belongs to an iOS device.');
  }
  return { token, provider: input.provider, platform };
}

function isSentRecord(value: unknown): value is SentRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record['signature'] === 'string' && typeof record['at'] === 'number' && Number.isFinite(record['at']);
}

export class PushDeviceRegistrar {
  private current: Stored | null = null;
  private restored: Promise<void>;
  /** The last `permission` the server was told, so an unchanged one sends nothing. */
  private sentPermission: PushPermission | undefined;
  /** The registrations being sent, by signature, so the same one asked for twice is one request. */
  private readonly registrations = new SingleFlight<string, boolean>();

  constructor(private readonly deps: PushDeviceDeps) {
    this.restored = this.restore();
  }

  /** The token of an earlier launch, so a withdrawal of consent can revoke it before the host registers again. */
  private async restore(): Promise<void> {
    try {
      const raw = await this.deps.storage().getItem(STORAGE_KEYS.PUSH_DEVICE);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<Stored>;
      if (
        typeof parsed.token === 'string' &&
        PUSH_PROVIDERS.includes(parsed.provider as PushProvider) &&
        PUSH_PLATFORMS.includes(parsed.platform as PushPlatform)
      ) {
        this.current = {
          token: parsed.token,
          provider: parsed.provider as PushProvider,
          platform: parsed.platform as PushPlatform,
          ...(parsed.withheld ? { withheld: true } : {}),
          ...(isSentRecord(parsed.sent) ? { sent: parsed.sent } : {}),
        };
        // A launch that finds consent already withdrawn revokes at once.
        if (!this.current.withheld && !this.deps.consentAllows()) void this.onConsentChange();
      }
    } catch (error) {
      this.deps.log('The stored push token could not be read', error);
    }
  }

  /** Register (or refresh) the host's token. True when the server has it; false when withheld or failed. */
  async register(input: PushDeviceRegistration): Promise<boolean> {
    await this.restored;
    const previous = this.current;
    if (!this.deps.consentAllows()) {
      // Not sent, and not worth keeping beyond a withheld note: a grant sends it.
      this.current = { ...input, withheld: true };
      await this.persist();
      this.deps.log('Push token withheld: marketing consent does not allow it');
      return false;
    }
    // The same phone as already held and registered: nothing to store, and
    // `send()` knows whether the server needs telling again.
    const same =
      !!previous &&
      !previous.withheld &&
      previous.token === input.token &&
      previous.provider === input.provider &&
      previous.platform === input.platform;
    this.current = { ...input, ...(same && previous.sent ? { sent: previous.sent } : {}) };
    if (!same) await this.persist();
    return this.send();
  }

  /** The host stopped notifying (logout of push, the user turned the app's switch off). */
  async unregister(): Promise<boolean> {
    await this.restored;
    const current = this.current;
    if (!current) return false;
    this.current = null;
    this.sentPermission = undefined;
    await this.deps.storage().removeItem(STORAGE_KEYS.PUSH_DEVICE).catch(() => undefined);
    if (current.withheld) return true;
    return this.revoke(current, 'app_unregistered');
  }

  /** The OS permission changed (`setPushPermission`): tell the server, for the token already registered. */
  async onPermissionChange(): Promise<void> {
    await this.restored;
    const current = this.current;
    if (!current || current.withheld || !this.deps.consentAllows()) return;
    if (this.sentPermission === this.deps.permission()) return;
    await this.send();
  }

  /** `identify()` / `logout()`: the customer the phone belongs to changed. */
  async onIdentityChange(): Promise<void> {
    await this.restored;
    const current = this.current;
    if (!current || current.withheld || !this.deps.consentAllows()) return;
    await this.send();
  }

  /** `setConsent()`: a withdrawal revokes the registered token, a grant sends the withheld one. */
  async onConsentChange(): Promise<void> {
    await this.restored;
    const current = this.current;
    if (!current) return;
    const allowed = this.deps.consentAllows();
    if (!allowed && !current.withheld) {
      // The server forgets the phone on a revoke: what it last accepted no longer stands.
      this.current = { token: current.token, provider: current.provider, platform: current.platform, withheld: true };
      this.sentPermission = undefined;
      await this.persist();
      await this.revoke(current, 'consent_withdrawn');
    } else if (allowed && current.withheld) {
      this.current = { token: current.token, provider: current.provider, platform: current.platform };
      await this.persist();
      await this.send();
    }
  }

  /** The registration as the SDK holds it (tests, and a host that wants to show it). */
  get registered(): PushDeviceRegistration | null {
    const current = this.current;
    return current && !current.withheld
      ? { token: current.token, provider: current.provider, platform: current.platform }
      : null;
  }

  private async send(): Promise<boolean> {
    const current = this.current;
    const visitorId = this.deps.visitorId();
    if (!current || !visitorId || !this.deps.ready()) return false;
    // Asked again here, not only by the callers: the claim below is that
    // consent allows this, and it must be true at the moment of the request.
    if (!this.deps.consentAllows()) return false;
    const permission = this.deps.permission() ?? 'undetermined';
    if (permission === 'undetermined') {
      this.deps.log(
        "Push token registered with an unknown permission: call setPushPermission('granted') once the OS allows notifications, or no notification will be sent to it",
      );
    }
    const appVersion = this.deps.appVersion();
    const locale = this.deps.locale();
    // Always explicit: a string links (the server keeps it only for a visitor
    // bound to that customer), `null` unlinks.
    const siteUserId = this.deps.siteUserId();
    const signature = JSON.stringify([
      current.token,
      current.provider,
      current.platform,
      permission,
      siteUserId,
      visitorId,
      locale ?? null,
      appVersion ?? null,
    ]);
    const clock = this.deps.now ?? Date.now;
    const age = current.sent ? clock() - current.sent.at : Infinity;
    if (current.sent && current.sent.signature === signature && age >= 0 && age < RESEND_AFTER_MS) {
      this.sentPermission = this.deps.permission();
      return true;
    }
    // The same registration already on its way (a permission change and the
    // launch's `registerPushToken()` land together): wait for that one.
    return this.registrations.run(signature, () =>
      this.post(current, signature, clock, {
        visitorId,
        siteUserId,
        permission,
        ...(appVersion ? { appVersion } : {}),
        ...(locale ? { locale } : {}),
      })
    );
  }

  private async post(
    current: Stored,
    signature: string,
    clock: () => number,
    who: {
      visitorId: string;
      siteUserId: string | null;
      permission: PushPermission;
      appVersion?: string;
      locale?: string;
    },
  ): Promise<boolean> {
    try {
      await this.deps.register({
        ...who,
        token: current.token,
        provider: current.provider,
        platform: current.platform,
        marketingConsent: true,
      });
      this.sentPermission = this.deps.permission();
      // Only while the phone that was sent is still the one held: an unregister or a
      // withdrawal that came in meanwhile has already dropped it.
      const held = this.current;
      if (
        held &&
        !held.withheld &&
        held.token === current.token &&
        held.provider === current.provider &&
        held.platform === current.platform
      ) {
        this.current = { ...held, sent: { signature, at: clock() } };
        await this.persist();
      }
      return true;
    } catch (error) {
      this.deps.log('The push token could not be registered', error);
      return false;
    }
  }

  private async revoke(
    target: PushDeviceRegistration,
    reason: 'app_unregistered' | 'consent_withdrawn',
  ): Promise<boolean> {
    const visitorId = this.deps.visitorId();
    if (!visitorId || !this.deps.ready()) return false;
    try {
      await this.deps.revoke({ visitorId, token: target.token, provider: target.provider, reason });
      return true;
    } catch (error) {
      this.deps.log('The push token could not be revoked', error);
      return false;
    }
  }

  private async persist(): Promise<void> {
    const current = this.current;
    try {
      if (current) await this.deps.storage().setItem(STORAGE_KEYS.PUSH_DEVICE, JSON.stringify(current));
      else await this.deps.storage().removeItem(STORAGE_KEYS.PUSH_DEVICE);
    } catch (error) {
      this.deps.log('The push token could not be stored', error);
    }
  }
}

/**
 * The deep link a Selwise notification carries, from whatever the host's push
 * library hands over when the person taps it — a link string, FCM's
 * `RemoteMessage` (`{ data }`), Expo's response (`{ notification: { request:
 * { content: { data } } } }`) or the bare data object. Null when it carries
 * none (a notification this SDK did not send).
 */
export function pushLinkOf(payload: unknown): string | null {
  if (typeof payload === 'string') return payload.trim() || null;
  const candidates: unknown[] = [payload];
  const seen = new Set<unknown>();
  while (candidates.length > 0) {
    const value = candidates.shift();
    if (!value || typeof value !== 'object' || seen.has(value)) continue;
    seen.add(value);
    const record = value as Record<string, unknown>;
    const direct = record[PUSH_LINK_DATA_KEY];
    if (typeof direct === 'string' && direct.trim()) return direct.trim();
    // Where the common push libraries put the custom data.
    candidates.push(record.data, record.userInfo, record.notification, record.request, record.content);
  }
  return null;
}
