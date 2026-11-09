'use strict';

const { screenUrl } = require('../screens.js');

/**
 * Translates App Maker analytics events into Selwise SDK calls.
 *
 * ## Pure on purpose
 *
 * Every function here takes state and returns a plain list of
 * `{ kind, ... }` instructions; nothing imports React Native or the SDK. That
 * is what makes the mapping testable at all — the alternative is asserting on
 * a mocked SDK from inside a React Native test environment, which is how the
 * RelatedDigital and Adjust plugins ended up with no tests.
 *
 * ## The identity rule
 *
 * `product.sku` is the App Maker product's own code and is what Selwise stores
 * as `item_code`, so it is the join key for every product-level report. The
 * numeric `pk` is the code the basket accepts and Selwise carries it as
 * `cart_code`; it must NEVER be sent as the product's identity, or orders stop
 * matching the catalogue and every product-level number goes empty while
 * looking like "no data yet".
 */

/** Instruction kinds the executor understands. */
const KIND = {
  SCREEN: 'screen',
  TRACK: 'track',
  IDENTIFY: 'identify',
  RESET: 'reset',
  ORDER: 'order',
  FLUSH: 'flush'
};

function str(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function num(value) {
  const parsed = typeof value === 'number' ? value : parseFloat(str(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

/** The basket lines, deduplicated by sku with quantities folded. */
function foldLines(items) {
  if (!Array.isArray(items)) return [];
  const bySku = new Map();

  for (const item of items) {
    const sku = str(item && item.sku).trim();
    if (!sku) continue;

    const quantity = num(item.quantity) || 1;
    const unitPrice = num(item.price);
    const existing = bySku.get(sku);

    if (existing) {
      existing.quantity += quantity;
      continue;
    }

    // Field names are the SDK's `OrderItemInput`, not ours to shorten. The
    // order route takes a plain TS type rather than a class DTO, so it has no
    // validation pipe: `itemCode` / `price` were accepted with a 201 and
    // dropped, and the order landed with empty product codes — no product-level
    // revenue, no `bought_together`, and nothing anywhere said so.
    bySku.set(sku, {
      productItemCode: sku,
      quantity,
      // App Maker's basket line carries a line total (`totalAmount`); an order
      // item carries a unit `price`. Selwise wants the unit either way.
      unitPrice: unitPrice !== null ? unitPrice : lineUnitPrice(item, quantity),
      ...(str(item.name) ? { name: str(item.name) } : {})
    });
  }

  return [...bySku.values()];
}

function lineUnitPrice(item, quantity) {
  const total = num(item && item.totalAmount);
  if (total === null) return null;
  return quantity > 0 ? Number((total / quantity).toFixed(2)) : total;
}

// ---- per-event mappers ----

/**
 * `navigationChange` is the only screen signal the app publishes, and it fires
 * for every route including ones we do not map, so it is also what keeps
 * `pageUrl` correct for the events that follow it.
 */
function navigationChange(state, prevState, data) {
  const currentPage = (data && data.currentPage) || (state && state.app && state.app.currentPage);
  if (!currentPage) return [];
  return [{ kind: KIND.SCREEN, pageUrl: screenUrl(currentPage), screenName: str(currentPage) }];
}

function productImpression(state) {
  const product = state && state.productDetail && state.productDetail.product;
  const sku = str(product && product.sku).trim();
  if (!sku) return [];

  const metadata = {};
  if (str(product.name)) metadata.title = str(product.name);
  if (num(product.price) !== null) metadata.price = num(product.price);
  if (str(product.brand)) metadata.brand = str(product.brand);
  if (product.stock !== undefined && num(product.stock) !== null) metadata.stock = num(product.stock);

  return [
    {
      kind: KIND.TRACK,
      name: 'product_view',
      entityType: 'product',
      productItemCode: sku,
      metadata
    }
  ];
}

/**
 * The app publishes one `cartChanges` event for both directions and does not
 * say which line moved, so the direction is derived from the quantity total —
 * the same inference the RelatedDigital plugin makes, and the only one the
 * state supports.
 */
function cartChanges(state, prevState) {
  const basket = (state && state.basket && state.basket.basket) || {};
  const previous = (prevState && prevState.basket && prevState.basket.basket) || {};

  const total = num(basket.totalQuantity) || 0;
  const previousTotal = num(previous.totalQuantity) || 0;
  if (total === previousTotal) return [];

  const added = total > previousTotal;
  const lines = foldLines(basket.products);
  const changed = diffLine(lines, foldLines(previous.products), added);

  const metadata = {
    basketQuantity: total,
    basketLines: lines.length
  };
  if (basket.pk !== undefined && str(basket.pk)) metadata.basketId = str(basket.pk);

  const event = {
    kind: KIND.TRACK,
    name: added ? 'add_to_cart' : 'remove_from_cart',
    entityType: 'product',
    metadata
  };

  if (changed) {
    event.productItemCode = changed.productItemCode;
    if (changed.unitPrice !== null && changed.unitPrice !== undefined) {
      event.metadata.price = changed.unitPrice;
    }
    event.metadata.quantity = Math.abs(changed.quantity);
  }

  return [event];
}

/**
 * Which line actually changed.
 *
 * Without this the event carries no product code and `add_to_cart` becomes
 * unattributable — every cart-based strategy (`bought_together`,
 * `viewed_together`, abandoned-cart segments) reads the product code.
 */
function diffLine(lines, previousLines, added) {
  const previousBySku = new Map(previousLines.map((line) => [line.productItemCode, line]));
  const currentBySku = new Map(lines.map((line) => [line.productItemCode, line]));

  if (added) {
    for (const line of lines) {
      const before = previousBySku.get(line.productItemCode);
      if (!before) return line;
      if (line.quantity > before.quantity) {
        return { ...line, quantity: line.quantity - before.quantity };
      }
    }
    return null;
  }

  for (const line of previousLines) {
    const after = currentBySku.get(line.productItemCode);
    if (!after) return line;
    if (after.quantity < line.quantity) {
      return { ...line, quantity: line.quantity - after.quantity };
    }
  }
  return null;
}

function basketImpression(state) {
  const basket = (state && state.basket && state.basket.basket) || {};
  const currentPage = state && state.app && state.app.currentPage;
  if (currentPage !== 'Basket') return [];

  const lines = foldLines(basket.products);
  return [
    {
      kind: KIND.TRACK,
      name: 'cart_view',
      entityType: 'page',
      entityId: screenUrl('Basket'),
      metadata: {
        basketQuantity: num(basket.totalQuantity) || 0,
        basketLines: lines.length,
        itemCodes: lines.map((line) => line.productItemCode)
      }
    }
  ];
}

/**
 * The app's OWN search screen.
 *
 * `<SelwiseSearch />` is not mounted in most apps — the app has its own search
 * UI and replacing it is a product decision. Without subscribing here, every
 * real search in the app was invisible to Selwise: the search reports showed
 * only the queries that went through `SDK.search()`, which is to say the demo
 * harness and nothing else.
 *
 * Zero-results cannot be known from this event — App Maker publishes the query
 * before the results land — so this is always `search_query`. The web's
 * zero-result report therefore stays a web-only number for an app whose
 * results Selwise does not serve, which is honest: reporting a guess would put
 * fabricated rows in the merchant's zero-results screen.
 */
function searched(state, prevState, data) {
  const query = str(data && (data.searchText || data.query || data.term)).trim();
  if (!query) return [];

  const screen = state && state.app && state.app.currentPage;
  const metadata = { query: query, source: 'app_search' };
  if (str(screen)) metadata.screenName = str(screen);

  return [
    {
      kind: KIND.TRACK,
      name: 'search_query',
      entityType: 'search',
      entityId: query,
      metadata: metadata
    }
  ];
}

/** Barcode search. Same event, different input method. */
function barcodeSearched(state, prevState, data) {
  const instructions = searched(state, prevState, data);
  for (const instruction of instructions) {
    instruction.metadata.source = 'app_barcode';
  }
  return instructions;
}

/**
 * Checkout started.
 *
 * The funnel reads `checkout_begin`, `checkout_progress` and `checkout_option`
 * (`unified-analytics.service.ts`). Mapping none of them left the app's funnel
 * going product_view -> add_to_cart -> purchase with nothing in between, so
 * every app visitor looked like they skipped checkout entirely.
 */
function checkoutImpression(state) {
  const basket = (state && state.basket && state.basket.basket) || {};
  const lines = foldLines(basket.products);
  if (lines.length === 0) return [];

  const amounts = basket.amounts || {};
  const total = num(amounts.totalAmount);
  const metadata = {
    basketLines: lines.length,
    basketQuantity: num(basket.totalQuantity) || 0,
    itemCodes: lines.map((line) => line.productItemCode)
  };
  if (total !== null) metadata.value = total;
  if (str(basket.voucherCode)) metadata.coupon = str(basket.voucherCode);

  return [
    {
      kind: KIND.TRACK,
      name: 'checkout_begin',
      entityType: 'checkout',
      entityId: screenUrl('Basket'),
      metadata: metadata
    }
  ];
}

/**
 * A choice made during checkout — shipping or payment.
 *
 * `checkout_option` is the canonical name for both; which one it was lives in
 * the metadata. Reads the same `state.webCheckout` wrapper as the purchase
 * mapper, including App Maker's own `sucess` misspelling.
 */
function checkoutChoice(kind, read) {
  return function (state) {
    const checkout = (state && state.webCheckout) || {};
    const wrapper = checkout.sucess || checkout.success || {};
    const order = (wrapper.order && wrapper.order.order) || wrapper.order || null;
    if (!order) return [];

    const value = read(order);
    if (!value) return [];

    const metadata = { option: kind, value: value };
    const amount = num(order.amount);
    if (amount !== null) metadata.orderValue = amount;

    return [
      {
        kind: KIND.TRACK,
        name: 'checkout_option',
        entityType: 'checkout',
        entityId: kind,
        metadata: metadata
      }
    ];
  };
}

const addShippingInfo = checkoutChoice('shipping', (order) =>
  str(order.cargoCompany || (order.shippingOption && order.shippingOption.name)).trim()
);

const addPaymentInfo = checkoutChoice('payment', (order) =>
  str(
    (order.paymentOption && (order.paymentOption.payment_type || order.paymentOption.name)) ||
      order.paymentType
  ).trim()
);

/**
 * Added to favourites.
 *
 * `wishlist` is both a canonical event and a recommendation signal
 * (`USER_BEHAVIOR_TYPES`), so an unmapped favourite costs the merchant a
 * personalisation input, not just a report row.
 */
function favouriteCode(data) {
  const payload = (data && (data.product || data)) || {};
  return str(
    payload.sku || payload.productSku || payload.itemCode || payload.product_sku
  ).trim();
}

/**
 * On the product screen (`…OnPd`) only, a payload without a code means the
 * product on screen. `state.productDetail` keeps the LAST product page seen,
 * so anywhere else that fallback would credit a different product.
 */
function productScreenCode(state, data) {
  const code = favouriteCode(data);
  if (code) return code;
  const product = state && state.productDetail && state.productDetail.product;
  return str(product && product.sku).trim();
}

function wishlistAdd(code) {
  if (!code) return [];
  return [
    {
      kind: KIND.TRACK,
      name: 'wishlist',
      entityType: 'product',
      productItemCode: code,
      metadata: { action: 'add' }
    }
  ];
}

function wishlistRemove(code) {
  if (!code) return [];
  return [
    {
      kind: KIND.TRACK,
      name: 'custom_event',
      entityType: 'product',
      productItemCode: code,
      metadata: { action: 'wishlist_remove' }
    }
  ];
}

function addToFavOnPd(state, prevState, data) {
  return wishlistAdd(productScreenCode(state, data));
}

function removeFromFavOnPd(state, prevState, data) {
  return wishlistRemove(productScreenCode(state, data));
}

function addToFav(state, prevState, data) {
  return wishlistAdd(favouriteCode(data));
}

/**
 * Removed from favourites.
 *
 * NOT a `wishlist` event: that name means "wants this" to every reader — a
 * scenario trigger, the engagement signals — and a removal sent under it
 * would fire a "you saved this" reminder for a product the shopper just
 * dropped. The browser widget sends no removal at all; here it is kept as a
 * custom event, visible in the event stream and read by nothing that means
 * interest.
 */
function removeFromFav(state, prevState, data) {
  return wishlistRemove(favouriteCode(data));
}

/**
 * The voucher a payload names, under any of the spellings App Maker uses,
 * falling back to the basket's. A coupon-applied action may also name it
 * plain `code`; an order's `code` is the order number, so it never counts.
 */
function voucherOf(payload, basket, acceptBareCode) {
  return str(
    payload.voucherCode ||
      payload.voucher_code ||
      (acceptBareCode ? payload.code : undefined) ||
      payload.couponCode ||
      basket.voucherCode
  ).trim();
}

/**
 * A coupon applied to the basket.
 *
 * A checkout step (`checkout_progress`) carrying the code under `coupon`, the
 * key the web's checkout events use. The ORDER carries it too
 * (`measuringPurchases`), which is what the coupon segment signals read.
 */
function couponUsed(state, prevState, data) {
  const payload = data || {};
  const basket = (state && state.basket && state.basket.basket) || {};
  const code = voucherOf(payload, basket, true);
  if (!code) return [];

  return [
    {
      kind: KIND.TRACK,
      name: 'checkout_progress',
      entityType: 'checkout',
      entityId: 'coupon',
      metadata: { step: 'coupon', coupon: code.slice(0, 100) }
    }
  ];
}

/**
 * The shopper asked to cancel an order from the app.
 *
 * A REQUEST, not a cancellation: the platform may refuse it, and the order's
 * status is the order system's to report — the server connection reads it
 * (`modules/commerce-connectors`), and an app key can never change an order's
 * status (`POST /orders/:id/status` takes the `orders_write` key only). So the
 * request is recorded as an event and nothing more.
 */
function cancelOrder(state, prevState, data) {
  const payload = (data && (data.order || data)) || {};
  const orderId = str(payload.number || payload.orderNumber || payload.order_number || payload.pk || payload.id).trim();
  if (!orderId) return [];

  const metadata = { action: 'order_cancel_request', orderId: orderId };
  const reason = str(payload.reason || payload.cancellationReason || payload.cancellation_reason).trim();
  if (reason) metadata.reason = reason.slice(0, 200);

  return [
    {
      kind: KIND.TRACK,
      name: 'custom_event',
      entityType: 'custom',
      entityId: orderId,
      metadata: metadata
    },
    { kind: KIND.FLUSH }
  ];
}

/**
 * The product list a visitor is looking at.
 *
 * `state.productList.activeRouteName` names the live list and
 * `state.productList[thatName]` is it — a shape App Maker uses for category
 * screens and search results alike, which is why the two are told apart by
 * whether the filters carry `search_text` rather than by the screen name.
 */
function activeList(state) {
  const lists = (state && state.productList) || {};
  const route = str(lists.activeRouteName);
  const list = (route && lists[route]) || {};
  return { route: route, list: list };
}

/** `currentFilters` is an array of `{key: value}` objects. */
function filterKeys(filters) {
  if (!Array.isArray(filters)) return [];
  const keys = [];
  for (const entry of filters) {
    if (!entry || typeof entry !== 'object') continue;
    for (const key of Object.keys(entry)) {
      if (!keys.includes(key)) keys.push(key);
    }
  }
  return keys;
}

/**
 * A tap on a product in a list.
 *
 * `product_click` was reachable only through the recommendation and search
 * helpers, so a tap on a category or search row — the ordinary way a visitor
 * opens a product — was unmeasured. It also feeds `user_behaviors`, so the
 * miss cost recommendation quality, not only a report column.
 *
 * The code is `sku`, never `baseCode`: `baseCode` is the GROUP key and Selwise
 * matches `products.item_code`. The app's own analytics config maps
 * `product.id` to `sku` for exactly this reason.
 */
function selectItemImpression(state, prevState, data) {
  const product = (data && data.product) || {};
  const code = str(product.sku || product.productSku || product.itemCode).trim();
  if (!code) return [];

  const { list } = activeList(state);
  const filters = filterKeys(list.currentFilters);
  const products = Array.isArray(list.products) ? list.products : [];
  const index = products.findIndex(
    (entry) => entry && str(entry.sku).trim() === code
  );

  const metadata = { source: filters.includes('search_text') ? 'search' : 'list' };
  if (index >= 0) metadata.position = index + 1;
  if (str(product.name)) metadata.title = str(product.name);
  if (num(product.price) !== null) metadata.price = num(product.price);

  return [
    {
      kind: KIND.TRACK,
      name: 'product_click',
      entityType: 'product',
      productItemCode: code,
      metadata: metadata
    }
  ];
}

/**
 * A category screen opened.
 *
 * `category_view` is canonical and had no source in the app at all, so a
 * merchant's category funnel stopped at the home screen.
 */
function categoryImpression(state, prevState, data) {
  const payload = data || {};
  const name = str(
    payload.categoryName || payload.name || payload.mainCategory || payload.subCategory
  ).trim();
  const id = str(payload.categoryId || payload.id).trim();
  if (!name && !id) return [];

  const metadata = {};
  if (name) metadata.categoryName = name;
  if (id) metadata.categoryId = id;
  if (str(payload.type)) metadata.level = str(payload.type);

  return [
    {
      kind: KIND.TRACK,
      name: 'category_view',
      entityType: 'page',
      entityId: id || name,
      metadata: metadata
    }
  ];
}

/**
 * A filter applied.
 *
 * `search_filter` on a search result and `category_filter` on a category list
 * — the same split the web makes, decided by whether the filters carry
 * `search_text` rather than by a screen name, since App Maker uses one list
 * shape for both.
 */
function setFilter(state) {
  const { list } = activeList(state);
  const keys = filterKeys(list.currentFilters);
  if (keys.length === 0) return [];

  const fromSearch = keys.includes('search_text');
  const applied = keys.filter((key) => key !== 'search_text');
  if (applied.length === 0) return [];

  return [
    {
      kind: KIND.TRACK,
      name: fromSearch ? 'search_filter' : 'category_filter',
      entityType: fromSearch ? 'search' : 'page',
      entityId: applied[applied.length - 1],
      metadata: { filters: applied, filterCount: applied.length }
    }
  ];
}

/**
 * A sort order chosen.
 *
 * App Maker publishes the sorter's VALUE; the human label lives in the list's
 * own `sorts` array, so it is resolved here — a report row reading
 * `price_asc` and one reading "Artan fiyat" are not equally useful.
 */
function setSorter(state, prevState, data) {
  const { list } = activeList(state);
  const chosen = Array.isArray(data) ? data[0] : data;
  const value = str(chosen && (chosen.sorter || chosen.value)).trim();
  if (!value) return [];

  const sorts = Array.isArray(list.sorts) ? list.sorts : [];
  const match = sorts.find((entry) => entry && str(entry.value).trim() === value);
  const label = str(match && match.label).trim();

  const metadata = { sorter: value };
  if (label) metadata.label = label;

  return [
    {
      kind: KIND.TRACK,
      name: 'search_sort',
      entityType: 'search',
      entityId: value,
      metadata: metadata
    }
  ];
}

/**
 * Purchase.
 *
 * Reads `state.webCheckout.sucess.order.order` — the misspelling is App
 * Maker's own key and correcting it here reads nothing.
 *
 * Emitted as an ORDER, not a `purchase` track event: the order endpoint is
 * idempotent on `orderId`, and revenue attribution, the customer graph and
 * `bought_together` co-occurrence all read orders. A tracking event would show
 * up in the funnel and nowhere else.
 */
function measuringPurchases(state, prevState) {
  const checkout = (state && state.webCheckout) || {};
  const wrapper = checkout.sucess || checkout.success || {};
  const order = (wrapper.order && wrapper.order.order) || wrapper.order || null;
  if (!order) return [];

  const orderId = str(order.number || order.orderNumber || order.pk).trim();
  const items = foldLines(order.items);
  if (!orderId || items.length === 0) return [];

  const total = num(order.amount) !== null ? num(order.amount) : num(order.total_amount);
  // The basket the order was placed from still holds the voucher in the
  // previous state; the order body names it under several spellings.
  const previousBasket = (prevState && prevState.basket && prevState.basket.basket) || {};
  const coupon = voucherOf(order, previousBasket, false);

  return [
    {
      kind: KIND.ORDER,
      order: {
        orderId,
        items,
        // `total`, the SDK's own field name. `totalAmount` was silently
        // dropped by the unvalidated order route.
        ...(total !== null ? { total } : {}),
        ...(str(order.currency) ? { currency: str(order.currency).toUpperCase() } : {}),
        // `couponCode` is the key the coupon segment signals read
        // (apps/api segments/discount-signals.ts).
        ...(coupon ? { metadata: { couponCode: coupon.slice(0, 100) } } : {})
      }
    },
    // Purchase is the one event a user can close the app on immediately, so the
    // queue is drained rather than left to the timer.
    { kind: KIND.FLUSH }
  ];
}

function productsImpressions(state, prevState, action) {
  const searchText = str(action && (action.search_text || action.searchText)).trim();
  if (!searchText) return [];

  const pagination = (action && action.pagination) || {};
  const total = num(pagination.total_count !== undefined ? pagination.total_count : pagination.totalCount);

  return [
    {
      kind: KIND.TRACK,
      // `search_query`, not `search`. The ingest pipeline keeps only the names
      // in CANONICAL_EVENTS (packages/tracking-contract); `search` is a
      // CATEGORY there, not an event, so the row was dropped and the search
      // panels stayed empty while the app was reporting every search.
      name: 'search_query',
      entityType: 'search',
      entityId: searchText,
      metadata: {
        query: searchText,
        ...(total !== null ? { resultCount: total } : {})
      }
    }
  ];
}

/**
 * Identity.
 *
 * `pk` is the merchant's own user id and the value the web integration sends
 * to `identify`, so the app must send the same one or the visitor becomes two
 * customers. The email is passed as a trait, never as the id: it changes.
 */
/**
 * A merchant user id is a non-empty string or a finite number. Nothing else.
 *
 * App Maker keeps an `auth.user` object for an anonymous session too, with
 * `pk` set to `false`. `String(false)` is `'false'` — a perfectly valid-looking
 * id — so every anonymous visitor was identified as the user "false": one
 * shared `site_users` row, every app visitor merged into it, and the customer
 * profile of a person who does not exist.
 */
function userIdOf(user) {
  if (!user) return '';
  const raw = user.pk !== undefined && user.pk !== null ? user.pk : user.id;
  if (typeof raw === 'number') return Number.isFinite(raw) ? String(raw) : '';
  if (typeof raw === 'string') return raw.trim();
  return '';
}

function identityFrom(state) {
  const user = state && state.auth && state.auth.auth && state.auth.auth.user;
  const userId = userIdOf(user);
  if (!userId) return [];

  const traits = {};
  if (str(user.email)) traits.email = str(user.email);
  if (str(user.first_name || user.firstName)) traits.firstName = str(user.first_name || user.firstName);
  if (str(user.last_name || user.lastName)) traits.lastName = str(user.last_name || user.lastName);

  return [{ kind: KIND.IDENTIFY, userId, traits }];
}

function userLogin(state) {
  const instructions = identityFrom(state);
  if (instructions.length === 0) return [];
  return [
    ...instructions,
    // Canonical names (CANONICAL_EVENTS): `signup` is not one and no alias
    // maps it, so a registration used to be filed as a nameless custom event.
    { kind: KIND.TRACK, name: 'user_login', entityType: 'user', entityId: instructions[0].userId }
  ];
}

function userRegister(state) {
  const instructions = identityFrom(state);
  if (instructions.length === 0) return [];
  return [
    ...instructions,
    { kind: KIND.TRACK, name: 'user_signup', entityType: 'user', entityId: instructions[0].userId }
  ];
}

/**
 * Logout clears the identity but keeps the visitor id: the person is still the
 * same device and their browsing should keep accruing anonymously, exactly as
 * the web widget behaves.
 */
function userLogout() {
  return [{ kind: KIND.RESET }];
}

/** Backgrounding is the app's equivalent of a page unload. */
function appOnBackground() {
  return [{ kind: KIND.FLUSH }];
}

const MAPPERS = {
  navigationChange,
  productImpression,
  cartChanges,
  basketImpression,
  checkoutImpression,
  addShippingInfo,
  addPaymentInfo,
  measuringPurchases,
  productsImpressions,
  selectItemImpression,
  categoryImpression,
  setFilter,
  setSorter,
  searched,
  barcodeSearched,
  addToFav,
  addToFavOnBasket: addToFav,
  // The names App Maker's analytics table documents (product screen, list).
  addToFavOnPd,
  addToFavOnPl: addToFav,
  removeFromFav,
  removeFromFavOnPd,
  removeFromFavOnPl: removeFromFav,
  couponUsed,
  cancelOrder,
  currentUser: identityFrom,
  userLogin,
  userRegister,
  userLogout,
  appOnBackground
};

/** Every App Maker event this plugin subscribes to. */
const HANDLED_EVENTS = Object.keys(MAPPERS);

function mapEvent(eventName, state, prevState, data) {
  const mapper = MAPPERS[eventName];
  if (!mapper) return [];
  try {
    return mapper(state, prevState, data) || [];
  } catch (error) {
    // A malformed state must never take a merchant's screen down with it.
    return [{ kind: 'error', eventName, message: (error && error.message) || 'mapping failed' }];
  }
}

module.exports = { KIND, HANDLED_EVENTS, MAPPERS, mapEvent, foldLines, diffLine, userIdOf };
