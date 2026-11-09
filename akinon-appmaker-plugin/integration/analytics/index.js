'use strict';

const { KIND, HANDLED_EVENTS, mapEvent } = require('./mapper.js');

/**
 * Canonical product events the SDK has a typed helper for.
 *
 * Kept as data so `index.spec.js` can assert every name here is a real method
 * on the SDK client — the drift that produced this table was calling
 * `selwise.reset()`, which does not exist (it is `logout()`), and would have
 * failed silently inside the try/catch below on every logout.
 */
const PRODUCT_EVENT_HELPERS = {
  product_view: 'trackProductView',
  add_to_cart: 'trackAddToCart',
  remove_from_cart: 'trackRemoveFromCart'
};

/**
 * Runs mapped instructions against the Selwise SDK.
 *
 * ## Why the class is generated rather than written out
 *
 * `AnalyticsService.publishToSubscribers` dispatches by looking for a method
 * whose name matches the event and skipping the subscriber when there is none.
 * So a subscriber's surface IS its event list, and writing eleven near-identical
 * methods by hand is how one gets forgotten. `HANDLED_EVENTS` is the single
 * list; the methods are attached from it, which also means
 * `mapper.spec.js` covering the list covers the wiring.
 */
class SelwiseAnalytics {
  constructor(params) {
    this.selwise = params.selwise;
    this.config = params.config || {};
    this.debug = !!this.config.debug;
    // The renderer needs the current screen, and this class is the only thing
    // that learns about navigation. Passing it on here beats having the UI
    // subscribe to App Maker's analytics bus a second time.
    this.onScreen = typeof params.onScreen === 'function' ? params.onScreen : null;
  }

  init() {
    this.log('analytics subscribed', { events: HANDLED_EVENTS.length });
  }

  log(message, extra) {
    if (!this.debug) return;
    // eslint-disable-next-line no-console
    console.log('[Selwise] ' + message, extra === undefined ? '' : extra);
  }

  handle(eventName, nextState, prevState, data) {
    const instructions = mapEvent(eventName, nextState, prevState, data);
    if (instructions.length === 0) return;

    for (const instruction of instructions) {
      this.execute(eventName, instruction);
    }
  }

  execute(eventName, instruction) {
    const selwise = this.selwise;
    if (!selwise) return;

    try {
      switch (instruction.kind) {
        case KIND.SCREEN:
          // `trackScreenView` sets the current screen AND emits the page view,
          // so later events on the screen carry the right pageUrl.
          selwise.trackScreenView(instruction.pageUrl, { screen: instruction.screenName });
          if (this.onScreen) this.onScreen(instruction.pageUrl, instruction.screenName);
          this.log(eventName + ' -> screen ' + instruction.pageUrl);
          break;

        case KIND.TRACK: {
          // The SDK owns the shape of its own canonical events — its helpers
          // also set `entityId`, which a raw `track()` here would omit and no
          // test would catch. So a product event goes through the helper and
          // only genuinely custom events fall back to `track()`.
          const helper = PRODUCT_EVENT_HELPERS[instruction.name];
          if (helper && instruction.productItemCode) {
            selwise[helper](instruction.productItemCode, instruction.metadata);
          } else {
            const options = { entityType: instruction.entityType };
            if (instruction.entityId !== undefined) options.entityId = instruction.entityId;
            if (instruction.productItemCode !== undefined) {
              options.productItemCode = instruction.productItemCode;
            }
            if (instruction.metadata !== undefined) options.metadata = instruction.metadata;
            selwise.track(instruction.name, options);
          }
          this.log(eventName + ' -> ' + instruction.name, instruction.productItemCode || '');
          break;
        }

        case KIND.IDENTIFY:
          // Fire-and-forget: identify resolves over the network and no App
          // Maker event handler is awaited.
          void selwise.identify(instruction.userId, instruction.traits);
          this.log(eventName + ' -> identify ' + instruction.userId);
          break;

        case KIND.RESET:
          // `logout()`, not a full reset: it clears the logged-in id and starts
          // a new session while keeping the visitor id, so the device keeps
          // accruing anonymously exactly as the web widget does.
          void selwise.logout();
          this.log(eventName + ' -> logout');
          break;

        case KIND.ORDER:
          void selwise.trackOrder(instruction.order);
          this.log(eventName + ' -> order ' + instruction.order.orderId, instruction.order.items.length + ' line(s)');
          break;

        case KIND.FLUSH:
          void selwise.flush();
          break;

        case 'error':
          this.log('mapping failed for ' + instruction.eventName + ': ' + instruction.message);
          break;

        default:
          break;
      }
    } catch (error) {
      // The app's analytics dispatch is synchronous and unguarded per
      // subscriber, so an exception here would stop every plugin registered
      // after this one from seeing the event.
      this.log('execute failed for ' + eventName, (error && error.message) || error);
    }
  }
}

for (const eventName of HANDLED_EVENTS) {
  SelwiseAnalytics.prototype[eventName] = function (nextState, prevState, data) {
    this.handle(eventName, nextState, prevState, data);
  };
}

module.exports = SelwiseAnalytics;
module.exports.HANDLED_EVENTS = HANDLED_EVENTS;
module.exports.PRODUCT_EVENT_HELPERS = PRODUCT_EVENT_HELPERS;
