import { createElement as h, type ElementType } from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Selwise } from '../client.js';
import { SelwiseProvider } from '../react/context.js';
import { normalizeSurface } from '../core/surfaces.js';
import * as renderers from './surfaces/index.js';
import { defaultSearchSettings } from '../vendor/search-settings.js';
import { searchTheme } from './search-styles.js';
import { SearchResultItem } from './search-result-item.js';
import { readPickId } from './pick-ids.js';
import { APP_WIDGET_TYPES } from '../vendor/app-placement.js';
import { countdownUnits } from './countdown.js';
import './test/react-native.mock.js';

/**
 * Each part of a surface the merchant edits says which part it is (`testID`), so
 * the dashboard's preview can turn a click on it into the field that draws it.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function draw(type: string, content: Record<string, unknown>, Component: unknown): ReactTestInstance {
  const surface = normalizeSurface({ id: type, type, contentJson: content, stylesJson: {}, placementConfigJson: {} }, 'campaign')!;
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      h(
        SelwiseProvider,
        { client: new Selwise() },
        h(Component as ElementType, { surface, onPress: () => undefined, onDismiss: () => undefined, onImagePress: () => undefined }),
      ),
    );
  });
  return renderer.root;
}

function drawElement(element: ReturnType<typeof h>): ReactTestInstance {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(h(SelwiseProvider, { client: new Selwise() }, element));
  });
  return renderer.root;
}

function drawCounter(type: 'product_view_count' | 'cart_count'): ReactTestInstance {
  const surface = normalizeSurface(
    { id: type, type, contentJson: { template: '{count} kişi' }, stylesJson: {}, placementConfigJson: {} },
    'campaign',
  )!;
  // a counter below its threshold is not drawn: it is handed a number
  return drawElement(h(renderers.CountBadge as never, { surface, value: 128, locale: 'tr', onPress: () => undefined, onDismiss: () => undefined } as never));
}

const picks = (root: ReactTestInstance) =>
  root
    .findAll((node) => typeof node.props?.testID === 'string' && readPickId(node.props.testID) !== null)
    .map((node) => node.props.testID as string);

describe('a drawn part says which part it is', () => {
  it('an announcement bar: its container, words, button and close', () => {
    const root = draw('announcement_bar', { text: 'Kargo bedava', buttonText: 'Gör', buttonUrl: 'app://list' }, renderers.AnnouncementBar);
    const ids = picks(root);
    expect(ids).toEqual(
      expect.arrayContaining(['selwise-pick:container', 'selwise-pick:text:text', 'selwise-pick:button:buttonText', 'selwise-pick:close']),
    );
  });

  it('a popup card: title, text, picture, button and close, and the card itself', () => {
    const root = draw(
      'exit_intent_popup',
      { title: 'Gitme', text: 'İndirim', buttonText: 'Kullan', imageUrl: 'https://img.test/a.png' },
      renderers.SurfaceCard,
    );
    expect(picks(root)).toEqual(
      expect.arrayContaining([
        'selwise-pick:container',
        'selwise-pick:title:title',
        'selwise-pick:text:text',
        'selwise-pick:image:imageUrl',
        'selwise-pick:button:buttonText',
        'selwise-pick:close',
      ]),
    );
  });

  it('a sticky footer and a floating button', () => {
    expect(picks(draw('sticky_footer', { text: 'a', subtext: 'b', buttonText: 'Git' }, renderers.StickyFooter))).toEqual(
      expect.arrayContaining(['selwise-pick:text:text', 'selwise-pick:text:subtext', 'selwise-pick:button:buttonText']),
    );
    expect(picks(draw('floating_button', { label: '?' }, renderers.FloatingButton))).toContain('selwise-pick:text:label');
  });

  it('a search result: the card is the results section, its button the basket', () => {
    const settings = defaultSearchSettings();
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        h(
          SelwiseProvider,
          { client: new Selwise() },
          h(SearchResultItem, {
            product: { id: 'p', itemCode: 'P', title: 'Ceket', price: 10, currency: 'TRY', url: '' },
            index: 0,
            settings,
            theme: searchTheme(settings.appearance),
            query: '',
            locale: 'tr',
            t: (key: string) => key,
            onPress: () => undefined,
            onAddToCart: () => undefined,
          } as never),
        ),
      );
    });
    expect(picks(renderer.root)).toEqual(expect.arrayContaining(['selwise-pick:card:results', 'selwise-pick:button:cart']));
  });

  /**
   * Every campaign type the app draws, with the parts the website's preview lets a
   * merchant click, as the ids they carry here. `custom` is the merchant's own
   * markup in a WebView: it has no parts of ours.
   */
  const PICKABLE: Record<string, { ids: string[]; draw: () => ReactTestInstance }> = {
    announcement_bar: {
      ids: ['container', 'text:text', 'button:buttonText', 'close'],
      draw: () => draw('announcement_bar', { text: 'a', buttonText: 'Git' }, renderers.AnnouncementBar),
    },
    sticky_footer: {
      ids: ['container', 'text:text', 'text:subtext', 'button:buttonText', 'close'],
      draw: () => draw('sticky_footer', { text: 'a', subtext: 'b', buttonText: 'Git' }, renderers.StickyFooter),
    },
    floating_button: { ids: ['text:label'], draw: () => draw('floating_button', { label: '?' }, renderers.FloatingButton) },
    exit_intent_popup: {
      ids: ['container', 'title:title', 'text:text', 'image:imageUrl', 'button:buttonText', 'close'],
      draw: () => draw('exit_intent_popup', { title: 't', text: 'x', buttonText: 'Git', imageUrl: 'https://img.test/a.png' }, renderers.SurfaceCard),
    },
    slide_in: {
      ids: ['container', 'title:title', 'text:text', 'image:imageUrl', 'button:buttonText', 'close'],
      draw: () => draw('slide_in', { title: 't', text: 'x', buttonText: 'Git', imageUrl: 'https://img.test/a.png' }, renderers.SurfaceCard),
    },
    countdown_timer: {
      ids: ['container', 'title:title', 'text:endDate', 'text:subtext', 'button:buttonText', 'close'],
      draw: () => {
        const surface = normalizeSurface(
          { id: 'c', type: 'countdown_timer', contentJson: { title: 'Bitiyor', subtext: 'Acele et', buttonText: 'Git' }, stylesJson: {}, placementConfigJson: {} },
          'campaign',
        )!;
        return drawElement(
          h(renderers.CountdownTimer as never, { surface, units: countdownUnits(Date.now() + 90_000_000), locale: 'tr', onPress: () => undefined, onDismiss: () => undefined } as never),
        );
      },
    },
    goal_bar: {
      ids: ['container', 'text', 'container:bar', 'container:markers', 'button:buttonText'],
      draw: () => {
        const surface = normalizeSurface(
          {
            id: 'g',
            type: 'goal_bar',
            contentJson: {
              metric: 'cart_total',
              thresholds: [{ at: 750, label: 'Kargo' }, { at: 1500, label: 'Hediye' }],
              text: '{goal.label} için {goal.remaining} kaldı',
              buttonText: 'Devam',
              buttonUrl: '/list/',
              completeText: 'Tebrikler',
            },
            stylesJson: { barHeight: '8px' },
            placementConfigJson: {},
          },
          'campaign',
        )!;
        const client = new Selwise();
        client.setCart({ total: 349, itemCount: 2, currency: 'TRY' });
        const view = client.resolveGoalBar(surface, { locale: 'tr-TR' });
        return drawElement(h(renderers.GoalBar as never, { surface, view, onPress: () => undefined, onDismiss: () => undefined } as never));
      },
    },
    newsletter: {
      ids: ['container', 'title:title', 'text:placeholder', 'text:phonePlaceholder', 'text:smsConsentText', 'text:privacyNoticeText', 'button:buttonText', 'close'],
      draw: () => {
        const surface = normalizeSurface(
          {
            id: 'n',
            type: 'newsletter',
            contentJson: { title: 'Bülten', buttonText: 'Abone ol', collectPhone: true, privacyNoticeUrl: 'https://shop.test/gizlilik' },
            stylesJson: {},
            placementConfigJson: { selector: '[data-selwise-slot="home-top"]' },
          },
          'campaign',
        )!;
        return drawElement(
          h(renderers.Newsletter as never, { surface, inSlot: true, locale: 'tr', onSubmit: async () => ({ success: true }), onDismiss: () => undefined } as never),
        );
      },
    },
    product_view_count: { ids: ['text:template'], draw: () => drawCounter('product_view_count') },
    cart_count: { ids: ['text:template'], draw: () => drawCounter('cart_count') },
  };

  it('every campaign type the app draws has its pickable parts named (custom is the merchant’s own markup)', () => {
    const covered = Object.keys(PICKABLE).sort();
    const drawn = APP_WIDGET_TYPES.filter((type) => type !== 'custom').slice().sort();
    // a type added to the table without a row here has parts nobody checked
    expect(covered).toEqual(drawn);
    for (const type of covered) {
      const found = picks(PICKABLE[type]!.draw());
      for (const id of PICKABLE[type]!.ids) {
        expect({ type, id, named: found.includes(`selwise-pick:${id}`) }).toEqual({ type, id, named: true });
      }
    }
  });
});
