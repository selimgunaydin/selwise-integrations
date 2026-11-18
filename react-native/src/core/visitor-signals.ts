import type { SelwiseStorage } from '../types.js';
import type { BehaviorSnapshot } from '../vendor/page-targeting.js';
import { STORAGE_KEYS } from './storage.js';

/**
 * The behaviour signals an app can fill from its own clock and its own session,
 * so a rule on them works without the host reporting anything.
 *
 * ## What it is, and the web it mirrors
 *
 * `hourOfDay`, `dayOfWeek`, `isWeekend` (the device's clock), `visitCount`,
 * `sessionCount`, `isReturningVisitor`, `daysSinceFirstVisit`,
 * `daysSinceLastVisit` (the visits this install has had) and the four session
 * counters (`pageViewsThisSession`, `productsViewedThisSession`,
 * `searchesThisSession`, `cartAddsThisSession`) — the same names, the same
 * arithmetic and the same dedupe as the browser widget's
 * `BehaviorSignalsManager`, so one campaign targeted "to returning visitors" or
 * "after two searches" reads the same on both channels.
 *
 * A VISIT is a session: the identity manager's 30-minute window
 * (`SESSION_TIMEOUT_MS`). The count moves when the session id the SDK reports
 * is a new one, which is also what the API calls a visit.
 *
 * ## Consent
 *
 * The record describes the visitor, so it is kept on the device only while the
 * visitor's answer allows measuring them (`persistAllowed`, analytics); before
 * that it lives in memory — a visit that happens before the answer is counted in
 * this launch and written with the first change after it. The host's own
 * `behavior` always wins over these (`Selwise.withOwnSignals`).
 *
 * ## Writes
 *
 * A screen view, a search and an add to the basket each change the record, and
 * a write per change is a storage round trip per tap. Changes are coalesced: the
 * first one opens a short window (`SAVE_DELAY_MS`) and everything that lands in
 * it goes out as ONE write of the record as it stands. `flush()` writes at once —
 * the client calls it when the app leaves the foreground (`setAppState`) and on
 * `destroy()` — so a change is lost only if the app is killed inside the window
 * with the host not having reported the state.
 *
 * Plain TypeScript with no `react-native` import, so it is tested in Node.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** How long changes are gathered into one write. */
export const SAVE_DELAY_MS = 1000;

interface Persisted {
  firstSeenAt: number;
  lastSeenAt: number;
  visitCount: number;
  /** The session the counters below belong to. */
  sessionId: string;
  /** `lastSeenAt` as it was when this session began (what `daysSinceLastVisit` measures from). */
  prevSeenAt: number;
  pageViews: number;
  productsViewed: number;
  searches: number;
  cartAdds: number;
  /** The last search counted, so one search reported twice is one. */
  lastSearchQuery?: string;
  /**
   * When each app screen was last opened on this device, by catalogue key
   * (`product`, `basket`). Kept across sessions: it is what a segment's
   * "opened the basket in the last 7 days" is answered from on a live request
   * (`screenDaysAgo`). At most one entry per screen the app has.
   */
  screens?: Record<string, number>;
}

/** Event names that move a counter; matched exactly, never by prefix (`search_close` is not a search). */
const SEARCH_EVENTS: readonly string[] = ['search', 'search_zero_results', 'search_query'];

function searchQueryOf(metadata: Record<string, unknown> | undefined): string | null {
  const raw = metadata?.['query'];
  if (typeof raw !== 'string') return null;
  const query = raw.trim().toLocaleLowerCase('tr').replace(/\s+/g, ' ');
  return query.length > 0 ? query : null;
}

function isPersisted(value: unknown): value is Persisted {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record['firstSeenAt'] === 'number' &&
    typeof record['lastSeenAt'] === 'number' &&
    typeof record['visitCount'] === 'number' &&
    typeof record['sessionId'] === 'string'
  );
}

export class VisitorSignals {
  private readonly storage: SelwiseStorage;
  private readonly sessionId: () => string;
  private readonly persistAllowed: () => boolean;
  private state: Persisted | null = null;
  /** The record changed since it was last written. */
  private dirty = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(storage: SelwiseStorage, sessionId: () => string, persistAllowed: () => boolean = () => true) {
    this.storage = storage;
    this.sessionId = sessionId;
    this.persistAllowed = persistAllowed;
  }

  /** Reads what an earlier launch left. Missing or damaged: a first visit. */
  async hydrate(): Promise<void> {
    try {
      const raw = await this.storage.getItem(STORAGE_KEYS.VISITS);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      if (isPersisted(parsed)) this.state = parsed;
    } catch {
      this.state = null;
    }
  }

