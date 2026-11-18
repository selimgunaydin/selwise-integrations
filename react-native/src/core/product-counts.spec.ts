import {
  counterProductCode,
  PRODUCT_COUNT_TTL_MS,
  ProductCountCache,
  productCountQuestion,
  type ProductCountQuestion,
} from './product-counts.js';

const views = (product: string, period = '24h'): ProductCountQuestion => ({ kind: 'product_view_count', product, period });

describe('productCountQuestion', () => {
  it('asks the merchant’s period, and 24h for one the route does not accept', () => {
    expect(productCountQuestion('product_view_count', 'P1', { timePeriod: '7d' })).toEqual(views('P1', '7d'));
    expect(productCountQuestion('product_view_count', 'P1', {})).toEqual(views('P1', '24h'));
    expect(productCountQuestion('product_view_count', 'P1', { timePeriod: '3y' })).toEqual(views('P1', '24h'));
  });

  it('asks the basket metric, active carts by default', () => {
    expect(productCountQuestion('cart_count', 'P1', {})).toEqual({ kind: 'cart_count', product: 'P1', metric: 'active_carts' });
    expect(productCountQuestion('cart_count', 'P1', { metricType: 'other' })).toMatchObject({ metric: 'active_carts' });
  });
});

describe('counterProductCode', () => {
  it('counts the merchant’s product, else the one the screen shows, else none', () => {
    expect(counterProductCode({ productId: ' SKU-9 ' }, { itemCode: 'P1' })).toBe('SKU-9');
    expect(counterProductCode({}, { itemCode: ' P1 ' })).toBe('P1');
    expect(counterProductCode({}, { itemCode: '' })).toBeNull();
    expect(counterProductCode({}, null)).toBeNull();
  });
});

describe('ProductCountCache', () => {
  it('shares a request in flight and keeps the answer for the TTL', async () => {
    let now = 1000;
    const read = jest.fn(async () => 12);
    const cache = new ProductCountCache(read, () => now);
    const [a, b] = await Promise.all([cache.ask(views('P1')), cache.ask(views('P1'))]);
    expect([a, b]).toEqual([12, 12]);
    expect(read).toHaveBeenCalledTimes(1);

    now += PRODUCT_COUNT_TTL_MS - 1;
    await cache.ask(views('P1'));
    expect(read).toHaveBeenCalledTimes(1);
    now += 2;
    await cache.ask(views('P1'));
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('keeps one answer per product and per period', async () => {
    const read = jest.fn(async (question: ProductCountQuestion) => question.product.length);
    const cache = new ProductCountCache(read);
    await cache.ask(views('P1'));
    await cache.ask(views('P1', '7d'));
    await cache.ask(views('P22'));
    await cache.ask({ kind: 'cart_count', product: 'P1', metric: 'active_carts' });
    expect(read).toHaveBeenCalledTimes(4);
  });

  it('answers null for a count that could not be read, and asks again next time', async () => {
    const read = jest.fn<Promise<number | null>, [ProductCountQuestion]>().mockResolvedValueOnce(null).mockResolvedValueOnce(5);
    const cache = new ProductCountCache(read);
    expect(await cache.ask(views('P1'))).toBeNull();
    expect(await cache.ask(views('P1'))).toBe(5);
    const throwing = new ProductCountCache(async () => {
      throw new Error('boom');
    });
    expect(await throwing.ask(views('P1'))).toBeNull();
  });
});
