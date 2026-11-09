import type { ConsentCategory, ConsentSnapshot, SelwiseStorage } from '../types.js';
import { STORAGE_KEYS } from './storage.js';

/**
 * Consent state.
 *
 * `POST /events/batch` declares `consentSnapshot` as required and DROPS the
 * whole batch when it is missing, and — since 2026-10-26 — drops every event
 * whose category the snapshot does not allow
 * (`consentCategoryOfEvent`, vendored from `@selwise/tracking-contract`).
 *
 * The default says what is true when the app never calls `setConsent()`: the
 * APP manages consent, Selwise does not (`source: 'app_managed'`, every
 * category allowed). It used to claim "necessary only" while the SDK sent
 * every event anyway, so the stored snapshot on each row contradicted the row.
 * Every event row records that `source`, so it is on file that the app,
 * not Selwise, was responsible for asking.
 *
 * An app that must withhold everything until its CMP resolves passes
 * `consent: { granted: false }` to `init()` and calls `setConsent()` with the
 * answer; events tracked in between are held, not discarded (see `EventQueue`),
 * and after the answer only the categories it allows are sent.
 */
export const DEFAULT_CONSENT: ConsentSnapshot = {
  granted: true,
  categories: { necessary: true, analytics: true, marketing: true, preferences: true },
  source: 'app_managed',
};

/**
 * What stands in for a decision while the channel requires one and the host
 * has not given it (`setRequiresDecision`). Not granted: events are held, not
 * sent and not discarded, exactly as with `consent: { granted: false }`.
 */
const AWAITING_DECISION: ConsentSnapshot = {
  granted: false,
  categories: { necessary: true, analytics: false, marketing: false, preferences: false },
  source: 'awaiting_decision',
};

export class ConsentManager {
  private readonly storage: SelwiseStorage;
  private snapshot: ConsentSnapshot;
  /** A decision exists: passed to `init()`, restored from storage, or `set()`. */
  private decided: boolean;
  /** The channel waits for a decision (`/config` → `consentRequired`). */
  private requiresDecision = false;
  /** The policy is on disk (this launch or an earlier one), so no send needs to wait for `/config`. */
  private policyStored = false;

  constructor(storage: SelwiseStorage, initial?: ConsentSnapshot) {
    this.storage = storage;
    this.snapshot = normalize(initial ?? DEFAULT_CONSENT);
    this.decided = initial !== undefined;
  }

  /**
   * The channel's policy, from `/config`. When it requires a decision and the
   * host has made none, the `app_managed` default no longer counts as one.
   */
  setRequiresDecision(required: boolean): void {
    if (this.requiresDecision === required && this.policyStored) return;
    this.requiresDecision = required;
    this.policyStored = true;
    void this.storage.setItem(STORAGE_KEYS.CONSENT_POLICY, required ? '1' : '0');
  }

  /** The channel's policy is known without asking `/config` (it was stored). */
  hasStoredPolicy(): boolean {
    return this.policyStored;
  }

  /** True while only the `app_managed` default stands — nobody has decided. */
  isUndecided(): boolean {
    return !this.decided;
  }

  private effective(): ConsentSnapshot {
    return this.requiresDecision && !this.decided ? AWAITING_DECISION : this.snapshot;
  }

  /**
   * Restores a previously stored decision, unless `init()` was given an
   * explicit snapshot — a value passed this launch is fresher than disk.
   */
  async hydrate(hasExplicitInitial: boolean): Promise<void> {
    // The policy the last launch read: a /config that fails this launch must
    // not turn a channel that requires a decision back into `app_managed`.
    // Both keys in one round trip.
    const [policy, raw] = await Promise.all([
      this.storage.getItem(STORAGE_KEYS.CONSENT_POLICY),
      hasExplicitInitial ? Promise.resolve(null) : this.storage.getItem(STORAGE_KEYS.CONSENT),
    ]);
    if (policy === '1' || policy === '0') {
      this.requiresDecision = policy === '1';
      this.policyStored = true;
    }
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as ConsentSnapshot;
      if (typeof parsed?.granted === 'boolean') {
        this.snapshot = normalize(parsed);
        this.decided = true;
      }
    } catch {
      // Corrupt value: keep the default rather than guessing at intent.
    }
  }

  get(): ConsentSnapshot {
    return this.effective();
  }

  async set(next: ConsentSnapshot): Promise<void> {
    this.snapshot = normalize(next);
    this.decided = true;
    await this.storage.setItem(STORAGE_KEYS.CONSENT, JSON.stringify(this.snapshot));
  }

  isGranted(): boolean {
    return this.effective().granted === true;
  }

  hasCategory(category: ConsentCategory): boolean {
    const snapshot = this.effective();
    if (!snapshot.granted) return false;
    if (category === 'necessary') return true;
    return snapshot.categories?.[category] === true;
  }
}

function normalize(snapshot: ConsentSnapshot): ConsentSnapshot {
  return {
    granted: snapshot.granted === true,
    categories: {
      // `necessary` is true whenever consent is granted at all: it is the
      // category first-party functional tracking lives in, and a CMP that
      // reports `granted` while omitting it is describing the optional ones.
      necessary: snapshot.granted === true,
      analytics: snapshot.categories?.analytics === true,
      marketing: snapshot.categories?.marketing === true,
      preferences: snapshot.categories?.preferences === true,
    },
    timestamp: snapshot.timestamp ?? Date.now(),
    source: snapshot.source ?? 'app',
  };
}
