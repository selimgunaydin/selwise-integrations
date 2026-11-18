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
 * Campaigns, recommendations, search and product content are the exception and
 * cannot work that way: they need a place on screen. `ui/` mounts the SDK's
 * components with this plugin as their host (`@selwise/react-native/ui`), and
 * `Selwise.recommendation()` hands a screen its data when it draws its own.
 *
 * ## init() is called for us
 *
 * `CreateApp` runs `initThirdParties()`, which calls `init()` on every plugin
 * in the generated `dependencies/plugins.js` registry. Nothing else needs to
 * call this.
 */

const SelwiseAnalytics = require('./analytics');
const SelwiseRecommendation = require('./recommendation');
const { screenUrl, screenPageType, screenRouteOf, SCREEN_URLS } = require('./screens.js');
const { basketCart, cartKey } = require('./cart.js');
const { markSurfaceAdd, consumeOwnSurfaceAdd, CLAIM_GRACE_MS } = require('./surface-add.js');
const { productFacts, productKey } = require('./product.js');

const PLUGIN_KEY = 'selwise-akinon-appmaker';

class SelwisePlugin {
  constructor() {
    this.config = readConfig();
    this.selwise = null;
    this.analytics = null;
    this.ready = null;
    this.stopCartFeed = null;
    this.stopProductFeed = null;
    this.stopDeepLinks = null;
    this.userHashProvider = null;
  }

