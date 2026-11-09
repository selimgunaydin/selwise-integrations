/**
 * Scenario deliveries waiting for this shopper.
 *
 * A scenario cannot push to an app that is not open, so `action.onsite` leaves
 * a CLAIM on the server and the SDK collects it the next time the app comes to
 * the foreground. Same mechanism as the web widget, same endpoint, same
 * acknowledgement — the only difference is that a host app draws the campaign
 * with its own components rather than through a DOM renderer.
 *
 * What the SDK does NOT do here is decide what the surface looks like. It
 * returns the claim and the campaign id; the host renders it exactly as it
 * renders any other surface. That is the same boundary `hosted_rendering`
 * draws for campaigns and widgets: the platform decides WHETHER and WHAT, the
 * app decides HOW.
 */

export interface ScenarioInboxEntry {
  deliveryId: string;
  scenarioId: string;
  runId: string;
  nodeId: string;
  campaignId: string;
  /** Merge fields the step resolved, already interpolated server-side. */
  tokens: Record<string, string>;
  respectFrequencyCaps: boolean;
  expiresAt: string;
  /** False: the campaign was paused, deleted, or is not this scenario's. Ack `suppressed:entity_missing`. */
  available: boolean;
  /**
   * The campaign exists ONLY for this scenario and is NOT among `getSurfaces()`.
   * Its presented body is in `campaign` — draw that.
   */
  scenarioOnly: boolean;
  campaign?: Record<string, unknown>;
}

/** What the host did with a claim. Anything but `shown` records a reason. */
export type ScenarioInboxOutcome =
  | 'shown'
  | 'suppressed:frequency_cap'
  | 'suppressed:consent_missing'
  | 'suppressed:entity_missing'
  | 'suppressed:duplicate'
  | 'suppressed:audience_mismatch';

export interface ScenarioInboxAcknowledgement {
  deliveryId: string;
  outcome: ScenarioInboxOutcome | string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asStringMap(value: unknown): Record<string, string> {
  const source = asRecord(value);
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(source)) {
    if (typeof entry === 'string') out[key] = entry;
  }
  return out;
}

/**
 * Parse an inbox response.
 *
 * Skips anything without a campaign id rather than surfacing a half-formed
 * entry: a claim the host cannot resolve to a surface is a blank on screen,
 * and the server closes it as `entity_missing` once the host says so.
 */
export function normalizeScenarioInbox(payload: unknown): ScenarioInboxEntry[] {
  const entries = asRecord(payload).entries;
  if (!Array.isArray(entries)) return [];

  const normalized: ScenarioInboxEntry[] = [];
  for (const raw of entries) {
    const entry = asRecord(raw);
    const deliveryId = typeof entry.deliveryId === 'string' ? entry.deliveryId : '';
    const campaignId = typeof entry.campaignId === 'string' ? entry.campaignId : '';
    if (!deliveryId || !campaignId) continue;

    normalized.push({
      deliveryId,
      campaignId,
      scenarioId: typeof entry.scenarioId === 'string' ? entry.scenarioId : '',
      runId: typeof entry.runId === 'string' ? entry.runId : '',
      nodeId: typeof entry.nodeId === 'string' ? entry.nodeId : '',
      tokens: asStringMap(entry.tokens),
      respectFrequencyCaps: entry.respectFrequencyCaps !== false,
      expiresAt: typeof entry.expiresAt === 'string' ? entry.expiresAt : '',
      available: entry.available !== false,
      scenarioOnly: entry.scenarioOnly === true,
      ...(entry.campaign && typeof entry.campaign === 'object'
        ? { campaign: asRecord(entry.campaign) }
        : {}),
    });
  }
  return normalized;
}

/**
 * Claims this install has already drawn.
 *
 * The acknowledgement is a network call and can fail — the app is backgrounded,
 * the connection drops. Without a local record the next foreground would
 * collect the same claim and draw it again, and the shopper would see the same
 * reminder on every launch until the TTL ran out.
 *
 * Bounded: only recent ids matter, because anything older has expired
 * server-side anyway.
 */
export class ScenarioSeenStore {
  private readonly seen: string[] = [];

  constructor(private readonly max = 50) {}

  has(deliveryId: string): boolean {
    return this.seen.indexOf(deliveryId) !== -1;
  }

  add(deliveryId: string): void {
    if (this.has(deliveryId)) return;
    this.seen.push(deliveryId);
    while (this.seen.length > this.max) this.seen.shift();
  }

  /** Restore from the host's persistent storage across launches. */
  hydrate(ids: readonly string[]): void {
    for (const id of ids) this.add(id);
  }

  snapshot(): string[] {
    return [...this.seen];
  }
}
