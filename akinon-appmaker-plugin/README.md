# selwise-akinon-appmaker

Selwise plugin for Akinon App Maker (`rn-env` 7).

It subscribes to the app's own `AnalyticsService`, so tracking, identity and
order attribution work across every screen without editing any of them.
Campaigns, recommendation strips, search and product content need a place on
screen: the plugin draws them with the components of
[`@selwise/react-native/ui`](https://www.npmjs.com/package/@selwise/react-native)
— the same ones a plain React Native app uses — and answers what they need to
know about an App Maker app (its navigation, its basket, its WebView).

## Install

The plugin is pure JavaScript. It adds one dependency and touches neither the
iOS nor the Android project, so it can go into a merchant's app without a
native release.

1. Copy this folder to `.plugins/selwise-akinon-appmaker` in the app.
2. Add the SDK: `yarn add @selwise/react-native` (2.0.0 or later: the components
   and the strip service the plugin hands its config to are in it).
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
| `testMode` | no | `true` shows surfaces, strips and enrichment marked "test" on THIS device only (a development build). **Off unless it is exactly `true`; never set it in a release.** |
| `qaLinks` | no | `true` lets a link that opens the app switch test mode on (`?selwise_test=1`) and force an experiment arm (`?selwise_variant=<experimentId>:<variantId>`) for that session: the dashboard's "Try on a device". **Off unless it is exactly `true`; development and internal builds only** — a link can be sent by anybody, and test mode hides every live campaign. |
| `screenRoutes` | no | Your App Maker route for a Selwise screen address when it is not the standard one, e.g. `{ "app://search": "PrimeSearch" }`. A campaign button or a push that points at `app://…` opens that route, and the plugin reads a visit to that route as that screen (a route registered for `app://search` is the search page). |
| `apiKey` | yes | Dashboard → Channels → Channel overview → API keys (purpose: Mobile app). Must carry **both** `mobile_read` and `mobile_write`. |
| `apiUrl` | no | Defaults to Selwise production; leave it out. It INCLUDES the version path (`https://api.selwise.com/api/v1`): without `/api/v1` every call is a 404 that looks like an empty catalogue. Set it only to point at a local API. |
| `locale` | no | The language the merchant's text — a campaign, a strip's heading, a search label — is asked for in (`'tr'`, `'en-US'`). Without it the plugin reads the app's own current language (App Maker's language service) at launch; if there is none, the account's default applies. Change it later with `Selwise.setLocale(...)` (see [Language](#language)). |
| `consent` | no | The consent answer a cold start begins with, e.g. `{ "granted": false }` to hold every event until the visitor answers. The answer itself is `Selwise.setConsent(...)` (see [Consent](#consent)). |
| `debug` | no | Logs every mapped event to the Metro console, puts the plugin on `global.Selwise` and draws a small "S" button at the bottom-left of every screen (`<SelwiseSurfaces />` mounts it) that opens the on-device diagnostics sheet: the screen, what was drawn and why the rest was not. **Off unless it is exactly `true`; leave it out of a release.** |
| `addedText` | no | What the app's snackbar says after a campaign or card adds a product to the basket. Empty: "Sepetinize eklendi" or "Added to your cart", by the phone's language. |
| `enrichment` | no | The base typography of a product enrichment block (`background`, `textColor`, `fontFamily`, `fontSize`, `padding`). |
| `analytics.active` | no | `false` stops the event subscription; recommendations still work. |
| `recommendation.placements` | no | Which widgets belong on which screen, by widget name or id. Leave it out when you use `SelwiseSlot`: the dashboard then decides (screen by page targeting, point by the strip's container selector). |

### This key ships inside the app

Anyone who unpacks the app can read `apiKey`. Use this mobile key in the app
only. A server-side integration — order status sync, consent sync, business
events from your ERP — needs its own purpose key (Dashboard → Channels → API
Keys), which never goes into the app.

### Keep the keys out of the repository

The config block lives in `akinon.json`, and a file that is committed is a file
that is copied, forked and pushed to a remote. Generate it at build time from
your CI's secret store (or an environment variable your build script writes into
`akinon.json`) instead of committing a live `apiKey`; commit only
`config.example.json`, whose values are placeholders. The same goes for the two
switches that change what a build does to a real visitor: build `qaLinks` and
`debug` into a development or internal build only, never into the release.

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

### Consent

When the dashboard's **Cookie Consent → "Ask for consent before tracking"** is on,
Selwise holds every event until the app says what the visitor chose: nothing is
sent and every figure in the dashboard stays at zero. The plugin cannot ask for
you — your consent dialog is your own — so it hands the answer over:

```js
import Selwise from '.plugins/selwise-akinon-appmaker';

// When the visitor answers your dialog, and on every launch that has an answer
Selwise.setConsent({ granted: true, categories: { analytics: true, marketing: false } });

// Optional: is the dashboard waiting for it?
if (await Selwise.consentRequired()) { /* show your dialog */ }
```

`setConsent` resolves `true` once the answer is stored (what was held is then on
its way) and `false` when the plugin is idle. Call it again whenever the visitor
changes their mind. `consentRequired()` resolves `true` while the dashboard waits
for an answer: an app that gets `true` there and never calls `setConsent`
measures nothing. The config's `consent` is only the answer a cold start begins
with.

### Language

The merchant's text comes in the app's language. The plugin starts from the
config's `locale`, or else the app's own current language, and the account's
default applies when it has neither. When the visitor changes the language in the
app:

```js
Selwise.setLocale('en');   // campaigns, strips, search and enrichment ask again in it
```

### Signed identity

When the channel enforces signed identity, an identify is accepted only with an
HMAC of the customer id made by **your** server. The secret never goes into the
app, so register a function that asks your own backend; the plugin calls it at
every sign-in:

```js
Selwise.setUserHashProvider(async (userId) => {
  const { hash, ts } = await api.post('/selwise/identity', { userId });
  return { userHash: hash, userHashTs: ts };   // or just the 64-character hex string
});
```

It has 5 seconds. Whatever it fails with (an error, a bad answer, no network),
the sign-in goes through without a signature — a login never waits on a signing
endpoint — and the channel decides what an unsigned identify is worth. Pass
`null` to remove it.

### Push notifications

A scenario's **App push** step notifies the phone through the merchant's own
Firebase project, Apple team or Expo account. App Maker's messaging plugin
(`akinon-firebase-messaging-service`) keeps the FCM token to itself and
publishes it to no other plugin, so the app hands it over in one call, and says
what the OS allows:

```js
import messaging from '@react-native-firebase/messaging';

Selwise.setPushPermission('granted');   // 'granted' | 'denied' | 'undetermined'
Selwise.registerPushToken({ token: await messaging().getToken(), provider: 'fcm' });
messaging().onTokenRefresh((token) => Selwise.registerPushToken({ token, provider: 'fcm' }));
```

`provider` is `'fcm'` (Android, and iOS through Firebase), `'apns'` or `'expo'`;
the platform is the app's own (pass `platform` for an Expo token on the other
OS). Registering needs the visitor's *marketing* consent (`Selwise.setConsent`):
without it nothing is sent, and withdrawing it revokes the phone. A phone is
notified only while the permission is `'granted'` — call `setPushPermission` at
launch and when the answer changes. `Selwise.unregisterPushToken()` is the app's
own "turn notifications off". Signing in links the phone to the customer and
signing out unlinks it.

**Opening the notification.** A Selwise notification carries `sw_link`: the
screen (`app://basket`), deep link or https address the step points at, with the
scenario in it so the open is a messaging click. When the push goes through App
Maker's messaging plugin, point it at that key in `akinon.json` and App Maker
navigates while this plugin — which already listens to App Maker's deep-link
service — records the click:

```json
"akinon-firebase-messaging-service": {
  "config": {
    "enableNotificationHandlingOnFCM": true,
    "notification": { "deepLink": { "integrationMaps": { "urlPath": "data.sw_link" } } }
  }
}
```

A push handled by your own code calls `Selwise.trackPushOpen(message)`, which
records the click and returns the link to open. Use links the app's deep-link
map understands (`yourapp://…`, your storefront URLs) or one of the app's
screens (`app://basket`). A screen address opens the App Maker route it is
mapped from (`app://basket` → `Basket`); a project whose route has another
name maps it in the plugin config:

```json
{ "screenRoutes": { "app://search": "PrimeSearch" } }
```

A screen that shows one thing (a product, a collection, an order) cannot be
opened by its address alone, so the dashboard does not offer it as a link.

### Orders

The plugin sends the order's own money lines when App Maker's order carries them
(`discount_amount`, `shipping_amount`; `subtotal` and a tax amount when present),
each line's list price (`retail_price`), and keeps the same product bought at two
prices as two lines. A marketing opt-in is recorded only when the order itself
carries an explicit tick (`email_allowed` / `sms_allowed`): the account's stored
preference is not a checkout decision, and a box that is absent or unticked
records nothing.

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

Mount one provider around the app and one overlay inside it, and every campaign
and widget the merchant configured follows, re-evaluated on each navigation:

```jsx
import { SelwiseProvider, SelwiseSurfaces } from '.plugins/selwise-akinon-appmaker/ui';

const App = (props) => (
  <SelwiseProvider>
    <BaseApp {...props} />
    <SelwiseSurfaces />
  </SelwiseProvider>
);
```

`SelwiseProvider` is the SDK's, already connected to this plugin: the client, and
what the components need to know about an App Maker app — links go through the
app's own deep-link map (`openStorefrontPath`), an add-to-cart through its own
basket action, and the app's WebView (`react-native-webview`), safe-area insets
and navigation focus are used when the app has them. Pass `host={{ … }}` to
override any part (a different `navigate`, say).

When the storefront refuses an add (the basket does not change), the plugin reads
the basket's own error from the app's store (`state.basket.error.apiError`:
`nonFieldErrors` or `nonFieldMessage`, a string or a list) and hands it to the
SDK as `{ success: false, message }`, so the shopper is told why — in the
storefront's words — where they pressed the button. A product the catalogue
already calls sold out is never sent: its button is drawn disabled instead.
`plugin.addToCartFromSurface(...)` still resolves a plain boolean for a custom
widget; `plugin.addToCartDetailed(...)` resolves `{ success, message? }`.

Rendered types: `announcement_bar`, `sticky_footer`, `floating_button`,
`countdown_timer`, `goal_bar`, `newsletter`, `slide_in`, `exit_intent_popup`,
`cart_count`, `product_view_count`, and `custom` (inside a WebView). Each draws
only from the merchant's own `stylesJson`. `inline_banner` and `embedded_card`
are placed into a page element and have no renderer here: the dashboard does not
offer them on an app channel, and a surface of an unknown type is neither drawn
nor reported as shown.

Content states, `{cart.total}` / `{cart.itemCount}` and the product values
(`{product.price}`, `{product.discountAmount}`, `{product.stock}`, …) arrive
already applied by the SDK (`surface.content`, `surface.stateId`); nothing here
re-decides them.

### The product on a ProductDetail screen

The plugin follows `state.productDetail` and, on the ProductDetail screen only,
tells the SDK client the product it shows (`client.setProduct`), which the
overlay passes to `getSurfaces(url, { product })` — `name`,
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

Every cart change also makes the overlay ask the SDK for the screen's surfaces again, because
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
step). A custom `renderers={{ goal_bar: MyBar }}` on `<SelwiseSurfaces />` receives the resolved `view`
too; draw from it, never from `surface.content`, which still holds the
`{goal.remaining}` template.