  /**
   * The screen the app is on, told to the SDK client, which the components read
   * (`client.on('screen')`): this plugin is the only thing that learns about
   * navigation (from App Maker's analytics bus), so it is the one place that
   * says it. The route name travels with it, and the page type the dashboard's
   * "only on product pages" rules are judged on.
   */
  setScreen(pageUrl, screenName) {
    if (!this.selwise || typeof this.selwise.setScreen !== 'function') return;
    this.selwise.setScreen(pageUrl, {
      screenName: screenName || null,
      pageType: screenPageType(screenName, this.screenRoutes()) || null,
    });
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
      getUserHashProvider: () => this.userHashProvider
    });
    this.configureStrips();

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
    if (this.config.debug === true && typeof global !== 'undefined') {
      global.Selwise = this;
    }

    // Read once. (Two functions, not one with a module name: Metro bundles only a
    // `require` whose argument is a literal.)
    const app = appVersion();
    const plugin = pluginVersion();
    const platform = osName();
    // The merchant's language: the config's `locale`, else the app's own current
    // language, so a campaign, a strip's heading and a search label come in the
    // language the app is showing. Read before `init()` so the first `/config`
    // already asks in it.
    this.ready = resolveLocale(this.config)
      .then((locale) =>
        client.init({
          channelKey,
          apiKey: this.config.apiKey,
          ...(storage ? { storage } : {}),
          // Shows up on every event and order, so Selwise can tell app traffic
          // from web traffic without inferring it from the user agent.
          clientPlatform: 'akinon-appmaker',
          ...(app ? { clientVersion: app } : {}),
          // Told to the dashboard beside the SDK's own version, so "which plugin and
          // which app release is this" is a glance there and not a support question.
          ...(plugin ? { pluginVersion: plugin } : {}),
          ...(app ? { appVersion: app } : {}),
          // `ios` / `android`: lets a segment target the OS the app runs on.
          ...(platform ? { platform } : {}),
          ...(locale ? { locale } : {}),
          // A cold start in test mode: the surfaces, strips and enrichment marked for
          // testing show on THIS device only. Off by default; a release build never sets it.
          ...(this.config.testMode === true ? { testMode: true } : {}),
          // A link may put this build in test mode and force an experiment arm
          // (the dashboard's "Try on a device"). Off unless the build asks for it:
          // anybody can send a link, and test mode hides every live campaign.
          ...(this.config.qaLinks === true ? { qaLinks: true } : {}),
          ...(this.config.apiUrl ? { apiUrl: this.config.apiUrl } : {}),
          ...(this.config.debug === true ? { debug: true } : {}),
          ...(this.config.consent ? { consent: this.config.consent } : {})
        })
      )
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
   * The visitor's answer to the app's consent dialog.
   *
   * When the dashboard's "Ask for consent before tracking" is on, Selwise holds
   * every event — nothing is sent, and every figure in the dashboard stays at
   * zero — until the app says what the visitor chose. This is how: call it with
   * your consent dialog's answer, on every launch that has one and whenever the
   * visitor changes it.
   *
   * ```js
   * Selwise.setConsent({ granted: true, categories: { analytics: true, marketing: false } });
   * ```
   *
   * The config's `consent` is only the answer a cold start begins with. Resolves
   * once the answer is stored (and what was held is on its way); `false` when
   * the plugin is idle or the SDK did not start.
   */
  async setConsent(snapshot) {
    if (!this.selwise || !this.ready) return false;
    if (!(await this.ready)) return false;
    try {
      await this.selwise.setConsent(snapshot);
      return true;
    } catch (error) {
      log('setConsent failed: ' + ((error && error.message) || error));
      return false;
    }
  }

  /**
   * Whether the dashboard asks for the app's consent before tracking — the
   * question `setConsent` answers. `true` means nothing is sent until it is
   * called, so an app that gets `true` here and never calls it measures nothing.
   * Resolves `false` when the plugin is idle.
   */
  async consentRequired() {
    if (!this.selwise || !this.ready) return false;
    if (!(await this.ready)) return false;
    try {
      return await this.selwise.isConsentRequired();
    } catch (error) {
      return false;
    }
  }

  /**
   * Signed identity. When the channel enforces it, an identify is accepted only
   * with an HMAC of the customer id made by YOUR server, and the secret must
   * never be in the app — so register a function that asks your own backend:
   *
   * ```js
   * Selwise.setUserHashProvider(async (userId) => {
   *   const { hash, ts } = await api.post('/selwise/identity', { userId });
   *   return { userHash: hash, userHashTs: ts };   // or just the hex string
   * });
   * ```
   *
   * It is asked at every sign-in (App Maker's `currentUser` / `userLogin`),
   * within 5 seconds; whatever it fails with, the login goes through without a
   * signature. Pass `null` to remove it.
   */
  setUserHashProvider(provider) {
    this.userHashProvider = typeof provider === 'function' ? provider : null;
  }

  /**
   * Whether the OS lets the app notify this person: `'granted'`, `'denied'` or
   * `'undetermined'` (never asked). Call it at launch and when the answer
   * changes: a segment can then say "has not allowed notifications", and a
   * phone registered with `registerPushToken` takes the answer (a phone is sent
   * a scenario's notification only while it is `'granted'`).
   */
  async setPushPermission(state) {
    if (!this.selwise || !this.ready) return;
    if (!(await this.ready)) return;
    if (typeof this.selwise.setPushPermission === 'function') this.selwise.setPushPermission(state);
  }

  /**
   * Register this phone for the merchant's app push scenarios.
   *
   * App Maker's own messaging plugin (`akinon-firebase-messaging-service`) keeps
   * the FCM token to itself and publishes it to no other plugin, so the token
   * is handed over here, from the app's own code:
   *
   * ```js
   * import messaging from '@react-native-firebase/messaging';
   * const token = await messaging().getToken();
   * Selwise.registerPushToken({ token, provider: 'fcm' });          // platform is the app's
   * messaging().onTokenRefresh((next) => Selwise.registerPushToken({ token: next, provider: 'fcm' }));
   * ```
   *
   * `provider` is `'fcm'` (Android, and iOS through Firebase), `'apns'` or
   * `'expo'`. It needs the visitor's marketing consent (`setConsent`) and
   * `setPushPermission('granted')`. Resolves `true` when Selwise has the phone;
   * `false` when the plugin is idle, the SDK has no app push (an older one), the
   * registration was withheld or a call could not be sent.
   */
  async registerPushToken(input) {
    if (!this.selwise || !this.ready) return false;
    if (!(await this.ready)) return false;
    if (typeof this.selwise.registerPushToken !== 'function') return false;
    try {
      // The OS the app runs on, unless the call names one (an Expo token on iOS is `ios`).
      const platform = (input && input.platform) || osName() || undefined;
      return await this.selwise.registerPushToken({ ...input, ...(platform ? { platform } : {}) });
    } catch (error) {
      log('registerPushToken failed: ' + ((error && error.message) || error));
      return false;
    }
  }

  /** The app's own "turn notifications off": Selwise stops notifying this phone. */
  async unregisterPushToken() {
    if (!this.selwise || !this.ready) return false;
    if (!(await this.ready)) return false;
    if (typeof this.selwise.unregisterPushToken !== 'function') return false;
    try {
      return await this.selwise.unregisterPushToken();
    } catch (error) {
      log('unregisterPushToken failed: ' + ((error && error.message) || error));
      return false;
    }
  }

  /**
   * A Selwise notification was tapped: records the messaging click (when it
   * carries Selwise's attribution) and returns the link it points at, or `null`
   * for a notification Selwise did not send. A push that goes through App
   * Maker's messaging plugin needs none of this — set that plugin's
   * `notification.deepLink.integrationMaps.urlPath` to `data.sw_link` and the
   * link reaches App Maker's DeepLinkService, which this plugin already listens
   * to (so the open is attributed) and the app navigates from.
   */
  trackPushOpen(payload) {
    if (!this.selwise || typeof this.selwise.trackPushOpen !== 'function') return null;
    try {
      return this.selwise.trackPushOpen(payload);
    } catch (error) {
      log('trackPushOpen failed: ' + ((error && error.message) || error));
      return null;
    }
  }

  /**
   * The app's language changed (`'tr'`, `'en-US'`). The merchant's text — a
   * campaign, a strip's heading, a search label, an enrichment block — is asked
   * for again in it, and what is already drawn follows. The config's `locale`,
   * or else the app's own language at launch, is where it starts.
   */
  async setLocale(locale) {
    if (!this.selwise || !this.ready) return;
    if (!(await this.ready)) return;
    this.selwise.setLocale(locale ? String(locale) : undefined);
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
   * Waits for the app's own state to name a screen, once.
   *
   * A single read at init is too early — the app is still booting and
   * `app.currentPage` is empty — so this subscribes until the first non-empty
   * value arrives and then unsubscribes. Bounded by a timeout so a store that
   * never reports one does not leave a listener attached for the session.
   */
  seedInitialScreen() {
    const client = this.selwise;
    if (!client || typeof client.getScreen !== 'function' || client.getScreen().pageUrl) return;

    const store = requireStore();
    if (!store || typeof store.subscribe !== 'function') return;

    const apply = () => {
      const page = currentPageFromStore();
      if (!page) return false;
      if (!client.getScreen().pageUrl) {
        this.setScreen(screenUrl(page, this.screenRoutes()), page);
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
      if (client.getScreen().pageUrl || apply()) stop();
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
   * follows the basket, and tells the SDK the product the CURRENT screen shows
   * (`client.setProduct`) — for `{product.*}` in campaign words — or `null` on
   * any screen but ProductDetail, and the pending marker while a product is
   * still loading there. The components ask for their surfaces again when it
   * moves; reading the product needs no request, the screen already fetched it.
   *
   * The reducer keeps the last product after the screen is left, so the screen
   * name is the gate: a banner on the home screen must never say the price of
   * the product the shopper looked at before. The screen is followed too, so
   * the gate moves with it.
   */
  startProductFeed() {
    if (this.stopProductFeed) return;
    const client = this.selwise;
    if (!client || typeof client.setProduct !== 'function') return;
    const store = requireStore();
    if (!store || typeof store.subscribe !== 'function' || typeof store.getState !== 'function') {
      log('app store unavailable — product values will not reach campaigns');
      return;
    }

    let state = null;
    let facts = null;
    const publish = () => {
      const onProduct = client.getScreen().screenName === 'ProductDetail';
      // The key says whether it is another product, or the same one fetched
      // again: either is worth asking the campaigns about once more.
      client.setProduct(onProduct ? facts : null, onProduct ? productKey(state, facts) : 'off-screen');
    };
    const read = () => {
      try {
        state = store.getState();
        facts = productFacts(state);
      } catch (error) {
        facts = null;
      }
      publish();
    };

    read();
    const stopStore = store.subscribe(read) || (() => {});
    const stopScreen = client.on('screen', publish);
    this.stopProductFeed = () => {
      stopStore();
      stopScreen();
    };
  }

  /**
   * Hands the config's `recommendation.placements` to the SDK's strip service,
   * once, so the ready-made components and `recommendation()` agree on which
   * widgets belong on which screen.
   */
  configureStrips() {
    const placements = this.config && this.config.recommendation && this.config.recommendation.placements;
    const strips = this.selwise && this.selwise.strips;
    if (placements && strips && typeof strips.setPlacements === 'function') strips.setPlacements(placements);
  }

  /** The data side of recommendations. Safe to call before `init()` resolves. */
  recommendation() {
    return new SelwiseRecommendation({ selwise: this.selwise, config: this.config });
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
  async addToCartFromSurface(surface, code, quantity, source) {
    return (await this.addToCartDetailed(surface, code, quantity, source)).success;
  }

  /**
   * `addToCartFromSurface` with the reason: `{ success, message? }`, where
   * `message` is the storefront's own sentence for a refusal (the basket's
   * `apiError`: "Bu ürün 0 adetten fazla satın alınamaz."), read from the app's
   * store. The SDK's host contract takes it (`SelwiseCartResult.message`) and
   * shows it where the add was pressed; without it a refused add looked like
   * nothing had happened. `message` is absent when the store gave none.
   */
  async addToCartDetailed(surface, code, quantity, source) {
    const cartCode = String(code || '').trim();
    if (!cartCode) return { success: false };
    const count = Number.isFinite(Number(quantity)) && Number(quantity) > 0 ? Math.floor(Number(quantity)) : 1;

    const basket = requireBasketActions();
    const store = requireStore();
    if (!basket || !store || typeof basket.addToCart !== 'function') {
      log('cannot add to cart: the app basket container is unavailable');
      return { success: false };
    }

    // One read before the add and one after: the count says whether it went
    // in, and the error is read only when THIS add replaced it, so a sentence
    // left by an earlier failure is never shown for a later one that recorded none.
    const stateBefore = basketState(store);
    const before = basketQuantity(stateBefore);
    const errorBefore = basketError(stateBefore);
    // The app publishes `cartChanges` from inside the dispatch, so the mark has
    // to exist before it: the mapper then writes the one add_to_cart, with this
    // surface as its source.
    const ownMark = markSurfaceAdd({ source: source || 'custom_widget', surfaceId: (surface && surface.id) || '' });
    let thrown = null;
    try {
      // A snackbar, not the basket's `modal`: the modal is drawn only by the
      // product screen, so a widget on the home or a list added silently and the
      // modal then appeared, stale, on the next product page.
      await store.dispatch(basket.addToCart({ pk: cartCode }, count, { snackbar: this.addedSnackbar() }));
    } catch (error) {
      thrown = error;
    }

    // Neither resolving nor throwing is the verdict; the basket's own count is.
    // The framework's `addToCart` swallows a refusal (it records the error in
    // the basket state and resolves), and an app's override can throw AFTER the
    // line went in — one called an action creator that was never defined, so
    // every add threw after the server had accepted it (2026-11-18). A count
    // that went up is an add; one that cannot be read takes the dispatch at its
    // word (no throw = added).
    const stateAfter = basketState(store);
    const after = basketQuantity(stateAfter);
    const added = before !== null && after !== null ? after > before : thrown === null;
    if (!added) {
      consumeOwnSurfaceAdd(ownMark);
      log(thrown ? 'add to cart failed: ' + ((thrown && thrown.message) || thrown) : 'add to cart refused: the basket did not change');
      // A thrown error's own text is a developer's, not the shopper's; the
      // store's `apiError`, when the basket recorded one, is the storefront's.
      const message = basketRefusalMessage(stateAfter, errorBefore);
      return message ? { success: false, message } : { success: false };
    }
    if (thrown) log('the app basket threw after the add went in: ' + ((thrown && thrown.message) || thrown));

    // The mapper writes the one add_to_cart when the app publishes
    // `cartChanges` — and an app may publish it AFTER this dispatch settles
    // (measured on a live App Maker app: the event arrived after the action
    // returned). Taking the mark now would count the add twice, so the mapper
    // gets a grace period; only a mark still unclaimed after it means the app
    // published nothing, and the surface writes the event itself.
    setTimeout(() => {
      const unclaimed = consumeOwnSurfaceAdd(ownMark);
      if (unclaimed && this.selwise) {
        this.selwise.trackAddToCart(cartCode, {
          quantity: count,
          source: unclaimed.source,
          surfaceId: unclaimed.surfaceId,
        });
      }
    }, CLAIM_GRACE_MS);
    return { success: true };
  }

  /**
   * What the app's snackbar says after a widget's add. The app's own words
   * (`$B.ADDED_TO_CART`) are not reachable from a plugin, so the merchant's
   * `addedText` wins and otherwise the phone's language picks one of two.
   */
  addedSnackbar() {
    const configured = this.config && typeof this.config.addedText === 'string' ? this.config.addedText.trim() : '';
    return { text: configured || defaultAddedText(), type: 'success' };
  }

  /**
   * Opens any link a Selwise surface, strip or notification points at, the way
   * the app would: one of the app's own screens (`app://basket` → the App Maker
   * route it is mapped from, the `screenRoutes` config first), else a storefront
   * path or url through the app's deep-link map (`openStorefrontPath`).
   *
   * Resolves false when nothing could be opened — a screen that needs to know
   * which one (`app://product`), or a route the app does not have.
   */
  async openLink(url) {
    const link = String(url || '').trim();
    if (!link) return false;
    if (/^app:\/\//i.test(link)) return this.openScreen(link);
    return this.openStorefrontPath(link);
  }

  /** Opens one of the app's own screens by its Selwise address (`openLink`). */
  openScreen(url) {
    const route = screenRouteOf(url, this.screenRoutes());
    if (!route) return false;
    const navigation = requireNavigation();
    if (!navigation || typeof navigation.navigate !== 'function') return false;
    try {
      navigation.navigate(route);
      return true;
    } catch (error) {
      log('could not open screen ' + url);
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

  /** The merchant's own origin, so a relative image in an enrichment block resolves against the shop. */
  storefrontUrl() {
    return storefrontOrigin() || '';
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
    return screenUrl(screenName, this.screenRoutes());
  }

  /** The app's own route for each Selwise screen address (`screenRoutes` in the config), when it set any. */
  screenRoutes() {
    return (this.config && this.config.screenRoutes) || undefined;
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

/** The first non-empty sentence of a string or an array of them, else ''. */
function firstSentence(value) {
  const list = Array.isArray(value) ? value : [value];
  for (let i = 0; i < list.length; i += 1) {
    if (typeof list[i] === 'string' && list[i].trim()) return list[i].trim();
  }
  return '';
}

/** The app's redux state, or {} when the store cannot be read. */
function basketState(store) {
  try {
    return (store && typeof store.getState === 'function' && store.getState()) || {};
  } catch (error) {
    return {};
  }
}

/** What the app basket holds as its error, or null. */
function basketError(state) {
  return (state && state.basket && state.basket.error) || null;
}

/**
 * Why the storefront refused the last add, in its own words — or '' when the
 * store does not say. The framework's basket action does not throw on a
 * refusal: it records the API's answer in `state.basket.error.apiError`, whose
 * sentence is `nonFieldErrors` (a string or a list) or `nonFieldMessage`. Read
 * defensively: this is the app's private state, and a shape that moved must
 * cost the message, never the add's answer.
 */
function basketRefusalMessage(state, errorBefore) {
  try {
    const error = basketError(state);
    // The reducer writes a new object on every rejection; the same one means
    // this add recorded nothing.
    if (error === errorBefore) return '';
    const api = (error && error.apiError) || error;
    if (!api || typeof api !== 'object') return '';
    return (
      firstSentence(api.nonFieldErrors) ||
      firstSentence(api.nonFieldMessage) ||
      firstSentence(api.non_field_errors) ||
      firstSentence(api.detail)
    );
  } catch (error) {
    return '';
  }
}

/** The app basket's unit count, or null when the state does not say. */
function basketQuantity(state) {
  try {
    const total = Number(state.basket && state.basket.basket && state.basket.basket.totalQuantity);
    return Number.isFinite(total) ? total : null;
  } catch (error) {
    return null;
  }
}

let cachedAddedText = null;

function defaultAddedText() {
  if (cachedAddedText) return cachedAddedText;
  let locale = '';
  try {
    locale = String(Intl.DateTimeFormat().resolvedOptions().locale || '').toLowerCase();
  } catch (error) {
    locale = '';
  }
  cachedAddedText = locale.indexOf('tr') === 0 ? 'Sepetinize eklendi' : 'Added to your cart';
  return cachedAddedText;
}

/**
 * The language the SDK asks the merchant's text in: the config's `locale`, else
 * the app's current language (App Maker's language service), else none — and the
 * account's default applies. Never rejects and never waits long: a service that
 * is missing or slow costs the app its language, not its launch.
 */
function resolveLocale(config) {
  const configured = config && typeof config.locale === 'string' ? config.locale.trim() : '';
  if (configured) return Promise.resolve(configured);

  const Language = requireLanguageService();
  if (!Language || typeof Language.getCurrent !== 'function') return Promise.resolve('');

  let timer = null;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), LANGUAGE_TIMEOUT_MS);
  });
  const settle = (language) => {
    clearTimeout(timer);
    if (!language) return '';
    const code = typeof language === 'string' ? language : language.code || language.key;
    return typeof code === 'string' ? code.trim() : '';
  };
  return Promise.race([Promise.resolve().then(() => Language.getCurrent()), timeout]).then(settle, () => settle(null));
}

const LANGUAGE_TIMEOUT_MS = 1500;

function requireLanguageService() {
  try {
    // eslint-disable-next-line global-require
    const imported = require('@services/language');
    return imported && (imported.default || imported);
  } catch (error) {
    return null;
  }
}

function requireNavigation() {
  try {
    // eslint-disable-next-line global-require
    const imported = require('@core/navigation');
    return (imported && (imported.default || imported)) || null;
  } catch (error) {
    return null;
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

/** `ios` or `android` from React Native's `Platform.OS`; '' when it cannot be read (a test, a web build). */
function osName() {
  try {
    // eslint-disable-next-line global-require
    const os = require('react-native').Platform.OS;
    return os === 'ios' || os === 'android' ? os : '';
  } catch (error) {
    return '';
  }
}

function pluginVersion() {
  try {
    // eslint-disable-next-line global-require
    return require('../package.json').version || '';
  } catch (error) {
    return '';
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
