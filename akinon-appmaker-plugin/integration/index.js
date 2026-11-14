'use strict';

/**
 * Selwise plugin for Akinon App Maker.
 *
 * ## What it does without touching a screen
 *
 * App Maker's `AnalyticsService` broadcasts the app's own events — navigation,
 * product detail, basket changes, checkout success, login — to every
 * subscribed plugin. Subscribing gives Selwise tracking, identity and order
 * attribution across the whole app with no per-screen edits, which is the same
 * shape the RelatedDigital and Adjust plugins use in this app.
 *
 * Recommendations are the exception and cannot work that way: they need a
 * place on screen. `Selwise.recommendation()` hands a screen its data and the
 * screen renders it with the app's own components.
 *
 * ## init() is called for us
 *
 * `CreateApp` runs `initThirdParties()`, which calls `init()` on every plugin
 * in the generated `dependencies/plugins.js` registry. Nothing else needs to
 * call this.
 */

const SelwiseAnalytics = require('./analytics');
const SelwiseRecommendation = require('./recommendation');
const { screenUrl, screenPageType, SCREEN_URLS } = require('./screens.js');
const { basketCart, cartKey } = require('./cart.js');
const { productFacts, productKey } = require('./product.js');
const { setThemeTokens } = require('../ui/styles.js');
const { fixedCountdownTarget } = require('../ui/countdown.js');

const PLUGIN_KEY = 'selwise-akinon-appmaker';

class SelwisePlugin {
  constructor() {
    this.config = readConfig();
    this.selwise = null;
    this.analytics = null;
    this.ready = null;
    this.currentScreen = { pageUrl: null, screenName: null };
    this.screenListeners = new Set();
    this.stopCartFeed = null;
    this.stopProductFeed = null;
    this.currentProduct = null;
    this.productListeners = new Set();
    this.stopDeepLinks = null;
  }

  /**
   * The screen the visitor is on, and a subscription to it.
   *
   * `<SelwiseSurfaces />` renders whatever targets the current screen, so it
   * needs to re-evaluate on every navigation. This is the only place that
   * learns about navigation (from App Maker's analytics bus), so it is the
   * place that publishes it — the alternative is the UI subscribing to that bus
   * a second time and the two disagreeing about which screen is current.
   */
  getScreen() {
    return this.currentScreen;
  }

  onScreenChange(listener) {
    if (typeof listener !== 'function') return () => {};
    this.screenListeners.add(listener);
    // Fire immediately: a component mounting after the navigation event would
    // otherwise render nothing until the visitor moved again.
    if (this.currentScreen.pageUrl) listener(this.currentScreen);
    return () => this.screenListeners.delete(listener);
  }

  setScreen(pageUrl, screenName) {
    this.currentScreen = {
      pageUrl: pageUrl,
      screenName: screenName || null,
      pageType: screenPageType(screenName) || null,
    };
    for (const listener of this.screenListeners) {
      try {
        listener(this.currentScreen);
      } catch (error) {
        log('screen listener failed: ' + ((error && error.message) || error));
      }
    }
  }

