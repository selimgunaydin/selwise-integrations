/**
 * Selwise — Akinon Project Zero Enhanced Ecommerce shim
 *
 * ## The problem it solves
 *
 * PZ classic's stock GTM adapter (`shop-packages/analytics/adapters/gtm`) emits
 * UA Enhanced Ecommerce, and it uses ONE event name for three different things:
 *
 *   productViewed      → { event: 'eeEvent',    ecommerce: { detail:      { products: [...] } } }
 *   productClicked     → { event: 'eeEvent',    ecommerce: { click:       { products: [...] } } }
 *   productListViewed  → { event: 'eeEvent',    ecommerce: { impressions: [...] } }
 *   productAdded       → { event: 'eeCart',     ecommerce: { add:         { products: [...] } } }
 *
 * Selwise maps incoming events by NAME. `eeEvent` alone cannot say whether a
 * view, a click or an impression is meant, so mapping it directly would record
 * clicks as product views.
 *
 * ## How it solves it
 *
 * The disambiguation the name lacks is present in the `ecommerce` payload — the
 * action key IS the intent. This shim reads that key and mirrors the event into
 * a PRIVATE layer under the correct GA4 name.
 *
 * Private on purpose: pushing the renamed events back into `window.dataLayer`
 * would also feed the merchant's own GTM container and double-count every GA4
 * hit. Nothing here writes to `dataLayer`.
 *
 * GA4-shaped events are mirrored through UNCHANGED, so the private layer is a
 * complete superset of what the site emits. Projects that already have their
 * own GA4 layer (several live Akinon storefronts) therefore need no special
 * casing — install the shim everywhere.
 *
 * ## Required panel configuration
 *
 * Integrations → Data Layer:
 *   • Source variable name (`externalDataLayerName`) = the value of
 *     `SELWISE_EE_LAYER` below, default `selwiseLayer`
 *   • Platform = `akinon`
 *
 * Without that, Selwise keeps listening to `dataLayer` and this shim is inert.
 *
 * ## Install
 *
 * Must run BEFORE the storefront's analytics adapters push anything. In Django
 * PZ that means inside `<head>`, above the GTM snippet — `templates/layout/base.html`.
 * Existing entries are replayed on install, so an early push is not lost even
 * if the ordering slips.
 */
(function () {
  'use strict';

  /** Layer Selwise is configured to read. Must match the dashboard value. */
  var SELWISE_EE_LAYER = 'selwiseLayer';

  /**
   * Enhanced Ecommerce action key → GA4 event name.
   *
   * These are the names Selwise already recognises out of the box, so no custom
   * mapping is needed in the panel.
   */
  var ACTION_TO_GA4 = {
    detail: 'view_item',
    click: 'select_item',
    impressions: 'view_item_list',
    add: 'add_to_cart',
    remove: 'remove_from_cart',
    checkout: 'begin_checkout',
    checkout_option: 'add_payment_info',
    purchase: 'purchase',
    cart: 'view_cart',
  };

  /** Event names that are containers for an EE action rather than intents themselves. */
  var AMBIGUOUS_EVENTS = { eeEvent: true, eeCart: true, eeCheckout: true, eePurchase: true };

  /** Order in which to probe the `ecommerce` object; first hit wins. */
  var ACTION_KEYS = [
    'detail',
    'click',
    'impressions',
    'add',
    'remove',
    'purchase',
    'checkout',
    'checkout_option',
    'cart',
  ];

  function isObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  function resolveAction(ecommerce) {
    if (!isObject(ecommerce)) return null;
    for (var i = 0; i < ACTION_KEYS.length; i += 1) {
      var key = ACTION_KEYS[i];
      var value = ecommerce[key];
      // `impressions` is a bare array; every other action is `{ products: [...] }`.
      if (Array.isArray(value) ? value.length > 0 : isObject(value)) {
        return key;
      }
    }
    return null;
  }

  /**
   * Returns what should be mirrored, or null to skip.
   *
   * An ambiguous event whose action cannot be resolved is DROPPED rather than
   * guessed at: recording a click as a view is worse than recording nothing.
   */
  function toMirroredEvent(item) {
    if (!isObject(item) || typeof item.event !== 'string') return null;

    var eventName = item.event;

    // GTM's own lifecycle events carry no commerce meaning.
    if (eventName.indexOf('gtm.') === 0) return null;

    if (!AMBIGUOUS_EVENTS[eventName]) {
      // Already unambiguous (GA4, Facebook, Turkish, custom): pass through.
      return item;
    }

    var action = resolveAction(item.ecommerce);
    if (!action) return null;

    var mapped = ACTION_TO_GA4[action];
    if (!mapped) return null;

    var mirrored = {};
    for (var key in item) {
      if (Object.prototype.hasOwnProperty.call(item, key)) {
        mirrored[key] = item[key];
      }
    }
    mirrored.event = mapped;
    // Kept for debugging: shows in the Selwise debug overlay which EE event a
    // mirrored hit came from.
    mirrored.selwiseSourceEvent = eventName;
    mirrored.selwiseSourceAction = action;
    return mirrored;
  }

  function install() {
    var target = window[SELWISE_EE_LAYER];
    if (!Array.isArray(target)) {
      target = [];
      window[SELWISE_EE_LAYER] = target;
    }

    var source = window.dataLayer;
    if (!Array.isArray(source)) {
      source = [];
      window.dataLayer = source;
    }

    // Guard against a double include (a base template plus a page template).
    if (source.__selwiseEeShimInstalled) return;

    function mirror(item) {
      var mirrored = toMirroredEvent(item);
      if (mirrored) {
        target.push(mirrored);
      }
    }

    // Replay what is already there. The adapters buffer events until GTM loads
    // and then flush them, so on a fast connection several pushes can land
    // before this file runs.
    for (var i = 0; i < source.length; i += 1) {
      mirror(source[i]);
    }

    var nativePush = source.push;
    source.push = function () {
      for (var j = 0; j < arguments.length; j += 1) {
        try {
          mirror(arguments[j]);
        } catch (error) {
          // Never let mirroring break the merchant's own analytics.
          if (window.console && console.warn) {
            console.warn('[Selwise] EE shim skipped an event', error);
          }
        }
      }
      return nativePush.apply(source, arguments);
    };

    try {
      Object.defineProperty(source, '__selwiseEeShimInstalled', {
        value: true,
        enumerable: false,
      });
    } catch (error) {
      source.__selwiseEeShimInstalled = true;
    }
  }

  // Guarded so the mapping functions can be unit-tested under Node, where
  // there is no `window` to install onto.
  if (typeof window !== 'undefined') {
    install();
  }

  // Exported for the unit tests in this kit; harmless in production.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      toMirroredEvent: toMirroredEvent,
      resolveAction: resolveAction,
      install: install,
      SELWISE_EE_LAYER: SELWISE_EE_LAYER,
    };
  }
})();
