/**
 * Tests for the Enhanced Ecommerce shim.
 *
 * Run with the repo's client test runner:
 *   cd apps/client && npx jest --config ../../integrations/akinon/jest.config.js
 * or from the kit directory:
 *   npx jest integrations/akinon
 */
const path = require('path');

function loadShim() {
  // Fresh module each time: `install()` mutates globals.
  const modulePath = path.join(__dirname, 'selwise-ee-shim.js');
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

describe('toMirroredEvent', () => {
  const { toMirroredEvent } = loadShim();

  it('renames eeEvent + detail to view_item', () => {
    const result = toMirroredEvent({
      event: 'eeEvent',
      ecommerce: { detail: { products: [{ id: 'SKU-1', name: 'Gömlek' }] } },
    });

    expect(result.event).toBe('view_item');
    expect(result.ecommerce.detail.products[0].id).toBe('SKU-1');
    expect(result.selwiseSourceEvent).toBe('eeEvent');
    expect(result.selwiseSourceAction).toBe('detail');
  });

  it('renames eeEvent + click to select_item, not view_item', () => {
    const result = toMirroredEvent({
      event: 'eeEvent',
      ecommerce: { click: { products: [{ id: 'SKU-2' }] } },
    });

    // This is the whole point of the shim: the same source event name must not
    // collapse a click into a view.
    expect(result.event).toBe('select_item');
  });

  it('renames eeEvent + impressions to view_item_list', () => {
    const result = toMirroredEvent({
      event: 'eeEvent',
      ecommerce: { impressions: [{ id: 'SKU-3' }, { id: 'SKU-4' }] },
    });

    expect(result.event).toBe('view_item_list');
  });

  it('renames eeCart + add to add_to_cart', () => {
    const result = toMirroredEvent({
      event: 'eeCart',
      ecommerce: { add: { products: [{ id: 'SKU-5' }] } },
    });

    expect(result.event).toBe('add_to_cart');
  });

  it('renames eeCart + remove to remove_from_cart', () => {
    const result = toMirroredEvent({
      event: 'eeCart',
      ecommerce: { remove: { products: [{ id: 'SKU-6' }] } },
    });

    expect(result.event).toBe('remove_from_cart');
  });

  it('renames a purchase action to purchase and keeps the actionField', () => {
    const result = toMirroredEvent({
      event: 'eeEvent',
      ecommerce: {
        purchase: { actionField: { id: 'ORDER-9', revenue: '250.00' }, products: [{ id: 'SKU-7' }] },
      },
    });

    expect(result.event).toBe('purchase');
    expect(result.ecommerce.purchase.actionField.id).toBe('ORDER-9');
  });

  it('passes GA4 events through untouched', () => {
    const input = { event: 'view_item', ecommerce: { items: [{ item_id: 'SKU-8' }] } };
    const result = toMirroredEvent(input);

    // Same object: projects with their own GA4 layer need no special casing.
    expect(result).toBe(input);
  });

  it('passes non-commerce custom events through', () => {
    const input = { event: 'newsletter_subscribe', source: 'footer' };
    expect(toMirroredEvent(input)).toBe(input);
  });

  it('drops an ambiguous event whose action cannot be resolved', () => {
    // Guessing here would be worse than silence: it would file a click as a view.
    expect(toMirroredEvent({ event: 'eeEvent', ecommerce: {} })).toBeNull();
    expect(toMirroredEvent({ event: 'eeEvent' })).toBeNull();
    expect(toMirroredEvent({ event: 'eeCart', ecommerce: { add: {} } })).not.toBeNull();
  });

  it('drops an empty impressions array rather than reporting a list view', () => {
    expect(toMirroredEvent({ event: 'eeEvent', ecommerce: { impressions: [] } })).toBeNull();
  });

  it('ignores GTM internal events', () => {
    expect(toMirroredEvent({ event: 'gtm.js' })).toBeNull();
    expect(toMirroredEvent({ event: 'gtm.dom' })).toBeNull();
    expect(toMirroredEvent({ event: 'gtm.load' })).toBeNull();
  });

  it('ignores malformed entries', () => {
    expect(toMirroredEvent(null)).toBeNull();
    expect(toMirroredEvent(undefined)).toBeNull();
    expect(toMirroredEvent('string')).toBeNull();
    expect(toMirroredEvent([])).toBeNull();
    expect(toMirroredEvent({ noEvent: true })).toBeNull();
  });
});

describe('install', () => {
  let shim;

  beforeEach(() => {
    global.window = { console: undefined };
    shim = loadShim();
  });

  afterEach(() => {
    delete global.window;
  });

  it('mirrors later pushes into the private layer and leaves dataLayer intact', () => {
    shim.install();

    window.dataLayer.push({ event: 'eeEvent', ecommerce: { click: { products: [{ id: 'A' }] } } });

    expect(window.selwiseLayer.map((entry) => entry.event)).toEqual(['select_item']);
    // The merchant's own layer must keep the ORIGINAL event, or their GTM
    // container stops recognising it.
    expect(window.dataLayer[0].event).toBe('eeEvent');
  });

  it('replays entries that were pushed before it ran', () => {
    window.dataLayer = [
      { event: 'gtm.js' },
      { event: 'eeEvent', ecommerce: { detail: { products: [{ id: 'B' }] } } },
    ];

    shim.install();

    expect(window.selwiseLayer.map((entry) => entry.event)).toEqual(['view_item']);
  });

  it('never writes the renamed event back into dataLayer', () => {
    shim.install();
    window.dataLayer.push({ event: 'eeCart', ecommerce: { add: { products: [{ id: 'C' }] } } });

    const names = window.dataLayer.map((entry) => entry.event);
    expect(names).toEqual(['eeCart']);
    expect(names).not.toContain('add_to_cart');
  });

  it('is idempotent when the include lands twice', () => {
    shim.install();
    shim.install();

    window.dataLayer.push({ event: 'eeEvent', ecommerce: { detail: { products: [{ id: 'D' }] } } });

    // A second wrap would mirror each push twice.
    expect(window.selwiseLayer).toHaveLength(1);
  });

  it('keeps the merchant push working when mirroring throws', () => {
    shim.install();

    const hostile = {
      get event() {
        throw new Error('boom');
      },
    };

    expect(() => window.dataLayer.push(hostile)).not.toThrow();
    expect(window.dataLayer).toHaveLength(1);
  });

  it('preserves the array push return value', () => {
    shim.install();
    expect(window.dataLayer.push({ event: 'view_item' })).toBe(1);
    expect(window.dataLayer.push({ event: 'view_cart' })).toBe(2);
  });
});

describe('toMirroredEvent: Project Zero checkout steps and eepurchase', () => {
  const { toMirroredEvent } = loadShim();
  const step = (n) => toMirroredEvent({
    event: 'eeCheckout',
    ecommerce: { checkout: { actionField: { step: n }, products: [{ id: '1' }] } },
  });

  it('reads step 1 as the basket and 2-4 as the checkout funnel', () => {
    expect(step(1).event).toBe('view_cart');
    expect(step(2).event).toBe('begin_checkout');
    expect(step(3).event).toBe('add_shipping_info');
    expect(step(4).event).toBe('add_payment_info');
  });

  it('resolves the lowercase eepurchase the stock adapter pushes', () => {
    const result = toMirroredEvent({
      event: 'eepurchase',
      ecommerce: { purchase: { actionField: { id: '339' }, products: [{ id: '1' }] } },
    });
    expect(result.event).toBe('purchase');
  });
});