  init() {
    if (!this.config) {
      log('no config found under plugins.' + PLUGIN_KEY + ' — plugin idle');
      return;
    }
    // The dashboard calls this value a CHANNEL key (an app is one kind of
    // channel; a website is the other). `siteKey` stays accepted because it is
    // in every config.json already deployed in a merchant's App Maker project.
    const channelKey = this.config.channelKey || this.config.siteKey;
    if (!channelKey || !this.config.apiKey) {
      // Loud, because the failure is otherwise invisible: every call would
      // return empty and look like an empty catalogue.
      log('channelKey (or siteKey) and apiKey are both required — plugin idle');
      return;
    }
    this.channelKey = channelKey;

    const client = createSdkClient();
    if (!client) {
      log('@selwise/react-native is not installed — plugin idle');
      return;
    }

    this.selwise = client;
    this.analytics = new SelwiseAnalytics({
      selwise: client,
      config: this.config,
      onScreen: (pageUrl, screenName) => this.setScreen(pageUrl, screenName),
    });

    // Subscribed BEFORE init resolves. The SDK queues what it cannot send yet
    // and the app publishes its first navigation event within milliseconds of
    // startup; waiting for the network would drop the app's opening screen.
    if (this.config.analytics === undefined || this.config.analytics.active !== false) {
      const AnalyticsService = requireAnalyticsService();
      if (AnalyticsService) {
        AnalyticsService.subscribe('selwise-analytics', this.analytics);
      } else {
        log('AnalyticsService unavailable — events will not be collected');
      }
    }

    const storage = requireAsyncStorage();
    if (!storage) {
      // Not fatal, but it degrades everything quietly: the SDK falls back to
      // an in-memory store, so every launch is a brand-new visitor, the
      // logged-in id is forgotten and the offline queue cannot survive a
      // crash. The SDK only warns about this in debug mode.
      log('AsyncStorage unavailable — visitor identity will not survive a restart');
    }

    // `global.Selwise`, the app's answer to `window.Selwise`.
    //
    // The browser widget puts itself on `window` so a merchant can poke at it
    // from the console. In an app the equivalent is the debugger's evaluation
    // context, which has no module registry — so without this there is no way
    // to ask a running app what Selwise thinks is on screen. Debug only: it is
    // a handle onto the visitor's identity and should not exist in a release.
    if (this.config.debug && typeof global !== 'undefined') {
      global.Selwise = this;
    }

    this.ready = client.init({
      channelKey,
      apiKey: this.config.apiKey,
      ...(storage ? { storage } : {}),
      // Shows up on every event and order, so Selwise can tell app traffic
      // from web traffic without inferring it from the user agent.
      clientPlatform: 'akinon-appmaker',
      ...(appVersion() ? { clientVersion: appVersion() } : {}),
      ...(this.config.apiUrl ? { apiUrl: this.config.apiUrl } : {}),
      ...(this.config.debug ? { debug: true } : {}),
      ...(this.config.consent ? { consent: this.config.consent } : {})
    })
      .then(() => {
        log('initialized for channel ' + channelKey);
        // Seed the screen from the app's own state.
        //
        // `<SelwiseSurfaces />` renders whatever targets the current screen,
        // and it learns the screen from App Maker's `navigationChange`. That
        // event does not always fire on a cold start — the app restores to its
        // opening route without publishing a CHANGE — and when it does not,
        // every campaign and widget stays invisible until the visitor
        // navigates. Twice in testing that looked exactly like a broken
        // integration.
        //
        // `state.app.currentPage` is the app's own answer to the same
        // question, so it is read once here as the floor.
        this.seedInitialScreen();
        this.startCartFeed();
        this.startProductFeed();
        this.startAppStateFeed();
        this.applyBrandTheme();
        return true;
      })
      .catch((error) => {
        log('init failed: ' + ((error && error.message) || error));
        return false;
      });

    // Subscribed now, recorded once the SDK is ready: the link that cold-
    // starts the app arrives before init resolves, and it is the one a push
    // or an e-mail campaign is credited by.
    this.stopDeepLinks = subscribeDeepLinks((url) => this.recordDeepLink(url));
  }

  /**
   * A link that opened the app — a push, an e-mail, an ad, another app.
   * The SDK reads the attribution off it (`sw_sc`, `utm_*`) and drops the
   * rest; an SDK older than 1.4.0 has no `trackDeepLink` and nothing is sent.
   */
  recordDeepLink(url) {
    if (!url || !this.ready) return;
    void this.ready.then((ok) => {
      if (!ok || !this.selwise || typeof this.selwise.trackDeepLink !== 'function') return;
      try {
        const read = this.selwise.trackDeepLink(String(url));
        if (read) log('deep link recorded' + (read.scenarioId ? ' (message ' + read.scenarioId + ')' : ''));
      } catch (error) {
        log('deep link failed: ' + ((error && error.message) || error));
      }
    });
  }

  /**
   * Hands the site brand theme to the style translator.
   *
   * Widget style DEFAULTS are literally `'var(--selwise-brand, #1a1a1a)'`, so
   * without this every unmodified widget in the app rendered with an
   * unparseable colour string instead of the merchant's brand. `/config` is
   * fetched in the background by the SDK, so this is retried on the first
   * surface fetch rather than assumed to have landed by now.
   */
  applyBrandTheme() {
    if (!this.selwise || typeof this.selwise.getTheme !== 'function') return false;

    const tokens = this.selwise.getTheme();
    if (!tokens || Object.keys(tokens).length === 0) return false;

    setThemeTokens(tokens);
    log('brand theme applied (' + Object.keys(tokens).length + ' token(s))');
    return true;
  }

