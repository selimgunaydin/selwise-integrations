import { createElement as h } from 'react';
import { SelwiseText } from './host-hooks.js';
import { setThemeTokens } from './styles.js';
import { el, flat, mount, recordingHost, resetHarness, startClient, teardownHarness } from './test/strip-harness.js';

beforeEach(resetHarness);
afterEach(teardownHarness);

/** How many listeners of the client's `theme` event are alive. */
function themeListeners(client: Awaited<ReturnType<typeof startClient>>) {
  const on = jest.spyOn(client, 'on');
  return {
    subscribed: () => on.mock.calls.filter(([name]) => name === 'theme').length,
  };
}

describe('SelwiseText', () => {
  it('does not follow the brand theme when the host mapped no font', async () => {
    const client = await startClient();
    const spy = themeListeners(client);
    const { host } = recordingHost();

    const renderer = await mount(client, host, h(SelwiseText, null, 'Merhaba'), h(SelwiseText, null, 'Dünya'));

    expect(spy.subscribed()).toBe(0);
    const texts = renderer.root.findAllByType(el('Text'));
    expect(texts).toHaveLength(2);
    expect(flat(texts[0]!.props.style)).not.toHaveProperty('fontFamily');
  });

  it('draws the host’s font, and follows the theme, when the host mapped one', async () => {
    const client = await startClient();
    const spy = themeListeners(client);
    const { host } = recordingHost({ fontFamily: { inter: 'Inter-Regular' } });
    // A surface sets the brand's tokens as it draws; a bare text has no surface above it here.
    setThemeTokens(client.getTheme());

    const renderer = await mount(client, host, h(SelwiseText, null, 'Merhaba'));
    expect(spy.subscribed()).toBeGreaterThanOrEqual(1);

    expect(flat(renderer.root.findByType(el('Text')).props.style)).toMatchObject({ fontFamily: 'Inter-Regular' });
  });

  it('draws a surface’s own font stack when the host maps it, and never passes `fontStack` to the Text', async () => {
    const client = await startClient();
    const { host } = recordingHost({ fontFamily: { roboto: 'Roboto-Regular' } });

    const renderer = await mount(client, host, h(SelwiseText, { fontStack: '"Roboto", sans-serif' }, 'Merhaba'));

    const text = renderer.root.findByType(el('Text'));
    expect(flat(text.props.style)).toMatchObject({ fontFamily: 'Roboto-Regular' });
    expect(text.props).not.toHaveProperty('fontStack');
  });

  it('passes the text props through without a mapping and without a font stack prop', async () => {
    const client = await startClient();
    const { host } = recordingHost();

    const renderer = await mount(client, host, h(SelwiseText, { fontStack: 'Roboto', numberOfLines: 2, testID: 't' }, 'Merhaba'));

    const text = renderer.root.findByType(el('Text'));
    expect(text.props).toMatchObject({ numberOfLines: 2, testID: 't' });
    expect(text.props).not.toHaveProperty('fontStack');
  });
});
