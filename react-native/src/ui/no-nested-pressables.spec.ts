import { createElement as h, type ElementType, type ReactElement } from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Selwise } from '../client.js';
import { SelwiseProvider } from '../react/context.js';
import { normalizeSurface } from '../core/surfaces.js';
import { defaultSearchSettings } from '../vendor/search-settings.js';
import { searchTheme } from './search-styles.js';
import { SearchResultItem } from './search-result-item.js';
import { DefaultCard } from './card/DefaultCard.js';
import * as renderers from './surfaces/index.js';
import type { SelwiseProduct } from '../types.js';
import type { CardEnv } from './card/card-env.js';
import './test/react-native.mock.js';

/**
 * A button inside a button is invalid on the web — the dashboard draws these
 * components through react-native-web and the browser says so — a second target
 * a screen reader cannot reach on its own, and a tap that can land on both. A
 * card, a result or a surface that has a call to action of its own makes the
 * CTA a SIBLING of whatever else is tappable, never its child.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const el = (name: string) => name as unknown as ElementType;

/** The Pressables that have another Pressable somewhere inside them. */
function nested(root: ReactTestInstance): number {
  return root
    .findAllByType(el('Pressable'))
    .filter((outer) => outer.findAllByType(el('Pressable')).some((inner) => inner !== outer)).length;
}

function draw(element: ReactElement): ReactTestInstance {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    // The components read the brand theme from a client; an uninitialised one has none, which is all a shape test needs.
    renderer = create(h(SelwiseProvider, { client: new Selwise() }, element));
  });
  return renderer.root;
}

const product = {
  id: 'p1',
  itemCode: 'P1',
  title: 'Mavi Ceket',
  price: 100,
  originalPrice: 150,
  discountRate: 33,
  currency: 'TRY',
  imageUrl: 'https://img.test/a.png',
  url: 'app://product?code=P1',
  inStock: true,
} as SelwiseProduct;

describe('no pressable is drawn inside another', () => {
  it('a search result with an add-to-cart button, in every layout', () => {
    for (const layout of ['grid', 'list', 'compact'] as const) {
      const settings = defaultSearchSettings();
      settings.results.layout = layout;
      settings.results.fields.image = true;
      const root = draw(
        h(SearchResultItem, {
          product,
          index: 0,
          settings,
          theme: searchTheme(settings.appearance),
          query: 'ceket',
          locale: 'tr',
          t: (key: string) => key,
          onPress: () => undefined,
          onAddToCart: () => undefined,
        } as never),
      );
      // the card, its picture and the button are all there to be tapped ...
      expect(root.findAllByType(el('Pressable')).length).toBeGreaterThanOrEqual(2);
      // ... and none of them holds another
      expect(nested(root)).toBe(0);
    }
  });

  it('the tap on a result still opens the product, and the button still adds', () => {
    const settings = defaultSearchSettings();
    const opened: string[] = [];
    const root = draw(
      h(SearchResultItem, {
        product,
        index: 0,
        settings,
        theme: searchTheme(settings.appearance),
        query: '',
        locale: 'tr',
        t: (key: string) => key,
        onPress: () => opened.push('open'),
        onAddToCart: () => opened.push('add'),
      } as never),
    );
    const byLabel = (label: string) =>
      root.findAll((node) => (node.type as unknown) === 'Pressable' && node.props.accessibilityLabel === label)[0]!;
    byLabel('Mavi Ceket').props.onPress();
    expect(opened).toEqual(['open']);
    const buttons = root.findAll((node) => (node.type as unknown) === 'Pressable' && node.props.accessibilityRole === 'button');
    // the add button is the one whose label is not the title
    buttons.find((node) => node.props.accessibilityLabel !== 'Mavi Ceket')!.props.onPress();
    expect(opened).toEqual(['open', 'add']);
  });

  it('the default product card with its call to action', () => {
    const card = {
      cart: { ctaMode: 'add_to_cart', addToCartEnabled: true, canAdd: true, reviewButtonText: 'İncele', texts: {}, cardTexts: {} },
      selection: 'none',
      actions: { open: () => undefined, add: async () => true, choose: async () => null, say: () => undefined },
      language: 'tr',
      currency: 'TRY',
      locale: 'tr',
      tree: { root: { type: 'stack', children: [] } },
      ctx: {},
      rootText: {},
    } as unknown as CardEnv;
    const root = draw(h(DefaultCard, { product, onPress: () => undefined, env: { tokens: {}, currency: 'TRY', locale: 'tr', card } }));
    // the card and its button
    expect(root.findAllByType(el('Pressable')).length).toBe(2);
    expect(nested(root)).toBe(0);
  });

  it('every surface that has a button of its own', () => {
    const content = { title: 'Başlık', text: 'Metin', buttonText: 'Git', buttonUrl: 'app://list', imageUrl: 'https://img.test/a.png', imageLinkUrl: 'app://list', label: 'Ara', subtext: 'alt' };
    const types: Array<[string, (props: renderers.SurfaceRendererProps) => ReactElement]> = [
      ['announcement_bar', renderers.AnnouncementBar],
      ['sticky_footer', renderers.StickyFooter],
      ['floating_button', renderers.FloatingButton],
      ['exit_intent_popup', renderers.SurfaceModal as never],
      ['slide_in', renderers.SlideIn as never],
    ];
    for (const [type, Component] of types) {
      const surface = normalizeSurface({ id: type, type, contentJson: content, stylesJson: {}, placementConfigJson: {} }, 'campaign')!;
      const root = draw(h(Component as never, { surface, onPress: () => undefined, onDismiss: () => undefined, onImagePress: () => undefined } as never));
      expect({ type, nested: nested(root) }).toEqual({ type, nested: 0 });
    }
  });

  it('the newsletter, in a point and as a window, with its phone consent line and privacy link', () => {
    const content = {
      title: 'Bülten',
      text: 'Fırsatlar',
      buttonText: 'Abone ol',
      collectPhone: true,
      privacyNoticeUrl: 'https://shop.test/gizlilik',
      imageUrl: 'https://img.test/a.png',
    };
    for (const inSlot of [true, false]) {
      const surface = normalizeSurface(
        {
          id: 'n',
          type: 'newsletter',
          contentJson: content,
          stylesJson: {},
          placementConfigJson: inSlot ? { selector: '[data-selwise-slot="home-top"]' } : {},
        },
        'campaign',
      )!;
      const root = draw(
        h(renderers.Newsletter as never, { surface, inSlot, locale: 'tr', onSubmit: async () => ({ success: true }), onDismiss: () => undefined } as never),
      );
      // the checkbox, the privacy link, the button and the close are all tappable, none inside another
      expect(root.findAllByType(el('Pressable')).length).toBeGreaterThanOrEqual(4);
      expect({ inSlot, nested: nested(root) }).toEqual({ inSlot, nested: 0 });
    }
  });
});