  /**
   * Waits for the app's own state to name a screen, once.
   *
   * A single read at init is too early — the app is still booting and
   * `app.currentPage` is empty — so this subscribes until the first non-empty
   * value arrives and then unsubscribes. Bounded by a timeout so a store that
   * never reports one does not leave a listener attached for the session.
   */
  seedInitialScreen() {
    if (this.currentScreen.pageUrl) return;

    const store = requireStore();
    if (!store || typeof store.subscribe !== 'function') return;

    const apply = () => {
      const page = currentPageFromStore();
      if (!page) return false;
      if (!this.currentScreen.pageUrl) {
        this.setScreen(screenUrl(page), page);
        log('initial screen ' + page + ' (from app state)');
      }
      return true;
    };

    if (apply()) return;

    let unsubscribe = null;
    const stop = () => {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    };

    unsubscribe = store.subscribe(() => {
      if (this.currentScreen.pageUrl || apply()) stop();
    });

    // `navigationChange` normally arrives within a second of the first render;
    // this only has to cover the launches where it does not.
    setTimeout(stop, 15000);
  }

  /**
   * Hands the app's basket to the SDK, on every basket change.
   *
   * The goal bar, `{cart.total}` in campaign copy and the `cartValue` /
   * `cartItemCount` targeting signals all read the SDK's cart, and in an app
   * only the app knows its basket — it lives in the Redux store, not behind a
   * storefront URL the SDK could fetch. So the store is subscribed for the
   * session, and `setCart` runs whenever the basket's total, quantity or
   * currency moved (`cartKey`), not on every unrelated action.
   *
   * A basket the app has not fetched yet — or has just cleaned after an order
   * — goes to the SDK as `null`: unknown, never printed (`./cart.js`).
   */
  startCartFeed() {
    if (this.stopCartFeed) return;
    const client = this.selwise;
    if (!client || typeof client.setCart !== 'function') return;

    const store = requireStore();
    if (!store || typeof store.subscribe !== 'function' || typeof store.getState !== 'function') {
      log('app store unavailable — the basket will not reach goal bars or cart placeholders');
      return;
    }

    let lastKey = null;
    const apply = () => {
      let cart = null;
      try {
        cart = basketCart(store.getState());
      } catch (error) {
        cart = null;
      }
      const key = cartKey(cart);
      if (key === lastKey) return;
      lastKey = key;
      client.setCart(cart);
    };

    apply();
    this.stopCartFeed = store.subscribe(apply) || (() => {});
  }

  /**
   * The product the CURRENT screen shows, for `{product.*}` in campaign words
   * — or `null` on any screen but ProductDetail, and while a product is still
   * loading there. `<SelwiseSurfaces />` passes it to `getSurfaces`.
   *
   * The reducer keeps the last product after the screen is left, so the screen
   * name is the gate: a banner on the home screen must never say the price of
   * the product the shopper looked at before.
   */
  getProduct() {
    if (this.currentScreen.screenName !== 'ProductDetail') return null;
    return this.currentProduct;
  }

  /** Called when the product on a ProductDetail screen changes. Returns the unsubscribe. */
  onProductChange(listener) {
    if (typeof listener !== 'function') return () => {};
    this.productListeners.add(listener);
    return () => this.productListeners.delete(listener);
  }

  /**
   * Hands the app's `AppState` to the SDK (`setAppState`, SDK 1.2.0): the
   * dashboard's Live View counts the user while the app is in the foreground,
   * and the queue is flushed when it leaves. An older SDK has no
   * `setAppState`, and then nothing is subscribed — it keeps its old behaviour.
   */
  startAppStateFeed() {
    if (this.appStateSubscription) return true;
    if (!this.selwise || typeof this.selwise.setAppState !== 'function') return false;
    let AppState = null;
    try {
      AppState = require('react-native').AppState;
    } catch (error) {
      return false;
    }
    if (!AppState || typeof AppState.addEventListener !== 'function') return false;
    const selwise = this.selwise;
    this.appStateSubscription = AppState.addEventListener('change', (state) => selwise.setAppState(state));
    return true;
  }

