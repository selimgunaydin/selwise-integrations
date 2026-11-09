import { isGoalMetric, type GoalBarView, type GoalMetric } from '../vendor/dynamic-content.js';
import type { SelwiseStorage } from '../types.js';
import { STORAGE_KEYS } from './storage.js';

/**
 * The goal bar in an app: what the SDK decides, and what it leaves to the host.
 *
 * WHAT the bar says is `resolveGoalBar` in the vendored contract — the same
 * pure function the browser widget and the dashboard preview call, so a cart
 * reads the same sentence on every channel. The host draws the view and
 * re-resolves it on every `onCartChange`.
 *
 * `goal_reached` is the one thing the SDK cannot decide alone: it means "the
 * bar was ON SCREEN while the basket passed a step", and only the host knows
 * what is on screen. So the host reports the crossing and the SDK makes sure
 * it is counted once.
 */

export interface GoalReachedDetail {
  /** Index of the threshold crossed, 0-based, as in `GoalProgress.reachedCount`. */
  step: number;
  /** The threshold's `at` value. */
  threshold: number;
  metric: GoalMetric;
}

/** A host's detail, validated; `null` when it does not describe a real step. */
export function normalizeGoalReachedDetail(input: unknown): GoalReachedDetail | null {
  if (!input || typeof input !== 'object') return null;
  const record = input as Record<string, unknown>;
  const step = Number(record.step);
  const threshold = Number(record.threshold);
  if (!Number.isInteger(step) || step < 0) return null;
  if (!Number.isFinite(threshold) || threshold <= 0) return null;
  if (!isGoalMetric(record.metric)) return null;
  return { step, threshold, metric: record.metric };
}

/**
 * The steps passed between two views of the same bar — only when the EARLIER
 * view was visible. A step already behind the shopper when the bar first
 * appeared was not reached in front of it, and a bar that was hidden (an
 * unmeasured cart, an empty one the merchant did not ask to show) was not in
 * front of anyone. The later view need not be visible: completing the goal can
 * hide a bar that has no reward sentence, and that crossing still happened on
 * screen.
 */
export function goalStepsCrossed(
  previous: GoalBarView | null | undefined,
  next: GoalBarView | null | undefined
): number[] {
  if (!previous || !previous.visible || !previous.progress) return [];
  if (!next || !next.progress) return [];
  const steps: number[] = [];
  for (let step = previous.progress.reachedCount; step < next.progress.reachedCount; step += 1) {
    steps.push(step);
  }
  return steps;
}

export const HIDDEN_GOAL_BAR_VIEW: GoalBarView = Object.freeze({
  state: 'unknown' as const,
  visible: false,
  text: '',
  buttonText: '',
  buttonUrl: '',
  progress: null,
});

/** Keys kept per session; a bar has at most four steps, so this is many bars. */
const MAX_KEYS = 50;

/**
 * `goal_reached` already sent, once per session per surface and step.
 *
 * The web keys this by journey and stores it; the app keys it by SESSION (the
 * SDK's journey id lives only as long as the process) and stores it too, so a
 * relaunch inside the same session cannot report the same step again. A new
 * session starts clean without anyone clearing it: the record carries the
 * session it belongs to.
 */
export class GoalReachedStore {
  private readonly storage: SelwiseStorage;
  private sessionId: string | null = null;
  private keys: string[] = [];
  private hydrated = false;

  constructor(storage: SelwiseStorage) {
    this.storage = storage;
  }

  async hydrate(): Promise<void> {
    if (this.hydrated) return;
    this.hydrated = true;

    const raw = await this.storage.getItem(STORAGE_KEYS.GOAL_REACHED);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { sessionId?: unknown; keys?: unknown };
      if (typeof parsed?.sessionId === 'string' && Array.isArray(parsed.keys)) {
        this.sessionId = parsed.sessionId;
        this.keys = parsed.keys.filter((key): key is string => typeof key === 'string');
      }
    } catch {
      await this.storage.removeItem(STORAGE_KEYS.GOAL_REACHED);
    }
  }

  /**
   * Claims `key` for this session. Returns false when it was already claimed.
   * The write is not awaited by the caller: losing it costs at most one repeat
   * after a crash, and the in-memory record already stops a repeat now.
   */
  claim(sessionId: string, key: string): boolean {
    if (this.sessionId !== sessionId) {
      this.sessionId = sessionId;
      this.keys = [];
    }
    if (this.keys.includes(key)) return false;
    this.keys = [...this.keys, key].slice(-MAX_KEYS);
    void this.storage.setItem(
      STORAGE_KEYS.GOAL_REACHED,
      JSON.stringify({ sessionId: this.sessionId, keys: this.keys })
    );
    return true;
  }
}
