import type { SelwiseStorage } from '../types.js';
import { STORAGE_KEYS } from '../core/storage.js';

export interface QueuedEvent {
  eventId: string;
  entityType: string;
  entityId?: string;
  productItemCode?: string;
  name: string;
  metadata?: Record<string, string | number | boolean | null>;
  timestamp: number;
  eventTs: number;
  correlationId?: string;
  parentEventId?: string;
  /** Incremented on each failed flush; used to give up on permanently bad events. */
  retryCount?: number;
  /**
   * The screen this event happened on, stamped at track time.
   *
   * INTERNAL — stripped before the event is sent. `POST /events/batch` carries
   * one `pageUrl` for the whole batch and its per-event DTO has no such field,
   * so a batch mixing screens would attribute every event to whichever screen
   * the visitor was on at flush time. On web that cannot happen because a page
   * load ends the batch; in an app the queue outlives the screen.
   */
  pageUrl?: string;
}

export interface EventQueueOptions {
  storage: SelwiseStorage;
  maxQueueSize: number;
  /** Failed events are dropped once they exceed this. Default 5. */
  maxRetries?: number;
  /**
   * Keep the queue on disk between launches. Default true.
   *
   * The dashboard exposes this as "offline persistence"; turning it off is a
   * privacy choice (nothing about a visitor's activity outlives the process),
   * so switching it off must also erase what is already stored.
   */
  persistence?: boolean;
  onLog?: (message: string, detail?: unknown) => void;
}

/** The subset of queue options a merchant can change from the dashboard. */
export interface EventQueueTuning {
  maxQueueSize?: number;
  maxRetries?: number;
  persistence?: boolean;
}

const DEFAULT_MAX_RETRIES = 5;

/**
 * Durable, size-bounded event buffer.
 *
 * A mobile app is offline far more often than a web page, and it is killed
 * without warning, so events live on disk between flushes rather than only in
 * memory. Two rules keep that from becoming a liability:
 *
 * - **Bounded.** At `maxQueueSize` the OLDEST events are dropped. A queue that
 *   grows without limit on a long flight turns into an AsyncStorage row big
 *   enough to stall the JS thread when it is read back.
 * - **Bounded retries.** An event the server rejects for its own content (a bad
 *   `entityType`, oversized metadata) would otherwise be retried forever and
 *   block every event behind it.
 */
export class EventQueue {
  private readonly storage: SelwiseStorage;
  private maxQueueSize: number;
  private maxRetries: number;
  private persistence: boolean;
  private readonly onLog: ((message: string, detail?: unknown) => void) | undefined;

  private events: QueuedEvent[] = [];
  private hydrated = false;
  /** Serialises disk writes so two concurrent flushes cannot interleave. */
  private writeChain: Promise<void> = Promise.resolve();

  constructor(options: EventQueueOptions) {
    this.storage = options.storage;
    this.maxQueueSize = Math.max(1, options.maxQueueSize);
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.persistence = options.persistence !== false;
    this.onLog = options.onLog;
  }

  /**
   * Re-tune after the dashboard's settings arrive.
   *
   * Applied live rather than at construction because `/config` lands after
   * `init()` — blocking the first screen on that request is exactly the cost
   * the lazy fetch exists to avoid.
   */
  configure(tuning: EventQueueTuning): void {
    if (tuning.maxQueueSize !== undefined) {
      this.maxQueueSize = Math.max(1, tuning.maxQueueSize);
      // A lowered bound has to take effect on what is already queued, or the
      // setting does nothing until the queue happens to drain.
      if (this.events.length > this.maxQueueSize) {
        this.events = this.events.slice(this.events.length - this.maxQueueSize);
      }
    }
    if (tuning.maxRetries !== undefined) {
      this.maxRetries = Math.max(0, tuning.maxRetries);
    }
    if (tuning.persistence !== undefined && tuning.persistence !== this.persistence) {
      this.persistence = tuning.persistence;
      // Turning it off is a privacy choice, so the stored copy goes too.
      if (!this.persistence) {
        this.writeChain = this.writeChain
          .then(() => this.storage.removeItem(STORAGE_KEYS.QUEUE))
          .catch(() => {});
      } else {
        this.persist();
      }
    } else if (tuning.maxQueueSize !== undefined) {
      this.persist();
    }
  }

