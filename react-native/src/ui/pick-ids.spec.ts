import { CARD_PREFIX, cardPickId, nodePickId, pickId, readPickId } from './pick-ids.js';

describe('the names a drawn part carries', () => {
  it('round-trips a part, with and without the field that holds its words', () => {
    expect(readPickId(pickId('title'))).toEqual({ part: 'title' });
    expect(readPickId(pickId('button', 'buttonText'))).toEqual({ part: 'button', field: 'buttonText' });
    expect(pickId('image', 'imageUrl')).toBe('selwise-pick:image:imageUrl');
  });

  it('round-trips an element of a designed card by its designer id', () => {
    expect(readPickId(nodePickId('n-4f2'))).toEqual({ part: 'card', node: 'n-4f2' });
  });

  it('names a whole drawn card by its product, which is no pick: it only says WHICH card a click or an outline belongs to', () => {
    expect(cardPickId('SKU-1')).toBe('selwise-card-SKU-1');
    expect(cardPickId('SKU-1').startsWith(`${CARD_PREFIX}-`)).toBe(true);
    expect(readPickId(cardPickId('SKU-1'))).toBeNull();
  });

  it('reads nothing from a test id that is not ours, or names a part the dashboard has no word for', () => {
    expect(readPickId('my-own-test-id')).toBeNull();
    expect(readPickId(undefined)).toBeNull();
    expect(readPickId('selwise-pick:wizard')).toBeNull();
    expect(readPickId('selwise-node:')).toBeNull();
  });
});
