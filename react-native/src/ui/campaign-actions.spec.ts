import { createElement as h } from 'react';
import { act } from 'react-test-renderer';
import { SelwiseSurfaces } from './SelwiseSurfaces.js';
import {
  campaign,
  el,
  eventsOf,
  flatStyle,
  goTo,
  hostParent,
  mount,
  press,
  recordingHost,
  resetWorld,
  settle,
  startClient,
  teardown,
  textOf,
  texts,
  world,
} from './test/campaign-harness.js';
import { controls } from './test/react-native.mock.js';

/**
 * The picture, the tap and the measurement of a campaign: where its image is
 * drawn and how, what a tap on the button, the picture and the backdrop does,
 * and what the experiment, the newsletter and the screen view report.
 */

beforeEach(resetWorld);
afterEach(teardown);

async function draw(items: unknown[], hostExtra?: Parameters<typeof recordingHost>[0], options: Record<string, unknown> = {}) {
  world.campaigns = items;
  const client = await startClient(options);
  const recorded = recordingHost(hostExtra);
  const renderer = await mount(client, recorded.host, h(SelwiseSurfaces));
  await goTo(client, 'app://home', { pageType: 'home' });
  await settle();
  return { client, renderer, ...recorded };
}

const images = (renderer: Awaited<ReturnType<typeof draw>>['renderer']) => renderer.root.findAllByType(el('Image'));
const POPUP_NOW = { triggerStrategy: 'page_load' };

