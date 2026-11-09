/**
 * Tests for the mini-basket hook (older Django themes that listen to none of
 * the widget's basket signals).
 */
const { basketQuantity, onBasketUpdated, install, COUNT_ATTRIBUTE } = require('./selwise-basket-hook.js');

function fakeDocument(counters) {
  const listeners = {};
  return {
    listeners,
    querySelectorAll: (selector) => (selector === `[${COUNT_ATTRIBUTE}]` ? counters : []),
    addEventListener: (type, listener) => {
      listeners[type] = listeners[type] || [];
      listeners[type].push(listener);
    },
  };
}

describe('basketQuantity', () => {
  it('reads PZ total_quantity, nested or not', () => {
    expect(basketQuantity({ basket: { total_quantity: 3 } })).toBe(3);
    expect(basketQuantity({ total_quantity: '2' })).toBe(2);
  });

  it('sums the lines when there is no total', () => {
    expect(basketQuantity({ basket: { basketitem_set: [{ quantity: 2 }, { quantity: 1 }, { quantity: 'x' }] } })).toBe(3);
  });

  it('is null for an answer with no basket in it', () => {
    expect(basketQuantity(undefined)).toBeNull();
    expect(basketQuantity({ basket: { foo: 1 } })).toBeNull();
  });
});

describe('onBasketUpdated', () => {
  it('writes the count into every marked element and hands the basket to the theme', () => {
    const counters = [{ textContent: '0' }, { textContent: '0' }];
    const refresh = jest.fn();
    const basket = { basket: { total_quantity: 4 } };
    onBasketUpdated({ detail: { basket } }, { document: fakeDocument(counters), selwiseRefreshMiniBasket: refresh });
    expect(counters.map((c) => c.textContent)).toEqual(['4', '4']);
    expect(refresh).toHaveBeenCalledWith(basket);
  });

  it('leaves the counters alone when the answer has no count, and survives a throwing theme callback', () => {
    const counters = [{ textContent: '7' }];
    const scope = {
      document: fakeDocument(counters),
      selwiseRefreshMiniBasket: () => {
        throw new Error('theme bug');
      },
      console: { debug: jest.fn() },
    };
    expect(() => onBasketUpdated({ detail: {} }, scope)).not.toThrow();
    expect(counters[0].textContent).toBe('7');
    expect(scope.console.debug).toHaveBeenCalled();
  });
});

describe('install', () => {
  it('listens to the widget event once', () => {
    const doc = fakeDocument([]);
    const scope = { document: doc };
    install(scope);
    install(scope);
    expect(doc.listeners['akinon:basket:updated']).toHaveLength(1);
  });
});