### Countdowns

A `countdown_timer` counts to a fixed end date, or to a DAILY cutoff in the
store's time zone ("orders before 14:00 ship today") that rolls over to
tomorrow once it passes. The target comes from the SDK's `countdownTarget` and
is asked for on every tick.

Pass `renderers={{ announcement_bar: MyBar }}` to draw a type with your own
component instead of the built-in one, which draws the campaign as the merchant
designed it (placement, colours, picture, button, content states).

### What does not carry over from the web

| | |
|---|---|
| `customCss` / `customJs` | Applied only to a `custom` campaign, inside its WebView. Not applied to a native type: there is no stylesheet and no `eval` on a native surface. |
| `scroll` trigger | Treated as immediate. No App Maker screen reports its scroll offset. |
| `exit_intent` trigger | Fires when the app goes to the background — the phone's real "leaving" signal. A timer would interrupt someone who is still shopping. |
| `cart_count` / `product_view_count` | The SDK reads the number itself (people who viewed this product, baskets holding it) for the product on the screen — the plugin names it with `setProduct({ itemCode })` from the product screen. They sit in a point of the product screen (`<SelwiseSlot slot="pdp-under-info" />` unless the merchant picked another); a counter below the merchant's threshold, with no product on the screen or whose number cannot be read is not drawn. There is nothing to pass. |
| Closing a `goal_bar` | Remembered for the SDK session only (`dismissSurface` scopes it to the session for this type), like the web, which forgets a closed goal bar at the end of the session: the cart it talks about moves on. Every other surface stays closed across launches. |

