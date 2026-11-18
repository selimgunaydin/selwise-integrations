import { createElement as h } from 'react';
import { act } from 'react-test-renderer';
import { appSlotSelector } from '../vendor/app-surfaces.js';
import { SelwiseSlot } from './SelwiseSlot.js';
import { SelwiseSurfaces } from './SelwiseSurfaces.js';
import {
  campaign,
  el,
  eventsOf,
  flatStyle,
  goTo,
  mount,
  recordingHost,
  resetWorld,
  settle,
  startClient,
  teardown,
  textOf,
  texts,
  world,
} from './test/campaign-harness.js';
import { controls } from './test/react-native.mock.js';

/**
 * Where each type is drawn (`APP_WIDGET_PLACEMENT`, K8): the dock, the four
 * corners, the three slide-in edges, the window, and the named point — and that
 * a point nobody mounted draws nothing.
 */

beforeEach(resetWorld);
afterEach(teardown);

const INSETS = { top: 40, bottom: 20, left: 0, right: 0 };

async function draw(items: unknown[], extra?: { screen?: string; pageType?: string; children?: unknown[]; cartCount?: number; product?: boolean }) {
  world.campaigns = items;
  world.metrics = { view: extra?.cartCount ?? 0, cart: extra?.cartCount ?? 0 };
  const client = await startClient();
  if (extra?.product) client.setProduct({ itemCode: 'P1' });
  const { host } = recordingHost({ safeAreaInsets: INSETS });
  const renderer = await mount(
    client,
    host,
    h(SelwiseSurfaces),
    ...((extra?.children ?? []) as never[])
  );
  await goTo(client, extra?.screen ?? 'app://home', { pageType: extra?.pageType ?? 'home' });
  await settle();
  return { client, renderer };
}

describe('the dock', () => {
  it('pins a bar to the bottom and a bar to the top, each inside its own safe area', async () => {
    const { renderer } = await draw([
      campaign('top', 'announcement_bar', { content: { text: 'Üst' }, placement: { position: 'top' } }),
      campaign('bot', 'announcement_bar', { content: { text: 'Alt' }, placement: { position: 'bottom' } }),
    ]);
    const docks = renderer.root.findAllByType(el('View')).filter((node) => node.props.pointerEvents === 'box-none');
    expect(docks).toHaveLength(2);
    expect(flatStyle(docks[0]!)).toMatchObject({ top: 0, paddingTop: 40 });
    expect(flatStyle(docks[1]!)).toMatchObject({ bottom: 0, paddingBottom: 20 });
    expect(textOf(docks[0]!)).toContain('Üst');
    expect(textOf(docks[1]!)).toContain('Alt');
  });

  it('reads a position the type does not offer as the type’s own (a website’s corner on a newsletter is the centre)', async () => {
    const { renderer } = await draw([
      campaign('nl', 'newsletter', { content: { headline: 'Merhaba', buttonText: 'Tamam' }, placement: { position: 'bottom-right' } }),
    ]);
    expect(renderer.root.findAllByType(el('Modal'))).toHaveLength(1);
    const root = renderer.root.findAllByType(el('View')).find((node) => flatStyle(node)['justifyContent'] === 'center' && flatStyle(node)['flex'] === 1);
    expect(root).toBeDefined();
  });
});

describe('the floating button in its four corners', () => {
  const corners: Array<[string, Record<string, unknown>]> = [
    ['bottom-right', { right: 20, bottom: 50 }],
    ['bottom-left', { left: 20, bottom: 50 }],
    ['top-right', { right: 20, top: 70 }],
    ['top-left', { left: 20, top: 70 }],
  ];

  it.each(corners)('puts %s at the merchant’s offsets, plus the safe area on its own side', async (corner, expected) => {
    const { renderer } = await draw([
      campaign('fb', 'floating_button', {
        content: { text: 'Yardım' },
        styles: { offsetX: '20px', offsetY: '30px' },
        placement: { position: corner },
      }),
    ]);
    const holder = renderer.root.findAllByType(el('View')).find((node) => flatStyle(node)['position'] === 'absolute' && 'zIndex' in flatStyle(node));
    expect(flatStyle(holder!)).toMatchObject(expected);
  });

  it('reads the website’s plain top, bottom, left and right as the corner they were drawn in', async () => {
    const { renderer } = await draw([campaign('fb', 'floating_button', { content: { text: 'a' }, placement: { position: 'left' } })]);
    const holder = renderer.root.findAllByType(el('View')).find((node) => flatStyle(node)['position'] === 'absolute' && 'zIndex' in flatStyle(node));
    expect(flatStyle(holder!)).toMatchObject({ left: 16, bottom: 36 });
  });
});

