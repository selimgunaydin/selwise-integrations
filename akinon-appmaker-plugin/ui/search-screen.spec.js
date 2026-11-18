'use strict';

/**
 * `SelwiseSearchScreen`, called as a function with a small stand-in for React's
 * hooks: the elements it returns are plain `{ type, props, children }` objects,
 * and the mockEffects it asks for are run by the test.
 */
let mockSlots = [];
let mockCursor = 0;
let mockEffects = [];
// What `useOptionalSelwise` answers: the provider an app mounted above the screen, or none.
let mockAmbient = null;

jest.mock(
  'react',
  () => ({
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    Fragment: 'Fragment',
    useMemo: (factory) => factory(),
    useCallback: (callback) => callback,
    useState: (initial) => {
      const index = mockCursor;
      mockCursor += 1;
      if (!(index in mockSlots)) mockSlots[index] = initial;
      return [
        mockSlots[index],
        (value) => {
          mockSlots[index] = value;
        },
      ];
    },
    useEffect: (effect) => {
      mockEffects.push(effect);
    },
  }),
  { virtual: true }
);
jest.mock(
  '@selwise/react-native/ui',
  () => ({
    SelwiseProvider: 'SdkProvider',
    SelwiseSearchPanel: 'SdkPanel',
    useOptionalSelwise: () => mockAmbient,
    // The SDK's own rule, as written there: no language named, or a Turkish one.
    isTurkishLocale: (locale) => {
      const language = String(locale == null ? '' : locale).trim().toLowerCase();
      return !language || language === 'tr' || language.startsWith('tr-') || language.startsWith('tr_');
    },
  }),
  { virtual: true }
);
jest.mock('react-native', () => ({ View: 'View', Text: 'Text', Pressable: 'Pressable' }), { virtual: true });
jest.mock('@core/store', () => ({ getState: () => ({}), subscribe: () => () => undefined }), { virtual: true });

const plugin = require('../integration/index.js');
const { SelwiseProvider } = require('./provider.js');
const { SelwiseSearchScreen } = require('./search-screen.js');
const ui = require('./index.js');

function render(props) {
  mockCursor = 0;
  mockEffects = [];
  return SelwiseSearchScreen(props);
}

/** The panel inside the provider and the screen's frame. */
function panelOf(element) {
  expect(element.type).toBe(SelwiseProvider);
  const frame = element.children[0];
  expect(frame.type).toBe('View');
  expect(frame.props.style).toMatchObject({ flex: 1 });
  return frame.children[0];
}

function navigationStub(extra = {}) {
  return { goBack: jest.fn(), canGoBack: jest.fn(() => true), addListener: jest.fn(() => jest.fn()), ...extra };
}

beforeEach(() => {
  mockSlots = [];
  mockAmbient = null;
  plugin.config = null;
  plugin.selwise = { setScreen: jest.fn() };
});

afterEach(() => {
  plugin.selwise = null;
  plugin.config = null;
});