  /**
   * Follows `state.productDetail` for the session, the way `startCartFeed`
   * follows the basket: listeners hear about a new product (`productKey`), not
   * every unrelated action. Reading the product needs no request — the screen
   * already fetched it.
   */
  startProductFeed() {
    if (this.stopProductFeed) return;
    const store = requireStore();
    if (!store || typeof store.subscribe !== 'function' || typeof store.getState !== 'function') {
      log('app store unavailable — product values will not reach campaigns');
      return;
    }

    let lastKey = null;
    const apply = () => {
      let state = null;
      let facts = null;
      try {
        state = store.getState();
        facts = productFacts(state);
      } catch (error) {
        facts = null;
      }
      const key = productKey(state, facts);
      if (key === lastKey) return;
      lastKey = key;
      this.currentProduct = facts;
      for (const listener of this.productListeners) {
        try {
          listener(facts);
        } catch (error) {
          log('product listener failed: ' + ((error && error.message) || error));
        }
      }
    };

    apply();
    this.stopProductFeed = store.subscribe(apply) || (() => {});
  }

  /**
   * Where a countdown counts to right now: the SDK's `countdownTarget` (a fixed
   * end date, or the next daily cutoff in the store's time zone), or the fixed
   * end date alone on an SDK that predates daily cutoffs.
   */
  countdownTarget(content, now) {
    const sdk = this.sdkModule();
    const at = typeof now === 'number' ? now : Date.now();
    if (sdk && typeof sdk.countdownTarget === 'function') {
      try {
        return sdk.countdownTarget(content || {}, at);
      } catch (error) {
        return null;
      }
    }
    return fixedCountdownTarget(content);
  }

  /**
   * The goal-bar steps passed between two views of one bar — the SDK's
   * statement of "crossed while the bar was visible". Nothing on an SDK that
   * predates the goal bar, which also has no `resolveGoalBar` to draw one.
   */
  goalStepsCrossed(previous, next) {
    const sdk = this.sdkModule();
    if (!sdk || typeof sdk.goalStepsCrossed !== 'function') return [];
    return sdk.goalStepsCrossed(previous, next) || [];
  }

  sdkModule() {
    if (this.sdkModuleCache === undefined) this.sdkModuleCache = requireSdkModule();
    return this.sdkModuleCache;
  }

  /**
   * The SDK's `RecommendationWidgetLoader` (0.10.0+) — the object
   * `useRecommendationWidget` runs on — or null on an older SDK, where
   * `<RecommendationStrips />` asks every strip once per screen, as before.
   */
  recommendationLoader() {
    const sdk = this.sdkModule();
    const Loader = sdk && sdk.RecommendationWidgetLoader;
    return typeof Loader === 'function' ? Loader : null;
  }

  /** The data side of recommendations. Safe to call before `init()` resolves. */
  recommendation() {
    return new SelwiseRecommendation({ selwise: this.selwise, config: this.config });
  }

  /**
   * Newsletter signup from a newsletter widget.
   *
   * Here rather than in the renderer so the surface id travels with it: the
   * widget's own report is what a merchant looks at to see whether the form
   * converted, and without the id the signup lands attributed to nothing.
   */
  async subscribeNewsletter(email, surface) {
    if (!this.selwise) return { success: false };
    await this.ready;
    return this.selwise
      .subscribeNewsletter(email, surface ? { surfaceId: surface.id } : {})
      .catch((error) => {
        log('newsletter signup failed: ' + ((error && error.message) || error));
        return { success: false };
      });
  }

  /** Search, for a screen that wants Selwise results instead of the storefront's. */
  /**
   * A search, with the merchant's redirect rules honoured.
   *
   * A redirect REPLACES the result list — "kargo" sends the visitor to the
   * shipping page, usually with zero hits. The browser widget navigates and
   * renders nothing; an app that ignored the field showed an empty list for a
   * rule the merchant wrote on purpose. Navigation is performed here and the
   * result is flagged, so a caller that renders `hits` shows nothing rather
   * than an empty-state message.
   */
  async search(query, options) {
    if (!this.selwise) return { query, hits: [] };
    await this.ready;

    const result = await this.selwise
      .search(query, options || {})
      .catch(() => ({ query, hits: [] }));

    const redirect = typeof result.redirect === 'string' ? result.redirect.trim() : '';
    if (redirect) {
      const navigated = await this.openStorefrontPath(redirect).catch(() => false);
      return Object.assign({}, result, { redirected: navigated });
    }

    return result;
  }