describe('the picture', () => {
  it('draws the bar’s picture as a thumbnail beside its text, at the merchant’s size and corners', async () => {
    const { renderer } = await draw([
      campaign('b', 'announcement_bar', {
        content: { text: 'Kampanya', imageUrl: 'https://cdn.test/a.png' },
        styles: { imageSize: '32px', imageBorderRadius: '8px', imageSpacing: '10px' },
      }),
    ]);
    const [image] = images(renderer);
    expect(image!.props.source).toEqual({ uri: 'https://cdn.test/a.png' });
    expect(flatStyle(image!)).toMatchObject({ width: 32, height: 32, borderRadius: 8 });
    expect(flatStyle(hostParent(image!))).toMatchObject({ marginRight: 10 });
  });

  it('draws the popup’s picture above its words, full width, at its ratio and its fit', async () => {
    const { renderer } = await draw([
      campaign('p', 'exit_intent_popup', {
        content: { title: 'Gitme', imageUrl: 'https://cdn.test/p.png' },
        styles: { imageMode: 'cover', imageAspectRatio: '4/3', imageObjectFit: 'fill', imageBorderRadius: '20px' },
        placement: POPUP_NOW,
      }),
    ]);
    const [image] = images(renderer);
    expect(flatStyle(image!)).toMatchObject({ width: '100%', aspectRatio: 4 / 3, borderRadius: 20 });
    expect(image!.props.resizeMode).toBe('stretch');
  });

  it('draws a thumbnail at its size, and a full-width picture with square corners', async () => {
    const thumb = await draw([
      campaign('p1', 'exit_intent_popup', { content: { title: 'a', imageUrl: 'https://cdn.test/p.png' }, styles: { imageMode: 'thumbnail', imageSize: '64px' }, placement: POPUP_NOW }),
    ]);
    expect(flatStyle(images(thumb.renderer)[0]!)).toMatchObject({ width: 64, height: 64 });
    await teardown();

    resetWorld();
    const full = await draw([
      campaign('p2', 'exit_intent_popup', { content: { title: 'a', imageUrl: 'https://cdn.test/p.png' }, styles: { imageMode: 'fullWidth', imageBorderRadius: '20px' }, placement: POPUP_NOW }),
    ]);
    expect(flatStyle(images(full.renderer)[0]!)).toMatchObject({ width: '100%', borderRadius: 0 });
  });

  it('lays the picture beside the words at the merchant’s width, on the side they chose', async () => {
    const { renderer } = await draw([
      campaign('p', 'exit_intent_popup', {
        content: { title: 'Gitme', imageUrl: 'https://cdn.test/p.png' },
        styles: { imagePosition: 'right', imageWidth: '120px' },
        placement: POPUP_NOW,
      }),
    ]);
    const [image] = images(renderer);
    expect(flatStyle(image!)).toMatchObject({ width: 120 });
    const row = renderer.root.findAllByType(el('View')).find((node) => flatStyle(node)['flexDirection'] === 'row-reverse');
    expect(row).toBeDefined();
  });

  it('lets an edge-to-edge picture out of the card’s padding, with square corners', async () => {
    const bleed = await draw([
      campaign('p', 'exit_intent_popup', { content: { title: 'Gitme', imageUrl: 'https://cdn.test/p.png' }, styles: { imageBleed: true, padding: '30px' }, placement: POPUP_NOW }),
    ]);
    const [image] = images(bleed.renderer);
    expect(flatStyle(image!)).toMatchObject({ borderRadius: 0 });
    // Its parent is the card, which holds no padding: the words' block has it.
    expect(flatStyle(hostParent(image!))['padding']).toBeUndefined();
    await teardown();

    resetWorld();
    const inside = await draw([
      campaign('p', 'exit_intent_popup', { content: { title: 'Gitme', imageUrl: 'https://cdn.test/p.png' }, styles: { padding: '30px' }, placement: POPUP_NOW }),
    ]);
    expect(flatStyle(hostParent(images(inside.renderer)[0]!))).toMatchObject({ padding: 30 });
  });

  it('draws the slide-in’s picture, at its own ratio once it is known and at the fallback until then', async () => {
    const { renderer } = await draw([
      campaign('s', 'slide_in', { content: { title: 'Merhaba', imageUrl: 'https://cdn.test/s.png' }, styles: { imageMode: 'cover', imageAspectRatio: 'auto' } }),
    ]);
    expect(flatStyle(images(renderer)[0]!)).toMatchObject({ width: '100%', aspectRatio: 16 / 9 });
  });

  it('draws a newsletter’s picture too, when it has one', async () => {
    const { renderer } = await draw([
      campaign('n', 'newsletter', { content: { headline: 'Bülten', buttonText: 'Katıl', imageUrl: 'https://cdn.test/n.png' } }),
    ]);
    expect(images(renderer)).toHaveLength(1);
  });

  it('skips an SVG without a host image component, and hands it to the host’s when there is one', async () => {
    const svg = campaign('b', 'announcement_bar', { content: { text: 'Kampanya', imageUrl: 'https://cdn.test/logo.svg' } });
    const plain = await draw([svg]);
    expect(images(plain.renderer)).toHaveLength(0);
    expect(texts(plain.renderer)).toContain('Kampanya');
    await teardown();

    resetWorld();
    const drawn: string[] = [];
    const hosted = await draw([svg], { renderImage: ({ uri }) => { drawn.push(uri); return h('HostImage', { uri }); } });
    expect(drawn).toContain('https://cdn.test/logo.svg');
    expect(hosted.renderer.root.findAllByType(el('HostImage'))).toHaveLength(1);
  });

  it('resolves a storefront-relative picture against the storefront the host named, and skips it without one', async () => {
    const item = campaign('b', 'announcement_bar', { content: { text: 'Kampanya', imageUrl: '/media/a.png' } });
    const named = await draw([item], { storefrontUrl: 'https://shop.test/' });
    expect(images(named.renderer)[0]!.props.source).toEqual({ uri: 'https://shop.test/media/a.png' });
    await teardown();

    resetWorld();
    const bare = await draw([item]);
    expect(images(bare.renderer)).toHaveLength(0);
  });

  it('opens the picture’s own link on a tap, reports it, and takes the popup away without recording a close', async () => {
    const { renderer, navigated, client } = await draw([
      campaign('p', 'exit_intent_popup', {
        content: { title: 'Gitme', imageUrl: 'https://cdn.test/p.png', imageLinkUrl: 'app://basket' },
        placement: POPUP_NOW,
      }),
    ]);
    const link = hostParent(images(renderer)[0]!);
    await press(link);
    await settle();
    await client.flush();

    expect(navigated).toEqual([{ kind: 'screen', url: 'app://basket', source: 'campaign', entityId: 'p' }]);
    expect(eventsOf('click')[0]).toMatchObject({ entityId: 'p', metadata: { linkUrl: 'app://basket' } });
    expect(renderer.root.findAllByType(el('Modal'))).toHaveLength(0);
    expect(eventsOf('close')).toHaveLength(0);
  });
});

