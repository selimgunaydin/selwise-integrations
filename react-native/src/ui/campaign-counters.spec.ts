import { createElement as h } from 'react';
import { act } from 'react-test-renderer';
import { SelwiseSlot } from './SelwiseSlot.js';
import { SelwiseSurfaces } from './SelwiseSurfaces.js';
import { campaign, eventsOf, goTo, mount, recordingHost, resetWorld, settle, startClient, teardown, texts, world } from './test/campaign-harness.js';

/**
 * The social-proof counters read their number from the public API, as the
 * browser widget does: the app never has to know it, and a counter below the
 * merchant's threshold (or with no product, or no answer) is not drawn and not
 * counted as shown.
 */

beforeEach(resetWorld);
afterEach(teardown);

const PRODUCT = 'app://product';
const counter = (type: string, content: Record<string, unknown> = {}) =>
  campaign('c-' + type, type, { content: { showIcon: false, ...content }, styles: { animateCounter: false } });

async function draw(item: Record<string, unknown>, options: { product?: Record<string, unknown> | null } = {}) {
  world.campaigns = [item];
  const client = await startClient();
  if (options.product !== null) client.setProduct(options.product ?? { itemCode: 'P1' });
  const { host } = recordingHost();
  const renderer = await mount(
    client,
    host,
    h(SelwiseSurfaces),
    h(SelwiseSlot, { screen: PRODUCT, slot: 'pdp-under-info', context: { currentProductId: 'P1' } })
  );
  await goTo(client, PRODUCT, { pageType: 'product' });
  await settle();
  await client.flush();
  return { client, renderer };
}

const metricCalls = () => world.calls.filter((call) => call.url.includes('/product-metrics/'));
// A slot's impression waits for the point to be on screen for a second; these tests judge the draw.
const impressions = () => eventsOf('impression');

describe('a counter above the threshold', () => {
  it('asks the view-count route for the product on screen, with the key, and draws the formatted number', async () => {
    world.metrics = { view: 1500, cart: 0 };
    const { renderer } = await draw(counter('product_view_count', { timePeriod: '7d' }));
    const call = metricCalls()[0]!;
    expect(call.url).toContain('/public/sites/site-key/product-metrics/view-count?product=P1&period=7d');
    expect(call.headers['x-selwise-api-key']).toBe('api-key');
    expect(texts(renderer)).toContain('1.5K');
  });

  it('asks the cart-count route for a basket counter', async () => {
    world.metrics = { view: 0, cart: 12 };
    const { renderer } = await draw(counter('cart_count'));
    expect(metricCalls()[0]!.url).toContain('/product-metrics/cart-count?product=P1&metric=active_carts');
    expect(texts(renderer)).toContain('12');
  });

  it('reports the impression once the point has been on screen, and only then', async () => {
    jest.useFakeTimers();
    world.metrics = { view: 8, cart: 0 };
    const { client } = await draw(counter('product_view_count'));
    expect(impressions()).toHaveLength(0);
    await act(async () => {
      jest.advanceTimersByTime(1500);
    });
    await client.flush();
    expect(impressions()).toHaveLength(1);
    expect(impressions()[0]).toMatchObject({ entityId: 'c-product_view_count', metadata: { impressionBasis: 'visible' } });
  });

  it('counts the merchant’s own product when they named one', async () => {
    world.metrics = { view: 4, cart: 0 };
    await draw(counter('product_view_count', { productId: 'SKU-9' }), { product: null });
    expect(metricCalls()[0]!.url).toContain('product=SKU-9');
  });

  it('asks once for two counters of one product and period', async () => {
    world.metrics = { view: 4, cart: 4 };
    world.campaigns = [counter('product_view_count'), campaign('c2', 'product_view_count', { content: { showIcon: false } })];
    const client = await startClient();
    client.setProduct({ itemCode: 'P1' });
    await mount(client, recordingHost().host, h(SelwiseSurfaces), h(SelwiseSlot, { screen: PRODUCT, slot: 'pdp-under-info', context: { currentProductId: 'P1' } }));
    await goTo(client, PRODUCT, { pageType: 'product' });
    await settle();
    expect(metricCalls()).toHaveLength(1);
  });
});

describe('a counter that must not be drawn', () => {
  it('draws nothing, and reports no impression, below the merchant’s threshold', async () => {
    world.metrics = { view: 4, cart: 0 };
    const { renderer } = await draw(counter('product_view_count', { minCount: 5 }));
    expect(texts(renderer)).toEqual([]);
    expect(impressions()).toHaveLength(0);
  });

  it('applies the default threshold of 1: never "0 people"', async () => {
    world.metrics = { view: 0, cart: 0 };
    const { renderer } = await draw(counter('product_view_count'));
    expect(texts(renderer)).toEqual([]);
    expect(impressions()).toHaveLength(0);
  });

  it('draws nothing, and asks for nothing, when no product is on screen', async () => {
    world.metrics = { view: 50, cart: 50 };
    const { renderer } = await draw(counter('cart_count'), { product: null });
    expect(texts(renderer)).toEqual([]);
    expect(metricCalls()).toHaveLength(0);
    expect(impressions()).toHaveLength(0);
  });

  it('draws nothing for a product screen that named no item code', async () => {
    const { renderer } = await draw(counter('cart_count'), { product: { title: 'Ruj', price: 10 } });
    expect(texts(renderer)).toEqual([]);
    expect(metricCalls()).toHaveLength(0);
  });

  it('draws nothing when the count could not be read: unmeasured is not a zero', async () => {
    world.metrics = { view: null, cart: null };
    const { renderer } = await draw(counter('product_view_count', { minCount: 0 }));
    expect(texts(renderer)).toEqual([]);
    expect(impressions()).toHaveLength(0);
  });
});
