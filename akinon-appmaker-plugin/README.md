# selwise-akinon-appmaker

Selwise plugin for Akinon App Maker (`rn-env` 7).

It subscribes to the app's own `AnalyticsService`, so tracking, identity and
order attribution work across every screen without editing any of them.
Recommendations are the one thing that needs a place on screen, and the plugin
hands a screen its data rather than drawing a card.

## Install

The plugin is pure JavaScript. It adds one dependency and touches neither the
iOS nor the Android project, so it can go into a merchant's app without a
native release.

1. Copy this folder to `.plugins/selwise-akinon-appmaker` in the app.
2. Add the SDK: `yarn add @selwise/react-native`.
3. Declare it in `akinon.json` under `plugins` (see `config.example.json` for
   the config block).
4. Register it in the generated `dependencies/plugins.js`:

```js
import SelwiseService from ".plugins/selwise-akinon-appmaker";
export default { SelwiseService, /* … */ };
```

`CreateApp` calls `init()` on every entry in that registry, so nothing else
needs to start the plugin.

## Configuration

| Key | Required | What it does |
|---|---|---|
| `channelKey` | yes | The Selwise app channel. Dashboard → Channels → the channel's card. `siteKey` is accepted as the previous name for the same value. |
| `apiKey` | yes | Dashboard → Sites → API Keys. Must carry **both** `mobile_read` and `mobile_write`. |
| `apiUrl` | no | Defaults to Selwise production. Point it at a local API for testing. |
| `debug` | no | Logs every mapped event to the Metro console. |
| `analytics.active` | no | `false` stops the event subscription; recommendations still work. |
| `recommendation.placements` | no | Which widgets belong on which screen, by widget name or id. |

### This key ships inside the app

Anyone who unpacks the app can read `apiKey`. Use this mobile key in the app
only. A server-side integration — order status sync, consent sync, business
events from your ERP — needs its own purpose key (Dashboard → Channels → API
Keys), which never goes into the app.

### The API key scope trap

The recommendation **products** endpoint is a `POST` (it carries visitor
context in the body) and the server derives the required scope from the HTTP
method. A key with only `mobile_read` makes everything work **except**
recommendations, which return 403 — and nothing else fails, so it takes a
while to find.

## What is collected

The plugin subscribes to App Maker's analytics events (`HANDLED_EVENTS` in
`integration/analytics/mapper.js` is the list) and to the links that open the
app. Nothing is polled and no screen is patched.