describe('the tap', () => {
  it('opens an app screen of the catalogue through the host, as a screen', async () => {
    const { renderer, navigated } = await draw([
      campaign('b', 'announcement_bar', { content: { text: 'Sepetin', buttonText: 'Git', buttonUrl: 'app://basket' } }),
    ]);
    await press(renderer.root.findAllByType(el('Pressable')).find((node) => textOf(node) === 'Git')!);
    expect(navigated).toEqual([{ kind: 'screen', url: 'app://basket', source: 'campaign', entityId: 'b' }]);
  });

  it('opens an https link as a page, and leaves a screen address alone when the host opens nothing', async () => {
    const page = await draw([campaign('b1', 'announcement_bar', { content: { text: 'x', buttonText: 'Git', buttonUrl: 'https://shop.test/x' } })], { navigate: () => false });
    await press(page.renderer.root.findAllByType(el('Pressable')).find((node) => textOf(node) === 'Git')!);
    expect(controls.linkingOpened).toEqual(['https://shop.test/x']);
    await teardown();

    resetWorld();
    const screen = await draw([campaign('b2', 'announcement_bar', { content: { text: 'x', buttonText: 'Git', buttonUrl: 'app://basket' } })], { navigate: () => false });
    await press(screen.renderer.root.findAllByType(el('Pressable')).find((node) => textOf(node) === 'Git')!);
    expect(controls.linkingOpened).toEqual([]);
  });

  it('closes the popup on a tap on its backdrop, and remembers it as a close', async () => {
    const { renderer, client } = await draw([campaign('p', 'exit_intent_popup', { content: { title: 'Gitme' }, placement: POPUP_NOW })]);
    const scrim = renderer.root.findAllByType(el('Pressable')).find((node) => node.props.accessibilityLabel === 'Kapat' && 'onPress' in node.props && flatStyle(node)['position'] === 'absolute' && flatStyle(node)['backgroundColor']);
    await press(scrim!);
    await settle();
    await client.flush();
    expect(renderer.root.findAllByType(el('Modal'))).toHaveLength(0);
    expect(eventsOf('close')).toHaveLength(1);
  });

  it('leaves the newsletter alone on a tap outside it: a half-typed address survives a stray tap', async () => {
    const { renderer } = await draw([campaign('n', 'newsletter', { content: { headline: 'Bülten', buttonText: 'Katıl' } })]);
    const scrimPressable = renderer.root.findAllByType(el('Pressable')).find((node) => flatStyle(node)['position'] === 'absolute' && flatStyle(node)['backgroundColor']);
    expect(scrimPressable).toBeUndefined();
    expect(renderer.root.findAllByType(el('Modal'))).toHaveLength(1);
  });

  it('takes the popup away on its button, without remembering a close', async () => {
    const { renderer, client } = await draw([
      campaign('p', 'exit_intent_popup', { content: { title: 'Gitme', buttonText: 'Kullan', buttonUrl: 'https://shop.test/k' }, placement: POPUP_NOW }),
    ]);
    await press(renderer.root.findAllByType(el('Pressable')).find((node) => textOf(node) === 'Kullan')!);
    await settle();
    await client.flush();
    expect(renderer.root.findAllByType(el('Modal'))).toHaveLength(0);
    expect(eventsOf('close')).toHaveLength(0);
    expect(eventsOf('click')).toHaveLength(1);
  });

  it('keeps the slide-in on screen after its button, as the web’s does', async () => {
    const { renderer } = await draw([campaign('s', 'slide_in', { content: { title: 'Merhaba', buttonText: 'Gör', buttonUrl: 'app://list' } })]);
    await press(renderer.root.findAllByType(el('Pressable')).find((node) => textOf(node) === 'Gör')!);
    expect(texts(renderer)).toContain('Merhaba');
  });
});

