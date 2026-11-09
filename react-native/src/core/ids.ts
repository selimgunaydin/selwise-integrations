import type { SelwiseStorage } from '../types.js';
import { STORAGE_KEYS } from './storage.js';

/** Same 30-minute window the browser widget and the server-side session logic use. */
export const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

interface StoredSession {
  id: string;
  lastActivityAt: number;
}

/**
 * RFC 4122 v4 id built on `Math.random`.
 *
 * Hermes has no `crypto.getRandomValues`, and pulling in `react-native-get-random-values`
 * would add a native dependency to three apps on three different RN versions for
 * ids that are analytics correlators, not secrets. Collision risk at this
 * cardinality is irrelevant; unlinkable ids across app launches would not be.
 */
export function generateId(): string {
  let out = '';
  for (let i = 0; i < 36; i += 1) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      out += '-';
    } else if (i === 14) {
      out += '4';
    } else {
      const random = (Math.random() * 16) | 0;
      const value = i === 19 ? (random & 0x3) | 0x8 : random;
      out += value.toString(16);
    }
  }
  return out;
}

/**
 * Visitor and session identity, resolved once per launch and then held in
 * memory so no screen render awaits storage.
 */
/**
 * A merchant user id is a non-empty string. Nothing else.
 *
 * `identify()` is typed `string`, but it is called from JavaScript — an
 * Akinon App Maker app keeps an `auth.user` object for anonymous sessions with
 * `pk: false`, and the plugin passed `String(false)`. `'false'` looks like a
 * perfectly good id, so it was stored, replayed on every launch and attached
 * to every event: every anonymous visitor on that install became the same
 * customer.
 *
 * Rejecting it here means no caller can create that state, and an install that
 * already has one heals on its next launch.
 */
function normalizeSiteUserId(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;
  // The literal strings a boolean or a missing value stringifies into.
  if (trimmed === 'false' || trimmed === 'true' || trimmed === 'null' || trimmed === 'undefined') {
    return null;
  }
  return trimmed;
}

export { normalizeSiteUserId };

export class IdentityManager {
  private readonly storage: SelwiseStorage;

  private visitorId: string | null = null;
  private session: StoredSession | null = null;
  private siteUserId: string | null = null;
  private hydrated: Promise<void> | null = null;

  constructor(storage: SelwiseStorage) {
    this.storage = storage;
  }

  /** Idempotent: concurrent callers await the same hydration. */
  async ready(): Promise<void> {
    if (!this.hydrated) {
      this.hydrated = this.hydrate();
    }
    return this.hydrated;
  }

  private async hydrate(): Promise<void> {
    const [storedVisitor, storedSession, storedUser] = await Promise.all([
      this.storage.getItem(STORAGE_KEYS.VISITOR_ID),
      this.storage.getItem(STORAGE_KEYS.SESSION),
      this.storage.getItem(STORAGE_KEYS.SITE_USER_ID),
    ]);

    if (storedVisitor) {
      this.visitorId = storedVisitor;
    } else {
      this.visitorId = generateId();
      await this.storage.setItem(STORAGE_KEYS.VISITOR_ID, this.visitorId);
    }

    // Validated on the way back in, not just on the way out: a bad value
    // written by an earlier version would otherwise be attached to every event
    // for the life of the install, with no way to clear it but a logout.
    const restoredUser = normalizeSiteUserId(storedUser);
    if (restoredUser) {
      this.siteUserId = restoredUser;
    } else if (storedUser) {
      await this.storage.removeItem(STORAGE_KEYS.SITE_USER_ID);
    }

    this.session = this.parseSession(storedSession);
    if (!this.session) {
      this.session = { id: generateId(), lastActivityAt: Date.now() };
      await this.persistSession();
    }
  }

  private parseSession(raw: string | null): StoredSession | null {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<StoredSession>;
      if (typeof parsed?.id !== 'string' || typeof parsed?.lastActivityAt !== 'number') {
        return null;
      }
      // An expired session is discarded rather than resumed: resuming it would
      // merge two visits into one journey and inflate session-scoped metrics.
      if (Date.now() - parsed.lastActivityAt > SESSION_TIMEOUT_MS) {
        return null;
      }
      return { id: parsed.id, lastActivityAt: parsed.lastActivityAt };
    } catch {
      return null;
    }
  }

  private async persistSession(): Promise<void> {
    if (!this.session) return;
    await this.storage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(this.session));
  }

  getVisitorId(): string {
    if (!this.visitorId) {
      // Only reachable when a caller skipped `ready()`. Generating here keeps
      // events attributable for this launch instead of dropping them.
      this.visitorId = generateId();
    }
    return this.visitorId;
  }

  /**
   * Current session id, rotating it when the 30-minute window has lapsed.
   * Call this on every tracked interaction — it doubles as "touch the session".
   */
  getSessionId(): string {
    const now = Date.now();

    if (!this.session || now - this.session.lastActivityAt > SESSION_TIMEOUT_MS) {
      this.session = { id: generateId(), lastActivityAt: now };
    } else {
      this.session.lastActivityAt = now;
    }

    // Fire-and-forget: the in-memory value is already correct, and awaiting a
    // disk write on every event would put storage latency in the UI path.
    void this.persistSession();
    return this.session.id;
  }

  getSiteUserId(): string | null {
    return this.siteUserId;
  }

  async setSiteUserId(siteUserId: string | null): Promise<void> {
    const normalized = normalizeSiteUserId(siteUserId);
    this.siteUserId = normalized;
    if (normalized) {
      await this.storage.setItem(STORAGE_KEYS.SITE_USER_ID, normalized);
    } else {
      await this.storage.removeItem(STORAGE_KEYS.SITE_USER_ID);
    }
  }

  /**
   * Drops the logged-in id and starts a fresh session, keeping the visitor id.
   * Use on logout: the device is still the same device, but the two users'
   * behaviour must not land in one session.
   */
  async resetSession(): Promise<void> {
    this.siteUserId = null;
    this.session = { id: generateId(), lastActivityAt: Date.now() };
    await Promise.all([
      this.storage.removeItem(STORAGE_KEYS.SITE_USER_ID),
      this.persistSession(),
    ]);
  }
}