### Storefront links

A campaign's `buttonUrl` is authored for the web (`/list/`,
`/baskets/basket/`). `Selwise.openStorefrontPath()` sends it through App
Maker's own deep-link map, so `baskets/basket` opens the app's Basket screen
instead of a browser. Only a genuinely external absolute url leaves the app. The
provider's `host.navigate` is this call; the components use it for every link —
a campaign's button, a tapped product card, a search redirect, a link inside an
enrichment block.

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
  screenName="ProductDetail"
  context={{ currentProductId: product.sku }}
  renderItem={({ product, onPress }) => <MyProductCard product={product} onPress={onPress} />}
/>
```

Mounted per screen, not in the root overlay: a strip belongs in the content
flow — below the merchant's own widgets on the home screen, under the product
on a PDP — and an absolutely positioned overlay cannot put it there. A tapped
card opens the product through the app's deep-link map unless you pass
`onProductPress`.

Without `renderItem` the strip draws the merchant's own design: the heading and
container, the display type (slider, grid, list, tabs by role, a look with its total
and "add all"), and the card from the card designer, whose "add to cart" goes through
the app's own basket (a size sheet opens when the shopper has to choose one). Pass
`renderItem` to draw the card with your own component; the layout, the impressions
and the clicks still wrap it.

A "complete to free shipping" strip (`free_shipping_complement`) follows the
basket the plugin feeds to the SDK, through the SDK's own
`RecommendationWidgetLoader` (the object `useRecommendationWidget` runs on):
asked again 300 ms after the basket last changed, its cards swapped in place,
hidden once the basket passes the threshold, and not asked while the basket is
unknown. A swap is not a new impression; a strip that was hidden and comes back
is. `getStrip(screen, context, { followCart: true })` and
`Selwise.recommendation().followStrip(...)` are the same two steps for a screen
that draws its own strips.

### Slots: placing a strip from the dashboard, with no code

`RecommendationStrips` draws every strip of a screen in one place. For a strip
the merchant can MOVE, mount named points instead:

```jsx
import { SelwiseSlot } from '.plugins/selwise-akinon-appmaker/ui';

