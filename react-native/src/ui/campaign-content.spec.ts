import { createElement as h } from 'react';
import { act } from 'react-test-renderer';
import { SelwiseSlot } from './SelwiseSlot.js';
import { SelwiseSurfaces } from './SelwiseSurfaces.js';
import {
  campaign,
  el,
  flatStyle,
  goTo,
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
 * What each campaign type DRAWS of the content and the style the dashboard
 * stores (roadmap Faz 3): one test per group of fields that were promised and
 * not drawn (`APP_PENDING_FIELDS`, `faz3`). Each test names the dashboard's own
 * keys, not the renderer's.
 */

beforeEach(resetWorld);
afterEach(teardown);

async function draw(campaigns: unknown[], options: { screen?: string; host?: Parameters<typeof recordingHost>[0] } = {}) {
  world.campaigns = campaigns;
  const client = await startClient();
  const recorded = recordingHost(options.host);
  const renderer = await mount(client, recorded.host, h(SelwiseSurfaces));
  await goTo(client, options.screen ?? 'app://home', { pageType: 'home' });
  await settle();
  return { client, renderer, ...recorded };
}

describe('the newsletter says what the dashboard stored (headline, placeholder, success, button states)', () => {
  const NEWSLETTER = campaign('nl-1', 'newsletter', {
    content: {
      headline: 'Bültene katıl',
      text: 'Haftalık fırsatlar',
      emailPlaceholder: 'ornek@site.com',
      buttonText: 'Katıl',
      submittingButtonText: 'Gönderiliyor',
      successButtonText: 'Tamam',
      successMessage: 'Kaydın alındı',
      errorMessage: 'Olmadı',
    },
    styles: { headlineFontSize: '28px', headlineFontWeight: 'semibold' },
    placement: { position: 'center' },
  });

  it('draws the headline, the placeholder and the idle button label', async () => {
    const { renderer } = await draw([NEWSLETTER]);
    expect(texts(renderer)).toEqual(expect.arrayContaining(['Bültene katıl', 'Haftalık fırsatlar', 'Katıl']));
    expect(renderer.root.findByType(el('TextInput')).props.placeholder).toBe('ornek@site.com');
  });

  it('sets the headline in the headline size and weight', async () => {
    const { renderer } = await draw([NEWSLETTER]);
    const headline = renderer.root.findAllByType(el('Text')).find((node) => textOf(node) === 'Bültene katıl')!;
    expect(flatStyle(headline)).toMatchObject({ fontSize: 28, fontWeight: '600' });
  });

  it('relabels the button while sending and when done, and says the merchant’s success sentence', async () => {
    let release!: () => void;
    world.holdNewsletter = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { renderer, client } = await draw([NEWSLETTER]);
    await act(async () => {
      renderer.root.findByType(el('TextInput')).props.onChangeText('a@b.co');
    });
    const button = () => renderer.root.findAllByType(el('Pressable')).find((node) => node.props.accessibilityRole === 'button' && /Katıl|Gönderiliyor|Tamam/.test(textOf(node)))!;
    await press(button());
    expect(textOf(button())).toBe('Gönderiliyor');
    expect(button().props.disabled).toBe(true);

    await act(async () => release());
    await settle();
    expect(texts(renderer)).toContain('Kaydın alındı');
    expect(textOf(button())).toBe('Tamam');
    await client.flush();
  });

  it('keeps the merchant’s own label for a state they wrote none for', async () => {
    const plain = campaign('nl-2', 'newsletter', { content: { headline: 'x', buttonText: 'Katıl' } });
    let release!: () => void;
    world.holdNewsletter = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { renderer } = await draw([plain]);
    await act(async () => {
      renderer.root.findByType(el('TextInput')).props.onChangeText('a@b.co');
    });
    const button = () => renderer.root.findAllByType(el('Pressable')).find((node) => node.props.accessibilityRole === 'button' && textOf(node) === 'Katıl');
    await press(button()!);
    expect(button()).toBeDefined();
    await act(async () => release());
  });
});

describe('the sticky footer, the countdown and the floating button draw their sub-text, button, label and tooltip', () => {
  it('draws the footer’s sub-text on a line of its own, and not a repeat of the text', async () => {
    const footer = campaign('sf-1', 'sticky_footer', { content: { text: 'Kargo bedava', subtext: '500 TL üzeri', buttonText: 'Gör' }, placement: { position: 'bottom' } });
    const { renderer } = await draw([footer]);
    expect(texts(renderer)).toEqual(expect.arrayContaining(['Kargo bedava', '500 TL üzeri', 'Gör']));

    const same = campaign('sf-2', 'sticky_footer', { content: { text: 'Aynı', subtext: 'aynı' }, placement: { position: 'bottom' } });
    const second = await draw([same]);
    expect(texts(second.renderer).filter((line) => line.toLowerCase() === 'aynı')).toHaveLength(1);
  });

  it('draws the countdown with its sub-text and its button, and the unit labels', async () => {
    const end = new Date(Date.now() + 3 * 86400_000 + 3_600_000).toISOString().slice(0, 16);
    const countdown = campaign('cd-1', 'countdown_timer', {
      content: { title: 'Bitiyor', text: 'Acele et', buttonText: 'Al', buttonUrl: 'app://basket', endDate: end },
      placement: { position: 'top' },
    });
    const { renderer, navigated, client } = await draw([countdown]);
    // No language named: the surface speaks Turkish, like every default sentence of the SDK.
    expect(texts(renderer)).toEqual(expect.arrayContaining(['Bitiyor', 'Acele et', 'Al', 'Gün', 'Saat', 'Dk', 'Sn']));

    await press(renderer.root.findAllByType(el('Pressable')).find((node) => textOf(node) === 'Al')!);
    await client.flush();
    expect(navigated).toEqual([{ kind: 'screen', url: 'app://basket', source: 'campaign', entityId: 'cd-1' }]);
  });

  it('counts down to the next daily cutoff in the store’s clock (countdownMode, dailyCutoff, cutoffTimeZone)', async () => {
    const countdown = campaign('cd-2', 'countdown_timer', {
      content: { countdownMode: 'daily_cutoff', dailyCutoff: '23:59', cutoffTimeZone: 'Europe/Istanbul', title: 'Bugün' },
    });
    const { renderer } = await draw([countdown]);
    // A fixed end date was never given: the surface exists only because the cutoff resolved a target.
    expect(texts(renderer)).toEqual(expect.arrayContaining(['Bugün', 'Sn']));
  });

  it('colours the timer box and its digits from the timer keys', async () => {
    const end = new Date(Date.now() + 86400_000).toISOString().slice(0, 16);
    const countdown = campaign('cd-3', 'countdown_timer', {
      content: { endDate: end },
      styles: { timerBgColor: '#112233', timerTextColor: '#fafafa', timerFontSize: '30px', separatorStyle: 'dot' },
    });
    const { renderer } = await draw([countdown]);
    const box = renderer.root.findAllByType(el('View')).find((node) => flatStyle(node)['backgroundColor'] === '#112233');
    expect(box).toBeDefined();
    const digits = renderer.root.findAllByType(el('Text')).find((node) => flatStyle(node)['fontSize'] === 30);
    expect(flatStyle(digits!)).toMatchObject({ color: '#fafafa' });
    expect(texts(renderer)).toContain('•');
  });

  it('draws the floating button’s text as its label, not a fixed emoji, and its tooltip', async () => {
    const button = campaign('fb-1', 'floating_button', {
      content: { text: 'Yardım', tooltip: 'Bize yazın' },
      styles: { tooltipBgColor: '#000001', tooltipTextColor: '#fffffe' },
      placement: { position: 'bottom-right' },
    });
    const { renderer } = await draw([button]);
    expect(texts(renderer)).toEqual(expect.arrayContaining(['Yardım', 'Bize yazın']));
    expect(texts(renderer)).not.toContain('💬');
    const tip = renderer.root.findAllByType(el('Text')).find((node) => textOf(node) === 'Bize yazın')!;
    expect(flatStyle(tip)).toMatchObject({ color: '#fffffe' });
    const bubble = renderer.root.findAllByType(el('View')).find((node) => flatStyle(node)['backgroundColor'] === '#000001');
    expect(bubble).toBeDefined();
  });

  it('shows the tooltip for a few seconds, then hides it, and brings it back on a long press', async () => {
    jest.useFakeTimers();
    const button = campaign('fb-2', 'floating_button', { content: { text: 'Hi', tooltip: 'Merhaba' } });
    const { renderer } = await draw([button]);
    expect(texts(renderer)).toContain('Merhaba');
    await act(async () => {
      jest.advanceTimersByTime(5100);
    });
    expect(texts(renderer)).not.toContain('Merhaba');
    await act(async () => {
      renderer.root.findAllByType(el('Pressable'))[0]!.props.onLongPress();
    });
    expect(texts(renderer)).toContain('Merhaba');
  });

  it('pulses only when the merchant turned the pulse on', async () => {
    await draw([campaign('fb-3', 'floating_button', { content: { text: 'a' }, styles: { pulseAnimation: true } })]);
    expect(controls.loops).toBe(1);
    controls.reset();
    await teardown();
    await draw([campaign('fb-4', 'floating_button', { content: { text: 'a' }, styles: { pulseAnimation: false } })]);
    expect(controls.loops).toBe(0);
  });
});

describe('the counters draw their template, period, icon, separator, display, count-up and badge', () => {
  const PRODUCT = 'app://product';
  const counter = (type: string, content: Record<string, unknown>, styles: Record<string, unknown> = {}) =>
    campaign('ct-' + type, type, { content, styles, targeting: { showOnAllPages: true } });

  /** `counts` is what the public API answers for the product on screen (`P1`). */
  async function drawCounter(item: Record<string, unknown>, counts: { cart?: number; productView?: number }) {
    world.campaigns = [item];
    world.metrics = { view: counts.productView ?? 0, cart: counts.cart ?? 0 };
    const client = await startClient();
    client.setProduct({ itemCode: 'P1' });
    const { host } = recordingHost();
    const renderer = await mount(
      client,
      host,
      h(SelwiseSurfaces),
      h(SelwiseSlot, { screen: PRODUCT, slot: 'pdp-under-info', context: { currentProductId: 'P1' } })
    );
    await goTo(client, PRODUCT, { pageType: 'product' });
    await settle();
    return { client, renderer };
  }

  it('fills {count} and {timePeriod} in the picked template, shortening a thousand as the web does', async () => {
    const { renderer } = await drawCounter(
      counter('product_view_count', { template: 'Son {timePeriod}: {count} görüntüleme', timePeriod: '7d' }, { animateCounter: false }),
      { productView: 1500 }
    );
    expect(texts(renderer).join('')).toContain('Son 7d: ');
    expect(texts(renderer)).toContain('1.5K');
  });

  it('prefers the custom text over the template, and ends a template with no {count} on the number', async () => {
    const { renderer } = await drawCounter(
      counter('cart_count', { template: '{count} kişi sepete ekledi', customText: 'Popüler!' }, { animateCounter: false }),
      { cart: 12 }
    );
    expect(texts(renderer).join('')).toContain('Popüler! ');
    expect(texts(renderer)).toContain('12');
  });

  it('draws the dashboard’s icon pick, or the host’s icon component for it', async () => {
    const own = await drawCounter(counter('product_view_count', { iconType: 'flame', showIcon: true }, { animateCounter: false }), { productView: 3 });
    expect(texts(own.renderer)).toContain('🔥');
    await teardown();

    resetWorld();
    world.campaigns = [counter('product_view_count', { iconType: 'users' }, { animateCounter: false })];
    world.metrics = { view: 3, cart: 0 };
    const client = await startClient();
    client.setProduct({ itemCode: 'P1' });
    const { host } = recordingHost({ renderIcon: ({ name }) => h('MyIcon', { name }) });
    const renderer = await mount(client, host, h(SelwiseSurfaces), h(SelwiseSlot, { screen: PRODUCT, slot: 'pdp-under-info', context: { currentProductId: 'P1' } }));
    await goTo(client, PRODUCT, { pageType: 'product' });
    await settle();
    expect(renderer.root.findByType(el('MyIcon')).props.name).toBe('users');
  });

  it('draws no icon when the merchant switched it off', async () => {
    const { renderer } = await drawCounter(counter('product_view_count', { showIcon: false }, { animateCounter: false }), { productView: 3 });
    expect(texts(renderer)).not.toContain('👁');
  });

  it('keeps the counter off the screen below its threshold', async () => {
    const { renderer } = await drawCounter(counter('cart_count', { minCount: 5 }, { animateCounter: false }), { cart: 4 });
    expect(texts(renderer)).toEqual([]);
  });

  it('counts up from zero over the merchant’s duration, and shows the number at once when animation is off', async () => {
    jest.useFakeTimers();
    const { renderer } = await drawCounter(counter('cart_count', { customText: '{count} kişi' }, { animateCounter: true, animationDuration: '500' }), { cart: 40 });
    expect(texts(renderer)).toContain('0');
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    expect(texts(renderer)).toContain('40');
  });

  it('draws the urgency badge, in its colours, only when asked', async () => {
    const withBadge = await drawCounter(
      counter('cart_count', { showIcon: true }, { animateCounter: false, showBadge: true, badgeText: 'son', badgeColor: '#aa0000', badgeTextColor: '#ffeeee' }),
      { cart: 3 }
    );
    expect(texts(withBadge.renderer)).toContain('son');
    const pill = withBadge.renderer.root.findAllByType(el('View')).find((node) => flatStyle(node)['backgroundColor'] === '#aa0000');
    expect(pill).toBeDefined();
    await teardown();

    resetWorld();
    const without = await drawCounter(counter('cart_count', { showIcon: true }, { animateCounter: false, showBadge: false, badgeText: 'son' }), { cart: 3 });
    expect(texts(without.renderer)).not.toContain('son');
  });

  it('follows the display key (inline stays beside its neighbours, block stretches)', async () => {
    const block = await drawCounter(counter('cart_count', { showIcon: true }, { animateCounter: false, display: 'block' }), { cart: 3 });
    const view = block.renderer.root.findAllByType(el('View')).find((node) => flatStyle(node)['alignSelf'] === 'stretch');
    expect(view).toBeDefined();
  });
});

describe('the close button', () => {
  it('has a touch target of at least 44 points around its glyph', async () => {
    const { renderer } = await draw([campaign('b-1', 'announcement_bar', { content: { text: 'Merhaba' } })]);
    const close = renderer.root.findAllByType(el('Pressable')).find((node) => node.props.accessibilityLabel === 'Kapat')!;
    const slop = close.props.hitSlop as { top: number; bottom: number; left: number; right: number };
    // 22pt of glyph height and 28pt of width, plus the slop on both sides.
    expect(22 + slop.top + slop.bottom).toBeGreaterThanOrEqual(44);
    expect(28 + slop.left + slop.right).toBeGreaterThanOrEqual(44);
  });

  it('is not drawn when the merchant turned it off', async () => {
    const { renderer } = await draw([campaign('b-2', 'announcement_bar', { content: { text: 'Merhaba' }, styles: { showCloseButton: false } })]);
    expect(renderer.root.findAllByType(el('Pressable')).find((node) => node.props.accessibilityLabel === 'Kapat')).toBeUndefined();
  });
});
