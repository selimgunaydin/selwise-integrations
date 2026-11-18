import { createElement as h } from 'react';
import { act, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { appSlotSelector } from '../vendor/app-surfaces.js';
import { DEBUG_REASON_TEXT } from './debug-reasons.js';
import { debugBoardOf, DebugBoard, SCREEN_STRIPS, useReportDrawnStrips } from './debug-board.js';
import type { Strip } from '../core/strips.js';
import { APP_EXPLAIN_REASONS } from '../vendor/app-not-shown.js';
import { SelwiseDebugOverlay } from './SelwiseDebugOverlay.js';
import { SelwiseSlot } from './SelwiseSlot.js';
import { SelwiseSurfaces } from './SelwiseSurfaces.js';
import { campaign, el, goTo, mount, press, recordingHost, resetWorld, settle, startClient, teardown, texts, world } from './test/campaign-harness.js';

/**
 * The on-device diagnostics panel: present only when the host started the client
 * with `debug: true`, a no-op otherwise, and it says what `explain()` says plus
 * what was drawn.
 */

beforeEach(resetWorld);
afterEach(teardown);

const PRODUCT = 'app://product';
const onProduct = { showOnAllPages: false, includeUrls: [PRODUCT], excludeUrls: [] };

const button = (renderer: ReactTestRenderer): ReactTestInstance[] =>
  renderer.root.findAll((node) => node.props.testID === 'selwise-debug-button' && typeof node.type === 'string');

async function draw(items: unknown[], options: { debug?: boolean; slot?: string } = {}) {
  world.campaigns = items;
  const client = await startClient(options.debug === undefined ? {} : { debug: options.debug });
  client.setProduct({ itemCode: 'P1' });
  const children = options.slot
    ? [h(SelwiseSlot, { screen: PRODUCT, slot: options.slot, context: { currentProductId: 'P1' } })]
    : [];
  const renderer = await mount(client, recordingHost().host, h(SelwiseSurfaces), ...children);
  await goTo(client, PRODUCT, { pageType: 'product', screenName: 'ProductDetail' });
  await settle();
  return { client, renderer };
}

const bar = campaign('bar', 'announcement_bar', { content: { text: 'Merhaba' }, targeting: onProduct });
const lost = campaign('lost', 'announcement_bar', {
  content: { text: 'Nokta' },
  placement: { position: 'top', selector: appSlotSelector('pdp-under-info') },
  targeting: onProduct,
});

describe('the diagnostics button', () => {
  it('is not drawn without debug: nothing for a release build', async () => {
    const { renderer } = await draw([bar]);
    expect(button(renderer)).toHaveLength(0);
    expect(texts(renderer)).toContain('Merhaba');
  });

  it('is not drawn when the dashboard turns debug on remotely: only the host asks for a button', async () => {
    world.config = { tracking: { debug: true } };
    const { client, renderer } = await draw([bar]);
    expect(button(renderer)).toHaveLength(0);
    expect(client.debugOverlayEnabled).toBe(false);
  });

  it('is not drawn for debug: false', async () => {
    const { renderer } = await draw([bar], { debug: false });
    expect(button(renderer)).toHaveLength(0);
  });

  it('is drawn with debug: true, even when nothing else is on the screen', async () => {
    const { renderer } = await draw([], { debug: true });
    expect(button(renderer)).toHaveLength(1);
    expect(texts(renderer)).toContain('S');
  });

  it('writes nothing to the board and listens to nothing while debug is off', async () => {
    const { client } = await draw([bar]);
    const board = debugBoardOf(client);
    expect(board.snapshot(PRODUCT)).toEqual({ surfaces: [], strips: [] });
  });
});

describe('the sheet', () => {
  it('opens on a tap and names the screen, its page type, what was drawn and what was not', async () => {
    const { renderer } = await draw([bar, lost], { debug: true });
    expect(renderer.root.findAll((node) => node.props.testID === 'selwise-debug-sheet')).toHaveLength(0);

    await press(button(renderer)[0]!);
    const said = texts(renderer);

    expect(said).toContain('Selwise diagnostics');
    expect(said).toContain(PRODUCT);
    expect(said).toContain('page type: product');
    expect(said).toContain('screen name: ProductDetail');
    expect(said).toContain('Surfaces drawn (1)');
    expect(said).toContain('bar · announcement_bar · dock bottom');
    expect(said).toContain('Not shown (1)');
    expect(said.some((line) => line.startsWith('lost · campaign · announcement_bar'))).toBe(true);
    expect(said).toContain(`campaignSlot: ${DEBUG_REASON_TEXT.campaignSlot}`);
    expect(said).toContain('slot=pdp-under-info');
  });

  it('marks a popup that is armed as waiting, in the same words explain() uses', async () => {
    const { renderer } = await draw(
      [
        campaign('pop', 'exit_intent_popup', {
          content: { title: 'Gitme' },
          placement: { triggerStrategy: 'time_delay', triggerDelaySeconds: 30 },
          targeting: onProduct,
        }),
      ],
      { debug: true }
    );
    await press(button(renderer)[0]!);
    const said = texts(renderer);
    expect(said.some((line) => line.startsWith('pop · campaign') && line.endsWith('· waiting'))).toBe(true);
    expect(said).toContain(`trigger_armed: ${DEBUG_REASON_TEXT.trigger_armed}`);
  });

  it('lists the campaigns a mounted point drew, under the point', async () => {
    const { renderer } = await draw([lost], { debug: true, slot: 'pdp-under-info' });
    await press(button(renderer)[0]!);
    const said = texts(renderer);
    expect(said).toContain('Surfaces drawn (1)');
    expect(said).toContain('lost · announcement_bar · point pdp-under-info');
    expect(said).toContain('Not shown (0)');
    expect(said).toContain('nothing is on record against this screen');
  });

  it('closes again', async () => {
    const { renderer } = await draw([bar], { debug: true });
    await press(button(renderer)[0]!);
    const close = renderer.root.find((node) => node.props.testID === 'selwise-debug-close' && typeof node.type === 'string');
    await press(close);
    expect(renderer.root.findAll((node) => node.props.testID === 'selwise-debug-sheet')).toHaveLength(0);
  });

  it('reads the current screen: navigating away drops the old screen\'s lists and says why nothing targets the new one', async () => {
    const { client, renderer } = await draw([bar, lost], { debug: true });
    await goTo(client, 'app://home', { pageType: 'home' });
    await settle();
    await press(button(renderer)[0]!);
    const said = texts(renderer);
    expect(said).toContain('app://home');
    expect(said).toContain('page type: home');
    expect(said).toContain('Surfaces drawn (0)');
    expect(said).toContain('Not shown (2)');
    expect(said).toContain(`screens: ${DEBUG_REASON_TEXT.screens}`);
  });
});

describe('the standalone component', () => {
  it('renders nothing for a client without debug', async () => {
    const client = await startClient();
    const renderer = await mount(client, recordingHost().host, h(SelwiseDebugOverlay));
    expect(renderer.root.findAllByType(el('Pressable'))).toHaveLength(0);
  });
});

describe('one overlay per client', () => {
  it('draws one button when SelwiseSurfaces and a manual mount are both there', async () => {
    const client = await startClient({ debug: true });
    const renderer = await mount(client, recordingHost().host, h(SelwiseSurfaces), h(SelwiseDebugOverlay), h(SelwiseDebugOverlay));
    expect(button(renderer)).toHaveLength(1);
  });

  it('hands over to the next mount when the drawing one goes', async () => {
    const client = await startClient({ debug: true });
    const board = debugBoardOf(client);
    const first = Symbol('a');
    const second = Symbol('b');
    const releaseFirst = board.claimOverlay(first);
    board.claimOverlay(second);
    expect([board.drawsOverlay(first), board.drawsOverlay(second)]).toEqual([true, false]);
    releaseFirst();
    expect([board.drawsOverlay(first), board.drawsOverlay(second)]).toEqual([false, true]);
  });
});

describe('the reason sentences', () => {
  it('cover every code explain() can return', () => {
    for (const reason of APP_EXPLAIN_REASONS) {
      expect(DEBUG_REASON_TEXT[reason].length).toBeGreaterThan(10);
    }
  });
});

describe('the strips a component draws', () => {
  const strip = (id: string, name?: string) => ({ widget: { id, ...(name ? { name } : {}) } }) as unknown as Strip;
  const Drawer = (props: { client: Parameters<typeof useReportDrawnStrips>[0]; point: string; strips: Strip[] }) => {
    useReportDrawnStrips(props.client, PRODUCT, props.point, props.strips);
    return null;
  };

  it('are reported per point in debug mode, and withdrawn when the component goes', async () => {
    const client = await startClient({ debug: true });
    const renderer = await mount(
      client,
      recordingHost().host,
      h(Drawer, { client, point: 'pdp-under-info', strips: [strip('s1', 'Benzer ürünler')] }),
      h(Drawer, { client, point: SCREEN_STRIPS, strips: [strip('s2')] })
    );
    expect(debugBoardOf(client).snapshot(PRODUCT).strips).toEqual([
      { point: 'pdp-under-info', strips: [{ id: 's1', name: 'Benzer ürünler' }] },
      { point: SCREEN_STRIPS, strips: [{ id: 's2' }] },
    ]);
    await act(async () => renderer.unmount());
    expect(debugBoardOf(client).snapshot(PRODUCT).strips).toEqual([]);
  });

  it('are never reported without debug', async () => {
    const client = await startClient();
    await mount(client, recordingHost().host, h(Drawer, { client, point: 'pdp-under-info', strips: [strip('s1')] }));
    expect(debugBoardOf(client).snapshot(PRODUCT).strips).toEqual([]);
  });

  it('show up in the sheet under their point', async () => {
    const client = await startClient({ debug: true });
    const renderer = await mount(
      client,
      recordingHost().host,
      h(SelwiseDebugOverlay),
      h(Drawer, { client, point: 'pdp-under-info', strips: [strip('s1', 'Benzer ürünler')] })
    );
    await goTo(client, PRODUCT, { pageType: 'product' });
    await press(button(renderer)[0]!);
    expect(texts(renderer)).toContain('pdp-under-info: Benzer ürünler (s1)');
  });
});

describe('DebugBoard', () => {
  it('files strips by point and screen, and withdraws an owner', () => {
    const board = new DebugBoard();
    const a = Symbol('a');
    const b = Symbol('b');
    board.setStrips(a, 'app://home', 'home-bottom', [{ id: 's1', name: 'Sana özel' }]);
    board.setStrips(b, 'app://product', 'pdp-under-info', [{ id: 's2' }]);
    expect(board.snapshot('app://home').strips).toEqual([{ point: 'home-bottom', strips: [{ id: 's1', name: 'Sana özel' }] }]);
    board.clearStrips(a);
    expect(board.snapshot('app://home').strips).toEqual([]);
    board.clearStrips(b);
    expect(board.snapshot('app://product').strips).toEqual([]);
  });

  it('tells a listener only when the answer changed', () => {
    const board = new DebugBoard();
    let calls = 0;
    board.onChange(() => (calls += 1));
    board.setSurfaces('app://home', [{ id: 'a', type: 'popup', where: 'window' }]);
    board.setSurfaces('app://home', [{ id: 'a', type: 'popup', where: 'window' }]);
    expect(calls).toBe(1);
  });
});

