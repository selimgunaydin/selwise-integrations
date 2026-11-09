import fs from 'node:fs';
import path from 'node:path';

import { MemoryStorage } from './storage.js';
import {
  DismissalStore,
  normalizeSurface,
  normalizeSurfaces,
  resolveConflicts,
  resolveSurfaceContent,
  selectSurfaces,
  type Surface,
} from './surfaces.js';

/** A campaign exactly as `/config` returns one for a live merchant site. */
const ANNOUNCEMENT = {
  id: 'camp-1',
  type: 'announcement_bar',
  isTestMode: false,
  contentJson: { text: 'Sezon sonu', buttonText: 'Keşfet', buttonUrl: '/list/' },
  stylesJson: { backgroundColor: '#d3145a', fontSize: '13px' },
  placementConfigJson: { position: 'top', placementType: 'fixed' },
  pageTargetingJson: { showOnAllPages: true, includeUrls: [], excludeUrls: [] },
  segmentTargetingMode: 'all',
  segmentIds: [],
};

const EXIT_POPUP = {
  id: 'camp-2',
  type: 'exit_intent_popup',
  isTestMode: false,
  contentJson: { title: 'Gitmek zorunda değilsin' },
  placementConfigJson: {
    position: 'center',
    placementType: 'fixed',
    triggerStrategy: 'exit_intent',
    triggerDelaySeconds: 5,
    triggerScrollPercent: 50,
    triggerEventName: 'selwise:open-modal',
  },
  pageTargetingJson: { showOnAllPages: false, includeUrls: ['app://basket'], excludeUrls: [] },
};

describe('normalizeSurface', () => {
  it('keeps content, styles and placement as the host needs them', () => {
    const surface = normalizeSurface(ANNOUNCEMENT, 'campaign') as Surface;
    expect(surface.kind).toBe('campaign');
    expect(surface.type).toBe('announcement_bar');
    expect(surface.content.text).toBe('Sezon sonu');
    expect(surface.styles.backgroundColor).toBe('#d3145a');
    expect(surface.placement.position).toBe('top');
  });

  it('reads the trigger config the API nests inside placement', () => {
    const surface = normalizeSurface(EXIT_POPUP, 'campaign') as Surface;
    expect(surface.placement.triggerStrategy).toBe('exit_intent');
    expect(surface.placement.triggerDelaySeconds).toBe(5);
    expect(surface.placement.triggerEventName).toBe('selwise:open-modal');
  });

  it('falls back to immediate for a strategy it does not know', () => {
    const surface = normalizeSurface(
      { ...ANNOUNCEMENT, placementConfigJson: { triggerStrategy: 'telepathy' } },
      'campaign'
    ) as Surface;
    expect(surface.placement.triggerStrategy).toBe('immediate');
  });

  it('falls back to exit intent for a popup, as the browser widget does', () => {
    const surface = normalizeSurface(
      { ...EXIT_POPUP, placementConfigJson: { triggerStrategy: 'telepathy' } },
      'campaign'
    ) as Surface;
    expect(surface.placement.triggerStrategy).toBe('exit_intent');
  });

  // The dashboard stores `MODAL_TRIGGER_STRATEGIES`; every one of them used to
  // arrive here as `immediate`, so a delayed or event-driven popup opened at once.
  it.each([
    ['page_load', 'immediate'],
    ['time_delay', 'delay'],
    ['scroll_depth', 'scroll'],
    ['custom_event', 'event'],
    ['exit_intent', 'exit_intent'],
  ])('reads the dashboard trigger %s as %s', (stored, expected) => {
    const surface = normalizeSurface(
      {
        ...EXIT_POPUP,
        placementConfigJson: { ...EXIT_POPUP.placementConfigJson, triggerStrategy: stored },
      },
      'campaign'
    ) as Surface;
    expect(surface.placement.triggerStrategy).toBe(expected);
  });

  it("fills a popup's blank trigger fields with the browser widget's defaults", () => {
    const surface = normalizeSurface(
      { ...EXIT_POPUP, placementConfigJson: { triggerStrategy: 'custom_event' } },
      'campaign'
    ) as Surface;
    expect(surface.placement.triggerStrategy).toBe('event');
    expect(surface.placement.triggerEventName).toBe('selwise:open-modal');
    expect(surface.placement.triggerDelaySeconds).toBe(5);
    expect(surface.placement.triggerScrollPercent).toBe(50);
  });

  it('drops an entry with no id or type rather than rendering a blank', () => {
    expect(normalizeSurface({ type: 'announcement_bar' }, 'campaign')).toBeNull();
    expect(normalizeSurface({ id: 'x' }, 'campaign')).toBeNull();
    expect(normalizeSurface(null, 'campaign')).toBeNull();
  });

  it('reads every surface out of the campaigns key', () => {
    const surfaces = normalizeSurfaces({ campaigns: [ANNOUNCEMENT, EXIT_POPUP] });
    expect(surfaces.map((s) => s.kind)).toEqual(['campaign', 'campaign']);
  });

  it('ignores the deprecated widgets key rather than double-counting it', () => {
    // Widgets merged into campaigns in September 2026 and the bootstrap still
    // sends the key, always empty, for CDN-cached clients. An SDK that also
    // mapped it would draw the same surface twice the day the API stopped
    // emptying it.
    const surfaces = normalizeSurfaces({ campaigns: [ANNOUNCEMENT], widgets: [EXIT_POPUP] });
    expect(surfaces.map((s) => s.id)).toEqual(['camp-1']);
  });

  it('tolerates a config with neither key', () => {
    expect(normalizeSurfaces({})).toEqual([]);
    expect(normalizeSurfaces(null)).toEqual([]);
  });
});