describe('SelwiseSearchScreen', () => {
  it('is exported from the ui entry, beside the components an app mounts', () => {
    expect(ui.SelwiseSearchScreen).toBe(SelwiseSearchScreen);
  });

  it('draws the merchant’s search panel as a whole screen, focused, clear of the safe area', () => {
    const panel = panelOf(render({ navigation: navigationStub(), route: { name: 'Search' } }));

    expect(panel.type).toBe('SdkPanel');
    expect(panel.props).toMatchObject({ autoFocus: true, safeArea: true, backLabel: expect.any(String) });
    expect(typeof panel.props.onBack).toBe('function');
  });

  describe('the back arrow', () => {
    it('goes back through the navigation', () => {
      const navigation = navigationStub();
      panelOf(render({ navigation, route: {} })).props.onBack();

      expect(navigation.goBack).toHaveBeenCalledTimes(1);
    });

    it('is left out when there is nothing to go back to', () => {
      const navigation = navigationStub({ canGoBack: jest.fn(() => false) });

      expect(panelOf(render({ navigation, route: {} })).props.onBack).toBeUndefined();
    });

    it('is drawn by a navigator that cannot say whether there is anything to go back to', () => {
      const navigation = navigationStub({ canGoBack: undefined });

      expect(typeof panelOf(render({ navigation, route: {} })).props.onBack).toBe('function');
    });

    it('is left out when there is no navigation at all', () => {
      expect(panelOf(render({})).props.onBack).toBeUndefined();
    });

    it('speaks the app’s language: Turkish for a Turkish configuration', () => {
      plugin.config = { locale: 'tr-TR' };
      expect(panelOf(render({ navigation: navigationStub(), route: {} })).props.backLabel).toBe('Geri');

      plugin.config = { locale: 'en-US' };
      expect(panelOf(render({ navigation: navigationStub(), route: {} })).props.backLabel).toBe('Back');
    });
  });

  describe('the term it starts from', () => {
    it('is route.params.query', () => {
      const panel = panelOf(render({ navigation: navigationStub(), route: { params: { query: 'ceket' } } }));

      expect(panel.props.initialQuery).toBe('ceket');
    });

    it('is none without one, or with a blank or a non-text one', () => {
      for (const route of [undefined, {}, { params: {} }, { params: { query: '  ' } }, { params: { query: 4 } }]) {
        expect(panelOf(render({ navigation: navigationStub(), route })).props.initialQuery).toBeUndefined();
      }
    });
  });

  describe('the screen it does NOT report', () => {
    it('leaves it to the plugin’s navigation path: no setScreen on mount or focus', () => {
      const navigation = navigationStub();
      render({ navigation, route: { name: 'SelwiseSearch' } });
      mockEffects.forEach((effect) => effect());

      expect(plugin.selwise.setScreen).not.toHaveBeenCalled();
      expect(navigation.addListener).not.toHaveBeenCalled();
    });
  });

  describe('while search is switched off for the visitor', () => {
    it('shows the panel’s own bar and a sentence, never a blank screen', () => {
      const first = panelOf(render({ navigation: navigationStub(), route: {} }));
      expect(first.props.style[0]).toEqual({ flex: 1 });

      first.props.onUnavailable('off');
      const element = render({ navigation: navigationStub(), route: {} });
      const frame = element.children[0];
      const panel = frame.children[0];
      const notice = frame.children[1];

      // The panel keeps its back arrow in a bar and gives the rest to the sentence.
      expect(panel.type).toBe('SdkPanel');
      expect(typeof panel.props.onBack).toBe('function');
      expect(panel.props.style[0]).toEqual({ flex: 0 });
      expect(notice).toBeTruthy();
      const sentence = notice.type().children[0];
      expect(sentence.props.accessibilityRole).toBe('alert');
      expect(sentence.children[0]).toBe('Search is not available right now.');
    });

    it('says it in Turkish for a Turkish configuration', () => {
      plugin.config = { locale: 'tr' };
      const first = panelOf(render({ navigation: navigationStub(), route: {} }));
      first.props.onUnavailable('test');
      const notice = render({ navigation: navigationStub(), route: {} }).children[0].children[1];

      expect(notice.type().children[0].children[0]).toBe('Arama şu anda kullanılamıyor.');
    });

    it('still tells the app that wrapped the screen', () => {
      const onUnavailable = jest.fn();
      panelOf(render({ navigation: navigationStub(), route: {}, onUnavailable })).props.onUnavailable('off');

      expect(onUnavailable).toHaveBeenCalledWith('off');
    });
  });

  describe('a plugin without configuration', () => {
    it('draws a back arrow and the sentence instead of a panel with no client', () => {
      plugin.selwise = null;
      const navigation = navigationStub();
      const element = render({ navigation, route: {} });

      expect(element.type.name).toBe('Idle');
      expect(typeof element.props.onBack).toBe('function');
      element.props.onBack();
      expect(navigation.goBack).toHaveBeenCalledTimes(1);
    });
  });

  it('hands every other prop to the panel, but never lets one take the screen over', () => {
    const onProductPress = () => undefined;
    const panel = panelOf(
      render({ navigation: navigationStub(), route: {}, onProductPress, autoFocus: false, addToCartLabel: 'Ekle', safeArea: false, onBack: () => 'mine' })
    );

    expect(panel.props).toMatchObject({ onProductPress, autoFocus: false, addToCartLabel: 'Ekle', safeArea: true });
    expect(panel.props.onBack()).not.toBe('mine');
  });

  it('draws the panel under the plugin’s provider, so it works without one around the app', () => {
    const element = render({ navigation: navigationStub(), route: {} });

    expect(element.type).toBe(SelwiseProvider);
  });

  describe('with the app’s own provider above it', () => {
    it('uses it as it is and mounts none of its own, so the app’s host is not shadowed', () => {
      mockAmbient = { marker: 'the app client' };
      const element = render({ navigation: navigationStub(), route: {} });

      expect(element.type).toBe('View');
      expect(element.props.style).toMatchObject({ flex: 1 });
      expect(element.children[0].type).toBe('SdkPanel');
    });

    it('draws the panel even when the plugin itself has no client', () => {
      mockAmbient = { marker: 'the app client' };
      plugin.selwise = null;

      expect(render({ navigation: navigationStub(), route: {} }).children[0].type).toBe('SdkPanel');
    });
  });
});
