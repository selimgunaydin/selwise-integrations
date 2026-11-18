import type { ExperimentAssignment } from './eligibility.js';
import {
  applyScreenSlotArms,
  screenSlotArmAt,
  screenSlotArmOf,
  screenSlotArmsOn,
  slotArmEnrichment,
  slotArmStrip,
  slotArmSurface,
} from './screen-slot.js';
import { normalizeSurface } from './surfaces.js';

const base = (config: unknown, extra: Partial<ExperimentAssignment> = {}): ExperimentAssignment => ({
  experimentId: 'e1',
  variantId: 'v1',
  targetType: 'screen_slot',
  config: config as Record<string, unknown>,
  ...extra,
});
const point = { screen: 'app://product', slot: 'pdp-under-info' };

describe('screenSlotArmOf', () => {
  it('reads a shown arm and the arm that shows nothing', () => {
    const shown = screenSlotArmOf(base({ ...point, module: { kind: 'campaign', id: 'c1' } }));
    expect(shown).toMatchObject({ ...point, module: { kind: 'campaign', id: 'c1' }, holdout: false });
    expect(screenSlotArmOf(base({ ...point, module: { kind: 'none' } }))).toMatchObject({ holdout: true });
    expect(screenSlotArmOf(base({ ...point, module: { kind: 'none' } }, { holdout: true }))!.holdout).toBe(true);
  });

  it('is not an arm for another experiment, a module with no id or an unknown kind', () => {
    expect(screenSlotArmOf({ ...base({}), targetType: 'campaign' })).toBeNull();
    expect(screenSlotArmOf(base({ ...point, module: { kind: 'campaign' } }))).toBeNull();
    expect(screenSlotArmOf(base({ ...point, module: { kind: 'banner', id: 'x' } }))).toBeNull();
    expect(screenSlotArmOf(base(null))).toBeNull();
  });

  it('spells the screen the way the catalogue does', () => {
    expect(screenSlotArmOf(base({ screen: 'APP://Product', slot: 'PDP-under-info', module: { kind: 'none' } }))).toMatchObject(point);
  });
});

describe('screenSlotArmAt / screenSlotArmsOn', () => {
  const list = [
    base({ ...point, module: { kind: 'recommendation', id: 's1' } }),
    base({ screen: 'app://home', slot: 'home-top', module: { kind: 'none' } }, { experimentId: 'e2' }),
  ];
  it('finds the arm of one point, case-insensitively, and none for any other', () => {
    expect(screenSlotArmAt(list, 'APP://product', 'pdp-under-info')!.experimentId).toBe('e1');
    expect(screenSlotArmAt(list, 'app://product', 'pdp-bottom')).toBeNull();
    expect(screenSlotArmAt(list, '', 'pdp-under-info')).toBeNull();
  });
  it('lists the arms that own a point on a screen', () => {
    expect(screenSlotArmsOn(list, 'app://home').map((arm) => arm.experimentId)).toEqual(['e2']);
    expect(screenSlotArmsOn(list, 'app://basket')).toEqual([]);
  });
});

describe('what each kind of arm draws', () => {
  it('reads the strip, the enrichment rule and (for a campaign) a surface placed at the point', () => {
    const strip = screenSlotArmOf(base({ ...point, module: { kind: 'recommendation', id: 's1' } }, { moduleData: { id: 's1', title: 'T' } }))!;
    expect(slotArmStrip(strip)).toMatchObject({ id: 's1', title: 'T' });
    // The `{ targetType, data }` wrapper is unwrapped as the browser widget does.
    const wrapped = screenSlotArmOf(base({ ...point, module: { kind: 'recommendation', id: 's1' } }, { moduleData: { data: { id: 's1', title: 'W' } } }))!;
    expect(slotArmStrip(wrapped)!.title).toBe('W');

    const rule = screenSlotArmOf(base({ ...point, module: { kind: 'enrichment', id: 'r1' } }, { moduleData: { id: 'r1', placementKey: ' pdp-specs ' } }))!;
    expect(slotArmEnrichment(rule)).toEqual({ id: 'r1', placementKey: 'pdp-specs' });
    expect(slotArmEnrichment(screenSlotArmOf(base({ ...point, module: { kind: 'enrichment', id: 'r1' } }))!)).toBeNull();
    expect(slotArmStrip(rule)).toBeNull();
  });

  const campaign = {
    id: 'c1',
    type: 'announcement_bar',
    contentJson: { text: 'Merhaba' },
    placementConfigJson: { position: 'top' },
    pageTargetingJson: { showOnAllPages: false, includeUrls: ['app://basket'], excludeUrls: [], device: { types: ['mobile'] } },
  };
  it('places a campaign arm at the point whatever its own placement says and drops the screens it was sent to', () => {
    const arm = screenSlotArmOf(base({ ...point, module: { kind: 'campaign', id: 'c1' } }, { moduleData: campaign }))!;
    const surface = slotArmSurface(arm)!;
    expect(surface.placement.slot).toBe('pdp-under-info');
    expect(surface.experiment).toEqual({ experimentId: 'e1', variantId: 'v1' });
    const targeting = surface.targeting as { showOnAllPages: boolean; includeUrls: string[]; device?: unknown };
    expect(targeting.showOnAllPages).toBe(true);
    expect(targeting.includeUrls).toEqual([]);
    // Its other rules stay the campaign's own.
    expect(targeting.device).toBeTruthy();
  });

  it('refuses a campaign that takes the whole screen', () => {
    const arm = screenSlotArmOf(base({ ...point, module: { kind: 'campaign', id: 'c1' } }, { moduleData: { ...campaign, type: 'sticky_footer' } }))!;
    expect(slotArmSurface(arm)).toBeNull();
  });
});

describe('applyScreenSlotArms', () => {
  const surface = (id: string, selector?: string) =>
    normalizeSurface(
      { id, type: 'announcement_bar', contentJson: { text: id }, placementConfigJson: selector ? { selector } : {}, pageTargetingJson: {} },
      'campaign'
    )!;
  const slotted = (id: string) => surface(id, '[data-selwise-slot="pdp-under-info"]');
  const arm = screenSlotArmOf(
    base({ ...point, module: { kind: 'campaign', id: 'c1' } }, { moduleData: { id: 'c1', type: 'announcement_bar', contentJson: { text: 'arm' } } })
  )!;

  it('leaves the list alone when no experiment owns a point', () => {
    const list = [surface('a'), slotted('b')];
    expect(applyScreenSlotArms(list, []).map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('withholds the native campaigns of the owned point only, and adds the arm’s once', () => {
    const list = [surface('a'), slotted('b'), slotted('c1')];
    const result = applyScreenSlotArms(list, [arm]);
    expect(result.map((s) => s.id)).toEqual(['a', 'c1']);
    // The campaign that was ALSO native at the point is the arm's.
    expect(result.find((s) => s.id === 'c1')!.experiment).toEqual({ experimentId: 'e1', variantId: 'v1' });
  });

  it('empties the point for the arm that shows nothing', () => {
    const none = screenSlotArmOf(base({ ...point, module: { kind: 'none' } }))!;
    expect(applyScreenSlotArms([surface('a'), slotted('b')], [none]).map((s) => s.id)).toEqual(['a']);
  });
});
