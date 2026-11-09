import type { SelwiseStorage } from '../types.js';

/**
 * Storage keys. Prefixed `selwise_` to match the browser widget's convention so
 * a merchant debugging one surface recognises the other.
 */
export const STORAGE_KEYS = {
  VISITOR_ID: 'selwise_vid',
  SESSION: 'selwise_session',
  SITE_USER_ID: 'selwise_suid',
  QUEUE: 'selwise_queue',
  CONSENT: 'selwise_consent',
  /** The channel's last known consent policy (`/config` → `consentRequired`), `'1'` or `'0'`. */
  CONSENT_POLICY: 'selwise_consent_policy',
  DISMISSED_SURFACES: 'selwise_dismissed',
  FREQUENCY_CAPS: 'selwise_frequency_caps',
  /** `goal_reached` already sent this session — the same key the browser widget uses. */
  GOAL_REACHED: 'selwise_goal_reached',
} as const;

/**
 * Last-resort storage when the host app passes none.
 *
 * Deliberately NOT silent about being ephemeral: `isEphemeral` lets `init()`
 * warn in debug mode, because a missing AsyncStorage means every launch looks
 * like a brand-new visitor and the offline queue cannot survive a crash.
 */
export class MemoryStorage implements SelwiseStorage {
  readonly isEphemeral = true;
  private readonly map = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.map.delete(key);
  }
}

/**
 * Wraps a host-provided storage so a throwing or misbehaving implementation can
 * never take down tracking.
 *
 * AsyncStorage rejects in real situations that are not the SDK's business to
 * fix — a full disk on Android, a locked keychain right after a cold boot on
 * iOS. A rejected read must read as "no value", not as a crash inside the
 * merchant's product screen.
 */
export class SafeStorage implements SelwiseStorage {
  /** Forwarded from the wrapped storage so wrapping does not hide ephemerality. */
  readonly isEphemeral: boolean;

  private readonly inner: SelwiseStorage;
  private readonly onError: ((error: unknown) => void) | undefined;

  constructor(inner: SelwiseStorage, onError?: (error: unknown) => void) {
    this.inner = inner;
    this.onError = onError;
    this.isEphemeral = (inner as MemoryStorage).isEphemeral === true;
  }

  async getItem(key: string): Promise<string | null> {
    try {
      return await this.inner.getItem(key);
    } catch (error) {
      this.onError?.(error);
      return null;
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    try {
      await this.inner.setItem(key, value);
    } catch (error) {
      this.onError?.(error);
    }
  }

  async removeItem(key: string): Promise<void> {
    try {
      await this.inner.removeItem(key);
    } catch (error) {
      this.onError?.(error);
    }
  }
}

export function isEphemeralStorage(storage: SelwiseStorage): boolean {
  return (storage as MemoryStorage).isEphemeral === true;
}
