import { WebViewBridge, WEBVIEW_BRIDGE_SCRIPT } from './webview.js';
import type { Selwise } from '../client.js';

function makeSelwise() {
  return {
    track: jest.fn(),
    trackOrder: jest.fn().mockResolvedValue({ success: true, created: true }),
  } as unknown as Selwise & {
    track: jest.Mock;
    trackOrder: jest.Mock;
  };
}

describe('WebViewBridge', () => {
  it('maps a GA4 view_item push to product_view with the item code', () => {
    const selwise = makeSelwise();
    const bridge = new WebViewBridge(selwise);

    const handled = bridge.handleMessage(
      JSON.stringify({
        event: 'view_item',
        ecommerce: { currency: 'TRY', value: 749.9, items: [{ item_id: 'SKU-1', item_name: 'Gömlek', price: 749.9 }] },
      })
    );

    expect(handled).toBe(true);
    expect(selwise.track).toHaveBeenCalledWith(
      'product_view',
      expect.objectContaining({
        entityType: 'product',
        entityId: 'SKU-1',
        productItemCode: 'SKU-1',
        metadata: expect.objectContaining({ source: 'webview', currency: 'TRY', value: 749.9 }),
      })
    );
  });

  it('reads Enhanced Ecommerce payloads, not just GA4', () => {
    const selwise = makeSelwise();
    const bridge = new WebViewBridge(selwise);

    bridge.handleMessage({
      event: 'add_to_cart',
      ecommerce: { add: { products: [{ id: 'EE-9', name: 'Pantolon', price: '199.90', quantity: 2 }] } },
    });

    expect(selwise.track).toHaveBeenCalledWith(
      'add_to_cart',
      expect.objectContaining({ productItemCode: 'EE-9' })
    );
  });

  it('forwards a purchase as an order with the transaction id as key', async () => {
    const selwise = makeSelwise();
    const bridge = new WebViewBridge(selwise);

    bridge.handleMessage({
      event: 'purchase',
      ecommerce: {
        transaction_id: 'ORDER-1881',
        currency: 'TRY',
        value: 1499.7,
        items: [{ item_id: 'SKU-1', price: 749.9, quantity: 2 }],
      },
    });

    await Promise.resolve();

    expect(selwise.trackOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'ORDER-1881',
        total: 1499.7,
        currency: 'TRY',
        items: [expect.objectContaining({ productItemCode: 'SKU-1', quantity: 2, unitPrice: 749.9 })],
      })
    );
  });

  it('reads the UA purchase actionField when there is no GA4 field', async () => {
    const selwise = makeSelwise();
    const bridge = new WebViewBridge(selwise);

    bridge.handleMessage({
      event: 'purchase',
      ecommerce: {
        purchase: {
          actionField: { id: 'UA-77', revenue: '250.00', currency: 'TRY' },
          products: [{ id: 'SKU-2' }],
        },
      },
    });

    await Promise.resolve();

    expect(selwise.trackOrder).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'UA-77', total: 250, currency: 'TRY' })
    );
  });

  it('ignores a repeated purchase so a WebView reload cannot double-count', async () => {
    const selwise = makeSelwise();
    const bridge = new WebViewBridge(selwise);
    const message = { event: 'purchase', ecommerce: { transaction_id: 'ORDER-1', value: 10 } };

    bridge.handleMessage(message);
    await Promise.resolve();
    const second = bridge.handleMessage(message);

    expect(second).toBe(false);
    expect(selwise.trackOrder).toHaveBeenCalledTimes(1);
  });

  it('allows a retry when trackOrder rejected', async () => {
    const selwise = makeSelwise();
    selwise.trackOrder.mockRejectedValueOnce(new Error('offline'));
    const bridge = new WebViewBridge(selwise);
    const message = { event: 'purchase', ecommerce: { transaction_id: 'ORDER-2', value: 10 } };

    bridge.handleMessage(message);
    // Two microtask turns: one for trackOrder, one for the catch that clears it.
    await Promise.resolve();
    await Promise.resolve();

    expect(bridge.handleMessage(message)).toBe(true);
    expect(selwise.trackOrder).toHaveBeenCalledTimes(2);
  });

  it('drops a purchase with no transaction id rather than inventing one', () => {
    const selwise = makeSelwise();
    const onUnhandled = jest.fn();
    const bridge = new WebViewBridge(selwise, { onUnhandled });

    expect(bridge.handleMessage({ event: 'purchase', ecommerce: { value: 10 } })).toBe(false);
    expect(selwise.trackOrder).not.toHaveBeenCalled();
    expect(onUnhandled).toHaveBeenCalled();
  });

  it('does not map eeEvent, which is ambiguous by design', () => {
    const selwise = makeSelwise();
    const onUnhandled = jest.fn();
    const bridge = new WebViewBridge(selwise, { onUnhandled });

    expect(
      bridge.handleMessage({ event: 'eeEvent', ecommerce: { detail: { products: [{ id: 'X' }] } } })
    ).toBe(false);
    expect(selwise.track).not.toHaveBeenCalled();
    expect(onUnhandled).toHaveBeenCalledWith('eeEvent', expect.anything());
  });

  it('ignores non-JSON and shapeless messages', () => {
    const selwise = makeSelwise();
    const bridge = new WebViewBridge(selwise);

    expect(bridge.handleMessage('hello from the page')).toBe(false);
    expect(bridge.handleMessage('')).toBe(false);
    expect(bridge.handleMessage(null)).toBe(false);
    expect(bridge.handleMessage(JSON.stringify({ noEvent: true }))).toBe(false);
    expect(bridge.handleMessage(JSON.stringify(['array']))).toBe(false);
    expect(selwise.track).not.toHaveBeenCalled();
  });

  it('maps Turkish event names PZ projects emit', () => {
    const selwise = makeSelwise();
    const bridge = new WebViewBridge(selwise);

    bridge.handleMessage({ event: 'sepete_ekle', ecommerce: { items: [{ item_id: 'TR-1' }] } });

    expect(selwise.track).toHaveBeenCalledWith('add_to_cart', expect.anything());
  });

  it('injection script sets the flag Akinon isInAppWebView() reads', () => {
    expect(WEBVIEW_BRIDGE_SCRIPT).toContain('window.isMobileApp = true');
    expect(WEBVIEW_BRIDGE_SCRIPT).toContain('ReactNativeWebView');
    // Must end truthy or iOS logs an injection warning.
    expect(WEBVIEW_BRIDGE_SCRIPT.trimEnd().endsWith('})();')).toBe(true);
  });
});