<SelwiseSlot
  screenName="ProductDetail"
  slot="pdp-under-info"
  sku={product.sku}                              // also draws enrichment placed at this name
  context={{ currentProductId: product.sku }}
  renderItem={({ product, onPress }) => <MyCard product={product} onPress={onPress} />}
/>
```

The merchant answers three separate questions in the dashboard: the SCREEN
(page targeting, `app://product`), the POINT on it (the strip's container
selector — for an app channel the dashboard writes
`[data-selwise-slot="pdp-under-info"]` from a picker), and WHAT is drawn
(strategy, heading, segment, experiment, test mode). A strip with no point, or
a point the screen does not mount, is drawn at the screen's LAST point rather
than vanishing.

The catalogue (`slotUtils.SCREEN_SLOTS`, from the SDK), top to bottom per
screen; the last name is the default:

| Screen | Points |
|---|---|
| `app://home` | `home-top`, `home-bottom` |
| `app://product` | `pdp-under-cart`, `pdp-under-info`, `pdp-bottom` |
| `app://list` | `plp-top`, `plp-bottom` |
| `app://category` | `category-bottom` |
| `app://basket` | `basket-under-items`, `basket-bottom` |
| `app://favourites` | `favourites-bottom` |
| `app://search` | `search-bottom` |
| `app://checkout/success` | `order-success-bottom` |