  /**
   * Adds to the basket on behalf of a custom widget.
   *
   * Through the app's OWN basket action, not a fetch: a WebView-rendered
   * widget has no storefront session, so anything it added directly would land
   * in a basket the visitor never sees. Dispatching the app's action puts the
   * item in the same basket its own buttons fill, and the app's basket badge
   * and modal update for free.
   *
   * `product.pk` is what that action posts, and `pk` is the code Selwise
   * carries as `cart_code` — so a custom widget passes the cart code. A sku
   * would be accepted by this method and rejected by the storefront, which is
   * why the tracked event carries whichever code was given: the merchant can
   * see in their own report that the wrong one is being sent.
   */
  async addToCartFromSurface(surface, code, quantity) {
    const cartCode = String(code || '').trim();
    if (!cartCode) return false;
    const count = Number.isFinite(Number(quantity)) && Number(quantity) > 0 ? Math.floor(Number(quantity)) : 1;

    if (this.selwise) {
      this.selwise.trackAddToCart(cartCode, {
        quantity: count,
        source: 'custom_widget',
        surfaceId: (surface && surface.id) || '',
      });
    }

    const basket = requireBasketActions();
    const store = requireStore();
    if (!basket || !store || typeof basket.addToCart !== 'function') {
      log('cannot add to cart: the app basket container is unavailable');
      return false;
    }

    try {
      await store.dispatch(basket.addToCart({ pk: cartCode }, count, { modal: true }));
      return true;
    } catch (error) {
      log('add to cart failed: ' + ((error && error.message) || error));
      return false;
    }
  }

  /**
   * Opens a storefront path the way the app would.
   *
   * A campaign's `buttonUrl` is authored for the web — `/list/`,
   * `/baskets/basket/`. Handing that to `Linking.openURL` sends the visitor out
   * to a browser, which is the wrong outcome for a path the app has a screen
   * for: App Maker's own deep-link map turns `baskets/basket` into the Basket
   * screen. So a relative path goes through that map, and only a genuinely
   * external absolute url leaves the app.
   */
  async openStorefrontPath(url) {
    const path = String(url || '').trim();
    if (!path) return false;

    const external = /^https?:\/\//i.test(path);
    const shopUrl = storefrontOrigin();

    // An absolute url on the merchant's own domain is still an in-app
    // destination; only a third-party one is not.
    const isOwnDomain = external && shopUrl && path.startsWith(shopUrl);

    if (external && !isOwnDomain) {
      return openExternally(path);
    }

    const deepLink = requireDeeplinkService();
    if (deepLink && typeof deepLink.handleUrl === 'function') {
      const absolute = isOwnDomain ? path : joinUrl(shopUrl, path);
      try {
        await new Promise((resolve, reject) => deepLink.handleUrl(resolve, reject, absolute));
        return true;
      } catch (error) {
        log('deep link could not handle ' + absolute);
      }
    }

    // No deep-link map, or it refused the path: opening a browser is better
    // than a button that does nothing.
    const absolute = isOwnDomain ? path : joinUrl(shopUrl, path);
    return absolute ? openExternally(absolute) : false;
  }

  /**
   * A search result click.
   *
   * The one search event the SDK cannot send by itself: only the view knows
   * which row was tapped and at which position. `SDK.search()` already logs the
   * query and the zero-result case, so nothing else here logs those.
   */
  trackSearchClick(query, itemCode, position) {
    if (!this.selwise || !itemCode) return;
    this.selwise.trackSearchClick(String(query || ''), String(itemCode), position);
  }

  /**
   * The placement keys this channel's live enrichment rules carry.
   *
   * What makes the app side of enrichment free-form: a screen renders whatever
   * slots the merchant has actually named, and `debug` says when one is named
   * that no screen renders — otherwise a merchant's content is silently absent
   * and the only clue is an empty space.
   */
  enrichmentSlots() {
    if (!this.selwise || typeof this.selwise.getEnrichmentSlots !== 'function') return [];
    return this.selwise.getEnrichmentSlots();
  }