describe('selectSurfaces', () => {
  const surfaces = normalizeSurfaces({ campaigns: [ANNOUNCEMENT, EXIT_POPUP] });

  it('applies page targeting to the synthetic screen url', () => {
    const onHome = selectSurfaces(surfaces, { pageUrl: 'app://home' });
    expect(onHome.map((s) => s.id)).toEqual(['camp-1']);

    const onBasket = selectSurfaces(surfaces, { pageUrl: 'app://basket' });
    expect(onBasket.map((s) => s.id).sort()).toEqual(['camp-1', 'camp-2']);
  });

  it('hides a dismissed surface', () => {
    const result = selectSurfaces(surfaces, { pageUrl: 'app://home', dismissedIds: ['camp-1'] });
    expect(result).toEqual([]);
  });

  // Test mode is a gate, not an extra: getting it backwards puts a merchant's
  // unfinished campaign in front of every visitor.
  it('shows test-mode entities only in test mode, and nothing else', () => {
    const mixed = normalizeSurfaces({
      campaigns: [ANNOUNCEMENT, { ...ANNOUNCEMENT, id: 'camp-test', isTestMode: true }],
    });

    expect(selectSurfaces(mixed, { pageUrl: 'app://home' }).map((s) => s.id)).toEqual(['camp-1']);
    expect(
      selectSurfaces(mixed, { pageUrl: 'app://home', testMode: true }).map((s) => s.id)
    ).toEqual(['camp-test']);
  });

  it('respects device targeting, defaulting the app to mobile', () => {
    const desktopOnly = normalizeSurfaces({
      campaigns: [
        {
          ...ANNOUNCEMENT,
          pageTargetingJson: {
            showOnAllPages: true,
            includeUrls: [],
            excludeUrls: [],
            device: { types: ['desktop'] },
          },
        },
      ],
    });

    expect(selectSurfaces(desktopOnly, { pageUrl: 'app://home', deviceType: 'mobile' })).toEqual([]);
    expect(
      selectSurfaces(desktopOnly, { pageUrl: 'app://home', deviceType: 'desktop' }).length
    ).toBe(1);
  });
});

describe('DismissalStore', () => {
  it('remembers a dismissal across a restart', async () => {
    const storage = new MemoryStorage();

    const first = new DismissalStore(storage);
    await first.hydrate();
    await first.dismiss('camp-1');

    const second = new DismissalStore(storage);
    await second.hydrate();
    expect(second.has('camp-1')).toBe(true);
  });

  it('survives a corrupt stored value instead of failing every launch', async () => {
    const storage = new MemoryStorage();
    await storage.setItem('selwise_dismissed', '{not json');

    const store = new DismissalStore(storage);
    await store.hydrate();
    expect(store.list()).toEqual([]);
  });

  it('clears on request, for a merchant testing their own app', async () => {
    const storage = new MemoryStorage();
    const store = new DismissalStore(storage);
    await store.hydrate();
    await store.dismiss('a');
    await store.clear();
    expect(store.list()).toEqual([]);
  });
  it('forgets a session-scoped close when the session changes, and never persists it', async () => {
    const storage = new MemoryStorage();
    let session = 's1';
    const store = new DismissalStore(storage, () => session);
    await store.hydrate();
    await store.dismiss('goal-bar', 'session');
    await store.dismiss('popup');
    expect(store.list().sort()).toEqual(['goal-bar', 'popup']);
    expect(await storage.getItem('selwise_dismissed')).toBe(JSON.stringify(['popup']));

    session = 's2';
    expect(store.list()).toEqual(['popup']);
    expect(store.has('goal-bar')).toBe(false);
  });
});