An app mounts the points it wants; the dashboard offers the whole catalogue, so
keep a list of which ones your app mounts. A new point is one name in the
shared catalogue the dashboard and the SDK both read, so ask us to add it rather
than inventing a name the dashboard does not offer.

What a point does that a hand-written strip usually gets wrong:

- **Two points on one screen share one request for the list**, and each asks for
  the products of ITS strips only. Asked on their own, the widget list and every
  strip's products would be fetched once per point.
- **It fetches nothing on a product screen until the product code is known.**
  `similar_products` without its anchor recommends the product being viewed.
- **A render error stays in the point.** A strip is worth less than the page.
- **An impression needs the strip ON SCREEN** (more than half of it, for a
  second), not merely mounted in a scroll view below the fold, and not while
  another screen covers it or the app is in the background. The FlatList's own
  viewability knows only the horizontal axis; counting it alone wrote
  impressions for strips nobody had scrolled to.
- The strip's place is decided on the LISTED widget (`strip.listed`): in an A/B
  `different_module` arm the strip drawn is another widget, but it stands in the
  control's place.

Frame props, on `RecommendationStrip(s)` and passed through by `SelwiseSlot`:
`renderHeading({ widget, heading })`, `style`, `headingStyle`,
`contentContainerStyle`, `ItemSeparatorComponent`, `listWrapper`
(`({ widget, children })` around the list — an app's own list-impression scope),
`isFocused` (`SelwiseSlot` passes the navigation's own).

### The favourite heart on a card

A card the merchant designed with a favourite button draws it when the app has a
favourites list, which every rn-framework-shop project has. The plugin hands the
SDK three things (`host.toggleWishlist`, `host.isWishlisted`,
`host.subscribeWishlist`, in `ui/host.js`) and asks the app's own favourites
requests (`favourite._addToFavourite`, `_removeFromFavourite`,
`_fetchFavouriteStatus`), not the product screen's thunk: that one writes into the
product screen's state, and a heart pressed on a recommended card would have
turned the viewed product's own heart on. The Favourites screen refreshes after
a change.

- A guest is sent to the app's `SignIn` screen (App Maker's standard route name)
  and the heart stays empty.
- The favourites list is fetched only when its screen opens, so the heart knows
  what the plugin added or removed this session and what the loaded list holds;
  a product it has not seen shows an empty heart.
- The SDK reports the `wishlist` event itself (once, for an add). The app
  publishes no `addToFav` event for a request made this way, so nothing is
  counted twice.
- The product is identified by its basket code (`cartCode`, the product `pk`),
  which is what the favourites API takes.

### A/B experiments on a strip

Each strip is the one the visitor's A/B arm draws
(`Selwise.recommendation().resolveWidget(widget)`, the SDK's
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

### The whole search screen: one line in the router

```js
import { SelwiseSearchScreen } from '.plugins/selwise-akinon-appmaker/ui';

// the app's router, in its screens map: replaces the app's own search
Search: SelwiseSearchScreen,
```

An App Maker plugin cannot add a screen by itself, so the screen is a component
your router points a route at. `SelwiseSearchScreen` takes what every route
component takes (`{ navigation, route }`) and needs nothing else: no provider
around it, no props. To keep the app's own search and add this one beside it,
register a new route and tell the plugin which route is the search screen, so a
campaign button or a push that points at `app://search` opens it:

```js
SelwiseSearch: SelwiseSearchScreen,
```

```json
{ "screenRoutes": { "app://search": "SelwiseSearch" } }
```

Any route name works, as long as it is the one in `screenRoutes["app://search"]`:
the plugin reads that route as the search page wherever it reports a screen.
`SelwiseSearch` is the default name and needs no configuration.

The screen draws a back arrow (it calls `navigation.goBack()` and is left out
when there is nothing to go back to), the input focused as the screen opens, and
keeps clear of the status bar and the home indicator. `route.params.query`, when
a link or a button names a term, is what the input starts with and searches. A
tapped result opens through the app's deep-link map, the add-to-basket button is
the app's own basket. The plugin reports the visit from the app's own navigation
as `app://search`, a search page (so a search-page campaign, the funnel and the
journey see it): `Search`, `PrimeSearch`, `SelwiseSearch` and whatever route
`screenRoutes["app://search"]` names are the ones it knows as search. If the app
already mounts `<SelwiseProvider>` above the screen, the screen uses it (so the
app's `host` is kept); without one it mounts the plugin's own.

What the merchant controls from the dashboard (Search, in the app's editor): the
placeholder and every sentence, the suggestions of the empty box (recent,
popular searches, categories and products) and their order, the results'
layout and exactly the fields shown, the category chips, the add-to-basket
button and its words, a redirect for a term, the look (colours, corners,
density, the input's shape), and whether search is on at all. While search is
switched off for a visitor the screen shows the back arrow and a short sentence
instead of a blank page; show the app's own search there by passing
`onUnavailable` from a screen of your own that wraps this one:

```jsx
const Search = (props) => (
  <SelwiseSearchScreen {...props} onUnavailable={() => props.navigation.replace('PrimeSearch')} />
);
```

Any other prop is the search panel's (`onProductPress`, `renderItem`,
`addToCartLabel`, `unstyled`, `renderEmpty`, ...).

### A results view of your own

```jsx
import { SelwiseSearch } from '.plugins/selwise-akinon-appmaker/ui';

<SelwiseSearch query={query} renderItem={({ product, onPress }) => ...} />
```

A results view, not a screen: the app keeps its own input and layout. (For the
merchant's whole search screen — the suggestions, results layout, categories and
look they set in the dashboard — use `SelwiseSearchScreen` above, or
`SelwiseSearchPanel` from the same entry to place it yourself; its add-to-cart
word is the one in Search → Texts, and `addToCartLabel` overrides it.) It reads
the synced catalogue and applies the merchant's synonyms, redirects and
zero-result rules — which is what makes it different from the storefront's own
`/autocomplete/`.

`SDK.search()` logs the query and the zero-result case itself, so the component
does not: doing both doubles every number in the merchant's search report. A
merchant's redirect rule ("kargo" → the shipping page) is followed through the
app's deep-link map and draws no list; a channel with search switched off draws
nothing rather than "no results".

### Product enrichment

```jsx
import { SelwiseEnrichment } from '.plugins/selwise-akinon-appmaker/ui';

<SelwiseEnrichment code={product.sku} slot="pdp-specs" />
```

The merchant's own block for a product, placed by NAME (the dashboard's
placement key) and drawn in the app's WebView. `SelwiseSlot` with `sku` draws the
enrichment placed at the same name beside the strips. Relative image sources in
a block resolve against the shop's origin, and the config's `enrichment`
(`background`, `textColor`, `fontFamily`, `fontSize`, `padding`) sets the base
typography.

## Why is a campaign or strip not on the screen

The SDK client records why it left a campaign or a strip off the current screen, in
the same reason codes the dashboard's "Why is this not in my app?" checklist uses
(`screens`, `segment`, `frequency_cap`, `campaignSlot`, `below_min_count`…):

```js
Selwise.selwise.explain();            // everything not shown on this screen, with its reason
Selwise.selwise.explain('campaign-id');
```

With `debug: true` in the config each reason is also logged once as it is recorded.
A surface that is armed for its trigger shows `waiting: true`: it will show.

## Checkout in a WebView

Most App Maker apps run checkout in a WebView, so without a bridge the most
valuable part of the funnel is unmeasured. `Selwise.webViewBridge()` returns
the SDK's bridge; inject its script into the WebView and forward the messages.

## Release notes

### 1.0.0

The drawing moved to the SDK (`@selwise/react-native/ui`, 2.0.0): the components are
the same ones a plain React Native or Expo app uses, and this plugin is their host
(it answers for the app's navigation, basket, favourites, WebView, safe area and
language). The plugin needs `@selwise/react-native` 2.0.0 or later, which its install
manifest asks for.

**Breaking, on purpose**

- Mount `<SelwiseProvider>` around the app and drop the `plugin={Selwise}` prop
  from every component; `plugin` is no longer a prop of anything.
- `SelwiseSurfaces` has no `counts` prop. The two counters (`cart_count`,
  `product_view_count`) read their number from Selwise for the product on the screen;
  they sit in a point of the product screen (`<SelwiseSlot slot="pdp-under-info" />`
  unless the merchant picked another), and a counter below the merchant's threshold,
  with no product on the screen, or whose number cannot be read is not drawn.
- `SelwiseSlot` and `RecommendationStrips` still take the App Maker route name
  (`screenName`); the SDK takes the screen's address (`screen="app://product"`),
  and so does this plugin when you give it.
- Campaigns are drawn where the merchant placed them (dock, corner, window, or a
  named point). One placed in a point is drawn there or nowhere: mount the point
  (`<SelwiseSlot>`) on the screen, or the campaign does not show.
- `getScreen`, `onScreenChange`, `getProduct`, `onProductChange`,
  `applyBrandTheme`, `countdownTarget`, `goalStepsCrossed`, `subscribeNewsletter`,
  `enrichmentTheme` and `recommendationLoader` left the plugin: the SDK client
  holds that state (`client.getScreen()`, `client.on('screen')`, …).
- `slotUtils`, `styleUtils`, `triggerUtils`, `countdownUtils`, `enrichmentUtils`,
  `renderers` and now `placementUtils` and `pickIds` are re-exported from the SDK.
- A strip's card is the one the merchant designed in the dashboard, drawn natively;
  pass `renderItem` to keep your own card. The strips also draw the merchant's
  display types (grid, list, tabs by role, looks), heading and container.
- `Selwise.setConsent(...)` and `Selwise.consentRequired()` hand the app's consent
  answer to the SDK (a channel that asks for consent before tracking was held at
  zero without them); `locale` / `Selwise.setLocale(...)` pass the app's language.
- A screen's strips: the widget list is asked once for every point of a screen,
  and a point asks for the products of its own strips only.
- `qaLinks` and `debug` are on only when exactly `true`.

**Migrating from 0.x**

1. Update the SDK dependency to 2.0.0 (`yarn add @selwise/react-native@^2`) and the
   plugin entry in `akinon.json` to `1.0.0`.
2. Before:

   ```jsx
   import Selwise from '.plugins/selwise-akinon-appmaker';
   import { SelwiseSurfaces, SelwiseSlot } from '.plugins/selwise-akinon-appmaker/ui';

   <SelwiseSurfaces plugin={Selwise} counts={{ 'pdp-under-info': 12 }} />
   <SelwiseSlot plugin={Selwise} screenName="ProductDetail" slot="pdp-under-info" sku={sku} />
   ```

   After:

   ```jsx
   import { SelwiseProvider, SelwiseSurfaces, SelwiseSlot } from '.plugins/selwise-akinon-appmaker/ui';

   <SelwiseProvider>
     <BaseApp {...props} />
     <SelwiseSurfaces />
   </SelwiseProvider>

   <SelwiseSlot screenName="ProductDetail" slot="pdp-under-info" sku={sku} />
   ```

3. Remove every `counts={…}` you passed, and any code that fed a counter's number.
4. Mount the points the merchant may use (see the catalogue under Slots). A campaign
   or strip the merchant placed in a point you do not mount is not drawn.
5. Replace reads of the plugin's old screen and product state with the SDK client's
   (`Selwise.selwise.getScreen()`, `Selwise.selwise.on('screen', …)`).
6. Hand over the consent answer if the dashboard asks for it: call
   `Selwise.setConsent(...)` when the visitor answers your dialog.
7. If you drew a strip's card yourself, keep `renderItem`; remove it to use the
   merchant's designed card. Keep a search input of your own with `SelwiseSearch`,
   or use `SelwiseSearchPanel` (from the same `/ui` entry) for the merchant's whole
   search screen: its add-to-cart word comes from the dashboard's Search → Texts, and
   `addToCartLabel` overrides it with yours.
8. Check the dashboard's Application connection card: it lists this plugin's version,
   the SDK's, and the screens and points the app reported.

A campaign button that points at an `app://` screen address is not opened by the
plugin: App Maker has no map for Selwise's screen names. Send the merchant to a
storefront path (`/baskets/basket/`), which opens the matching screen, or pass your
own `host={{ navigate }}` to `<SelwiseProvider>`.

### 0.12.0

Needs `@selwise/react-native` 1.6.0 for the parts marked (SDK); older SDKs keep
working without them. Scenario "show in the app" steps are drawn (SDK). `SelwiseSlot` and the
screens report themselves to the dashboard's Application connection card (SDK). `qaLinks` and
`testMode` config. Newsletter: a failed signup no longer says "Teşekkürler!", an optional phone
field with its own SMS consent tick, and the privacy notice line. `border` / `borderTop` /
`borderBottom` styles are drawn. Surfaces no renderer draws (`inline_banner`, `embedded_card`)
no longer count as shown.

Also in 0.12.0: the plugin now also subscribes to `removeFavourite` and
`removeFromFavOnFl` (wishlist removals from the product, list and favourites
screens) and `beginCheckoutNative` (the in-app checkout's first step). Apps
that emit these names previously lost those events silently.

### 0.11.0

`SelwiseSlot` and the slot catalogue (above). A strip's impression
now needs the strip on screen, not just mounted. `NativeCheckout` and
`AkifastCheckout` map to `app://checkout` (an app whose whole checkout is native
matched no checkout funnel or page rule). `getStrip` returns `listed` on every
strip. `onProductPress` receives the card's `index` as a third argument.

## Tests

The tests are not shipped in the published package — they live with the source
in the Selwise repo (`packages/akinon-appmaker-plugin`):

```bash
npx jest
```

The event mapping is a pure module (`integration/analytics/mapper.js`) tested
against App Maker's real store shapes; the cart feed and the product feed are
tested against the SDK's REAL client, transpiled from its TypeScript source by
`test/sdk-source.js` (the SDK is the app's dependency, so a plugin test cannot
`require` it); and `integration/sdk-contract.spec.js` and
`integration/analytics/index.spec.js` assert that every SDK method this plugin
calls actually exists — the drift they were written for was a call to
`selwise.reset()`, which does not exist (it is `logout()`) and would have failed
silently on every logout. The components themselves are tested in the SDK.