  async hydrate(): Promise<void> {
    if (this.hydrated) return;
    this.hydrated = true;

    const raw = await this.storage.getItem(STORAGE_KEYS.QUEUE);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;

      const restored = parsed.filter(isQueuedEvent);
      // Events already in memory were tracked during hydration; they are newer
      // than what is on disk, so disk goes first to preserve order.
      this.events = [...restored, ...this.events].slice(-this.maxQueueSize);
      this.onLog?.(`Restored ${restored.length} queued event(s)`);
    } catch {
      // Unparseable queue: drop it. Keeping a corrupt blob would fail on every
      // subsequent launch.
      await this.storage.removeItem(STORAGE_KEYS.QUEUE);
    }
  }

  add(event: QueuedEvent): void {
    this.events.push(event);

    if (this.events.length > this.maxQueueSize) {
      const dropped = this.events.length - this.maxQueueSize;
      this.events = this.events.slice(dropped);
      this.onLog?.(`Queue full, dropped ${dropped} oldest event(s)`);
    }

    this.persist();
  }

  size(): number {
    return this.events.length;
  }

  /**
   * Removes and returns up to `count` events from the front, stopping at the
   * first event from a different screen.
   *
   * The batch's `pageUrl` applies to every event in it, so a batch must never
   * mix screens. Stopping early costs an extra request per screen the visitor
   * passed through between flushes, which is the price of a funnel that says
   * where each step actually happened.
   */
  take(count: number): QueuedEvent[] {
    const limit = Math.max(0, count);
    if (limit === 0 || this.events.length === 0) return [];

    const pageUrl = this.events[0]?.pageUrl;
    let end = 0;
    while (end < limit && end < this.events.length && this.events[end]?.pageUrl === pageUrl) {
      end += 1;
    }

    const taken = this.events.splice(0, end);
    if (taken.length > 0) {
      this.persist();
    }
    return taken;
  }

  /**
   * Returns events to the front after a failed flush, bumping their retry
   * count and discarding the ones that have exhausted it.
   */
  requeue(events: QueuedEvent[]): void {
    const retryable: QueuedEvent[] = [];
    let exhausted = 0;

    for (const event of events) {
      const retryCount = (event.retryCount ?? 0) + 1;
      if (retryCount > this.maxRetries) {
        exhausted += 1;
        continue;
      }
      retryable.push({ ...event, retryCount });
    }

    if (exhausted > 0) {
      this.onLog?.(`Dropped ${exhausted} event(s) after ${this.maxRetries} failed attempts`);
    }

    this.events = [...retryable, ...this.events].slice(-this.maxQueueSize);
    this.persist();
  }

  async clear(): Promise<void> {
    this.events = [];
    await this.storage.removeItem(STORAGE_KEYS.QUEUE);
  }

  /** Awaits every pending disk write. Call before the app backgrounds. */
  async flushWrites(): Promise<void> {
    await this.writeChain;
  }

  private persist(): void {
    if (!this.persistence) return;
    const snapshot = JSON.stringify(this.events);
    this.writeChain = this.writeChain
      .then(() => this.storage.setItem(STORAGE_KEYS.QUEUE, snapshot))
      .catch(() => {
        // SafeStorage already swallows and reports; this guard only keeps one
        // rejected write from poisoning the chain for every later write.
      });
  }
}

function isQueuedEvent(value: unknown): value is QueuedEvent {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<QueuedEvent>;
  return (
    typeof candidate.eventId === 'string' &&
    typeof candidate.entityType === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.timestamp === 'number'
  );
}