describe('the slide-in', () => {
  const edges: Array<[string, number, string]> = [
    ['right', 390, 'translateX'],
    ['left', -390, 'translateX'],
    ['bottom', 844, 'translateY'],
  ];

  it.each(edges)('slides in from the %s, over a screen that stays the visitor’s (no window, no scrim)', async (position, from, axis) => {
    const { renderer } = await draw([
      campaign('si', 'slide_in', { content: { title: 'Merhaba', text: 'Fırsat' }, placement: { position } }),
    ]);
    expect(renderer.root.findAllByType(el('Modal'))).toHaveLength(0);
    expect(controls.animations).toContainEqual({ from: 0, to: 1, duration: 300 });
    const card = renderer.root.findAllByType(el('Animated.View')).find((node) => flatStyle(node)['position'] === 'absolute')!;
    const transform = (flatStyle(card)['transform'] as Array<Record<string, { __interpolated: { outputRange: number[] } }>>)[0]!;
    expect(transform[axis]!.__interpolated.outputRange).toEqual([from, 0]);
    expect(flatStyle(card)).toMatchObject(position === 'right' ? { right: 16 } : position === 'left' ? { left: 16 } : { left: 16, right: 16 });
    expect(texts(renderer)).toEqual(expect.arrayContaining(['Merhaba', 'Fırsat']));
  });
});

describe('the popup and the newsletter window', () => {
  it('centres an exit-intent popup, and rises one the merchant put at the bottom from the edge', async () => {
    const centred = await draw([campaign('p1', 'exit_intent_popup', { content: { title: 'Gitme' }, placement: { position: 'center', triggerStrategy: 'page_load' } })]);
    const centredRoot = centred.renderer.root.findAllByType(el('View')).find((node) => flatStyle(node)['flex'] === 1)!;
    expect(flatStyle(centredRoot)).toMatchObject({ justifyContent: 'center' });
    await teardown();

    resetWorld();
    const bottom = await draw([campaign('p2', 'exit_intent_popup', { content: { title: 'Gitme' }, placement: { position: 'bottom', triggerStrategy: 'page_load' } })]);
    const bottomRoot = bottom.renderer.root.findAllByType(el('View')).find((node) => flatStyle(node)['flex'] === 1)!;
    expect(flatStyle(bottomRoot)).toMatchObject({ justifyContent: 'flex-end', paddingBottom: 40 });
    // It rises: the bottom edge is where it comes from.
    expect(controls.animations.length).toBeGreaterThan(0);
  });

  it('rises a newsletter the merchant put at the bottom from the edge, and centres one at the centre', async () => {
    const bottom = await draw([campaign('n1', 'newsletter', { content: { headline: 'Bülten', buttonText: 'Katıl' }, placement: { position: 'bottom' } })]);
    const root = bottom.renderer.root.findAllByType(el('View')).find((node) => flatStyle(node)['flex'] === 1)!;
    expect(flatStyle(root)).toMatchObject({ justifyContent: 'flex-end' });
    expect(controls.animations).toContainEqual({ from: 0, to: 1, duration: 300 });
    await teardown();

    resetWorld();
    const centre = await draw([campaign('n2', 'newsletter', { content: { headline: 'Bülten', buttonText: 'Katıl' }, placement: { position: 'center' } })]);
    const centred = centre.renderer.root.findAllByType(el('View')).find((node) => flatStyle(node)['flex'] === 1)!;
    expect(flatStyle(centred)).toMatchObject({ justifyContent: 'center' });
  });

  it('scales a popup in by default and not at all when the merchant chose none', async () => {
    await draw([campaign('p3', 'exit_intent_popup', { content: { title: 'a' }, placement: { triggerStrategy: 'page_load' } })]);
    expect(controls.animations).toHaveLength(1);
    controls.reset();
    await teardown();

    resetWorld();
    await draw([campaign('p4', 'exit_intent_popup', { content: { title: 'a' }, styles: { animation: 'none' }, placement: { triggerStrategy: 'page_load' } })]);
    expect(controls.animations).toHaveLength(0);
  });
});

