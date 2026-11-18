'use strict';

/**
 * `ui/index.js` re-exports the SDK's components. What it adds is two things
 * only an App Maker app has: a provider already connected to the plugin, and
 * the screen in the app's own route names.
 */
jest.mock(
  'react',
  () => ({
    createElement: (type, props, ...children) => ({ type, props, children }),
    Fragment: 'Fragment',
    useMemo: (factory) => factory(),
    useCallback: (callback) => callback,
  }),
  { virtual: true }
);
jest.mock(
  '@selwise/react-native/ui',
  () => ({
    SelwiseProvider: 'SdkProvider',
    SelwiseSlot: 'SdkSlot',
    RecommendationStrips: 'SdkStrips',
    SelwiseSurfaces: 'SdkSurfaces',
    SelwiseSearch: 'SdkSearch',
  }),
  { virtual: true }
);
jest.mock('react-native', () => ({}), { virtual: true });
jest.mock('@core/store', () => ({ getState: () => ({}), subscribe: () => () => undefined }), { virtual: true });

const plugin = require('../integration/index.js');
const ui = require('./index.js');

afterEach(() => {
  plugin.selwise = null;
});

describe('the SDK components', () => {
  it('are the same ones a plain React Native app mounts', () => {
    expect(ui.SelwiseSurfaces).toBe('SdkSurfaces');
    expect(ui.SelwiseSearch).toBe('SdkSearch');
  });
});

describe('SelwiseProvider', () => {
  it('connects the SDK’s provider to the plugin’s client and the app as its host', () => {
    plugin.selwise = { client: true };

    const element = ui.SelwiseProvider({ children: 'app' });

    expect(element.type).toBe('SdkProvider');
    expect(element.props.client).toBe(plugin.selwise);
    expect(element.props.host).toEqual(expect.objectContaining({ navigate: expect.any(Function), addToCart: expect.any(Function) }));
    expect(element.children).toEqual(['app']);
  });

  it('lets the app override any part of what the plugin answers', () => {
    plugin.selwise = { client: true };
    const navigate = () => true;

    const element = ui.SelwiseProvider({ host: { navigate }, children: 'app' });

    expect(element.props.host.navigate).toBe(navigate);
    expect(typeof element.props.host.addToCart).toBe('function');
  });

  it('renders the children as they are when the plugin is idle — there is no client to connect', () => {
    plugin.selwise = null;

    const element = ui.SelwiseProvider({ children: 'app' });

    expect(element.type).toBe('Fragment');
    expect(element.children).toEqual(['app']);
  });
});

describe('screens in App Maker’s route names', () => {
  it('turns a route into the screen address the SDK takes', () => {
    const slot = ui.SelwiseSlot({ screenName: 'ProductDetail', slot: 'pdp-bottom', sku: 'KM1' });

    expect(slot.type).toBe('SdkSlot');
    expect(slot.props).toEqual({ screen: 'app://product', slot: 'pdp-bottom', sku: 'KM1' });
    expect(ui.RecommendationStrips({ screenName: 'HomePage' }).props).toEqual({ screen: 'app://home' });
  });

  it('keeps an address the caller gave, and leaves the screen out when there is none to name', () => {
    expect(ui.SelwiseSlot({ screen: 'app://basket', screenName: 'ProductDetail', slot: 'x' }).props.screen).toBe('app://basket');
    expect(ui.SelwiseSlot({ slot: 'x' }).props).toEqual({ slot: 'x' });
  });
});
