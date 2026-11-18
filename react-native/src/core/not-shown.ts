import { isWaitingReason, type AppExplainReason } from '../vendor/app-not-shown.js';

/**
 * Why a campaign or a strip is not on the screen — `Selwise.explain()`.
 *
 * A surface can be sent by the API and still not be drawn: the visitor is outside
 * its segment, an experiment's arm draws something else, the point it was placed in
 * is not mounted, a counter is under its threshold. Each of those is a decision the
 * SDK makes for a good reason and, until this ledger, made silently — the merchant
 * saw an empty screen and nothing on the device said why.
 *
 * ## No second decision path
 *
 * This records; it never decides. Every reason is written by the code that
 * rejects the surface (`getSurfaces`, `StripService`, `renderVerdict`), at the
 * moment it rejects it, from the same condition — so what `explain()` says and
 * what the screen does cannot differ. The codes are the dashboard's own
 * (`@selwise/widget-contract/app-not-shown`, vendored): "screens" is one word in
 * the panel's "Why is this not in my app?" and here.
 *
 * ## What it holds
 *
 * Reports are per entity and per screen, and an owner replaces ITS reports as a
 * whole: a `getSurfaces` pass on a screen replaces the screen's `decision`
 * reports, the overlay replaces its `draw` reports. A surface that is drawn has
 * none. Numbers, codes and ids only — never a visitor's identifier, never markup.
 *
 * What it cannot say: a campaign outside its schedule, or with delivery switched
 * off, was never sent to the device (`app-not-shown.ts` says so too).
 */

// `enrichment` is one slot of a product screen, by name (`pdp-specs`), not a campaign id.
export type NotShownKind = 'campaign' | 'strip' | 'enrichment';

/** Who wrote a report: a pass of the client's decisions, or the overlay when it drew. */
export type NotShownSource = 'decision' | 'draw';

export type NotShownDetail = Record<string, string | number | boolean | null>;

export interface NotShownInput {
  id: string;
  kind: NotShownKind;
  reason: AppExplainReason;
  /** The surface's `type` (`announcement_bar`), for a campaign. */
  type?: string;
  detail?: NotShownDetail;
}

export interface NotShownReport extends Omit<NotShownInput, 'detail'> {
  /** Numbers, codes and ids that say more (`{ experimentId }`, `{ window: 'perSession' }`); empty when the reason says it all. */
  detail: NotShownDetail;
  /** The screen it was judged on (`app://product`). */
  screen: string;
  /** A wait, not a failure: armed and going to show (`trigger_armed`). */
  waiting: boolean;
  at: number;
}

export class NotShownLedger {
  private readonly entries = new Map<string, NotShownReport & { source: NotShownSource }>();

  /**
   * @param onReport Called once per new or changed report — debug mode logs it.
   * @param now Injectable for tests.
   */
  constructor(
    private readonly onReport: (report: NotShownReport) => void = () => undefined,
    private readonly now: () => number = Date.now
  ) {}

  /**
   * The reports of `source` for `kind` on `screen`, as a whole: what was there
   * and is not in `inputs` is gone (the surface is shown now, or no longer on
   * this screen), what is in `inputs` stands.
   */
  replace(source: NotShownSource, kind: NotShownKind, screen: string, inputs: readonly NotShownInput[]): void {
    const keep = new Set(inputs.map((input) => key(input.kind, input.id)));
    for (const [entryKey, entry] of this.entries) {
      if (entry.source === source && entry.kind === kind && entry.screen === screen && !keep.has(entryKey)) {
        this.entries.delete(entryKey);
      }
    }
    for (const input of inputs) this.set(source, screen, input);
  }

  /**
   * One more report on `screen`, without touching the others: for a pass whose
   * rejections arrive in steps (a strip is left out by its segment, then by its
   * arm, then by its cap — three places, one list).
   */
  note(source: NotShownSource, screen: string, input: NotShownInput): void {
    this.set(source, screen, input);
  }

  private set(source: NotShownSource, screen: string, input: NotShownInput): void {
    const entryKey = key(input.kind, input.id);
    const before = this.entries.get(entryKey);
    const report: NotShownReport = {
      ...input,
      detail: input.detail ?? {},
      screen,
      waiting: isWaitingReason(input.reason),
      at: this.now(),
    };
    this.entries.set(entryKey, { ...report, source });
    // Said once per change: a screen asked again every few seconds must not repeat itself.
    if (!before || before.reason !== report.reason || before.screen !== screen) this.onReport(report);
  }

  /** One surface is drawn now: nothing is on record about it. */
  clear(kind: NotShownKind, id: string): void {
    this.entries.delete(key(kind, id));
  }

  /**
   * What is on record, optionally for one screen and one entity. Newest first
   * is not promised: the order is the order the screen was judged in.
   */
  list(filter: { screen?: string | null; id?: string } = {}): NotShownReport[] {
    const out: NotShownReport[] = [];
    for (const { source: _source, ...report } of this.entries.values()) {
      if (filter.screen !== undefined && filter.screen !== null && report.screen !== filter.screen) continue;
      if (filter.id !== undefined && report.id !== filter.id) continue;
      out.push(report);
    }
    return out;
  }

  /** Forget everything — a new visitor, or the client is destroyed. */
  reset(): void {
    this.entries.clear();
  }
}

const key = (kind: NotShownKind, id: string): string => `${kind}:${id}`;

/** The one line debug mode prints for a report. */
export function describeNotShown(report: NotShownReport): string {
  const what = report.type ? `${report.kind} ${report.id} (${report.type})` : `${report.kind} ${report.id}`;
  const detail = Object.keys(report.detail).length > 0 ? ` ${JSON.stringify(report.detail)}` : '';
  return `${what} ${report.waiting ? 'is waiting' : 'not shown'} on ${report.screen}: ${report.reason}${detail}`;
}