describe('the named point', () => {
  const PRODUCT = 'app://product';
  const bar = (slot: string) =>
    campaign('bar-s', 'announcement_bar', {
      content: { text: 'Ürün sayfası çubuğu' },
      placement: { position: 'top', selector: appSlotSelector(slot) },
      targeting: { showOnAllPages: false, includeUrls: [PRODUCT], excludeUrls: [] },
    });

  const slotNode = (slot: string) => h(SelwiseSlot, { screen: PRODUCT, slot, context: { currentProductId: 'P1' } });

  it('draws a campaign in the point the merchant picked, and not in the dock', async () => {
    const { renderer } = await draw([bar('pdp-under-info')], { screen: PRODUCT, pageType: 'product', children: [slotNode('pdp-under-info')] });
    expect(texts(renderer)).toContain('Ürün sayfası çubuğu');
    // The overlay draws nothing of its own: no dock holds the bar.
    expect(renderer.root.findAllByType(el('View')).filter((node) => node.props.pointerEvents === 'box-none' && flatStyle(node)['top'] === 0)).toHaveLength(0);
  });

  it('draws nothing — not a dock, not an impression — when the app never mounted that point', async () => {
    const { renderer, client } = await draw([bar('pdp-under-info')], { screen: PRODUCT, pageType: 'product' });
    expect(texts(renderer)).toEqual([]);
    await client.flush();
    expect(eventsOf('impression')).toHaveLength(0);
  });

  it('draws it in the point it was sent to and not in another point of the same screen', async () => {
    const { renderer } = await draw([bar('pdp-bottom')], { screen: PRODUCT, pageType: 'product', children: [slotNode('pdp-under-info')] });
    expect(texts(renderer)).toEqual([]);
  });

  it('does not draw a point’s campaign on another screen that stays mounted behind it', async () => {
    // The product screen's point is mounted behind the home screen the shopper is on.
    const item = campaign('bar-all', 'announcement_bar', {
      content: { text: 'Her yerde' },
      placement: { selector: appSlotSelector('pdp-under-info') },
    });
    const { renderer } = await draw([item], { screen: 'app://home', pageType: 'home', children: [slotNode('pdp-under-info')] });
    expect(texts(renderer)).toEqual([]);
  });

  it('reads a counter as a campaign that needs a point: its default one when none was named', async () => {
    const counter = campaign('cc', 'cart_count', { content: { showIcon: false }, styles: { animateCounter: false } });
    const mounted = await draw([counter], { screen: PRODUCT, pageType: 'product', children: [slotNode('pdp-under-info')], cartCount: 7, product: true });
    expect(texts(mounted.renderer)).toContain('7');
    await teardown();

    resetWorld();
    const unmounted = await draw([counter], { screen: PRODUCT, pageType: 'product', cartCount: 7, product: true });
    expect(texts(unmounted.renderer)).toEqual([]);
  });

  it('draws an inline newsletter as a card in the point: no window, and no trigger to wait for', async () => {
    const newsletter = campaign('nl-slot', 'newsletter', {
      content: { headline: 'Bülten', buttonText: 'Katıl' },
      placement: { selector: appSlotSelector('pdp-under-info'), triggerStrategy: 'time_delay', triggerDelaySeconds: 30 },
      targeting: { showOnAllPages: false, includeUrls: [PRODUCT], excludeUrls: [] },
    });
    const { renderer } = await draw([newsletter], { screen: PRODUCT, pageType: 'product', children: [slotNode('pdp-under-info')] });
    expect(renderer.root.findAllByType(el('Modal'))).toHaveLength(0);
    expect(texts(renderer)).toEqual(expect.arrayContaining(['Bülten', 'Katıl']));
  });

  it('counts the impression only once the point is on the screen for a second, on the visible basis', async () => {
    jest.useFakeTimers();
    const { client } = await draw([bar('pdp-under-info')], { screen: PRODUCT, pageType: 'product', children: [slotNode('pdp-under-info')] });
    await client.flush();
    expect(eventsOf('impression')).toHaveLength(0);

    await act(async () => {
      jest.advanceTimersByTime(1500);
    });
    await client.flush();
    expect(eventsOf('impression')).toHaveLength(1);
    expect(eventsOf('impression')[0]).toMatchObject({ entityId: 'bar-s', metadata: { impressionBasis: 'visible' } });
  });
});

describe('the impression basis', () => {
  it('says a surface was counted when seen, not when fetched', async () => {
    const { client } = await draw([campaign('b', 'announcement_bar', { content: { text: 'Merhaba' } })]);
    await client.flush();
    expect(eventsOf('impression')[0]).toMatchObject({ entityType: 'campaign', entityId: 'b', metadata: { surfaceType: 'announcement_bar', impressionBasis: 'visible' } });
  });

  it('counts nothing while the app is in the background, and counts it on the way back', async () => {
    controls.appState = 'background';
    const { client } = await draw([campaign('b', 'announcement_bar', { content: { text: 'Merhaba' } })]);
    await client.flush();
    expect(eventsOf('impression')).toHaveLength(0);

    await act(async () => controls.emitAppState('active'));
    await client.flush();
    expect(eventsOf('impression')).toHaveLength(1);
  });
});