describe('the exit-intent trigger', () => {
  const popup = campaign('p', 'exit_intent_popup', { content: { title: 'Gitme' }, placement: { triggerStrategy: 'exit_intent' } });

  it('does not fire on iOS’s inactive state (control centre, a permission dialog), only when the app goes to the background', async () => {
    const { renderer, client } = await draw([popup]);
    expect(renderer.root.findAllByType(el('Modal'))).toHaveLength(0);

    await act(async () => controls.emitAppState('inactive'));
    expect(renderer.root.findAllByType(el('Modal'))).toHaveLength(0);

    await act(async () => controls.emitAppState('background'));
    expect(renderer.root.findAllByType(el('Modal'))).toHaveLength(1);
    // Armed is not shown: counted when the shopper is back, not into a backgrounded app.
    await client.flush();
    expect(eventsOf('impression')).toHaveLength(0);

    await act(async () => controls.emitAppState('active'));
    await client.flush();
    expect(eventsOf('impression')).toHaveLength(1);
  });

  it('opens after the delay, on the event, or at once, as it does today', async () => {
    jest.useFakeTimers();
    const delayed = await draw([campaign('d', 'exit_intent_popup', { content: { title: 'Geç' }, placement: { triggerStrategy: 'time_delay', triggerDelaySeconds: 3 } })]);
    expect(delayed.renderer.root.findAllByType(el('Modal'))).toHaveLength(0);
    await act(async () => {
      jest.advanceTimersByTime(3100);
    });
    expect(delayed.renderer.root.findAllByType(el('Modal'))).toHaveLength(1);
  });
});

describe('the experiment click goal', () => {
  const EXPERIMENT = {
    'exp-1': {
      experimentId: 'exp-1',
      variantId: 'var-b',
      experimentMode: 'config_override',
      targetType: 'campaign',
      targetId: 'b',
      effectiveTargetId: 'b',
      excludedTargetIds: [],
      config: { content: { buttonText: 'Varyant' } },
    },
  };
  const bar = () => campaign('b', 'announcement_bar', { content: { text: 'Kampanya', buttonText: 'Git', buttonUrl: 'https://shop.test/x' } });
  const tracked = () => world.calls.filter((call) => call.url.includes('/experiments/track'));

  it('sends the click of the tested surface to the experiment, with the key and the arm', async () => {
    world.assignments = EXPERIMENT;
    const { renderer, client } = await draw([bar()]);
    await press(renderer.root.findAllByType(el('Pressable')).find((node) => textOf(node) === 'Varyant')!);
    await client.flush();

    const click = tracked().find((call) => call.body?.['eventType'] === 'click')!;
    expect(click.body).toMatchObject({ experimentId: 'exp-1', variantId: 'var-b', eventType: 'click' });
    expect(typeof click.body!['visitorId']).toBe('string');
    expect(click.headers['x-selwise-api-key']).toBe('api-key');
    expect(click.url).toContain('/public/experiments/track?siteKey=site-key');
  });

  it('sends the exposure with the key too: the route holds an app’s writes to it', async () => {
    world.assignments = EXPERIMENT;
    await draw([bar()]);
    const exposure = tracked().find((call) => call.body?.['eventType'] === 'exposure')!;
    expect(exposure.headers['x-selwise-api-key']).toBe('api-key');
  });

  it('sends nothing for a surface that is in no experiment', async () => {
    const { renderer } = await draw([bar()]);
    await press(renderer.root.findAllByType(el('Pressable')).find((node) => textOf(node) === 'Git')!);
    expect(tracked()).toHaveLength(0);
  });

  it('sends nothing in test mode: the merchant checking their own app is not a sample', async () => {
    world.assignments = EXPERIMENT;
    world.campaigns = [{ ...bar(), isTestMode: true }];
    const client = await startClient({ qaLinks: true });
    client.applyQaLink('app://home?selwise_test=1');
    const { host } = recordingHost();
    const renderer = await mount(client, host, h(SelwiseSurfaces));
    await goTo(client, 'app://home', { pageType: 'home' });
    await settle();
    await press(renderer.root.findAllByType(el('Pressable')).find((node) => textOf(node) === 'Varyant')!);
    await client.flush();
    expect(tracked()).toHaveLength(0);
  });
});