  /**
   * Base typography for an enrichment document.
   *
   * A block with no styling of its own should look like it belongs to the app,
   * not like a browser default. Read from the site brand theme so a merchant
   * who set their colours once gets them here too; every merchant rule can
   * still override any of it.
   */
  enrichmentTheme() {
    const tokens =
      this.selwise && typeof this.selwise.getTheme === 'function' ? this.selwise.getTheme() : {};
    const configured = (this.config && this.config.enrichment) || {};

    return {
      background: configured.background || 'transparent',
      textColor: configured.textColor || tokens['--selwise-text'] || '',
      fontFamily: configured.fontFamily || tokens['--selwise-font'] || '',
      fontSize: configured.fontSize || '14px',
      padding: configured.padding || '0px',
      // So a relative image (`/media/size-chart.png`) in a block resolves against the shop.
      baseUrl: storefrontOrigin() || '',
    };
  }

  /**
   * The rendered enrichment for a product, for a host doing its own drawing.
   *
   * `<SelwiseEnrichment />` is the ready-made path; this is here for an app
   * that wants the markup and will put it in its own WebView.
   */
  async enrichment(code, slots) {
    if (!this.selwise) return { items: [] };
    await this.ready;
    return this.selwise
      .getEnrichment(String(code || ''), Array.isArray(slots) ? slots : [slots])
      .catch(() => ({ items: [] }));
  }

  /**
   * The bridge script for a WebView.
   *
   * The checkout flow is a WebView in most App Maker apps, so without this the
   * single most valuable part of the funnel is unmeasured.
   */
  webViewBridge() {
    const sdk = requireSdkModule();
    if (!sdk || !sdk.WebViewBridge || !this.selwise) return null;
    // The constructor takes the CLIENT, not an options bag. Handed
    // `{ selwise }`, the bridge called `trackOrder` on a plain object, so every
    // order completed in the checkout WebView threw inside `onMessage` and was
    // never recorded — the one part of the funnel this exists to measure.
    return new sdk.WebViewBridge(this.selwise);
  }

  screenUrl(screenName) {
    return screenUrl(screenName);
  }
}

function readConfig() {
  try {
    // eslint-disable-next-line global-require
    const akinonConfig = require('_akinonConfig');
    const plugin = akinonConfig && akinonConfig.plugins && akinonConfig.plugins[PLUGIN_KEY];
    return (plugin && plugin.config) || null;
  } catch (error) {
    return null;
  }
}

function requireSdkModule() {
  try {
    // eslint-disable-next-line global-require
    return require('@selwise/react-native');
  } catch (error) {
    return null;
  }
}

/**
 * One client instance for the app.
 *
 * The package exports the CLASS, not a ready-made singleton — `default` is
 * `Selwise` itself. Calling `Selwise.init()` on the export therefore throws
 * "init is not a function", which is what the first version of this plugin
 * did; an end-to-end run against the real API (now `demo/ardisa/app/verify.mjs`)
 * is what caught it.
 */
function createSdkClient() {
  const sdk = requireSdkModule();
  if (!sdk) return null;

  const SelwiseClient = sdk.Selwise || sdk.default;
  if (typeof SelwiseClient !== 'function') return null;
  return new SelwiseClient();
}

/**
 * The app's own AsyncStorage.
 *
 * `_dependencies` is the App Maker re-export every plugin in this app uses,
 * and it is the one guaranteed to be the same instance the app itself uses.
 * The direct package is the fallback for an app that does not re-export it.
 */
/** The screen the app is on, read from its own redux state. */
function currentPageFromStore() {
  try {
    const store = requireStore();
    if (!store || typeof store.getState !== 'function') return '';
    const state = store.getState() || {};
    const page = state.app && state.app.currentPage;
    return typeof page === 'string' && page.trim() ? page.trim() : '';
  } catch (error) {
    return '';
  }
}

function requireStore() {
  try {
    // eslint-disable-next-line global-require
    const imported = require('@core/store');
    return (imported && (imported.default || imported)) || null;
  } catch (error) {
    return null;
  }
}

function requireBasketActions() {
  try {
    // eslint-disable-next-line global-require
    const container = require('@services/container');
    const containers = (container.default || container).get('dataContainers') || {};
    const basket = containers.basket;
    return (basket && basket.actions) || null;
  } catch (error) {
    return null;
  }
}

