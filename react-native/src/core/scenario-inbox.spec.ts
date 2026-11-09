import { ScenarioSeenStore, normalizeScenarioInbox } from './scenario-inbox.js';
import { normalizeRemoteConfig } from './remote-config.js';

describe('normalizeScenarioInbox', () => {
  it('reads a well-formed response', () => {
    const entries = normalizeScenarioInbox({
      entries: [
        {
          deliveryId: 'd1',
          scenarioId: 's1',
          runId: 'r1',
          nodeId: 'onsite',
          campaignId: 'c1',
          tokens: { title: 'Still want the Sandal?' },
          respectFrequencyCaps: false,
          expiresAt: '2026-09-19T10:00:00.000Z',
        },
      ],
    });

    expect(entries).toEqual([
      {
        deliveryId: 'd1',
        scenarioId: 's1',
        runId: 'r1',
        nodeId: 'onsite',
        campaignId: 'c1',
        tokens: { title: 'Still want the Sandal?' },
        respectFrequencyCaps: false,
        expiresAt: '2026-09-19T10:00:00.000Z',
        available: true,
        scenarioOnly: false,
      },
    ]);
  });

  it('defaults respectFrequencyCaps to true when the field is absent', () => {
    // Absent must mean "apply the caps". The opposite default would let a
    // payload written before the field existed bypass every cap silently.
    const [entry] = normalizeScenarioInbox({
      entries: [{ deliveryId: 'd1', campaignId: 'c1' }],
    });
    expect(entry?.respectFrequencyCaps).toBe(true);
  });

  it('skips a claim with no campaign, which the host could only draw as a blank', () => {
    expect(
      normalizeScenarioInbox({ entries: [{ deliveryId: 'd1' }, { campaignId: 'c1' }] }),
    ).toEqual([]);
  });

  it('survives every shape a broken response can take', () => {
    for (const payload of [null, undefined, {}, { entries: null }, { entries: 'nope' }, 42]) {
      expect(normalizeScenarioInbox(payload)).toEqual([]);
    }
  });

  it('drops non-string token values rather than rendering "[object Object]"', () => {
    const [entry] = normalizeScenarioInbox({
      entries: [{ deliveryId: 'd1', campaignId: 'c1', tokens: { ok: 'yes', bad: { a: 1 } } }],
    });
    expect(entry?.tokens).toEqual({ ok: 'yes' });
  });
});

describe('ScenarioSeenStore', () => {
  it('remembers what was drawn and never reports an unseen claim', () => {
    const store = new ScenarioSeenStore();
    store.add('d1');
    expect(store.has('d1')).toBe(true);
    expect(store.has('d2')).toBe(false);
  });

  it('is bounded, keeping the most recent ids', () => {
    const store = new ScenarioSeenStore(3);
    for (const id of ['a', 'b', 'c', 'd']) store.add(id);
    expect(store.snapshot()).toEqual(['b', 'c', 'd']);
    expect(store.has('a')).toBe(false);
  });

  it('ignores a duplicate add rather than evicting on it', () => {
    const store = new ScenarioSeenStore(2);
    store.add('a');
    store.add('a');
    store.add('b');
    expect(store.snapshot()).toEqual(['a', 'b']);
  });
});

describe('remote config', () => {
  it('reads the scenarios flag so the SDK can skip the request entirely', () => {
    expect(normalizeRemoteConfig({ scenarios: { enabled: true } }).scenariosEnabled).toBe(true);
  });

  it('defaults to disabled, so a channel that never published one pays nothing', () => {
    expect(normalizeRemoteConfig({}).scenariosEnabled).toBe(false);
    expect(normalizeRemoteConfig({ scenarios: {} }).scenariosEnabled).toBe(false);
    expect(normalizeRemoteConfig(null).scenariosEnabled).toBe(false);
  });
});
