import { createElement as h } from 'react';
import { appSlotSelector } from '../vendor/app-surfaces.js';
import { SelwiseSlot } from './SelwiseSlot.js';
import { SelwiseSurfaces } from './SelwiseSurfaces.js';
import { campaign, goTo, mount, recordingHost, resetWorld, settle, startClient, teardown, texts, world } from './test/campaign-harness.js';

/**
 * The overlay's half of `Selwise.explain()`: what the client delivered and the
 * overlay then left off the screen, with the dashboard's own reason codes — and
 * that it says nothing about what it drew.
 */

beforeEach(resetWorld);
afterEach(teardown);

const PRODUCT = 'app://product';
const onProduct = { showOnAllPages: false, includeUrls: [PRODUCT], excludeUrls: [] };

async function draw(items: unknown[], options: { product?: boolean; slot?: string } = {}) {
  world.campaigns = items;
  const client = await startClient();
  if (options.product !== false) client.setProduct({ itemCode: 'P1' });
  const children = options.slot
    ? [h(SelwiseSlot, { screen: PRODUCT, slot: options.slot, context: { currentProductId: 'P1' } })]
    : [];
  const renderer = await mount(client, recordingHost().host, h(SelwiseSurfaces), ...children);
  await goTo(client, PRODUCT, { pageType: 'product' });
  await settle();
  return { client, renderer };
}

const said = (client: { explain(): Array<{ id: string; reason: string; waiting: boolean }> }) =>
  client.explain().map((report) => `${report.id}:${report.reason}:${report.waiting ? 'waiting' : 'not shown'}`);

describe('explain() from the overlay', () => {
  it('says nothing about a campaign it drew', async () => {
    const { client, renderer } = await draw([
      campaign('bar', 'announcement_bar', { content: { text: 'Merhaba' }, targeting: onProduct }),
    ]);
    expect(texts(renderer)).toContain('Merhaba');
    expect(client.explain()).toEqual([]);
  });

  it('says campaignSlot for a campaign sent to a point the app never mounted', async () => {
    const { client } = await draw([
      campaign('bar', 'announcement_bar', {
        content: { text: 'Nokta' },
        placement: { position: 'top', selector: appSlotSelector('pdp-under-info') },
        targeting: onProduct,
      }),
    ]);
    expect(client.explain()).toEqual([
      expect.objectContaining({ id: 'bar', reason: 'campaignSlot', detail: { slot: 'pdp-under-info' }, screen: PRODUCT }),
    ]);
  });

  it('stops saying it once the point is mounted', async () => {
    const { client, renderer } = await draw(
      [
        campaign('bar', 'announcement_bar', {
          content: { text: 'Nokta' },
          placement: { position: 'top', selector: appSlotSelector('pdp-under-info') },
          targeting: onProduct,
        }),
      ],
      { slot: 'pdp-under-info' }
    );
    expect(texts(renderer)).toContain('Nokta');
    expect(client.explain()).toEqual([]);
  });

  it('says a popup is WAITING for its trigger — armed is not shown, and not a failure', async () => {
    const { client } = await draw([
      campaign('pop', 'exit_intent_popup', {
        content: { title: 'Gitme' },
        placement: { triggerStrategy: 'time_delay', triggerDelaySeconds: 30 },
        targeting: onProduct,
      }),
    ]);
    expect(said(client)).toEqual(['pop:trigger_armed:waiting']);
    expect(client.explain('pop')[0]!.detail).toEqual({ trigger: 'delay' });
  });

  it('says why a counter is not drawn: under its threshold, and no product on the screen', async () => {
    world.metrics = { view: 3, cart: 3 };
    const below = await draw([
      campaign('views', 'product_view_count', { content: { minCount: 5, showIcon: false }, targeting: onProduct }),
    ], { slot: 'pdp-under-info' });
    expect(below.client.explain()).toEqual([
      expect.objectContaining({ id: 'views', reason: 'below_min_count', detail: { count: 3, min: 5 } }),
    ]);
    await teardown();

    resetWorld();
    const none = await draw([
      campaign('carts', 'cart_count', { content: { showIcon: false }, targeting: onProduct }),
    ], { product: false, slot: 'pdp-under-info' });
    expect(said(none.client)).toEqual(['carts:product_unresolved:not shown']);
  });
});