describe('the newsletter signup carries its evidence', () => {
  const FORM = campaign('nl', 'newsletter', {
    content: {
      headline: 'Bülten',
      buttonText: 'Katıl',
      collectPhone: true,
      smsConsentText: 'SMS ile bilgilendirilmeyi kabul ediyorum.',
      privacyNoticeText: 'Aydınlatma metni',
      privacyNoticeUrl: 'https://shop.test/gizlilik',
    },
  });

  async function subscribe(item: unknown, screen = 'app://basket') {
    world.campaigns = [item];
    const client = await startClient();
    const { host } = recordingHost();
    const renderer = await mount(client, host, h(SelwiseSurfaces));
    await goTo(client, screen, { pageType: 'cart' });
    await settle();
    await act(async () => {
      renderer.root.findAllByType(el('TextInput'))[0]!.props.onChangeText('a@b.co');
    });
    await press(renderer.root.findAllByType(el('Pressable')).find((node) => node.props.accessibilityRole === 'button' && textOf(node) === 'Katıl')!);
    await settle();
    await client.flush();
    return world.calls.find((call) => call.url.includes('/newsletter'))!;
  }

  it('sends the exact wording the form showed, a version of it, and the screen it was on', async () => {
    const call = await subscribe(FORM);
    expect(call.body).toMatchObject({
      email: 'a@b.co',
      sourcePath: 'app://basket',
      consentText: 'SMS ile bilgilendirilmeyi kabul ediyorum.\nAydınlatma metni',
    });
    expect(call.body!['consentTextVersion']).toMatch(/^[0-9a-f]{8}$/);
    expect(call.headers['x-selwise-api-key']).toBe('api-key');
  });

  it('changes the version when the wording changes, and keeps it when only the style does', async () => {
    const first = await subscribe(FORM);
    await teardown();
    resetWorld();
    const edited = await subscribe(campaign('nl', 'newsletter', { content: { ...(FORM['contentJson'] as object), smsConsentText: 'Başka bir metin' } }));
    expect(edited.body!['consentTextVersion']).not.toBe(first.body!['consentTextVersion']);
  });

  it('sends no wording when the form showed none', async () => {
    const call = await subscribe(campaign('nl', 'newsletter', { content: { headline: 'Bülten', buttonText: 'Katıl' } }));
    expect(call.body).not.toHaveProperty('consentText');
    expect(call.body).not.toHaveProperty('consentTextVersion');
    expect(call.body).toMatchObject({ sourcePath: 'app://basket' });
  });
});

describe('the screen view', () => {
  it('reports no referrer, so a visit no deep link opened reads as direct', async () => {
    world.campaigns = [];
    const client = await startClient();
    client.trackScreenView('app://home', { screenName: 'Home' }, { pageType: 'home' });
    await client.flush();
    expect(eventsOf('page_view')[0]).toMatchObject({ entityId: 'app://home', metadata: { referrer: '', screenName: 'Home' } });
  });

  it('keeps a referrer the host passed', async () => {
    const client = await startClient();
    client.trackScreenView('app://home', { referrer: 'push' });
    await client.flush();
    expect(eventsOf('page_view')[0]).toMatchObject({ metadata: { referrer: 'push' } });
  });
});
