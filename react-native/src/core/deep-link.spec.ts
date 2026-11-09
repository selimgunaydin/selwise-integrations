import * as fs from 'fs';
import * as path from 'path';
import { MESSAGE_ATTRIBUTION_PARAM, PARAM_VALUE_MAX, messageMedium, readDeepLinkAttribution } from './deep-link.js';

const SCENARIO = '0B6F0D7E-1C2A-4E5B-9D8C-7A6B5C4D3E2F';

describe('readDeepLinkAttribution', () => {
  it('reads a Selwise message link: the scenario, the campaign tags, nothing else', () => {
    const read = readDeepLinkAttribution(
      `myshop://product/42?sw_sc=${SCENARIO}&utm_source=selwise&utm_medium=Push&token=secret&email=a%40b.com#top`,
    );
    expect(read).toEqual({
      landingUrl: `myshop://product/42?sw_sc=${SCENARIO.toLowerCase()}&utm_source=selwise&utm_medium=Push`,
      scenarioId: SCENARIO.toLowerCase(),
      utm: { utm_source: 'selwise', utm_medium: 'Push' },
      clickIds: [],
    });
    expect(messageMedium(read!)).toBe('push');
  });

  it('keeps an ad-click id as present, never its value', () => {
    const read = readDeepLinkAttribution('https://shop.example.com/p/1?gclid=abc.123&utm_campaign=Kas%C4%B1m%20indirimi');
    expect(read?.landingUrl).toBe('https://shop.example.com/p/1?utm_campaign=Kas%C4%B1m%20indirimi&gclid=1');
    expect(read?.utm).toEqual({ utm_campaign: 'Kasım indirimi' });
    expect(read?.clickIds).toEqual(['gclid']);
  });

  it('ignores a malformed scenario id, and a link with nothing about its source', () => {
    expect(readDeepLinkAttribution('myshop://home?sw_sc=not-a-uuid')).toBeNull();
    expect(readDeepLinkAttribution('myshop://reset-password?token=abc')).toBeNull();
    expect(readDeepLinkAttribution('')).toBeNull();
    expect(readDeepLinkAttribution(undefined as unknown as string)).toBeNull();
  });

  it('survives a broken escape and caps a long value', () => {
    const read = readDeepLinkAttribution(`myshop://x?utm_source=%E0%A4%A&utm_campaign=${'a'.repeat(300)}`);
    expect(read?.utm.utm_source).toBe('%E0%A4%A');
    expect(read?.utm.utm_campaign).toHaveLength(100);
  });
});

describe('the message-link contract this SDK restates', () => {
  // @selwise/messaging-contract is private, so the SDK cannot import it; the
  // copy is held to the source here instead of drifting silently.
  const source = fs.readFileSync(path.join(__dirname, '../../../messaging-contract/src/link-tracking.ts'), 'utf8');

  it('reads the same attribution parameter and value bound as the API and the widget', () => {
    expect(source).toContain(`export const MESSAGE_ATTRIBUTION_PARAM = '${MESSAGE_ATTRIBUTION_PARAM}';`);
    expect(source).toMatch(new RegExp(`valueMax: ${PARAM_VALUE_MAX},`));
  });
});