| App Maker event | Selwise |
|---|---|
| `navigationChange` | screen view on `app://<screen>` |
| `productImpression` | `product_view` |
| `selectItemImpression` | `product_click` (list or search row) |
| `categoryImpression` | `category_view` |
| `cartChanges` | `add_to_cart` / `remove_from_cart`, with the line that moved |
| `basketImpression` | `cart_view` |
| `checkoutImpression` | `checkout_begin` (with the basket's voucher as `coupon`) |
| `addShippingInfo`, `addPaymentInfo` | `checkout_option` |
| `couponUsed` | `checkout_progress` with `coupon` |
| `measuringPurchases` | order ingest (idempotent on the order number; the voucher as `metadata.couponCode`) |
| `productsImpressions`, `searched`, `barcodeSearched` | `search_query` |
| `setFilter`, `setSorter` | `search_filter` / `category_filter`, `search_sort` |
| `addToFav`, `addToFavOnPd`, `addToFavOnPl`, `addToFavOnBasket` | `wishlist` |
| `removeFromFav`, `removeFromFavOnPd`, `removeFromFavOnPl` | `custom_event` with `action: wishlist_remove` — never `wishlist`, which would fire "you saved this" reminders |
| `cancelOrder` | `custom_event` with `action: order_cancel_request` — a request; the order's status comes from the server connection, never from the app |
| `currentUser`, `userLogin`, `userRegister` | `identify` on the merchant user id; `user_login` / `user_signup` |
| `userLogout` | `logout` — clears the id, keeps the visitor |
| `appOnBackground` | queue flush |
| a link that opens the app (`Linking`, `DeepLinkService`) | `trackDeepLink` (SDK 1.4.0+): the landing with its `utm_*`, and for a Selwise message link (`sw_sc`) the message click that lets the message own the order |

### Synthetic screen URLs

Page targeting, funnels and journeys are all keyed on `pageUrl`, and a native
app has none. Every screen is mapped to `app://<screen>` (`integration/screens.js`),
so those features work with the same shape they have on web — and app traffic
is one filter away from web traffic in the same reports.

### Product identity

`product.sku` is sent as the product code, because that is what Selwise stores
as `item_code` and what every product-level report joins on. The numeric `pk`
is the code the basket accepts; Selwise carries it separately as `cart_code`
and it must never be sent as identity, or orders stop matching the catalogue.

## Campaigns and widgets

Mount one component at the app root and every campaign and widget the merchant
configured follows, re-evaluated on each navigation:

```jsx
import Selwise from '.plugins/selwise-akinon-appmaker';
import { SelwiseSurfaces } from '.plugins/selwise-akinon-appmaker/ui';

const App = (props) => (
  <>
    <BaseApp {...props} />
    <SelwiseSurfaces
      plugin={Selwise}
      onNavigate={(url) => Selwise.openStorefrontPath(url)}
      counts={{ cart: basketQuantity, productView: viewersOnThisProduct }}
    />
  </>
);
```

Rendered types: `announcement_bar`, `sticky_footer`, `floating_button`,
`countdown_timer`, `goal_bar`, `newsletter`, `slide_in`, `exit_intent_popup`,
`cart_count`, `product_view_count`. Each draws only from the merchant's own
`stylesJson`.

Content states, `{cart.total}` / `{cart.itemCount}` and the product values
(`{product.price}`, `{product.discountAmount}`, `{product.stock}`, …) arrive
already applied by the SDK (`surface.content`, `surface.stateId`); nothing here
re-decides them.

### The product on a ProductDetail screen

The plugin follows `state.productDetail` and, on the ProductDetail screen only,
passes the product it shows to `getSurfaces(url, { product })` — `name`,
`price`, `retailPrice` as the original price, the selected variant's `stock`
and `currency` (`integration/product.js`). The same product answers product
CONDITIONS — a content state or a targeting rule on `productStock`,
`productOnSale`, `productDiscountRate` or `productPrice` — in the SDK. While
the next product is loading the reducer still holds the previous one, so a
pending detail goes over as `{ pending: true }`, never as the previous
product: a campaign whose words or state need the product is held back rather
than quoting the previous price or drawing its fallback and swapping it a
moment later. Another product on the same screen is a new screen for the
overlay — nothing shown for the previous product is kept.

### The basket and the goal bar

The plugin hands the app's basket to the SDK on every basket change: it
subscribes to the app's Redux store and calls `setCart` with
`basket.amounts.totalAmount` (Akinon's `total_amount` — after the basket's
discounts, before shipping) and `basket.totalQuantity`, plus the lines'
`currency` when it is an ISO code (`integration/cart.js`). A basket the app has
not fetched yet, or has cleaned after an order, goes over as unknown, and an
unknown cart is never printed.

The lines go too, as `codes`: each line's `pk` (the code Akinon's basket
accepts) and `sku`, read from rn-framework-shop's basket `Product` model. They
ride only with a "complete to free shipping" strip's request
(`free_shipping_complement`), so the strip does not offer back a product — or a
sibling size of it — that is already in the basket. A line swapped for another
at the same amount counts as a basket change.

Every cart change also asks the SDK for the screen's surfaces again, because
content states and `{cart.total}` are chosen from the cart at `getSurfaces()`
time — a "Sepetin {cart.total}" banner appears on the basket screen once the
app has fetched the basket. What is already on screen stays as it was shown: a
modal keeps its words, and a shown surface is not removed mid-screen (a state
that now hides it takes effect on the next screen).

`goal_bar` ("₺120 more for free shipping") re-resolves on every cart change
through the SDK's `resolveGoalBar` — the same resolver the browser widget and
the dashboard preview call. Its impression is recorded the first time a view is
VISIBLE, not when the surface is fetched, and `goal_reached` is reported only
for a step the basket passed while the bar was on screen (once per session per
step). A custom `renderers={{ goal_bar: MyBar }}` receives the resolved `view`
too; draw from it, never from `surface.content`, which still holds the
`{goal.remaining}` template.

### Countdowns

A `countdown_timer` counts to a fixed end date, or to a DAILY cutoff in the
store's time zone ("orders before 14:00 ship today") that rolls over to
tomorrow once it passes. The target comes from the SDK's `countdownTarget` and
is asked for on every tick. On an SDK that predates daily cutoffs, a fixed end
date still works and a daily cutoff draws nothing.

Pass `renderers={{ announcement_bar: MyBar }}` to draw a type with your own
component; the built-in ones are deliberately plain so nobody ships one
believing it is themed.

### What does not carry over from the web

| | |
|---|---|
| `customCss` / `customJs` | Not applied. There is no stylesheet and no `eval` on a native surface. |
| `scroll` trigger | Treated as immediate. No App Maker screen reports its scroll offset. |
| `exit_intent` trigger | Fires when the app goes to the background — the phone's real "leaving" signal. A timer would interrupt someone who is still shopping. |
| `cart_count` / `product_view_count` | Need the numbers from your app: pass `counts`. Without them the badge stays hidden rather than showing a zero. |
| Closing a `goal_bar` | Remembered for the SDK session only (`dismissSurface` scopes it to the session for this type), like the web, which forgets a closed goal bar at the end of the session: the cart it talks about moves on. Every other surface stays closed across launches. |

### Storefront links