describe('surface event names match the browser widget', () => {
  // The browser widget sends `impression` / `click` with
  // `entityType: 'campaign'`. The same campaign reported on two
  // surfaces has to add up in one report — and `widget_click`, the name that
  // reads better, is not in CANONICAL_EVENTS, so the pipeline would have
  // dropped it silently.
  function canonicalEvents(): string[] {
    const source = fs.readFileSync(
      path.join(__dirname, '../../../tracking-contract/src/configs.ts'),
      'utf8'
    );
    const list = source.slice(source.indexOf('CANONICAL_EVENTS'));
    return [...list.matchAll(/^ {2}'([a-z_]+)',/gm)].map((match) => match[1] as string);
  }

  function surfaceEventNames(): string[] {
    const source = fs.readFileSync(path.join(__dirname, '../client.ts'), 'utf8');
    // Exactly the three surface-interaction methods: `subscribeNewsletter`
    // sits after them and sends its own (canonical) `user_signup`.
    const section = source.slice(
      source.indexOf('trackSurfaceView'),
      source.indexOf('subscribeNewsletter')
    );
    return [
      ...new Set([...section.matchAll(/this\.track\('([a-z_]+)'/g)].map((m) => m[1] as string)),
    ];
  }

  it('only uses canonical event names', () => {
    const canonical = canonicalEvents();
    const used = surfaceEventNames();
    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((name) => !canonical.includes(name))).toEqual([]);
  });

  it('uses the same names the browser widget uses', () => {
    expect(surfaceEventNames().sort()).toEqual(['click', 'close', 'impression']);
  });
});

describe('normalizeSurface: the fields the app used to drop', () => {
  // `placementConfigJson.frequencyCap` is the merchant's "once per session"
  // rule. Dropped here, a capped popup reappeared on every navigation.
  it('keeps the frequency cap, with only the keys the store enforces', () => {
    const surface = normalizeSurface(
      {
        ...EXIT_POPUP,
        placementConfigJson: {
          ...EXIT_POPUP.placementConfigJson,
          frequencyCap: { perSession: 1, perDay: '3', minInterval: ' 30m ', nonsense: 5 },
        },
      },
      'campaign'
    ) as Surface;

    expect(surface.placement.frequencyCap).toEqual({
      perSession: 1,
      perDay: 3,
      minInterval: '30m',
    });
  });

  it('leaves the cap null when the merchant set none', () => {
    const surface = normalizeSurface(ANNOUNCEMENT, 'campaign') as Surface;
    expect(surface.placement.frequencyCap).toBeNull();
  });

  it('reads the conflict behaviour and priority', () => {
    const surface = normalizeSurface(
      {
        ...ANNOUNCEMENT,
        placementConfigJson: {
          position: 'top',
          conflictResolution: { behavior: 'highest_priority', priority: 7 },
        },
      },
      'campaign'
    ) as Surface;

    expect(surface.placement.conflictBehavior).toBe('highest_priority');
    expect(surface.placement.priority).toBe(7);
  });

  // The dashboard's own "Custom CSS" / "Custom JS" fields are columns of their
  // own, not part of contentJson. Dropping them rendered an empty box in the
  // app for a custom widget that worked on the web.
  it('keeps the entity-level custom code', () => {
    const surface = normalizeSurface(
      { ...ANNOUNCEMENT, customCss: '.a{color:red}', customJs: 'console.log(1)' },
      'campaign'
    ) as Surface;

    expect(surface.customCss).toBe('.a{color:red}');
    expect(surface.customJs).toBe('console.log(1)');
  });

  it('keeps the raw placement so an experiment override can be re-normalized', () => {
    const surface = normalizeSurface(ANNOUNCEMENT, 'campaign') as Surface;
    expect(surface.rawPlacement).toEqual({ position: 'top', placementType: 'fixed' });
    expect(surface.experiment).toBeNull();
  });
});

