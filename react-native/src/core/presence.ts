/**
 * The live heartbeat in an app: "this user still has the app open".
 *
 * The web widget's twin (`apps/client/src/core/presence.ts`), with the one
 * difference an app forces: the SDK cannot see touches, and it does not import
 * `react-native`, so "in use" is the app being in the FOREGROUND — which the
 * host reports through `Selwise.setAppState()` from an `AppState` listener. A
 * phone that locks or switches app moves it to the background, and nothing is
 * sent from there.
 *
 * It sends nothing:
 * - while the app is not active;
 * - when an event batch was accepted within the interval (`noteDelivered`):
 *   that already kept the user live;
 * - after the server answered `live: false` (no accepted event in 30
 *   minutes), until the next accepted batch;
 * - without analytics consent (`CONSENT_CHANNEL_CATEGORIES.presence`);
 * - after `LIVE_HEARTBEAT_IDLE_STOP_MS` with no SDK call at all (no screen,
 *   no event) — the guard for a host that never reports the background: an
 *   app left open on a table stops beating, and the next call restarts it.
 *
 * The server only REFRESHES a visitor whose events it accepted in the last 30
 * minutes, and every answer carries the interval to use next.
 */

import {
  LIVE_HEARTBEAT_IDLE_STOP_MS,
  LIVE_HEARTBEAT_INTERVAL_MS,
  liveHeartbeatDelay,
  liveHeartbeatInterval,
} from '../vendor/live-presence.js';

/** `/config`'s `tracking.presence`: present means "send it". */
export interface AppPresenceSettings {
  intervalMs?: number;
}

export interface AppPresenceOptions {
  /** Sends one heartbeat; resolves with the HTTP status and the server's answer. */
  send: () => Promise<{ status: number; intervalMs?: number; live?: boolean }>;
  /** Is a heartbeat allowed right now (consent)? */
  allowed: () => boolean;
  now?: () => number;
  random?: () => number;
}

/** `AppState.currentState` values that mean the user is looking at the app. */
export function isActiveAppState(state: string | null | undefined): boolean {
  return state === 'active';
}

export class AppPresence {
  private intervalMs = LIVE_HEARTBEAT_INTERVAL_MS;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private enabled = false;
  private foreground = true;
  private lastActivityAt = 0;
  private lastSentAt = 0;
  private lastDeliveredAt = 0;
  /** The server said `live: false` at this time; silent until a batch is accepted after it. */
  private dormantSince: number | null = null;
  private dead = false;
  private readonly now: () => number;
  private readonly random: () => number;

  constructor(private readonly options: AppPresenceOptions) {
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
  }

  /** Apply `/config`'s `tracking.presence`. */
  configure(settings: AppPresenceSettings | undefined): void {
    this.enabled = settings !== undefined && !this.dead;
    this.intervalMs = liveHeartbeatInterval(settings?.intervalMs, this.intervalMs);
    this.lastActivityAt = this.now();
    if (this.enabled) this.schedule(this.jittered());
    else this.clear();
  }

  /** The host's `AppState` changed. Coming back to the app beats at once. */
  setForeground(active: boolean): void {
    const wasForeground = this.foreground;
    this.foreground = active;
    if (!active) {
      this.clear();
      return;
    }
    this.lastActivityAt = this.now();
    if (!wasForeground && this.enabled && this.now() - this.lastSentAt >= this.intervalMs) {
      this.schedule(0);
    } else if (this.enabled && !this.timer) {
      this.schedule(this.jittered());
    }
  }

  /** Any SDK call: the app is in use. Wakes a heartbeat that went to sleep. */
  noteActivity(): void {
    this.lastActivityAt = this.now();
    if (this.enabled && this.foreground && !this.timer) this.schedule(this.jittered());
  }

  /** An event batch was accepted: it kept the user live, and wakes a dormant heartbeat. */
  noteDelivered(): void {
    this.lastDeliveredAt = this.now();
    this.dormantSince = null;
  }

  stop(): void {
    this.enabled = false;
    this.clear();
  }

  private clear(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private jittered(): number {
    return liveHeartbeatDelay(this.intervalMs, this.random());
  }

  private schedule(delay: number): void {
    this.clear();
    if (!this.enabled || !this.foreground) return;
    this.timer = setTimeout(() => void this.tick(), delay);
  }

  private async tick(): Promise<void> {
    this.timer = null;
    if (!this.enabled || !this.foreground) return;
    // Asleep until the next SDK call (`noteActivity`).
    if (this.now() - this.lastActivityAt >= LIVE_HEARTBEAT_IDLE_STOP_MS) return;
    const send =
      this.dormantSince === null &&
      this.now() - this.lastDeliveredAt >= this.intervalMs &&
      this.options.allowed();
    if (send) {
      this.lastSentAt = this.now();
      try {
        const answer = await this.options.send();
        // A wrong or unverified channel key is permanent.
        if (answer.status === 403 || answer.status === 404) {
          this.dead = true;
          this.stop();
          return;
        }
        this.intervalMs = liveHeartbeatInterval(answer.intervalMs, this.intervalMs);
        if (answer.live === false) this.dormantSince = this.lastSentAt;
      } catch {
        // Offline: the next beat tries again.
      }
    }
    this.schedule(this.jittered());
  }
}
