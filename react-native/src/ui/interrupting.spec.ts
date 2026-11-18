import { createElement as h } from 'react';
import { act } from 'react-test-renderer';
import { SelwiseSlot } from './SelwiseSlot.js';
import type { Surface } from '../core/surfaces.js';
import { settleScreenInterrupting } from './interrupting.js';
import { bottomReserve } from './placement.js';
import { SelwiseSurfaces } from './SelwiseSurfaces.js';
import { campaign, el, flatStyle, goTo, mount, press, recordingHost, resetWorld, settle, startClient, teardown, texts, world } from './test/campaign-harness.js';

/**
 * One interrupting surface open on a screen at a time — the widget's rule
 * (`settleInterrupting`). Conflict resolution is per position, so without this
 * rule a newsletter (centre) and a slide-in (bottom, right) would open together.
 */

const surface = (id: string, type: string, priority = 0, extra: Record<string, unknown> = {}) =>
  ({ id, type, placement: { priority, slot: null, position: '', placementType: 'fixed', ...extra }, content: {} }) as unknown as Surface;

describe('settleScreenInterrupting', () => {
  it('passes everything through when nothing interrupts', () => {
    const ready = [surface('bar', 'announcement_bar'), surface('fb', 'floating_button')];
    expect(settleScreenInterrupting(ready, null)).toEqual({ drawn: ready, waiting: [], openId: null });
  });

  it('opens the highest-priority interrupting surface, keeps the bars, and makes the rest wait', () => {
    const bar = surface('bar', 'announcement_bar');
    const news = surface('news', 'newsletter', 1);
    const slide = surface('slide', 'slide_in', 5);
    const settled = settleScreenInterrupting([bar, news, slide], null);
    expect(settled.openId).toBe('slide');
    expect(settled.drawn).toEqual([bar, slide]);
    expect(settled.waiting).toEqual([news]);
  });

  it('keeps the one that is open, whatever becomes ready later', () => {
    const news = surface('news', 'newsletter', 1);
    const slide = surface('slide', 'slide_in', 9);
    const settled = settleScreenInterrupting([news, slide], 'news');
    expect(settled.openId).toBe('news');
    expect(settled.waiting).toEqual([slide]);
  });

  it('opens the next when the open one is gone', () => {
    const slide = surface('slide', 'slide_in', 9);
    expect(settleScreenInterrupting([slide], 'news').openId).toBe('slide');
  });

  it('does not count a newsletter drawn in a point of the screen: it sits in the flow and interrupts nothing', () => {
    const inline = surface('inline', 'newsletter', 0, { slot: 'pdp-under-info' });
    const slide = surface('slide', 'slide_in');
    const settled = settleScreenInterrupting([inline, slide], null);
    expect(settled.drawn).toEqual([inline, slide]);
    expect(settled.waiting).toEqual([]);
  });
});

describe('bottomReserve', () => {
  it('is the safe area with no dock, and the whole dock when one is there', () => {
    expect(bottomReserve(20, 0, false)).toBe(20);
    expect(bottomReserve(20, 76, true)).toBe(76);
    // A stale measurement of a bar that left lifts nothing.
    expect(bottomReserve(20, 76, false)).toBe(20);
    expect(bottomReserve(34, 10, true)).toBe(34);
  });
});

describe('the overlay', () => {
  beforeEach(resetWorld);
  afterEach(teardown);

  const NOW = { triggerStrategy: 'page_load' };
  const newsletter = campaign('news', 'newsletter', { content: { headline: 'Bülten', buttonText: 'Katıl' }, placement: { position: 'center', ...NOW } });
  const slide = campaign('slide', 'slide_in', { content: { title: 'Fırsat' }, placement: { position: 'right', ...NOW } });

  async function draw(items: unknown[]) {
    world.campaigns = items;
    const client = await startClient();
    const renderer = await mount(client, recordingHost().host, h(SelwiseSurfaces));
    await goTo(client, 'app://home', { pageType: 'home' });
    await settle();
    return { client, renderer };
  }

  it('draws the newsletter and the slide-in one at a time, and says why the other waits', async () => {
    const { client, renderer } = await draw([newsletter, slide]);
    // Equal priority: the id breaks the tie, as in conflict resolution.
    expect(texts(renderer)).toContain('Bülten');
    expect(texts(renderer)).not.toContain('Fırsat');
    expect(client.explain()).toEqual([
      expect.objectContaining({ id: 'slide', reason: 'conflict', detail: expect.objectContaining({ cause: 'interrupting_open', open: 'news' }) }),
    ]);
  });

  it('opens the slide-in when the newsletter is closed, and then says nothing', async () => {
    const { client, renderer } = await draw([newsletter, slide]);
    const close = renderer.root.findAllByType(el('Pressable')).find((node) => node.props.accessibilityLabel === 'Kapat' && 'onPress' in node.props && !flatStyle(node)['backgroundColor']);
    expect(close).toBeDefined();
    await press(close!);
    await settle();

    expect(texts(renderer)).toContain('Fırsat');
    expect(texts(renderer)).not.toContain('Bülten');
    expect(client.explain()).toEqual([]);
  });

  it('lets the higher priority open first', async () => {
    const urgent = campaign('slide', 'slide_in', { content: { title: 'Fırsat' }, placement: { position: 'right', ...NOW, conflictResolution: { priority: 9 } } });
    const { renderer } = await draw([newsletter, urgent]);
    expect(texts(renderer)).toContain('Fırsat');
    expect(texts(renderer)).not.toContain('Bülten');
  });

  it('draws a bar beside the open interrupting surface: only overlays compete', async () => {
    const { renderer } = await draw([newsletter, slide, campaign('bar', 'announcement_bar', { content: { text: 'Kargo bedava' }, placement: { position: 'bottom' } })]);
    expect(texts(renderer)).toContain('Kargo bedava');
    expect(texts(renderer)).toContain('Bülten');
  });
});

