import type { SelwiseStorage } from '../types.js';

/**
 * The search box's history on this device.
 *
 * A visitor's past terms offered back to them are a remembered preference, so
 * what reaches the device's storage depends on the visitor's consent
 * (`searchHistory`, the preferences category):
 *
 * - allowed: the list is read from and written to storage, so it survives a
 *   launch;
 * - not allowed: it lives in memory for this launch only — the search box still
 *   shows what the visitor searched a minute ago — and what an earlier consent
 *   left on the device is removed.
 *
 * The consent is asked on every read and write (`allowed()`), never remembered:
 * the answer can change while the app runs.
 */

/** The terms kept per device. A reader shows the channel's own, smaller, number. */
export const RECENT_SEARCH_LIMIT = 20;

/** The longest term kept: a pasted paragraph is not a search worth offering back. */
const TERM_MAX_LENGTH = 100;

const fold = (term: string): string => term.toLocaleLowerCase();

export class RecentSearches {
  /** This launch's list, loaded once from storage when consent allows. */
  private terms: string[] = [];
  private loaded: Promise<void> | null = null;

  constructor(
    private readonly storage: SelwiseStorage,
    private readonly key: string,
    private readonly allowed: () => boolean
  ) {}

  /** The newest `max` terms. */
  async list(max: number): Promise<string[]> {
    await this.load();
    return this.terms.slice(0, Math.max(0, max));
  }

  /** Puts `term` first, once: the same term in another case moves up instead of repeating. */
  async add(term: string): Promise<void> {
    const text = String(term ?? '').trim().slice(0, TERM_MAX_LENGTH);
    if (!text) return;
    await this.load();
    const key = fold(text);
    this.terms = [text, ...this.terms.filter((entry) => fold(entry) !== key)].slice(0, RECENT_SEARCH_LIMIT);
    await this.save();
  }

  async remove(term: string): Promise<void> {
    await this.load();
    const key = fold(String(term ?? '').trim());
    this.terms = this.terms.filter((entry) => fold(entry) !== key);
    await this.save();
  }

  async clear(): Promise<void> {
    await this.load();
    this.terms = [];
    await this.storage.removeItem(this.key);
  }

  /** Test seam and consent seam: read storage again on the next call. */
  reset(): void {
    this.loaded = null;
    this.terms = [];
  }

  private load(): Promise<void> {
    if (!this.loaded) {
      this.loaded = (async () => {
        if (!this.allowed()) {
          await this.storage.removeItem(this.key);
          return;
        }
        try {
          const stored = await this.storage.getItem(this.key);
          const parsed: unknown = stored ? JSON.parse(stored) : [];
          if (Array.isArray(parsed)) {
            this.terms = parsed.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
          }
        } catch {
          // A value that does not parse is a history that starts again.
        }
      })();
    }
    return this.loaded;
  }

  private async save(): Promise<void> {
    if (this.allowed()) {
      await this.storage.setItem(this.key, JSON.stringify(this.terms));
    } else {
      // Consent was withdrawn after the list was loaded: what is on the device goes.
      await this.storage.removeItem(this.key);
    }
  }
}