  /**
   * The record for the CURRENT session: a new session id starts a visit (the
   * count moves, the counters restart, `prevSeenAt` is the last time the
   * visitor was seen), the same one carries on.
   */
  private current(now: number): Persisted {
    const session = this.sessionId();
    const before = this.state;
    if (before && before.sessionId === session) return before;
    const next: Persisted = {
      firstSeenAt: before?.firstSeenAt ?? now,
      lastSeenAt: now,
      visitCount: (before?.visitCount ?? 0) + 1,
      sessionId: session,
      prevSeenAt: before?.lastSeenAt ?? now,
      pageViews: 0,
      productsViewed: 0,
      searches: 0,
      cartAdds: 0,
    };
    this.state = next;
    this.save();
    return next;
  }

  /** Marks the record changed and makes sure ONE write is on its way. */
  private save(): void {
    if (!this.state) return;
    this.dirty = true;
    if (this.saveTimer !== null) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.write();
    }, SAVE_DELAY_MS);
    // Under Node (tests, tools) a pending write must not keep the process alive;
    // React Native's timer is a plain number and has no `unref`.
    (this.saveTimer as { unref?: () => void }).unref?.();
  }

  private async write(): Promise<void> {
    // Judged when it is written, not when it was asked for: the visitor may have
    // withdrawn the consent in the meantime. The record stays pending for the
    // next change after an answer that allows it.
    if (!this.state || !this.dirty || !this.persistAllowed()) return;
    this.dirty = false;
    try {
      await this.storage.setItem(STORAGE_KEYS.VISITS, JSON.stringify(this.state));
    } catch {
      this.dirty = true;
    }
  }

  /**
   * Writes a pending change now. The client calls it when the app leaves the
   * foreground and on `destroy()`, where a timer might never fire.
   */
  async flush(): Promise<void> {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await this.write();
  }

  /**
   * A screen was viewed (`trackScreenView`). `screenKey` is the catalogue's key
   * for it (`appScreenOfUrl(url)?.key`); a screen the catalogue does not list
   * counts as a page view and is not remembered.
   */
  recordPageView(now: number = Date.now(), screenKey?: string): void {
    const state = this.current(now);
    state.pageViews += 1;
    state.lastSeenAt = now;
    if (screenKey) {
      state.screens ??= {};
      state.screens[screenKey] = now;
    }
    this.save();
  }

  /**
   * Whole days since each screen was last opened on this device (0 = today),
   * by screen key. ALWAYS an object — empty when none was opened: "this device
   * opened none of them" is a measurement the server must be told, or it reads
   * the person as unmeasured. The window is the server's (it drops what is too
   * old); the clock is the device's on both sides, so a wrong clock cannot
   * shift a day count.
   */
  screenDaysAgo(now: number = Date.now()): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [key, at] of Object.entries(this.state?.screens ?? {})) {
      if (typeof at === 'number' && Number.isFinite(at)) out[key] = Math.max(0, Math.floor((now - at) / DAY_MS));
    }
    return out;
  }

  /** A tracked event: moves the product, search and add-to-cart counters. */
  recordEvent(name: string, metadata?: Record<string, unknown>, now: number = Date.now()): void {
    const searched = SEARCH_EVENTS.includes(name);
    const added = name === 'add_to_cart';
    const viewed = name === 'product_view';
    if (!searched && !added && !viewed) return;

    const state = this.current(now);
    if (searched) {
      const query = searchQueryOf(metadata);
      // One search can be reported by two producers; the same query twice is one search.
      if (query !== null) {
        if (query === state.lastSearchQuery) return;
        state.lastSearchQuery = query;
      }
      state.searches += 1;
    } else if (added) {
      state.cartAdds += 1;
    } else {
      state.productsViewed += 1;
    }
    state.lastSeenAt = now;
    this.save();
  }

  /** The signals, as a `BehaviorSnapshot` fragment. The clock is the device's, as the shopper's own evening is what a rule means. */
  snapshot(now: number = Date.now()): BehaviorSnapshot {
    const state = this.current(now);
    const date = new Date(now);
    const day = date.getDay();
    return {
      hourOfDay: date.getHours(),
      dayOfWeek: day,
      isWeekend: day === 0 || day === 6,
      searchesThisSession: state.searches,
      cartAddsThisSession: state.cartAdds,
      isReturningVisitor: state.visitCount > 1,
      visitCount: state.visitCount,
      sessionCount: state.visitCount,
      daysSinceFirstVisit: Math.max(0, Math.floor((now - state.firstSeenAt) / DAY_MS)),
      daysSinceLastVisit: Math.max(0, Math.floor((now - state.prevSeenAt) / DAY_MS)),
      pageViewsThisSession: state.pageViews,
      productsViewedThisSession: state.productsViewed,
    };
  }

  /** Forgets everything (the host's "reset" and a test). */
  async clear(): Promise<void> {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.dirty = false;
    this.state = null;
    await this.storage.removeItem(STORAGE_KEYS.VISITS);
  }
}