A campaign's `buttonUrl` is authored for the web (`/list/`,
`/baskets/basket/`). `Selwise.openStorefrontPath()` sends it through App
Maker's own deep-link map, so `baskets/basket` opens the app's Basket screen
instead of a browser. Only a genuinely external absolute url leaves the app.

## Recommendations on a screen

```js
import Selwise from '.plugins/selwise-akinon-appmaker';

const strips = await Selwise.recommendation().getStrip('ProductDetail', {
  productItemCode: product.sku,
  categories: product.category_name
});

// strips = [{ widget, products, productCard }]
```

Render `products` with the app's own card component, then report what happened
— the click is what attribution reads, so a widget without it looks like it
earns nothing:

```js
Selwise.recommendation().trackImpression(widget.id, products);
Selwise.recommendation().trackClick(widget.id, product.itemCode, index);
```

### Strips, ready made

```jsx
import { RecommendationStrips } from '.plugins/selwise-akinon-appmaker/ui';

<RecommendationStrips
  plugin={Selwise}
  screenName="ProductDetail"
  context={{ currentProductId: product.sku }}
  renderItem={({ product, onPress }) => <MyProductCard product={product} onPress={onPress} />}
  onProductPress={(recommended) => Selwise.openStorefrontPath(recommended.url)}
/>
```

Mounted per screen, not in the root overlay: a strip belongs in the content
flow — below the merchant's own widgets on the home screen, under the product
on a PDP — and an absolutely positioned overlay cannot put it there.

`renderItem` is the real integration point. The built-in card exists for the
first hour of an integration and for a demo.

A "complete to free shipping" strip (`free_shipping_complement`) follows the
basket the plugin feeds to the SDK, through the SDK's own
`RecommendationWidgetLoader` (`@selwise/react-native` 0.10.0+, the object
`useRecommendationWidget` runs on): asked again 300 ms after the basket last
changed, its cards swapped in place, hidden once the basket passes the
threshold, and not asked while the basket is unknown. A swap is not a new
impression; a strip that was hidden and comes back is. On an older SDK the
strip is asked once per screen, as before. `getStrip(screen, context,
{ followCart: true })` and `Selwise.recommendation().followStrip(...)` are the
same two steps for a screen that draws its own strips.

### A/B experiments on a strip

With `@selwise/react-native` 0.11.0+ each strip is the one the visitor's A/B
arm draws (`Selwise.recommendation().resolveWidget(widget)`, the SDK's
`resolveRecommendationWidget`). In a `different_module` experiment
`strip.widget` is the arm's strip — its id, its heading, its products — in the
control's slot; in a `config_override` experiment it is the listed widget with
the arm's title; a slot the arm draws nothing for is left out. `strip.experiment`
names the arm. `recommendation.placements` still matches the LISTED widget, by
the name you know it by. An arm that swaps in a "complete to free shipping"
strip is followed like one, whatever the slot's own strategy.

Report impressions and clicks with `strip.widget.id` — `RecommendationStrip`
does. The arm's exposure (the visitor counted into the experiment) rides with
the strip's first impression, once.

The heading is the screen's `title` prop, else the widget's title (the
shopper-facing heading the dashboard sets, and the field a title experiment
changes), else its name. It used to be the name first, which printed the
merchant's internal label to shoppers and made a title experiment draw two
identical arms.

## Search

```jsx
import { SelwiseSearch } from '.plugins/selwise-akinon-appmaker/ui';

<SelwiseSearch plugin={Selwise} query={query} renderItem={({ product, onPress }) => ...} />
```

A results view, not a screen: the app keeps its own input and layout. It reads
the synced catalogue and applies the merchant's synonyms, redirects and
zero-result rules — which is what makes it different from the storefront's own
`/autocomplete/`.

`SDK.search()` logs the query and the zero-result case itself, so the component
does not: doing both doubles every number in the merchant's search report.

## Checkout in a WebView

Most App Maker apps run checkout in a WebView, so without a bridge the most
valuable part of the funnel is unmeasured. `Selwise.webViewBridge()` returns
the SDK's bridge; inject its script into the WebView and forward the messages.

## Release notes

**Unreleased.** The plugin now also subscribes to `removeFavourite` and
`removeFromFavOnFl` (wishlist removals from the product, list and favourites
screens) and `beginCheckoutNative` (the in-app checkout's first step). Apps
that emit these names previously lost those events silently.

## Tests

The tests are not shipped in the published package — they live with the source
in the Selwise repo (`packages/akinon-appmaker-plugin`):

```bash
npx jest
```

The event mapping is a pure module (`integration/analytics/mapper.js`) tested
against App Maker's real store shapes; the goal bar, the cart feed and the
countdown are tested against the SDK's REAL functions, transpiled from its
TypeScript source by `test/sdk-source.js` (the SDK is the app's dependency, so a
plugin test cannot `require` it); and `integration/analytics/index.spec.js`
asserts that every SDK method this plugin calls actually exists — the drift it
was written for was a call to `selwise.reset()`, which does not exist (it is
`logout()`) and would have failed silently on every logout.
