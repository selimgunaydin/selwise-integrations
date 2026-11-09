import {
  ExperimentGate,
  audienceAdmits,
  type ExperimentAssignment,
  type ExperimentAudienceContext,
} from './eligibility.js';

/**
 * An entity experiment's own Audience, in an app: judged per screen, with the
 * targeting and segment logic a surface is judged with, failing closed.
 */

function ctx(overrides: Partial<ExperimentAudienceContext> = {}): ExperimentAudienceContext {
  return { pageUrl: 'app://product/42', deviceType: 'mobile', testMode: false, segments: null, ...overrides };
}

function arm(experimentId: string, overrides: Partial<ExperimentAssignment> = {}): ExperimentAssignment {
  return {
    experimentId,
    variantId: `${experimentId}-b`,
    targetId: `${experimentId}-campaign`,
    effectiveTargetId: `${experimentId}-campaign`,
    excludedTargetIds: [`${experimentId}-other`],
    config: { content: { text: 'B' } },
    ...overrides,
  };
}

describe('audienceAdmits', () => {
  it('reads the screen, device, country and behaviour', async () => {
    await expect(audienceAdmits(undefined, ctx())).resolves.toBe(true);
    await expect(audienceAdmits({ targeting: { device: { types: ['tablet'] } } }, ctx())).resolves.toBe(false);
    await expect(
      audienceAdmits({ targeting: { showOnAllPages: false, includeUrls: ['app://product/*'] } }, ctx())
    ).resolves.toBe(true);
    await expect(
      audienceAdmits({ targeting: { showOnAllPages: false, includeUrls: ['app://product/*'] } }, ctx({ pageUrl: 'app://home' }))
    ).resolves.toBe(false);
    await expect(audienceAdmits({ targeting: { geo: { mode: 'include', countries: ['DE'] } } }, ctx({ country: 'TR' }))).resolves.toBe(false);
    const big = { targeting: { behavior: { match: 'all', rules: [{ signal: 'cartValue', op: 'gte', value: 500 }] } } };
    await expect(audienceAdmits(big, ctx({ behavior: { cartValue: 100 } }))).resolves.toBe(false);
    await expect(audienceAdmits(big, ctx({ behavior: { cartValue: 900 } }))).resolves.toBe(true);
  });

  it('keeps the visitor out when the screen does not answer a dimension the audience narrows on', async () => {
    // A host that labels no screen kind, a channel whose country is unknown.
    await expect(audienceAdmits({ targeting: { pageTypes: { types: ['product'] } } }, ctx())).resolves.toBe(false);
    await expect(audienceAdmits({ targeting: { pageTypes: { types: ['product'] } } }, ctx({ pageType: 'product' }))).resolves.toBe(true);
    await expect(audienceAdmits({ targeting: { geo: { mode: 'exclude', countries: ['DE'] } } }, ctx())).resolves.toBe(false);
    await expect(audienceAdmits({ targeting: { geo: { mode: 'exclude', countries: ['DE'] } } }, ctx({ country: 'TR' }))).resolves.toBe(true);
  });

  it('keeps a test-mode experiment to a tester', async () => {
    await expect(audienceAdmits({ testMode: true }, ctx())).resolves.toBe(false);
    await expect(audienceAdmits({ testMode: true }, ctx({ testMode: true }))).resolves.toBe(true);
  });

  it('asks segments through the gate and fails CLOSED', async () => {
    const shouldShow = jest.fn(async () => true);
    const segments = { mode: 'include' as const, ids: ['seg'] };
    await expect(audienceAdmits({ segments }, ctx({ segments: { shouldShow } }))).resolves.toBe(true);
    expect(shouldShow).toHaveBeenCalledWith('include', ['seg'], { pageUrl: 'app://product/42' });
    await expect(audienceAdmits({ segments }, ctx())).resolves.toBe(false);
    const failing = { shouldShow: jest.fn(async () => { throw new Error('offline'); }) };
    await expect(audienceAdmits({ segments }, ctx({ segments: failing }))).resolves.toBe(false);
  });
});

describe('ExperimentGate — audience-gated arms', () => {
  async function gate(assignments: ExperimentAssignment[]) {
    const experiments = new ExperimentGate();
    await experiments.load(async () => Object.fromEntries(assignments.map((a) => [a.experimentId, a])));
    return experiments;
  }

  const mobileOnly = { targeting: { device: { types: ['mobile'] } } };

  it('applies a gated arm on no screen it was not asked about — a strip or a track call fails closed', async () => {
    const experiments = await gate([arm('gated', { audience: mobileOnly }), arm('open')]);

    expect(experiments.forTarget('gated-campaign')).toBeNull();
    expect(experiments.configFor('gated-campaign')).toBeNull();
    expect(experiments.shouldRenderTarget('gated-other')).toBe(true);
    // The unconditional arm is untouched.
    expect(experiments.forTarget('open-campaign')?.variantId).toBe('open-b');
    expect(experiments.shouldRenderTarget('open-other')).toBe(false);
    // Listed for a host that reports its own funnels, with the audience on it.
    expect(experiments.list().map((a) => a.experimentId).sort()).toEqual(['gated', 'open']);
  });

  it('hands a screen that admits the visitor the arm, exclusions and all', async () => {
    const experiments = await gate([arm('gated', { audience: mobileOnly }), arm('open')]);

    const admitted = await experiments.forScreen(ctx());
    expect(admitted.forTarget('gated-campaign')?.variantId).toBe('gated-b');
    expect(admitted.shouldRenderTarget('gated-other')).toBe(false);
    expect(admitted.forTarget('open-campaign')?.variantId).toBe('open-b');

    const refused = await experiments.forScreen(ctx({ deviceType: 'tablet' }));
    expect(refused.forTarget('gated-campaign')).toBeNull();
    expect(refused.shouldRenderTarget('gated-other')).toBe(true);
    expect(refused.forTarget('open-campaign')?.variantId).toBe('open-b');
  });

  it('withholds a different_module swap and a holdout from a screen that does not admit', async () => {
    const experiments = await gate([
      arm('swap', {
        audience: mobileOnly,
        experimentMode: 'different_module',
        controlTargetId: 'swap-campaign',
        effectiveTargetId: 'swap-module',
        excludedTargetIds: ['swap-campaign'],
        moduleData: { id: 'swap-module', type: 'inline_banner' },
      }),
      arm('held', { audience: mobileOnly, holdout: true, config: null }),
    ]);
    const refused = await experiments.forScreen(ctx({ deviceType: 'tablet' }));
    expect(refused.variantModules()).toEqual([]);
    expect(refused.shouldRenderTarget('swap-campaign')).toBe(true);
    expect(refused.isHeldOut('held-campaign')).toBe(false);

    const admitted = await experiments.forScreen(ctx());
    expect(admitted.variantModules()).toHaveLength(1);
    expect(admitted.isHeldOut('held-campaign')).toBe(true);
  });
});