describe('resolveConflicts', () => {
  const at = (id: string, position: string, extra: Record<string, unknown> = {}) =>
    normalizeSurface(
      {
        id,
        type: 'announcement_bar',
        contentJson: { text: id },
        placementConfigJson: { position, placementType: 'fixed', ...extra },
      },
      'campaign'
    ) as Surface;

  it('leaves surfaces in different docks alone', () => {
    const kept = resolveConflicts([at('a', 'top'), at('b', 'bottom')]);
    expect(kept.map((s) => s.id)).toEqual(['a', 'b']);
  });

  // Two bars pinned to `top` overlap; two popups open at once. In an app this
  // is worse than on the web, not milder.
  it('keeps the highest priority when two want the same dock', () => {
    const kept = resolveConflicts([
      at('a', 'top', { conflictResolution: { priority: 1 } }),
      at('b', 'top', { conflictResolution: { priority: 5 } }),
    ]);
    expect(kept.map((s) => s.id)).toEqual(['b']);
  });

  it('breaks a priority tie by id, so the choice is stable across launches', () => {
    const kept = resolveConflicts([at('b', 'top'), at('a', 'top')]);
    expect(kept.map((s) => s.id)).toEqual(['a']);
  });

  it('shows the whole group when any member asks for "all"', () => {
    const kept = resolveConflicts([
      at('a', 'top', { conflictResolution: { behavior: 'all' } }),
      at('b', 'top', { conflictResolution: { priority: 9 } }),
    ]);
    expect(kept.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('picks one when every member asks for "random"', () => {
    const group = [
      at('a', 'top', { conflictResolution: { behavior: 'random' } }),
      at('b', 'top', { conflictResolution: { behavior: 'random' } }),
    ];
    expect(resolveConflicts(group, () => 0).map((s) => s.id)).toEqual(['a']);
    expect(resolveConflicts(group, () => 0.99).map((s) => s.id)).toEqual(['b']);
  });

  // A selector has no rendered position in an app, so it competes with nothing
  // rather than colliding with everything that shares an empty position.
  it('does not group selector-placed surfaces together', () => {
    const kept = resolveConflicts([
      normalizeSurface(
        { id: 'a', type: 'custom', contentJson: { html: '<p>a</p>' },
          placementConfigJson: { placementType: 'selector', selector: '#a' } },
        'campaign'
      ) as Surface,
      normalizeSurface(
        { id: 'b', type: 'custom', contentJson: { html: '<p>b</p>' },
          placementConfigJson: { placementType: 'selector', selector: '#b' } },
        'campaign'
      ) as Surface,
    ]);
    expect(kept.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('preserves input order, since the host stacks what it is handed', () => {
    const kept = resolveConflicts([at('z', 'top'), at('m', 'bottom'), at('a', 'center')]);
    expect(kept.map((s) => s.id)).toEqual(['z', 'm', 'a']);
  });
});

describe('resolveSurfaceContent', () => {
  const UNKNOWN = { known: false, total: 0, itemCount: 0, currency: null };
  const CART = { known: true, total: 640, itemCount: 3, currency: 'TRY' };

  function campaign(type: string, contentJson: Record<string, unknown>): Surface {
    return normalizeSurface({ id: 'camp-s', type, contentJson }, 'campaign') as Surface;
  }

  const WITH_STATES = campaign('announcement_bar', {
    text: 'Sezon sonu',
    states: [
      {
        id: 'big-basket',
        name: 'Büyük sepet',
        when: { match: 'all', rules: [{ signal: 'cartValue', op: 'gte', value: 500 }] },
        content: { text: 'Kargo bizden' },
      },
      {
        id: 'night',
        when: { match: 'all', rules: [{ signal: 'hourOfDay', op: 'gte', value: 22 }] },
        hide: true,
      },
    ],
  });

  it('starts every surface on the base content', () => {
    expect(normalizeSurface(ANNOUNCEMENT, 'campaign')?.stateId).toBeNull();
  });

  it('applies the first matching state and names it', () => {
    const shaped = resolveSurfaceContent(WITH_STATES, {
      behavior: { cartValue: 640 },
      cart: CART,
      format: {},
    });
    expect(shaped?.content).toEqual({ text: 'Kargo bizden' });
    expect(shaped?.stateId).toBe('big-basket');
  });

  it('keeps the base content, without its states, when no state matches', () => {
    const shaped = resolveSurfaceContent(WITH_STATES, { behavior: {}, cart: UNKNOWN, format: {} });
    expect(shaped?.content).toEqual({ text: 'Sezon sonu' });
    expect(shaped?.stateId).toBeNull();
  });

  // It was not shown, so it must not take a dock or spend an allowance.
  it('drops a surface whose state hides it', () => {
    expect(
      resolveSurfaceContent(WITH_STATES, { behavior: { hourOfDay: 23 }, cart: UNKNOWN, format: {} })
    ).toBeNull();
  });

  it('fills campaign placeholders from a measured cart', () => {
    const shaped = resolveSurfaceContent(
      campaign('announcement_bar', { text: 'Sepetinde {cart.itemCount} ürün var', buttonText: 'Sepete git' }),
      { behavior: undefined, cart: CART, format: { locale: 'tr-TR' } }
    );
    expect(shaped?.content.text).toBe('Sepetinde 3 ürün var');
    expect(shaped?.content.buttonText).toBe('Sepete git');
  });

  // Never hand a host raw braces to print.
  it('drops a surface whose placeholder cannot be said', () => {
    const total = campaign('announcement_bar', { text: '{cart.total} seni bekliyor' });
    expect(resolveSurfaceContent(total, { behavior: undefined, cart: UNKNOWN, format: {} })).toBeNull();
    // Money with no currency on the basket or the channel is no value either.
    expect(
      resolveSurfaceContent(total, {
        behavior: undefined,
        cart: { ...CART, currency: null },
        format: { currency: null },
      })
    ).toBeNull();
    expect(
      resolveSurfaceContent(total, {
        behavior: undefined,
        cart: { ...CART, currency: null },
        format: { currency: 'TRY', locale: 'tr-TR' },
      })?.content.text
    ).toMatch(/640/);
  });

  it('leaves a name outside the catalogue as typed', () => {
    const shaped = resolveSurfaceContent(campaign('announcement_bar', { text: '{yeni sezon} {count}' }), {
      behavior: undefined,
      cart: UNKNOWN,
      format: {},
    });
    expect(shaped?.content.text).toBe('{yeni sezon} {count}');
  });

  it('fills product placeholders from the product on screen', () => {
    const shaped = resolveSurfaceContent(
      campaign('inline_banner', { title: '{product.title}', text: '{product.discountRate} indirim' }),
      {
        behavior: undefined,
        cart: UNKNOWN,
        product: { known: true, title: 'Ruj', price: 75, originalPrice: 100, currency: 'TRY' },
        format: { locale: 'tr-TR' },
      }
    );
    expect(shaped?.content).toEqual({ title: 'Ruj', text: '%25 indirim' });
  });

  it('drops a surface that says the product on a screen without one', () => {
    const banner = campaign('inline_banner', { text: '{product.title} sepetinde' });
    expect(resolveSurfaceContent(banner, { behavior: undefined, cart: CART, format: {} })).toBeNull();
    expect(
      resolveSurfaceContent(banner, { behavior: undefined, cart: CART, product: { known: false }, format: {} })
    ).toBeNull();
  });

  it('lets a state that cannot be said yield to the base', () => {
    const banner = campaign('announcement_bar', {
      text: 'Kargo bizden',
      states: [
        {
          id: 'basket',
          when: { match: 'all', rules: [{ signal: 'cartValue', op: 'gte', value: 500 }] },
          content: { text: 'Sepetin {cart.total}' },
        },
      ],
    });
    // The rule matches on the targeting signal, but the cart is not MEASURED.
    const shaped = resolveSurfaceContent(banner, { behavior: { cartValue: 640 }, cart: UNKNOWN, format: {} });
    expect(shaped?.content).toEqual({ text: 'Kargo bizden' });
    expect(shaped?.stateId).toBeNull();
  });

  // The goal bar fills its own sentences, from its own list, in resolveGoalBar.
  it('does not touch a goal bar', () => {
    const bar = campaign('goal_bar', {
      metric: 'cart_total',
      thresholds: [{ at: 750, label: 'Ücretsiz kargo' }],
      text: '{goal.remaining} kaldı, sepetin {cart.total}',
    });
    expect(resolveSurfaceContent(bar, { behavior: undefined, cart: UNKNOWN, format: {} })).toBe(bar);
  });
});