/**
 * Every way a link reaches the app, one callback.
 *
 * React Native's `Linking` is the floor: `getInitialURL` for the link that
 * started the app, the `url` event for one that arrives while it runs. App
 * Maker's `DeepLinkService` also publishes notification opens, so it is
 * subscribed too when it offers `subscribe`. One open may arrive through both;
 * the SDK records a link once per session, so that is one landing.
 * Returns the unsubscribe.
 */
function subscribeDeepLinks(onUrl) {
  const stops = [];
  const pick = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    return String(value.url || value.link || value.deepLink || value.deeplink || '');
  };
  const deliver = (value) => {
    const url = pick(value).trim();
    if (url) onUrl(url);
  };

  try {
    // eslint-disable-next-line global-require
    const { Linking } = require('react-native');
    if (Linking && typeof Linking.getInitialURL === 'function') {
      Linking.getInitialURL().then(deliver, () => undefined);
    }
    if (Linking && typeof Linking.addEventListener === 'function') {
      const subscription = Linking.addEventListener('url', deliver);
      stops.push(() => subscription && typeof subscription.remove === 'function' && subscription.remove());
    }
  } catch (error) {
    log('Linking unavailable — links that open the app are not attributed');
  }

  const deepLink = requireDeeplinkService();
  if (deepLink && typeof deepLink.subscribe === 'function') {
    try {
      // The documented shape names the subscriber like AnalyticsService does;
      // a one-argument subscribe takes the handler alone.
      const handle = deepLink.subscribe.length >= 2 ? deepLink.subscribe(PLUGIN_KEY, deliver) : deepLink.subscribe(deliver);
      if (typeof handle === 'function') stops.push(handle);
    } catch (error) {
      log('DeepLinkService.subscribe failed: ' + ((error && error.message) || error));
    }
  }

  return () => {
    for (const stop of stops) {
      try {
        stop();
      } catch (error) {
        // error-surface: an unsubscribe that throws leaves nothing to undo
      }
    }
  };
}

function requireDeeplinkService() {
  try {
    // eslint-disable-next-line global-require
    const imported = require('@services/deepLink');
    return imported && (imported.default || imported);
  } catch (error) {
    return null;
  }
}

/** The merchant's own origin, from the app's url map. */
function storefrontOrigin() {
  try {
    // eslint-disable-next-line global-require
    const container = require('@services/container');
    const maps = (container.default || container).get('integrationMaps');
    const urls = (maps && maps.urls) || {};
    const shop = urls.SHOP_URL || urls.BASE_URL || '';
    return String(shop).replace(/\/+$/, '');
  } catch (error) {
    return '';
  }
}

function joinUrl(origin, path) {
  if (!origin) return '';
  return origin + (path.startsWith('/') ? path : '/' + path);
}

function openExternally(url) {
  try {
    // eslint-disable-next-line global-require
    const { Linking } = require('react-native');
    return Linking.openURL(url).then(
      () => true,
      () => false
    );
  } catch (error) {
    return Promise.resolve(false);
  }
}

function requireAsyncStorage() {
  try {
    // eslint-disable-next-line global-require
    const deps = require('_dependencies');
    if (deps && deps.AsyncStorage) return deps.AsyncStorage;
  } catch (error) {
    // fall through
  }

  try {
    // eslint-disable-next-line global-require
    const imported = require('@react-native-async-storage/async-storage');
    return (imported && (imported.default || imported)) || null;
  } catch (error) {
    return null;
  }
}

function appVersion() {
  try {
    // eslint-disable-next-line global-require
    const akinonConfig = require('_akinonConfig');
    return (akinonConfig && akinonConfig.version) || '';
  } catch (error) {
    return '';
  }
}

function requireAnalyticsService() {
  try {
    // eslint-disable-next-line global-require
    const imported = require('@services/analytics/service');
    return imported && (imported.default || imported);
  } catch (error) {
    return null;
  }
}

function log(message) {
  // eslint-disable-next-line no-console
  console.log('[Selwise] ' + message);
}

module.exports = new SelwisePlugin();
module.exports.SelwisePlugin = SelwisePlugin;
module.exports.PLUGIN_KEY = PLUGIN_KEY;
module.exports.SCREEN_URLS = SCREEN_URLS;
module.exports.subscribeDeepLinks = subscribeDeepLinks;