describe('the floating button', () => {
  beforeEach(resetWorld);
  afterEach(teardown);

  const INSETS = { top: 40, bottom: 20, left: 0, right: 0 };
  async function draw(items: unknown[]) {
    world.campaigns = items;
    const client = await startClient();
    const renderer = await mount(client, recordingHost({ safeAreaInsets: INSETS }).host, h(SelwiseSurfaces));
    await goTo(client, 'app://home', { pageType: 'home' });
    await settle();
    return { client, renderer };
  }
  const button = (text: string) => campaign('fb', 'floating_button', { content: { text, tooltip: 'Destek ekibiyle görüşün' }, styles: { size: '56px', borderRadius: '50%' } });
  const labelled = (renderer: Awaited<ReturnType<typeof draw>>['renderer']) =>
    renderer.root.findAllByType(el('Pressable')).find((node) => 'onPress' in node.props && node.props.accessibilityLabel !== undefined && node.props.accessibilityRole === 'button')!;

  it('is a pill that fits its words, not a fixed 56 circle', async () => {
    const { renderer } = await draw([button('Yardım mı Lazım?')]);
    const style = flatStyle(labelled(renderer));
    expect(style).toMatchObject({ minHeight: 56, paddingHorizontal: 22 });
    expect(style['width']).toBeUndefined();
  });

  it('stays the icon circle for an emoji', async () => {
    const { renderer } = await draw([button('💬')]);
    expect(flatStyle(labelled(renderer))).toMatchObject({ width: 56, height: 56 });
  });

  it('is lifted above a bar docked to the bottom, by what the dock measured', async () => {
    const { renderer } = await draw([
      button('Yardım mı Lazım?'),
      campaign('footer', 'announcement_bar', { content: { text: 'Kargo bedava', buttonText: 'Git' }, placement: { position: 'bottom' } }),
    ]);
    const holder = () => renderer.root.findAllByType(el('View')).find((node) => flatStyle(node)['position'] === 'absolute' && 'zIndex' in flatStyle(node) && 'right' in flatStyle(node) && 'bottom' in flatStyle(node) && flatStyle(node)['bottom'] !== 0)!;
    expect(flatStyle(holder())).toMatchObject({ bottom: 36 });

    const dock = renderer.root.findAllByType(el('View')).find((node) => node.props.pointerEvents === 'box-none' && flatStyle(node)['bottom'] === 0 && typeof node.props.onLayout === 'function')!;
    await act(async () => dock.props.onLayout({ nativeEvent: { layout: { height: 76 } } }));
    expect(flatStyle(holder())).toMatchObject({ bottom: 92 });
  });
});

describe('a surface in a point of a screen', () => {
  beforeEach(resetWorld);
  afterEach(teardown);

  it('gets the same default side inset as an enrichment block, so it is not flush against the edge', async () => {
    world.campaigns = [
      campaign('c', 'cart_count', { content: { showIcon: false }, styles: { animateCounter: false }, placement: { position: '', selector: '[data-selwise-slot="pdp-under-info"]' }, targeting: { showOnAllPages: true } }),
    ];
    world.metrics = { view: 40, cart: 40 };
    const client = await startClient();
    client.setProduct({ itemCode: 'P1' });
    const renderer = await mount(
      client,
      recordingHost().host,
      h(SelwiseSurfaces),
      h(SelwiseSlot, { screen: 'app://product', slot: 'pdp-under-info', context: { currentProductId: 'P1' } })
    );
    await goTo(client, 'app://product', { pageType: 'product' });
    await settle();
    const item = renderer.root.findAllByType(el('View')).find((node) => node.props.collapsable === false && flatStyle(node)['paddingHorizontal'] === 16);
    expect(item).toBeDefined();
    expect(texts(renderer).join(' ')).toContain('40');
  });
});

describe('explain() for a countdown with no end', () => {
  beforeEach(resetWorld);
  afterEach(teardown);

  it('says content / no_end, as the widget does', async () => {
    world.campaigns = [campaign('t', 'countdown_timer', { content: { title: 'Bitiyor' }, placement: { position: 'bottom' } })];
    const client = await startClient();
    await mount(client, recordingHost().host, h(SelwiseSurfaces));
    await goTo(client, 'app://home', { pageType: 'home' });
    await settle();
    expect(client.explain()).toEqual([expect.objectContaining({ id: 't', reason: 'content', detail: { cause: 'no_end' } })]);
  });
});
