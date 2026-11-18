import { QA_VARIANTS_MAX, readQaLink } from './qa-link.js';

const EXP = '11111111-1111-4111-8111-111111111111';
const ARM = '22222222-2222-4222-8222-222222222222';

describe('readQaLink', () => {
  it('reads test mode on and off', () => {
    expect(readQaLink('myapp://x?selwise_test=1')).toEqual({ testMode: true, variants: {} });
    expect(readQaLink('myapp://x?selwise_test=on')).toEqual({ testMode: true, variants: {} });
    expect(readQaLink('myapp://x?selwise_test=off')).toEqual({ testMode: false, variants: {} });
  });

  it('reads a forced arm, and puts test mode on with it', () => {
    expect(readQaLink(`myapp://x?selwise_variant=${EXP}:${ARM}`)).toEqual({
      testMode: true,
      variants: { [EXP]: ARM },
    });
  });

  it('lets the link keep test mode off while forcing an arm', () => {
    expect(readQaLink(`myapp://x?selwise_variant=${EXP}:${ARM}&selwise_test=0`)).toEqual({
      testMode: false,
      variants: { [EXP]: ARM },
    });
  });

  it('skips a malformed entry and a link with nothing for it', () => {
    expect(readQaLink('myapp://x?selwise_variant=nope:nope')).toBeNull();
    expect(readQaLink(`myapp://x?selwise_variant=${EXP}`)).toBeNull();
    expect(readQaLink('myapp://x?utm_source=mail')).toBeNull();
    expect(readQaLink('myapp://x')).toBeNull();
    expect(readQaLink('')).toBeNull();
  });

  it('caps how many arms one link can force', () => {
    const entries = Array.from({ length: 30 }, (_, i) => {
      const id = `${String(i).padStart(8, '0')}-1111-4111-8111-111111111111`;
      return `selwise_variant=${id}:${ARM}`;
    });
    const read = readQaLink(`myapp://x?${entries.join('&')}`);
    expect(Object.keys(read!.variants)).toHaveLength(QA_VARIANTS_MAX);
  });
});
