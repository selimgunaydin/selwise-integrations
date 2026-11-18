# @selwise/react-native

[![npm](https://img.shields.io/npm/v/@selwise/react-native.svg)](https://www.npmjs.com/package/@selwise/react-native)
[![license](https://img.shields.io/npm/l/@selwise/react-native.svg)](./LICENSE)

The Selwise SDK for React Native apps: event tracking, recommendations, search
and order attribution — without a DOM — and the components that draw what the
dashboard configures: campaigns, recommendation strips, search results and
product content.

> **Why a separate package.** [`@selwise/widget`](https://www.npmjs.com/package/@selwise/widget)
> is DOM-bound from top to bottom (`document`, `window`, `localStorage`). Native
> apps render their own screens — product detail, product list, search, basket —
> and a browser widget cannot run there. This package has two layers. The core
> (`@selwise/react-native`, `@selwise/react-native/react`) delivers **data** and
> needs no UI library. The components (`@selwise/react-native/ui`) draw it with
> React Native and are the quickest way to see everything the dashboard
> configures in your app; every one of them takes your own component where you
> want your own look.

---

## Install

```bash
npm install @selwise/react-native
```

No required dependencies. `react` is needed only for the hooks under
`@selwise/react-native/react`, and `react-native` only for the components under
`@selwise/react-native/ui`; both are **optional peers**, so the core SDK stays
importable from services, sagas and redux middleware.

The components do not depend on `react-native-webview` or
`react-native-safe-area-context` either: an app that has them hands them over
(see [Drawing it: the components](#drawing-it-the-components)).

For persistence, pass the app's existing AsyncStorage — the SDK ships no native
dependency of its own:

```bash
npm install @react-native-async-storage/async-storage
```

---

## The API key, and the one thing to get right

An app is an **app channel** in Selwise — a channel with no domain to verify
and therefore nothing an `Origin` header could ever be evidence for. The
server's `PublicSiteGuard` authenticates every app-channel request by API key
and scope, unconditionally. (A native `fetch` sends no Origin header anyway;
for an app channel the key is required even when one is present, so an in-app
WebView takes the same path as the native code beside it.) Which means:

**The key must carry BOTH `mobile_read` AND `mobile_write`.**

The reason is subtle but absolute: the recommendation *products* endpoint is a
**POST** (`POST /recommendations/:widgetId/products` — it carries visitor
context in the body), and the guard derives the required scope from the HTTP
method (`GET → mobile_read`, everything else → `mobile_write`). A read-only key
returns 403 **there and nowhere else**, which is the single most common mistake
in a mobile setup.

Create the key in the dashboard under **Channels → the channel's card → API
keys**, choosing **Mobile app** as the purpose.

> The key ships inside the app binary and can be extracted. That is acceptable:
> its scopes cover public reads plus event and order writes only, with no
> dashboard access. Rotate it from the dashboard if it leaks.

---

## Initialize

```ts
// src/services/selwise.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Selwise } from '@selwise/react-native';

export const selwise = new Selwise();

export async function initSelwise() {
  await selwise.init({
    channelKey: 'CHANNEL_KEY',
    apiKey: 'SELWISE_API_KEY',
    storage: AsyncStorage,
    debug: __DEV__,
  });
}
```

`init()` resolves identity and **replays the queue left over from the previous
session**. It does not wait on a network round-trip, so it never blocks the
first screen.

Flush the queue to disk as the app leaves the foreground:

```ts
import { AppState } from 'react-native';

AppState.addEventListener('change', (state) => selwise.setAppState(state));
```

`setAppState` does two things: on any state but `'active'` it flushes the queue
and writes the visitor's session counters (the app may not get another chance),
and it drives the **live heartbeat**. The
dashboard's Live View counts an app user as live while the app is in the
foreground: the SDK posts `/presence` once a minute (the server sets the
interval) while the state is `'active'`, only with analytics consent, and only
for a user whose events the server accepted in the last 30 minutes — a
heartbeat never makes anyone live on its own. A beat is skipped when an event
batch was accepted within the interval, and after a `live: false` answer the
SDK stays silent until the next accepted batch. Without `setAppState` the SDK
assumes the foreground and stops beating after 30 minutes with no SDK call.

### Options

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `channelKey` | `string` | — | Required (or `siteKey`). From **Channels → the channel's card**. |
| `siteKey` | `string` | — | The published name for the same value. Kept forever; pass either one. |
| `apiKey` | `string` | — | Required. Needs `mobile_read` + `mobile_write` (see above). |
| `apiUrl` | `string` | `https://api.selwise.com/api/v1` | Point at staging when needed. |
| `storage` | `SelwiseStorage` | in-memory | Pass AsyncStorage. See [Running without storage](#running-without-storage). |
| `consent` | `ConsentSnapshot` | managed by the app (`app_managed`) | See [Consent](#consent). |
| `siteUserId` | `string` | — | Logged-in user id, if known at init. |
| `batchSize` | `number` | `20` | Events per flush. Server caps at 200. |
| `flushIntervalMs` | `number` | `5000` | `0` disables the timer — flush manually. |
| `timeoutMs` | `number` | `10000` | Per-request timeout. |
| `maxQueueSize` | `number` | `500` | Offline cap; oldest events are dropped first. |
| `debug` | `boolean` | `false` | Diagnostics via `console.log`, and the on-device [diagnostics button](#on-device-diagnostics-the-s-button). Development builds only. |
| `clientPlatform` | `string` | `react-native` | Sent as `x-selwise-client-platform`. |
| `clientVersion` | `string` | SDK version | Sent as `x-selwise-client-version`. |
| `locale` | `string` | — | The app's language (`'en'`, `'tr-TR'`). See [Languages](#languages-since-0140). |
| `platform` | `'ios' \| 'android'` | — | `Platform.OS`. Lets a segment target the OS the app runs on. |
| `appVersion` | `string` | — | The app's own release (`'3.4.1'`). A segment can compare it (`appVersion < 3.5`). |

Any storage implementing `getItem` / `setItem` / `removeItem` works —
AsyncStorage satisfies the contract as-is, and MMKV needs a three-line adapter.

### Consent

Every event needs a consent category — `analytics` for what the visitor did
(views, cart, search, purchase, identity), `marketing` for what a Selwise surface
did to them (impressions, clicks, experiment exposures). The list is shared with
the web widget and the API (`consentCategoryOfEvent`); an event it does not name
needs `analytics`. `POST /events/batch` requires a consent snapshot and drops
every event whose category the snapshot does not allow.

If the app never calls `setConsent()`, the SDK reports that **the app manages
consent** (`source: 'app_managed'`, every category allowed) and sends everything.
Every event records that source: you are then responsible for asking before
you track.

**The channel can require a decision.** When the channel's Cookie Consent
policy waits for an answer (Dashboard → Audience → Cookie Consent → Policy:
"Takipten önce onay iste" and "Cevaba kadar olayları beklet" on, "Cevap
gelmezse onay verilmiş say" off), the `app_managed` default no longer stands
in for a decision: until `setConsent()` is called, `getConsent()` answers
`{ granted: false, source: 'awaiting_decision' }` and nothing that measures the
visitor is sent. Events are held, not discarded. The SDK reads the policy from
`/config` before its first send and remembers it, so a launch on which
`/config` fails still honours it.

To send nothing until your CMP has decided:

```ts
await selwise.init({ /* ... */, consent: { granted: false } });

// once the CMP resolves:
await selwise.setConsent({ granted: true, categories: { analytics: true, marketing: false } });
```

Consent is evaluated **at send time, not at track time**. Events recorded while
the visitor has not answered are held and sent once they answer — only those
whose category the answer allows. An event of a refused category is dropped;
a later grant is consent from then on and does not bring it back.

The answer also decides what is read about the visitor:

| Without | What happens |
|---|---|
| `analytics` | `identify()` keeps the id on the device and sends it once allowed; an order is recorded without the visitor, unattributed. |
| `marketing` | The visitor is in no experiment (the control is shown), segment reads answer "in no segment", recommendation requests carry no visitor id, the scenario inbox is not read. |

A surface or an experiment can be restricted to consenting visitors with the
`consentAnalytics` / `consentMarketing` / `consentPreferences` targeting rules;
the SDK fills them from the consent answer.

---

## Screen names — what replaces `pageUrl`

A native app has no URLs, but page targeting, funnels and journeys are all
URL-shaped server-side. Use **one stable synthetic value per screen** and target
those in the dashboard:

```ts
selwise.trackScreenView('app://home');
selwise.trackScreenView('app://category');
selwise.trackScreenView('app://product');
selwise.trackScreenView('app://basket');
```

`trackScreenView()` sets the current screen context *and* sends a `page_view`.
Use `setScreen()` when you want the context without the event — subsequent
events are attributed to that screen either way. Both take what you know about
the screen as a last argument — `{ screenName, pageType }`, the dashboard's page
type (`home`, `product`, `category`, `search`, `cart`, `checkout`, `account`,
`other`) — and the components follow it: `selwise.getScreen()` reads it back and
`selwise.on('screen', listener)` tells you when it changes (see
[State and subscriptions](#state-and-subscriptions)). They may be called before
`init()` resolves.

Recommendation widgets must have their page targeting configured against these
values: `app://product` instead of the web's `/product/*`.

---

## Tracking events

`track()` **never throws and never awaits the network**, so it is safe to call
from a render path or a gesture handler.

```ts
selwise.trackProductView('SKU-12345');
selwise.trackAddToCart('SKU-12345', { quantity: 1, price: 749.9, currency: 'TRY' });
selwise.trackRemoveFromCart('SKU-12345');

selwise.track('checkout_begin', {
  entityType: 'checkout',
  metadata: { total: 1499.7, currency: 'TRY', itemCount: 3 },
});
```

> **`itemCode` = `item_code` in the product feed.** When they disagree,
> product-level reports drop the product. It is usually the variant `sku`, but
> some catalogues use a composite such as `base_code.color` as the GA4
> `item_id`. Settle the convention **once**, together with the feed; mixing the
> two breaks analytics silently.

### Identity

```ts
await selwise.identify('merchant-user-id', {   // sign-in
  email: 'customer@example.com',
  memberTier: 'gold',
});
await selwise.logout();                        // sign-out: visitor kept, session rotated
```

`identify()` does two things: it stores the id locally, so every later event
and order carries it, **and** it tells the server, which merges the anonymous
history collected before the sign-in into that customer. Without the second
part no `site_users` row exists, so the person never appears in a segment, on a
customer profile or in CLV — even though their events carry the id.

Traits are yours to choose. `email` is lifted out because the server has a
column for it; everything else is stored as traits and is available to segment
rules.

`phone` is lifted out too and is **not sent**: a phone number as a trait would
sit in clear text where every segment and export can read it, and sign-in has no
field for one. A number reaches Selwise as a consent decision — the order's
`marketingConsent` below, or the newsletter form.

The SDK adds what it knows about the app to the traits — `platform`, `appVersion`,
`appLocale` and `pushPermission` — so a segment of signed-in customers can be
built on them. Tell it the notification permission whenever you learn it:

```ts
selwise.setPushPermission('granted'); // 'granted' | 'denied' | 'undetermined'
```

It also lets a segment say "has not allowed notifications", and it is the
permission [app push](#push-notifications) is judged on. The same facts, and
which screens this device opened in the last days, go with every segment
request.

It never throws: it is called from a sign-in handler, and the local id is
already set by the time the network call runs.

#### Signed identity

The customer id is otherwise taken on the app's word. To prove it came from
you, have **your backend** sign it with the channel's identity secret
(Dashboard → Channels → the channel → Signed identity) and return the
signature with the sign-in response. The secret never goes into the app.

```ts
// your backend (Node), at sign-in
const userHashTs = Math.floor(Date.now() / 1000);
const userHash = crypto
  .createHmac('sha256', process.env.SELWISE_IDENTITY_SECRET)
  .update(`${customerId}:${userHashTs}`)
  .digest('hex');

// the app
await selwise.identify(customerId, { email }, { userHash, userHashTs });
```

A timestamped signature is valid for 7 days; `HMAC(secret, customerId)`
without `userHashTs` is accepted too. Once the dashboard shows every identify
as signed, the channel can **enforce** signed identity: an unsigned identify
then still records events but can no longer read the customer's segments or
recommendations, or tie a contact to them.

---

## Recommendations

### With the hook

```tsx
import { SelwiseProvider, useRecommendationWidget } from '@selwise/react-native/react';

// at the root:
<SelwiseProvider client={selwise}>{children}</SelwiseProvider>

function SimilarProducts({ productSku }: { productSku: string }) {
  const { products, loading, trackImpression, trackClick } = useRecommendationWidget(
    'WIDGET_ID',
    { currentProductId: productSku }
  );

  useEffect(() => {
    if (products.length > 0) trackImpression();
  }, [products, trackImpression]);

  if (loading || products.length === 0) return null;

  return (
    <FlatList
      horizontal
      data={products}
      keyExtractor={(item) => item.itemCode}
      renderItem={({ item, index }) => (
        // the app's EXISTING product card — not a Selwise one
        <ProductCard
          product={item}
          onPress={() => {
            trackClick(item.itemCode, index);
            navigation.navigate('ProductDetail', { pk: item.sku });
          }}
        />
      )}
    />
  );
}
```

`trackImpression` is idempotent per mount. `trackClick` is **required for
attribution** — without it, revenue from that recommendation is never credited
to the widget.

Draw the strip's heading from the hook's `widget` (`widget?.title`), not from
a copy of your own: an A/B experiment can change it — see
[A/B experiments on a strip](#ab-experiments-on-a-strip).

A "complete to free shipping" strip (`free_shipping_complement`) follows the
basket by itself — see [the basket](#the-basket-setcart) below. The hook's
`followsCart` says whether this strip is one.

The hook aborts its request on unmount and on every dependency change, which
matters more here than on the web: a fast scroll through a product list can
mount and unmount the same widget several times.

Pass `enabled: false` to hold the request until the product code resolves.

### Without hooks

```ts
const widgets = await selwise.getRecommendationWidgets('app://product');
const result = await selwise.getRecommendationProducts(widgets[0].id, {
  currentProductId: 'SKU-12345',
});
if (result.hidden || result.products.length === 0) return; // draw nothing

const heading = result.widget?.title ?? widgets[0].title;
selwise.trackRecommendationImpression(result.widgetId, result.products.map((p) => p.itemCode));
selwise.trackRecommendationClick(result.widgetId, 'SKU-12345', 0);
```

### A/B experiments on a strip

A recommendation experiment runs in the app the way it runs on the web. The
SDK resolves the visitor's arm for every strip before asking for its products,
so a host that names a widget by id is in the experiment without changing
anything:

- **`different_module`** — the arm's strip is drawn in the slot instead: its
  products are asked for under ITS id, and `result.widgetId` / `result.widget`
  describe it (`result.sourceWidgetId` is the widget you asked for). The arm's
  strip is usually inactive on its own; the API serves it while the experiment
  runs.
- **`config_override`** — the strip you asked for, with the arm's title,
  subtitle, display type and styles applied to `result.widget`. The products
  request names the arm (`experimentVariantId`, as the browser widget does)
  and the API applies the arm's strategy and product count from the stored
  experiment — never from the request. The SDK does not trim or reorder the
  products to fake either.
- **An experiment with an Audience** applies to a strip only on a screen the
  audience matches, judged when the strip is asked for: the screen set with
  `setScreen` / `trackScreenView`, a mobile device, the server's country, the
  measured basket, segments and test mode. A rule on what only `getSurfaces`
  is told (the page kind, the product on screen) does not match a strip, so
  such an experiment keeps strips out — the live strip, nothing counted.
- **A strip the arm draws nothing for** comes back `hidden: true`, with no
  request made. A holdout arm cannot be created for a recommendation
  experiment (whether a strip is drawn depends on the server's answer, and that
  request is itself recorded); one that arrives anyway is never drawn and never
  counted.

The arm's **exposure** — the visitor counted into the experiment — is recorded
with the strip's first `trackRecommendationImpression`, once per arm per
launch, never in test mode: the browser widget's moment, and the same moment in
every arm. Impressions and clicks are recorded under the strip actually drawn,
against the answer that strip was given — report them with `result.widgetId`
(the hook does). A listed id is mapped to the strip last answered for it. So
the impression call is what puts an app visitor into the results page.

The arms are fetched once per launch (shared with `getSurfaces`) and every
strip waits for them: a strip asked for before them would be the control for
everyone. `resolveRecommendationWidget(widget)` gives the same answer without
asking for products — `selwise.strips` uses it to decide how to draw a
strip before asking. An arm whose strip answers the basket ("complete to free
shipping") is followed like any such strip; the slot's own strategy does not
decide (see [the basket](#the-basket-setcart)).

### A/B tests of a point (screen experiments)

The dashboard can compare what a named point of a screen draws: one arm a recommendation strip, another an enrichment block, another a campaign, another nothing. There is nothing to write for it beyond mounting the point you already mount:

```jsx
<SelwiseSlot screen="app://product" slot="pdp-under-info" sku={product.sku} context={{ currentProductId: product.sku }} />
```

For a shopper in the test the point draws the module of their arm and nothing else: what the point's own targeting would have drawn there is replaced, and a module that is in an arm is not also drawn there by its own targeting. A shopper outside the test (its traffic share or audience, or no consent to experiments) sees the point as before and is not counted. The point draws nothing until it knows which, so what a test replaces is never drawn first.

- The shopper is counted when the point has been on screen for a second with the app in front (a one-point probe at the top of the point), in every arm, the one that shows nothing included. A point below the fold of a screen nobody scrolls counts nobody.
- A tap on the arm's own module (a strip's product, a campaign's button, an enrichment block's link) is the arm's click goal.
- A QA link (`qaLinks: true`, `selwise_variant=<experiment>:<arm>`) forces the arm and counts nothing.
- On a point you draw yourself, `client.resolveScreenSlot(screen, slot)` returns the arm (`arm.module.kind`: `recommendation`, `enrichment`, `campaign` or `none`; `arm.moduleData`), and `client.trackScreenSlotExposure(arm)` records the exposure when your point is on screen. `getSurfaces()` already withholds the campaigns of a point a test owns and adds the arm's campaign, placed at that point.

### Complementary strips: `product.complement`

A strip on the `complementary` strategy (products of the role pairs the store
approved on Catalog → Product Roles) carries, on every product, the pair that
put it there:

```ts
product.complement; // { role: 'socks', relation: 'complement', label: { tr: 'Çorap', en: 'Socks' } }
```

Group by `role` for one tab per role (the web widget's `role_tabs` view), or
caption each card with `label` (its `look` view). Every other strategy sends
`null`. The SDK passes the field through and draws nothing itself — the
`displayType` the merchant picked is in `widget.displayType`.

### Variants and sizes

A product arrives with its options when the feed has them: `variants` (each with
the `variantCode` the basket accepts, its size, colour and stock), `swatches` (the
colour siblings), `cartCode` (the code the basket accepts when it is not the
`itemCode`) and `hasVariants`. The strips draw them for you: the card's "add to
cart" opens a native sheet when the shopper has to choose a size (a sold-out size is
shown and cannot be picked), adds at once when there is nothing to choose, and
never guesses a size — a product with several options and no code of its own opens
its own screen instead. The add goes to `host.addToCart({ code, quantity, source,
surfaceId, product })` with the basket code, and the strip reports it. A product
the catalogue already calls sold out (`inStock: false`, and no option left in
stock) is never sent to the basket: its button is drawn disabled and says "sold
out". When the basket refuses an add, resolve `{ success: false, message }` with the
platform's own sentence and the strip shows it to the shopper, instead of a bare
"error". If you draw a card yourself (`renderItem`), the same fields are on
`product`; send the chosen `variantCode` to your own basket.

---

## Campaigns and widgets

`getSurfaces()` answers one question: **which campaigns and widgets is this
screen allowed to show right now.** It returns data, not UI.
[`<SelwiseSurfaces />`](#drawing-it-the-components) draws it for you — once, at
the app's root — and so does the `selwise-akinon-appmaker` plugin on Akinon App
Maker; call `getSurfaces()` yourself only to draw with your own components.

```javascript
const surfaces = await selwise.getSurfaces('app://basket');

for (const surface of surfaces) {
  // surface.type      — 'announcement_bar', 'custom', 'newsletter', …
  // surface.content    — the merchant's copy and links
  // surface.styles     — colours and spacing (may contain var() references)
  // surface.placement  — dock position, trigger, frequency cap
  // surface.customCss / surface.customJs — the dashboard's own code fields
  // surface.experiment — set when an A/B variant shaped this surface
  // surface.stateId    — the content state that chose the words, or null
}
```

### The gates, in order

The order mirrors the browser widget's, and each step protects against showing
too much:

1. Test mode — a gate, not a filter. A test-mode entity is invisible to a real
   visitor and the only thing a tester sees.
2. Page targeting, on the synthetic screen name — and on the screen's PAGE
   TYPE when you pass one: `getSurfaces('app://product', { pageType: 'product' })`.
   The dashboard lets a merchant limit a campaign to `home`, `product`,
   `category`, `search`, `cart`, `checkout`, `account` or `other`. A screen
   you do not label matches every page type, so a "product pages only"
   campaign shows on every screen until your product screen says it is one
   (`setScreen(url, { pageType: 'product' })`). The App Maker plugin labels its
   screens for you.
3. Country targeting, using the country the server resolved from the request ip
   (`getSurfaces(url, { country })` overrides it).
4. Experiment exclusion — a control the variant replaced does not render
   alongside it.
5. Segment targeting. Membership is asked of the server and cached for five
   minutes. A segment the server cannot answer for — it is switched off or
   deleted, or the server is unreachable — is unknown, and unknown hides the
   surface in both modes: `include` needs a segment the visitor is known to be
   in, and `exclude` needs every listed segment to be a known "not a member".
   The same rule as the web. (A visitor who has not allowed `personalization`
   is deliberately in no segment: `exclude` shows, `include` does not.)
6. Empty content, except for `custom`, where the code IS the content.
7. Experiment `config_override` — the variant's content merged over the
   control's. Arrays replace rather than concatenate.
8. Content states, cart and product values — the first matching state whose
   words can be said is applied (`surface.stateId` names it); a state whose
   values cannot be said yields to the next and then to the base; a state that
   hides the campaign drops it, and so does content with nothing sayable left
   (no `setCart`, money with no currency, no `product` on this screen). See
   below.
9. Conflict resolution — one surface per dock position.
10. Frequency caps.

### Content states and cart values

A merchant can give a campaign STATES in the dashboard ("when the basket is
worth 750 or more, say this instead"). `getSurfaces()` applies the winning one
for you: `surface.content` is that state's content with `states` removed, and
`surface.stateId` is its id (`null` for the base content). A state that hides
the campaign never reaches you — it was not shown, so it takes no dock, spends
no allowance and records no impression.

`{cart.total}` and `{cart.itemCount}` in a campaign's words are filled from the
cart you set with `setCart()`. The product values — `{product.title}`,
`{product.price}`, `{product.originalPrice}`, `{product.discountAmount}`,
`{product.discountRate}`, `{product.stock}` — are filled from the product a
product screen passes in the context:

```ts
await selwise.getSurfaces('app://product', {
  product: { title, price, originalPrice /* before a discount */, stock, currency },
});
```

A value that cannot be said — no measured cart, no product on this screen, an
original price not above the price (not on sale), a zero or unknown stock —
makes its sentence unsayable: a state yields to the next matching state and
finally to the base, and a surface with nothing sayable left is dropped. You
are never handed raw braces to print. The words are chosen at the moment of the
call, so call `getSurfaces()` again on `onCartChange`, and when the product on
screen changes, if a screen's campaigns speak about them. Pass `{ locale }` in
the context to format amounts in the viewer's language; the device default
applies otherwise.

The same product answers product CONDITIONS: a state or a targeting rule on
`productStock`, `productOnSale`, `productDiscountRate` or `productPrice`
(when the stock is below 5, say "Son {product.stock} ürün"). On a screen
with no product such a rule does not match — the state yields, a surface
targeted by it is not returned. While the product screen is still loading its
product, pass `product: { pending: true }`: a surface whose words or state
need the product is held back instead of returned with its fallback and
replaced a moment later.

The SDK announces on `/config` which values and conditions it understands
(`?p=4`: cart and product values, product conditions) and sends the same `p`
when it asks for its experiment assignments; the API withholds a campaign —
and keeps the SDK out of an experiment whose arm says or checks something —
from an older SDK that announces less, which would print the braces or drop a
rule it does not know and return the campaign more widely than it was
targeted.

### The basket: `setCart`

The basket lives in your app, so you tell the SDK what is in it — on every
basket change, and once with the basket the app restored at launch:

```javascript
selwise.setCart({
  total: 379.8,      // products after the store's discounts, BEFORE shipping and fees
  itemCount: 3,      // units in the basket
  currency: 'TRY',   // optional ISO 4217; the channel's currency otherwise
});

selwise.getCart();   // { known: true, total: 379.8, itemCount: 3, currency: 'TRY' }

const unsubscribe = selwise.onCartChange((cart) => {
  // re-resolve goal bars; re-run getSurfaces() where campaigns speak about the cart
});
```

- **Absolute, not a delta.** `total` is the whole basket after discounts and
  before shipping (GA4's `value`): a grand total counts the shipping fee toward
  free shipping. Numeric strings (`'379.80'`) are accepted.
- **Memory only.** A launch starts with an UNKNOWN cart (`known: false`), and an
  unknown cart is never printed. A cart persisted from the previous launch could
  have changed on another device, and a wrong amount is worse than none.
- `setCart(null)` when the basket is no longer known (cleared after an order,
  logout). An input that is not a basket returns `false` and also makes the
  cart unknown — the previous amount is stale by then.
- The cart also feeds targeting: when you pass no `behavior`, `cartValue` and
  `cartItemCount` rules evaluate against it; when you pass one, the SDK fills
  only the cart signals you did not set.
- `codes` (optional) lists the basket lines' product codes — item code, sku or
  the platform's cart code. They ride only with a `free_shipping_complement`
  ("complete to free shipping") strip's products request, which the SDK sends
  the measured basket with on its own, so the basket's own products are not
  recommended back. A line swapped for another at the same amount is a basket
  change (`onCartChange` fires). Pass `context.cart` to
  `getRecommendationProducts` to override the basket, or `null` to send none.
- `useRecommendationWidget` keeps such a strip in step with the basket on its
  own — no `reload` needed. On every basket change it asks again (debounced,
  300 ms, so a quantity stepper is one request), keeps the strip on screen
  without setting `loading` while it does (the cards change in place, and that
  is not a second impression), returns no products once the basket passes the
  threshold, and asks nothing while the basket is unknown (`setCart(null)`).
  A strip that empties and later fills again is a new display, which
  `trackImpression` counts once more (the effect in the hook example above
  already calls it on every new `products`). The products answer says whether
  a strip follows the basket (`result.liveCartRequired`).
- Without hooks, the same behaviour is `RecommendationWidgetLoader` (exported
  from the package root since 0.10.0 — the hook runs on it, and so does
  `selwise.strips.follow`, which `<RecommendationStrips />` uses):

  ```ts
  const loader = new RecommendationWidgetLoader(selwise, widgetId, { currentProductId }, (state) => {
    // state.products, state.followsCart, and state.appearance — bumped each
    // time the strip comes back on screen after being empty: count an
    // impression when it changes, not when the cards are swapped in place.
  });
  loader.load();
  // … on unmount:
  loader.stop();
  ```

The App Maker plugin feeds this from the app's own basket; on any other app,
call `setCart` from wherever the basket changes.

### The goal bar

`goal_bar` surfaces ("₺120 more for free shipping") are resolved by the same
pure function the browser widget and the dashboard preview call. Re-resolve on
every `onCartChange` and draw what comes back:

```javascript
const view = selwise.resolveGoalBar(surface, { locale: 'tr-TR' });
if (view.visible) {
  // view.text, view.buttonText, view.buttonUrl — already filled, state-dependent
  // view.progress.percent (0–100), view.progress.markers, view.progress.complete
}
```

- `visible: false` → draw nothing and record no impression: an unknown cart,
  an empty one the merchant did not ask to show, or a value that cannot be said.
- Call `trackSurfaceView(surface)` the first time a view is VISIBLE, not when
  the surface is returned.
- The button's words and link change with the state: navigate to
  `view.buttonUrl`, not `surface.content.buttonUrl`.

**`goal_reached`** means the basket passed a step WHILE the bar was on screen.
Only you know what is on screen, so you report it — with the browser widget's
rule:

```javascript
import { goalStepsCrossed } from '@selwise/react-native';

// previousView / nextView: two consecutive views of the SAME mounted bar
for (const step of goalStepsCrossed(previousView, nextView)) {
  selwise.trackGoalReached(surface, { step });
}
```

- Only steps passed while the PREVIOUS view was visible count. A step already
  behind the shopper when the bar first appeared, or one passed while it was
  hidden or off screen, is not reported. The new view need not be visible:
  reaching the goal can hide a bar with no reward sentence.
- Forget the previous view when the bar leaves the screen.
- Sent at most once per session per surface and step, across relaunches.
  Returns whether it was sent.
- Pass the surface as `getSurfaces()` returned it and `{ step }` is enough;
  with only an id, pass `threshold` (that step's `at`) and `metric` too.
- It is not a click and earns no revenue credit.

### Countdowns: fixed date or daily cutoff

A `countdown_timer` counts to a fixed `endDate`, or — with
`countdownMode: 'daily_cutoff'` — to the next time the STORE's clock reads
`dailyCutoff` ("orders before 14:00 ship today"), rolling over to tomorrow once
it passes. Ask for the target on every tick; a target read once ends the
countdown for good at the first cutoff:

```javascript
import { countdownTarget } from '@selwise/react-native';

const target = countdownTarget(surface.content, Date.now()); // epoch ms, or null → draw nothing
```

### Conflict resolution

On the web the contested resource is a CSS selector; in an app it is a **dock
position**. Two announcement bars pinned to `top` overlap and two popups open
at once, so the same rules apply: `highest_priority` (the default, ties broken
by id), `all`, `random`. A selector-placed surface occupies no dock and
competes with nothing.

**If you put two surfaces in the same dock on the same screen, one of them
never appears.** That is the intended behaviour, not a bug.

### Frequency caps

Spend the allowance when the surface actually DRAWS, not when it is returned —
a popup whose trigger never fires, or a badge below its threshold, should keep
its allowance for the screen where it appears:

```javascript
selwise.trackSurfaceView(surface);
await selwise.recordSurfaceShown(surface);
```

Caps persist to storage, so they survive a relaunch. In an app the process
outlives the screen, which is why an uncapped popup otherwise reappears on
every navigation.

### Dismissal

```javascript
await selwise.dismissSurface(surface);   // records `close`, remembers it
selwise.resetDismissals();               // for a merchant testing their app
```

A close is remembered for the campaign's "after it is closed" setting: for the
current session by default, or for a number of days (kept across relaunches).
Tapping the surface's own button stores nothing; how often it returns is the
frequency cap's job. The surface comes back when its words or design change.
Pass the whole `surface` object you were given, not just its id.

> **Behaviour change.** Earlier versions remembered every close (except a goal
> bar's) permanently. A close now lasts for the session unless the campaign
> says otherwise, and the old permanent list is dropped on first launch.

### The brand theme

Widget style DEFAULTS are literally `var(--selwise-brand, #1a1a1a)`, so a
merchant who never touched a colour still ships one. React Native has no
cascade and no `var()`, so resolve them before use:

```javascript
const tokens = selwise.getTheme();
// { '--selwise-brand': '#d3145a', '--selwise-brand-text': '#ffffff', … }
```

`<SelwiseProvider>` and the plugin do this for you. With no theme configured,
the literal fallback inside the `var()` applies — the same value the web falls
back to. `selwise.on('theme', listener)` tells you when the tokens arrive (they
come with `/config`, a moment after the first screen).

### Dashboard settings

`init()` options you pass explicitly win; the dashboard's Tracking settings
fill in the rest (batch size, flush interval, offline persistence, retries,
queue bound). The dashboard's debug flag can only turn diagnostics ON — it
never silences a host that asked for them.

### Control group (since 0.13.0)

When the merchant turns on the channel's control group (Dashboard → the
channel's settings → Control group), a share of visitors (1–20%) sees no
Selwise surface, so the dashboard can report the revenue Selwise ADDED rather
than the revenue it was credited with. The SDK applies it for you, from this
install's visitor id and `/config`, with the same rule the web widget and the
server use: for a held-out visitor `getSurfaces()` returns `[]`,
`getRecommendationWidgets()` returns `[]`, `getRecommendationProducts()` and
`resolveRecommendationWidget()` answer `hidden: true` without a request,
`getEnrichment()` is empty and `getScenarioInbox()` returns `[]`. Search and
tracking are unchanged — the comparison is made on those visitors' events and
orders, so keep calling `track*` and `trackOrder` exactly as before. An
instance created with `testMode: true` is never held out.

### Languages (since 0.14.0)

When the account writes its content in more than one language (the account's
languages are set by Selwise when the account is provisioned), pass the app's
language and every read — `/config`, recommendations, search, enrichment, the
scenario inbox — answers in it:

```javascript
await Selwise.init({ channelKey, apiKey, storage, locale: 'en' });

// The user switched the app's language:
Selwise.setLocale('tr');
// Cached /config and enrichment are dropped; redraw what is on screen.
```

The API matches the tag to the closest language the account has (`en-GB` →
`en`) and answers in the account's default when nothing is passed or the
account lacks the language — exactly what an app gets without this option.
A text the merchant has not translated yet is shown in the default language.
`getLocale()` returns the tag you passed.

Since 0.15.0 the catalogue speaks the language too: a strip's product titles
and URLs, enrichment's `${title}` and `${url}`, and search results come from
the merchant's language feed when the account has one, and from the main feed
otherwise.

## Product enrichment

The merchant's own HTML for a product — a spec table, a care guide, a shipping
note — with `${title}` / `${attr.gtin}` tokens filled in from the catalogue.
The most-used module on the web, and the one the app did not have until 0.6.0.

Placed by NAME, because a screen has no DOM to match a CSS selector against:

```javascript
const result = await selwise.getEnrichment(product.sku, ['pdp-specs']);

for (const item of selwise.enrichmentForSlot(result, 'pdp-specs')) {
  // item.html — interpolated, sanitized, ready to render
  // item.css  — sanitized and scoped to this rule's own blocks
  // item.reservedHeightPx — space to hold open while it measures itself
  selwise.trackEnrichmentView(item);
}
```

`<SelwiseEnrichment code={product.sku} slot="pdp-specs" />` from
`@selwise/react-native/ui` renders this for you in the app's WebView.

### Why the markup arrives finished

The browser widget receives RAW blocks plus a token map and interpolates
locally, because it places content inside the merchant's own page and must
scope CSS against a document the server has never seen. An app has neither
problem — it renders in an isolated WebView — and the alternative was vendoring
the interpolator, the CSS sanitizer and the CSS scoper into this package. A
drifted copy of a sanitizer is the worst kind of duplicate to own, so the
server runs the same `prepareEnrichmentBlock` and the same DOMPurify pass the
web path uses.

### Which slots exist

```javascript
selwise.getEnrichmentSlots();   // ['basket-shipping', 'pdp-specs']
```

Every placement key a live rule carries. A screen can compare this against the
slots it renders and say — in debug — that a merchant named one nothing draws,
which is otherwise a silent blank.

### What is decided in the SDK

Test mode and segment membership, exactly as for campaigns and widgets. That
split is what lets one product-keyed response be cached for every visitor.
Content is cached per (code, slots, digest stamp) and bounded at 20 products;
`invalidateEnrichment()` clears it.

### One rule is one impression

A rule can stack several blocks and the server puts them in one root, so
`trackEnrichmentView(item)` reports once however many blocks it drew. Clicks
carry the rule the tapped link belongs to.

### What does not apply

Server-side rendering. Its purpose is clients that run no JavaScript — GPTBot,
ClaudeBot, link-preview bots — and none of them can read an app, so
`renderMode` has no bearing on app visibility. A rule marked `server` for SEO
still renders here.

## Search

Selwise search is the merchant's own: the settings they chose in the dashboard
(Search — the words, the suggestions, the results' layout and fields, the look)
reach the app, and the app draws them. There are three ways in, from the least
to the most you draw yourself.

**Search searches the Selwise product feed**, not the storefront's own product
index. The app's existing list screen stays the place for the storefront's own
filters; Selwise search is the fast instant-search layer above it.

### The whole screen: `<SelwiseSearchPanel>`

```tsx
import { SelwiseSearchPanel } from '@selwise/react-native/ui';

<SelwiseSearchPanel
  onProductPress={(product) => router.push(`/product/${product.itemCode}`)}
  onViewAll={(query) => router.push({ pathname: '/search', params: { q: query } })}
  onClose={() => router.back()}
  addToCartLabel={t('addToCart')}
/>
```

Inside `<SelwiseProvider>`, it draws:

- an input with the merchant's placeholder, and — while the box is empty — the
  **suggestions**: recent searches (with a way to clear or remove them), popular
  searches, popular categories and popular products, in the order and number the
  merchant chose, as chips or as a list;
- the **results** in the merchant's layout (`list`, `compact` or `grid`, with
  the grid's columns and image shape) showing exactly the fields they switched
  on (image, price, old price, discount, stock, category, description), the
  matching part of the title marked, the categories as chips, "did you mean"
  for a search that found nothing, and more results as the list is scrolled;
- in the **grid**, the merchant's **product card** (Search → Results → Product
  card) — the same card the recommendation strips draw, with its price,
  discount, badge, rating, colour chips, favourite heart and button — when the
  channel has one. A tap opens the product, the card's add-to-basket goes to
  `host.addToCart` with `source: 'search'` (so it counts for the search, never
  for a strip), the basket's own reason for a refusal is said as a message over
  the screen, a sold-out product's button is disabled and a size is asked in the
  card's option sheet. The list and compact layouts, a channel with no card, and
  `unstyled` draw the rows below instead; `useSelwiseSearch().productCard` is
  the card for an app that draws its own screen;
- in the other layouts, an **add to the basket** button when the merchant switched the basket on and
  the app's `host.addToCart` exists (the button says "adding", "added" or "could
  not add" in the merchant's words, and the basket's own reason when it gave one,
  under the button). A result the catalogue calls sold out gets the button
  disabled, saying "out of stock", and is never sent to the basket;
- the merchant's **look**: colours (the brand where they chose none), corners,
  density, the input's height, corners and icon, the chips' corners, and the
  font (through `host.fontFamily`).

Every sentence is the merchant's, in the app's language: the API fills any they
left empty with the platform's own, so nothing here is hard-coded. That includes
the idle add-to-cart button's word (Search → Texts); pass `addToCartLabel` only
to say it in the app's own voice instead.

| Prop | What it does |
| --- | --- |
| `query`, `onQueryChange` | Pass `query` and the app's own box drives the panel (no input is drawn); `onQueryChange` hears the panel's own input. |
| `onProductPress(product)` | A result or popular product was tapped. Without it the product's link opens through `host.navigate`. |
| `onViewAll(query)` | The app opens its own results screen. "View all" is drawn only when the merchant switched it on **and** the app can answer it. |
| `onClose` | Draws a close button beside the input. |
| `onBack`, `backLabel` | The panel as a screen of its own: a back arrow before the input (`backLabel` is its spoken word, the merchant's "close" without it). With `onBack` the panel also keeps the arrow, alone in a bar, while it has nothing else to draw (settings still loading, search off, a redirect that could not open), so the visitor can always leave. |
| `initialQuery` | The term the own input starts with, searched as the panel opens (not with `query`: the app's box already holds it). |
| `safeArea` | Keeps the panel clear of the status bar and the home indicator, with `host.safeAreaInsets`. For a panel that fills a screen. |
| `onUnavailable(status)` | Search is off for this visitor (`off`) or in test mode for this client (`test`): the panel draws nothing and you show the app's own search. |
| `renderInput`, `renderItem`, `renderSuggestion`, `renderEmpty`, `renderHeader` | Draw that part yourself, from the same data. A `renderItem` replaces the grid's card too. `renderEmpty` also gets `category` and `onClearCategory()`, so a narrowed search that found nothing can offer its way out. |
| `unstyled` | The structure only, with none of the merchant's look (the grid's product card included: it is the merchant's design): for an app that styles every part itself. |

Reported for you, once each: the search, the opening and closing of the screen,
a tapped suggestion, the tapped result and the add to the basket. Do not report
them again.

The panel draws nothing until the channel's settings arrive, and nothing at all
if they cannot be read; `<SelwiseSearch query />` (the plain results list, for an
app that keeps its own screen) behaves the same, and takes its minimum length,
debounce and page size from the same settings.

### Your own screen: `useSelwiseSearch`

```tsx
import { useSelwiseSearch } from '@selwise/react-native/react';

const search = useSelwiseSearch();
// search.query, setQuery, results (= hits), total, loadMore, hasMore, loading,
// loadingMore, error, status, isZeroResults, redirect, didYouMean, categories,
// selectedCategory, setCategory, sort, setSort, suggestions, recent,
// clearRecent, removeRecent, pickSuggestion, submit, settings, t, open, close,
// trackClick, trackAddToCart, clear
```

- `minChars`, `debounceMs` and the page size are the channel's own (Search →
  Behaviour); pass `minChars`, `debounceMs` or `limit` to override.
- `settings` is the merchant's document as this visitor draws it, or `null`
  until it arrives and while search is off; `t('empty')` and
  `t('showing', { shown, total })` say a word in it.
- `loadMore()` adds the next page to `results`; `hasMore` says whether there is
  one. `setCategory(name)` narrows the results (with an empty query it browses
  the category); `setSort('price_asc')` orders them. `categories` are the
  sub-categories of the answer: when `selectedCategory` is not one of them (a
  browsed parent), the panel draws it as a lit chip with a "×" in front, which
  calls `setCategory(null)`. A screen that draws its own chips should do the same.
- `status` is `ready`, `off` (search is off for the channel, or this visitor is
  outside its audience or an experiment's holdout) or `test` (test mode, and
  this client was not started with `testMode`). Neither of the last two is a
  zero-result search: draw nothing, or your own search, not "no results".
- `redirect` is the address the merchant set for the term (for example
  "shipping" → the shipping page), or `null`. It is set only after `submit()`
  (call it on the keyboard's search key; `pickSuggestion` does it for a tapped
  term): a term the shopper is still typing never redirects, and a recent
  search is kept only for a submitted term. `submit()` returns `true` when a
  rule is already known for the term, so do not also open your own results
  page. A redirected term returns no hits,
  and is not a zero-result search.
- Call `open()` when your search screen shows and `close()` when it goes (it is
  closed on unmount too); `trackClick(itemCode, position)` on a tapped result;
  `trackAddToCart(product)` when you added one to the basket;
  `pickSuggestion(kind, value)` for a tapped suggestion — it reports the tap and
  searches the term or browses the category.

### Without React

```ts
const settings = await selwise.getSearchSettings();       // the document, or null
const sections = await selwise.getSearchSuggestions();    // { recent, popularSearches, popularCategories, popularProducts, order }
const result = await selwise.search('ceket', { offset: 12, sort: 'price_asc', category: 'Kadın' });
// The shopper pressed the keyboard's search key: ask as a submission.
const sent = await selwise.search('kargo', { submit: true });
// result.hits, total, offset, categories, suggestions (did you mean), redirect, status
```

- `getSearchSettings()` is the dashboard's document in the app's language, with
  the phone's own layer over it (an app is always a phone) and — for a visitor in
  a search A/B test — the arm's changes over that. Read once per language; read
  again after `setLocale` and after `invalidateSurfaces()`. `getSearchState()`
  tells `off`, `test` and `unknown` (could not be read) apart.
- `search()` asks for the channel's own page size, from `offset`, in `sort`
  (`relevance`, `price_asc`, `price_desc`, `newest`), narrowed by `category`
  (with an empty query it browses the category). The next page starts at
  `offset + hits.length`; the API reads the first 500 results.
- `getSearchSuggestions({ query? })` cuts each section to the merchant's limit;
  `query` narrows the two lists of terms to those containing it.
- **Recent searches** stay on the device only while the visitor's consent allows
  remembering them (the `preferences` category). Without it they live in memory
  until the app closes, and what an earlier consent left on the device is
  removed. `getRecentSearches()`, `removeRecentSearch(term)` and
  `clearRecentSearches()` read and edit them.

What `search()` reports: `search_query` — or `search_zero_results` when nothing
matched — once per search, from its first page (a page, a category or an order
of the same search is not reported again; pass `refinement: true` when you run
one yourself). A merchant's redirect is reported as a search, never as a
zero-result one. You report the rest:

| Call | Reports |
| --- | --- |
| `trackSearchOpen(trigger?)` / `trackSearchClose(summary?)` | The screen opened and closed, with how long it was open. The first opening of a visitor in a search A/B test is their exposure to its arm. |
| `trackSuggestionClick(kind, value)` | A tapped recent search, popular search, popular category or popular product. |
| `trackSearchClick(query, itemCode, position?, category?)` | A tapped result, with the term and the category it counts under (`primaryTopCategory(product.categories)`). |
| `trackSearchAddToCart(product, { query? })` | A product added to the basket from the search. |

Never call the storefront widget's own `/search/log` or `/search/click`
endpoints: Selwise writes the search log from these events, and a second call
would count every search twice.

### A/B tests of the search

When the visitor is in a test of the search configuration, `getSearchSettings()`
(and so the panel and the hook) already carry the arm's changes. The exposure is
recorded once, the first time the search is opened (`trackSearchOpen`, which the
panel and the hook call for you) — not when the settings are read. A visitor in
the test's holdout gets `off`.

---

## Drawing it: the components

`@selwise/react-native/ui` draws what the dashboard configures. It needs
`react-native` and nothing else; the two native modules a few of its parts want
are handed over by the app.

```tsx
import { Selwise } from '@selwise/react-native';
import { SelwiseProvider } from '@selwise/react-native/react';
import { SelwiseSurfaces, SelwiseSlot, SelwiseSearch } from '@selwise/react-native/ui';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const selwise = new Selwise();
selwise.init({ channelKey, apiKey, storage: AsyncStorage });   // not awaited: the components wait for it

const host = {
  navigate: (target) => router.open(target.url),                // a link a surface or a strip points at
  addToCart: async ({ code, quantity }) => {                    // `message` is shown to the shopper on a refusal
    const result = await basket.add(code, quantity);
    return result.ok ? { success: true } : { success: false, message: result.reason };
  },
  WebView,                                                      // the merchant's own HTML runs in it
  safeAreaInsets: useSafeAreaInsets,                            // an object, or a hook
};

export const Root = () => (
  <SelwiseProvider client={selwise} host={host}>
    <App />
    <SelwiseSurfaces />   {/* once, at the root: every campaign and widget follows the screen */}
  </SelwiseProvider>
);

// Wherever a strip may go. The merchant picks the point in the dashboard.
<SelwiseSlot screen="app://home" slot="home-bottom" />
```

Tell the client which screen the app is on, and the components follow:

```ts
selwise.setScreen('app://product', { screenName: 'ProductDetail', pageType: 'product' });
selwise.setProduct({ title, price, originalPrice, stock, currency });   // on a product screen; null elsewhere
selwise.setCart({ total, itemCount, currency });                        // on every basket change
```

| Component | Draws |
| --- | --- |
| `<SelwiseSurfaces />` | Every campaign and widget that targets the current screen, drawn where the merchant placed it: a bar docked to the top or bottom, a floating button in one of four corners, a popup or newsletter window (centred, or rising from the bottom), a slide-in from the right, left or bottom, and the merchant's own HTML (`custom`, in the app's WebView). Pictures, buttons, countdowns, the two counters and the newsletter are drawn as designed in the dashboard. The counters read their number from Selwise (`getProductCount`), so there is nothing to pass for them. Props: `renderers`, `onNavigate`. |
| `<SelwiseSlot screen slot />` | What the merchant sent to that named point: recommendation strips, campaigns placed in a point (an announcement bar inside the product screen, a counter under the price, an inline newsletter) and, with `sku`, the product enrichment placed at the same name. The names are `slotUtils.SCREEN_SLOTS`; a strip with no point is drawn at the screen's last one. Strips that land on the same point compete as they do on the web: the highest priority is drawn (a tie goes to the id), `random` picks one per install, and if any of them asks for `all` every one is drawn; a winner with no products hands the point to the next. `Selwise.explain()` lists a loser as `conflict` (with the winner and the rule) and an empty winner as `empty`. A campaign sent to a point you did not mount is not drawn — it never falls back to a bar at the top — and the viewers and basket counters have no place but a point (`pdp-under-info` unless the merchant picked another). |
| `<RecommendationStrips screen />` | Every strip a screen has, in one place — each point's winner, by the same competition as `<SelwiseSlot>`. |
| `<RecommendationStrip strip />` | One strip you loaded yourself with `selwise.strips`. |
| `<SelwiseSearchPanel />` | The whole search screen, drawn from the merchant's search settings (see [Search](#search)). |
| `<SelwiseSearch query submitted? />` | A results list: the app keeps its own input and screen. With `submitted` it follows a merchant's redirect rules, pages as it is scrolled and reports the tap. |
| `<SelwiseEnrichment code slot />` | A named block of the merchant's content for a product. On a screen known not to be a product screen its point is not reported as missing. |

`renderItem` on the strips and on search draws your own card;
`renderers={{ announcement_bar: MyBar }}` on the overlay draws a type with your
own component; the built-in ones are deliberately plain so nobody ships one
believing it is themed.

### The host

`SelwiseHost` is what the SDK cannot know about your app. Every member is
optional and each has a plain fallback:

| Member | Without it |
| --- | --- |
| `navigate(target)` | An `https` or custom-scheme link opens with `Linking`; a storefront path (`/list/`) or a screen address (`app://basket`) is left alone — **give the app `navigate` so a campaign button that points at one of your screens opens it**. `target.kind` says which it is (`screen` for an `app://` address of the screen catalogue), `target.source` what asked. Return `false` for a link you did not handle. |
| `addToCart(item)` | A `custom` widget's add-to-cart is skipped, with a line in the log. Resolve `{ success: false, message }` for a refusal and the SDK shows `message` (the platform's own sentence) where the add was pressed. |
| `WebView` | A `custom` campaign and an enrichment block are skipped, with a line in the log saying so. |
| `safeAreaInsets` | A platform-shaped guess. A function is called as a hook on every render. |
| `renderImage(props)` | React Native's `Image`. A campaign picture that is an SVG is drawn only through this (React Native's `Image` cannot), and skipped with a line in the log without it. |
| `renderIcon({ name, size, color })` | A small built-in glyph. Draws the dashboard's counter icons (`eye`, `users`, `trending-up`, `flame`, `shopping-cart`, `shopping-bag`) with your own icon set; return `null` for a name you have no icon for. |
| `fontFamily` | The app's default font. A map (or a function) from the brand's font name to yours. |
| `isFocused` / `useIsFocused` | A strip counts an impression whenever it is on screen; give it your navigation's focus so a strip another screen covers is not "seen". |
| `storefrontUrl`, `enrichment` | A block's relative image sources resolve against `storefrontUrl`; `enrichment` sets its base typography. |

Pass a stable `host` (a module constant, or memoised): a new object on every
render redraws every component below it.

### State and subscriptions

The components read everything from the client, and so can you:

```ts
const stop = selwise.on('screen', (screen) => { … });   // 'ready' | 'screen' | 'product' | 'cart' | 'theme' | 'consent' | 'locale'
selwise.getScreen(); selwise.getProduct(); selwise.getCart(); selwise.getTheme();
```

A listener is not called with the current value when it subscribes: read it
first. Hooks over the same state are in `@selwise/react-native/react`
(`useScreen`, `useProduct`, `useCartVersion`, `useThemeVersion`, `useLocale`,
`useSelwiseReady`).

### Strips: one request per screen

`selwise.strips` (a `StripService`) is the one place a screen's strips are
loaded: the list with the visitor's A/B arm applied, then each strip's products.
The list is asked once and shared between every point of a screen, and a point
asks for the products of its own strips only. `selwise.strips.setPlacements({
'app://product': ['PDP — Benzer Ürünler'] })` limits a screen to named widgets
when you would rather decide in code than in the dashboard.

### Favourites: the product card's heart

A card the merchant designed with a favourite ("wishlist") button draws it when
your app hands over its favourites list — an app with none has nothing for the
button to do, so it is not drawn.

```tsx
<SelwiseProvider
  client={selwise}
  host={{
    // The shopper asked for `wished` (true: add, false: remove). Resolve
    // { success: false } when you refused — a guest you sent to sign in — and
    // the heart keeps the state it had.
    toggleWishlist: async ({ product, wished }) => ({ success: await favourites.set(product.itemCode, wished) }),
    // What the heart shows when it appears. `product.cartCode` is there for a
    // store whose favourites are keyed by another code.
    isWishlisted: (code, product) => favourites.has(code),
    // Optional: call the listener when your list changes (a heart on another
    // screen, a sign-in that loaded it) and the hearts on screen redraw.
    subscribeWishlist: (listener) => favourites.subscribe(listener),
  }}
>
```

The SDK reports a `wishlist` event for an add you confirmed (a removal reports
nothing, as on the web). If your own code also sends a `wishlist` event for the
same tap, send it from one place only.

### What a strip draws

`<RecommendationStrips />` and `<SelwiseSlot />` draw a strip as the merchant
designed it: the heading and subheading, the container (background, padding,
corners), every display type (slider and carousel with the page dots, grid, list,
tabs by role, and a look with its total and "add all"), and the product card of
the card designer, painted from the brand and drawn from its element tree. The
card's price, discount, badge, rating, colour chips and button are drawn; what a
phone has no equivalent for (the card's own HTML node, hover effects, animations)
is not. The strip's frequency cap is kept on the device, and an A/B arm's heading,
display type and styles apply. Pass `renderItem` to draw the card with your own
component instead; the layout, the impressions and the clicks still wrap it.

### Why something is not on the screen: `explain()`

A campaign or a strip can be sent to the device and still not be drawn: the visitor
is outside its segment, an experiment draws something else, the point it sits in is
not mounted, a counter is under its threshold. `explain()` says which, for the
screen the app is on:

```ts
selwise.explain();            // everything the API sent that is not on this screen
selwise.explain('campaign-id');   // one campaign's, or one strip's widget id
// [{ id, kind: 'campaign' | 'strip', type?, screen, reason, waiting, detail, at }]
```

`reason` is one of the codes the dashboard's "Why is this not in my app?" checklist
uses, so the panel and the device say it in the same words: `screens` (not targeted
to this screen), `device`, `country`, `behavior`, `test` (test mode and the device
disagree), `dismissed`, `control_group`, `experiment_arm`, `experiment_holdout`,
`segment`, `consent` (the visitor's answer does not allow reading their segments),
`content` (nothing the surface can say right now; `detail.cause` names it),
`conflict`, `frequency_cap` (`detail.window` is the limit that blocked it),
`campaignSlot` (a campaign placed in a point the app does not mount here), `type`
(no renderer for it), `empty` (a strip with no products), `below_min_count`,
`count_unavailable`, `product_unresolved` (counters) and `trigger_armed`.
`waiting: true` marks a surface that is armed for its trigger: it will show, it has
not failed. `explain` returns an empty list for a surface that is drawn.

It records what the SDK decided, where it decided it, so it cannot disagree with the
screen. With `init({ debug: true })` each report is also logged once. It cannot say
anything about a campaign outside its schedule or with delivery switched off: the
API never sends those.

### On-device diagnostics: the "S" button

Start the client with `debug: true` and `<SelwiseSurfaces />` draws a small "S" at
the bottom-left of the screen. Tap it and a sheet lists what Selwise did on the
screen the app is on: its address and page type, the campaigns and widgets drawn,
the strips drawn per point, and every report of `explain()` with its reason in a
sentence (a waiting surface is marked as waiting). **Refresh** reads it again.

It is for development and internal builds. Without `debug: true` it draws nothing,
subscribes to nothing and costs a boolean read per render, and the dashboard cannot
switch it on remotely — only the host asks for the button. It uses only
`react-native` primitives and shows no visitor identifier.

`<SelwiseSurfaces />` mounts the button itself, so there is nothing to add. An app
that does not use `<SelwiseSurfaces />` mounts `<SelwiseDebugOverlay />` from
`@selwise/react-native/ui` once inside `<SelwiseProvider>`. A second mount is
harmless: one button is drawn per client.

---

## Orders and revenue attribution

```ts
const { created } = await selwise.trackOrder({
  orderId: 'ORDER-2026-1881', // idempotency key — re-sending never double-counts
  total: 1499.7,
  currency: 'TRY',
  items: [
    { productItemCode: 'SKU-12345', quantity: 1, unitPrice: 749.9 },
    { productItemCode: 'SKU-67890', quantity: 2, unitPrice: 374.9 },
  ],
});
```

Unlike `track()`, **this one is awaited**: a lost order is lost revenue
attribution. The call flushes pending events first, so last-touch attribution
can see the click that led to the order.

Send the money lines the app has — `subtotal`, `discountTotal`, `shippingTotal`,
`taxTotal` — and, on a line sold below its list price, `originalPrice`. Leave out
what the app does not know: an absent discount is "not reported", and `0` would
read as "paid full price".

```ts
await selwise.trackOrder({
  orderId: 'ORDER-2026-1882',
  total: 90,
  subtotal: 100,
  discountTotal: 10,
  items: [{ productItemCode: 'SKU-12345', quantity: 1, unitPrice: 90, originalPrice: 100 }],
  // Only when the shopper ticked a box at checkout. The order has no e-mail or
  // phone field of its own; this is the one door for them.
  marketingConsent: [{ kind: 'email', value: 'customer@example.com', optIn: true, note: 'Email me about offers' }],
});
```

`currency` is optional because omitting it beats guessing — the server falls back
to the site's configured currency, and a hardcoded default would file a Polish
order in Turkish lira on a multi-market storefront.

### Links that open the app: `trackDeepLink` (since 1.4.0)

A Selwise message link carries `sw_sc` — the scenario that sent it — and a
campaign link carries `utm_*` or an ad-click id. In a browser the widget reads
them off the landing page; an app has to hand them over:

```ts
import { Linking } from 'react-native';

Linking.getInitialURL().then((url) => url && selwise.trackDeepLink(url)); // cold start
Linking.addEventListener('url', ({ url }) => selwise.trackDeepLink(url)); // app already open
```

It records what the browser widget records on landing:

- a `page_view` of the link reduced to its path and its campaign parameters —
  the visit's traffic source (`utm_medium=cpc` or a `gclid` is paid);
- for a message link, a `click` on entity type `messaging` keyed by the
  scenario, so the message owns the order that follows, exactly as it does on
  the web.

Every other parameter is dropped before anything is sent — a deep link may
carry a reset token or an address — and an ad-click id is kept as present
(`gclid=1`), never its value. A link with no attribution parameter records
nothing, and the same link is recorded once per session. A link handed over
before `init()` resolves — the cold-start one usually is — is kept and recorded
when `init()` finishes. Consent applies as to every event: the landing is
`analytics`, the message click `marketing`.

---

## Push notifications

A scenario's **App push** step sends a notification to the person's phone
through *your own* Firebase project, Apple developer team or Expo account —
Selwise composes, targets and measures; the provider you connect in
**Settings → Messaging** sends. The app's part is three calls.

```ts
import { Platform } from 'react-native';
import messaging from '@react-native-firebase/messaging';

// 1. Tell Selwise whether the OS lets the app notify this person.
const status = await messaging().hasPermission();
selwise.setPushPermission(
  status === messaging.AuthorizationStatus.AUTHORIZED ? 'granted'
    : status === messaging.AuthorizationStatus.DENIED ? 'denied'
    : 'undetermined',
);

// 2. Register the token — at every launch, and when the library refreshes it.
await selwise.registerPushToken({
  token: await messaging().getToken(),
  provider: 'fcm',
  platform: Platform.OS === 'ios' ? 'ios' : 'android',
});
messaging().onTokenRefresh((token) =>
  selwise.registerPushToken({ token, provider: 'fcm', platform: Platform.OS === 'ios' ? 'ios' : 'android' }),
);

// 3. When the person taps a notification, open what it points at.
messaging().onNotificationOpenedApp((message) => {
  const link = selwise.trackPushOpen(message);
  if (link) Linking.openURL(link); // app://basket, your own deep link, or https
});
messaging().getInitialNotification().then((message) => {
  const link = message && selwise.trackPushOpen(message);
  if (link) Linking.openURL(link);
});
```

**Which provider, which token.** The token's family decides which of your
connected providers sends to it, so `provider` is required:

| Your push library | Token | `provider` |
| --- | --- | --- |
| `@react-native-firebase/messaging` — `getToken()` (Android, and iOS through Firebase) | FCM registration token | `'fcm'` |
| `expo-notifications` — `getDevicePushTokenAsync()` on Android | FCM registration token | `'fcm'` |
| `expo-notifications` — `getDevicePushTokenAsync()` on iOS, or the native APNs registration | APNs device token | `'apns'` |
| `expo-notifications` — `getExpoPushTokenAsync()` | `ExponentPushToken[…]` | `'expo'` |

An app that uses FCM on Android and APNs on iOS connects both providers and
writes one scenario step; each phone is sent through the provider of its own
token. An APNs token is always iOS; FCM and Expo need `platform` (or
`platform` in `init()`).

**The rules the SDK keeps for you**

- **The permission is the person's answer.** A phone is notified only while
  `setPushPermission('granted')` — a token registered while the permission is
  unknown is kept, counted as *undetermined* and never sent to. A change
  (`'denied'` from the OS settings, `'granted'` later) is re-sent for the token
  already registered.
- **Consent comes first.** Registering a phone is a *marketing* decision
  (`setConsent`). Without it the token is not sent; withdrawing it revokes the
  phone, also if the app was closed when the person changed their mind.
- **The customer follows the login.** `identify()` links the phone to the
  customer (so a scenario that starts from a server event for that customer
  finds it), `logout()` unlinks it. The phone stays reachable as this install.
- **A refreshed token needs nothing special.** Register the new one; the old
  token of this install is revoked by the server.
- `unregisterPushToken()` is for the app's own "turn notifications off".
- A token the provider reports dead (the app was uninstalled) is revoked by
  Selwise; the next time the person opens the app and registers, it is live
  again.

**What a Selwise notification carries.** The title and body, an optional image,
the merchant's own `data` keys, and `sw_link` — the screen or link the step
points at, already carrying `sw_sc` (the scenario) so `trackPushOpen` records
the tap as a messaging click and the order that follows is credited like any
other message. `sw_image` carries the image address for apps that draw it
themselves (an iOS notification service extension attaches it). Selwise never
navigates: the link is yours to open.

**On the device.** Android 13+ needs the `POST_NOTIFICATIONS` runtime
permission before the OS shows anything. iOS needs the notification
authorization request (`requestPermission`) and, for an image, a notification
service extension. Both are the host app's; Selwise only reads the answer.

---

## WebView bridge

Storefronts commonly detect an in-app WebView and route their analytics *away*
from the page: the page-side code calls
`window.ReactNativeWebView.postMessage(...)` and returns, so nothing is ever
written to `window.dataLayer`. No in-page listener — Selwise included — sees
anything while the app is running. The native side has to collect those messages
instead:

```tsx
import { WebViewBridge, WEBVIEW_BRIDGE_SCRIPT } from '@selwise/react-native';

const bridge = useMemo(
  () => new WebViewBridge(selwise, {
    debug: __DEV__,
    onUnhandled: (event, payload) => console.log('unmapped', event, payload),
  }),
  []
);

<WebView
  source={{ uri: checkoutUrl }}
  injectedJavaScriptBeforeContentLoaded={WEBVIEW_BRIDGE_SCRIPT}
  onMessage={(e) => bridge.handleMessage(e.nativeEvent.data)}
/>
```

`WEBVIEW_BRIDGE_SCRIPT` does two things:

1. Sets `window.isMobileApp = true` — the flag storefronts read to decide they
   are inside an in-app WebView, which is what triggers the dataLayer redirect.
2. **Mirrors** `dataLayer.push` to `postMessage`, so projects that never
   implemented the redirect are covered by the same listener.

It is safe on a page that already redirects: the bridge de-duplicates orders by
order id. `handleMessage` returns `true` when the message mapped to an event.

The bridge reads both the GA4 shape (`ecommerce.items[]`) and UA Enhanced
Ecommerce (`ecommerce.<action>.products[]`). **`eeEvent` is deliberately not
mapped:** some stock GTM adapters push product detail, product click and product
impressions all under that one name, so the name alone cannot say which event is
meant, and mapping it would record clicks as views. Those projects need a
composite `event + ecommerce action` mapping on the web side.

A `purchase` message without a `transaction_id` is **dropped** — with no
idempotency key, a refresh of the thank-you page would create a second order.

---

## Running without storage

Without `storage` the SDK still works, but the visitor id, the session and the
offline queue live only for that app launch. Every launch looks like a new
visitor, and the `recently_viewed` / `user_history` strategies stay empty.
`debug: true` logs a warning when this happens.

Persisted keys, when storage is provided: `selwise_vid`, `selwise_session`,
`selwise_suid`, `selwise_queue`, `selwise_consent`.

---

## Error handling

```ts
import { SelwiseApiError } from '@selwise/react-native';

try {
  await selwise.trackOrder({ /* ... */ });
} catch (error) {
  if (error instanceof SelwiseApiError && error.isAuthError) {
    // almost always: the key is missing mobile_write
  }
}
```

`SelwiseApiError` carries `status`, `path` and `body`; network faults surface as
the underlying error instead.

The event queue handles its own failures: 5xx, 408 and 429 are retried (up to 5
attempts), while other 4xx responses are treated as permanent rejections and
dropped — otherwise an event the server refuses on content would block
everything behind it forever.

---

## API reference

### Client

| Member | Returns | Notes |
| --- | --- | --- |
| `init(options)` | `Promise<void>` | Resolves identity, replays the stored queue. |
| `destroy()` | `Promise<void>` | Flushes and tears down timers. |
| `identify(siteUserId, traits?, { userHash?, userHashTs? }?)` | `Promise<void>` | Links the visitor to a known user, locally and on the server; the optional signature proves the id came from your backend. |
| `logout()` | `Promise<void>` | Keeps the visitor, rotates the session. |
| `setConsent(snapshot)` | `Promise<void>` | Applies a CMP decision. |
| `getConsent()` | `ConsentSnapshot` | Current snapshot. |
| `setPushPermission(state)` | `void` | The OS's notification permission (`'granted'`, `'denied'`, `'undetermined'`); sent for a segment and for the phone registered for push. |
| `registerPushToken({ token, provider, platform? })` | `Promise<boolean>` | Registers this phone for app push. Needs marketing consent; `true` when the server has it. See [Push notifications](#push-notifications). |
| `unregisterPushToken()` | `Promise<boolean>` | Stops notifying this phone. |
| `trackPushOpen(payload)` | `string \| null` | Call when a notification is tapped; records the messaging click and returns the link to open. |
| `setScreen(pageUrl)` | `void` | Sets screen context without an event. |
| `trackScreenView(pageUrl, metadata?)` | `void` | Sets context and sends `page_view`. |
| `track(name, options?)` | `void` | Queues a canonical event. Never throws. |
| `trackProductView(itemCode, metadata?)` | `void` | Shorthand for `product_view`. |
| `trackAddToCart(itemCode, metadata?)` | `void` | Shorthand for `add_to_cart`. |
| `trackRemoveFromCart(itemCode, metadata?)` | `void` | Shorthand for `remove_from_cart`. |
| `flush()` | `Promise<void>` | Sends the queue now. Call on backgrounding. |
| `getRecommendationWidgets(pageUrl?)` | `Promise<RecommendationWidgetSummary[]>` | Widgets targeted at a screen. |
| `getRecommendationProducts(widgetId, context?)` | `Promise<RecommendationProductsResult>` | Products for one widget, the visitor's A/B arm applied (`widgetId`, `widget`, `experiment`, `hidden`). |
| `resolveRecommendationWidget(widget)` | `Promise<ResolvedRecommendationWidget>` | The strip a widget is drawn as for this visitor, without asking for products. |
| `trackRecommendationImpression(widgetId, itemCodes?)` | `void` | Call when the widget is visible. Records the arm's exposure, once. |
| `trackRecommendationClick(widgetId, itemCode, position?)` | `void` | Required for attribution. |
| `getSurfaces(pageUrl?, context?)` | `Promise<Surface[]>` | What this screen may show, after every gate, with content states, cart and product values applied. `context.locale` formats amounts; `context.product` is the product a product screen shows; `context.pageType` is the screen's page type for page-type targeting. |
| `setCart(cart \| null)` | `boolean` | The basket, absolute: `{ total, itemCount, currency?, codes? }`. Memory only. |
| `getCart()` | `DynamicCart` | `known: false` until `setCart` was called. |
| `onCartChange(listener)` | `() => void` | Called on every cart change; returns the unsubscribe. |
| `resolveGoalBar(surface, { locale? })` | `GoalBarView` | A goal bar's words and progress for the current cart. |
| `trackGoalReached(surface, { step })` | `boolean` | `goal_reached`, once per session per surface and step. Only for a step crossed while the bar was visible. |
| `recordSurfaceShown(surface)` | `Promise<void>` | Spends the frequency-cap allowance. Call when it draws. |
| `trackSurfaceView(surface)` | `void` | `impression`, with the browser widget's entityType. |
| `trackSurfaceClick(surface, metadata?)` | `void` | `click`. |
| `dismissSurface(surface)` | `Promise<void>` | Records `close` and remembers it for the campaign's after-close setting (the session, or N days across launches). |
| `resetDismissals()` | `Promise<void>` | Forgets every dismissal. |
| `invalidateSurfaces()` | `void` | Drops the cached `/config` so the next call refetches. |
| `setLocale(locale)` | `void` | The app's language changed: later reads answer in it; cached `/config` and enrichment are dropped. |
| `getLocale()` | `string \| undefined` | The language passed to `init` or `setLocale`. |
| `getExperimentAssignments()` | `ExperimentAssignment[]` | The visitor's A/B assignments. |
| `getTheme()` | `Record<string, string>` | Resolved brand-theme tokens, `--` prefixed. |
| `getSearchStatus()` | `{ enabled, testMode }` | Whether search is on for this channel. |
| `getSearchSettings()`, `getSearchState()` | `Promise<SearchSettings \| null>`, `Promise<SearchResolution>` | The merchant's search settings as this visitor draws them (phone layer and A/B arm applied), and why there are none (`off`, `test`, `unknown`). |
| `getSearchSuggestions({ query? }?)` | `Promise<SearchSuggestionSections>` | Recent searches, popular searches, categories and products, in the merchant's order and limits. |
| `getRecentSearches(max?)`, `removeRecentSearch(term)`, `clearRecentSearches()` | `Promise<string[]>`, `Promise<void>`, `Promise<void>` | This device's recent searches (kept only with the visitor's consent). |
| `subscribeNewsletter(email, extra?)` | `Promise<void>` | Signs up and records `user_signup`. |
| `getEnrichment(code, slots, signal?)` | `Promise<EnrichmentResult>` | The merchant's markup for a product, in named slots. |
| `enrichmentForSlot(result, slot)` | `EnrichmentItem[]` | One slot's rules, in stacking order. |
| `getEnrichmentSlots()` | `string[]` | Every placement key a live rule carries. |
| `trackEnrichmentView(item)` | `void` | One impression per rule. Call when it draws. |
| `trackEnrichmentClick(item, metadata?)` | `void` | — |
| `invalidateEnrichment()` | `void` | Drops the cached markup. |
| `search(query, options?, signal?)` | `Promise<SearchResult>` | Product search: `limit`, `offset`, `sort`, `category`, `submit`. Check `result.status` and `result.redirect` first (a redirect comes only with `submit: true`). |
| `trackSearchOpen(trigger?)`, `trackSearchClose(summary?)` | `void` | The search screen opened and closed. |
| `trackSuggestionClick(kind, value)` | `void` | A tapped suggestion. |
| `trackSearchClick(query, itemCode, position?, category?)` | `void` | Required for click-through reporting. |
| `trackSearchAddToCart(product, options?)` | `void` | An add to the basket from the search. |
| `trackDeepLink(url)` | `DeepLinkAttribution \| null` | The link that opened the app: landing page view and, for a message link, the message click. |
| `trackOrder(order)` | `Promise<{ success, created, id? }>` | Await it. Idempotent on `orderId`. |
| `isInitialized` | `boolean` | — |
| `endpoints` | `Endpoints` | Resolved API paths. |
| `on(event, listener)` | `() => void` | Subscribe to `ready`, `screen`, `product`, `cart`, `theme`, `consent` or `locale`. Returns the unsubscribe. |
| `getScreen()`, `setScreen(url, { screenName, pageType }?)` | `ScreenState`, `void` | The screen the host named. `setScreen` works before `init()`. |
| `getProduct()`, `setProduct(product, key?)` | `ProductState`, `void` | The product the current product screen shows (`null` elsewhere). |
| `isConsentRequired()`, `isAwaitingConsent()` | `Promise<boolean>`, `boolean` | Whether the dashboard's "ask for consent before tracking" is on, and whether nothing is being sent because the app has not answered yet. |
| `strips` | `StripService` | The strips of a screen, with their shared requests. |

### React bindings — `@selwise/react-native/react`

| Export | Notes |
| --- | --- |
| `SelwiseProvider` | Puts a client (and the app's `host`) on the context: `<SelwiseProvider client={selwise} host={host}>`. |
| `useSelwise()`, `useSelwiseHost()` | The client, and the host, from context. |
| `useScreen()`, `useProduct()`, `useCartVersion()`, `useThemeVersion()`, `useLocale()`, `useSelwiseReady()` | The client's state; render again when it moves. |
| `useRecommendationWidget(widgetId, options?)` | `{ products, productCard, loading, error, followsCart, widget, experiment, reload, trackImpression, trackClick }` |
| `useSelwiseSearch(options?)` | The search of a screen: query, results, paging, categories, order, suggestions, settings and texts, and the reporting calls (see [Search](#search)). |

### Components — `@selwise/react-native/ui`

`SelwiseSurfaces`, `SelwiseDebugOverlay`, `SelwiseSlot`, `RecommendationStrip`, `RecommendationStrips`,
`SelwiseSearchPanel`, `SelwiseSearch`, `SelwiseEnrichment`, `useNavigate`, `classifyLink`, the types
`SelwiseHost`, `SelwiseNavigationTarget`, `SelwiseCartItem` and
`SelwiseCartResult`, and for an app writing its own renderer `renderers` (one
per surface type), `styleUtils` (a merchant's `stylesJson` as React Native
styles), `triggerUtils`, `countdownUtils`, `slotUtils` and `enrichmentUtils`.

### Also exported

`SDK_VERSION`, `Endpoints`, `WebViewBridge`, `WEBVIEW_BRIDGE_SCRIPT`,
`RecommendationWidgetLoader`, `CART_REFRESH_DEBOUNCE_MS`,
`EMPTY_RECOMMENDATION_WIDGET_STATE` (with the types
`RecommendationWidgetState` and `RecommendationWidgetSource`),
`StripService`, `filterByPlacement`, `normalizeContext`, `DEFAULT_CONSENT`, `MemoryStorage`, `STORAGE_KEYS`, `SESSION_TIMEOUT_MS`,
`generateId`, `SelwiseApiError`, and the types `SelwiseInitOptions`,
`SelwiseStorage`, `SelwiseProduct`, `TrackOptions`, `EntityType`,
`ConsentSnapshot`, `ConsentCategory`, `OrderInput`, `OrderItemInput`,
`RecommendationContext`, `RecommendationWidgetSummary`,
`RecommendationProductsResult`, `ResolvedRecommendationWidget`,
`RecommendationExperiment`, `SearchOptions`, `SearchResult`, `SearchSettings`,
`SearchSuggestionSections`, `SearchSort`, `Surface`,
`SurfaceFilter`, `SurfaceKind`, `SurfacePlacement`, `TriggerStrategy`,
`ExperimentAssignment`, `FrequencyCapConfig`, `SegmentTargetingMode`,
`RemoteConfig`, plus the helpers `normalizeSurface`, `normalizeSurfaces`,
`normalizePlacement`, `selectSurfaces`, `resolveConflicts`, `DismissalStore`,
`SegmentGate`, `ExperimentGate`, `FrequencyCapStore`, `deepMerge`,
`normalizeRemoteConfig`, `evaluateTargeting`, `evaluatePageTargeting` and
`matchUrlPattern`; plus `EnrichmentItem`, `EnrichmentResult`,
`EnrichmentCache`, `normalizeEnrichment`, `normalizeEnrichmentItem`,
`normalizePlacementKey`, `normalizePlacementKeys`, `itemsForSlot` and
`selectByTestMode`; plus `resolveSurfaceContent`, `normalizeCartInput`,
`withCartSignals`, `goalStepsCrossed`, `countdownTarget`, `nextDailyCutoff`,
`parseDailyCutoff`, `COUNTDOWN_MODES`, `CUTOFF_TIME_ZONES` and the types
`CartInput`, `DynamicCart`, `GoalBarView`, `GoalBarState`, `GoalProgress`,
`GoalMetric`, `GoalReachedDetail` and `CountdownMode`.

---

## Release notes

### 2.0.1

- **Unknown segment membership hides the surface.** A segment the server
  cannot answer for (switched off, deleted, unreachable) no longer counts as
  "not a member": `include` and `exclude` both hide until the answer is known,
  the same rule as the web.
- **Search redirects and recent searches follow a submission.** `search()`
  takes `submit`, `useSelwiseSearch` gains `submit()`, and `<SelwiseSearch>`
  takes `submitted`: a term the shopper is still typing never redirects, and
  only a submitted term with results is kept as a recent search.
- **Interrupting surfaces open one at a time.** A pop-up, slide-in, exit
  intent and floating button that would open together are settled by campaign
  priority, the same order as the web.
- **Recommendation strips.** `<RecommendationStrips>` shows each point's
  winner by the same competition as `<SelwiseSlot>`; frame, heading, layout and
  card fixes; the default phone padding is tighter.
- **Recommendation events carry the visitor's consent snapshot**, and an event
  the visitor refused is not sent.
- `<SelwiseEnrichment>` does not report its point as missing on a screen that
  is known not to be a product screen.

Nothing you call was removed or renamed.

### 2.0.0

The package now draws what the dashboard configures. `@selwise/react-native/ui`
holds the components that used to live only in the Akinon App Maker plugin
(`selwise-akinon-appmaker` 1.0.0 is now a thin host for them), so a plain React
Native or Expo app gets the same campaigns, recommendation strips, search screen and
product enrichment. The core entry (`@selwise/react-native`) and the hooks
(`@selwise/react-native/react`) still import neither React Native's view layer nor
any UI; `react-native` (0.70 or later) is an optional peer, needed only by `/ui`.

**Added**

- Components, from `@selwise/react-native/ui`: `SelwiseSurfaces`, `SelwiseSlot`,
  `RecommendationStrips`, `RecommendationStrip`, `SelwiseSearchPanel`,
  `SelwiseSearch`, `SelwiseEnrichment`, the card (`ProductCard`) and the size sheet,
  plus `renderers`, `styleUtils`, `triggerUtils`, `countdownUtils`, `slotUtils`,
  `placementUtils`, `enrichmentUtils` for an app that draws a type itself.
- `SelwiseProvider` takes a `host` (`SelwiseHost`): `navigate`, `addToCart`, the
  favourites trio, `WebView`, `safeAreaInsets`, `renderImage`, `renderIcon`,
  `fontFamily`, `storefrontUrl`, `enrichment`, `isFocused` / `useIsFocused`. Every
  member is optional. `useSelwiseHost()` reads it.
- Client state the components follow: `setScreen(url, { screenName, pageType })`
  (the second argument is new), `getScreen`, `setProduct` / `getProduct`,
  `on(event, listener)` (`ready`, `screen`, `product`, `cart`, `theme`, `consent`,
  `locale`), and the hooks
  `useScreen`, `useProduct`, `useCartVersion`, `useThemeVersion`, `useLocale`,
  `useSelwiseReady`. `selwise.strips` (a `StripService`) loads a screen's strips with
  one request for every point on it.
- Campaign placement as the dashboard offers it: dock (top, bottom), floating
  (four corners), window (centre, bottom, or a slide-in from an edge) and a named
  point (`<SelwiseSlot>`); pictures, buttons, counters, the goal bar, the
  countdown and the newsletter as designed. The two counters read their number from
  Selwise (`getProductCount`).
- Strips as designed: heading and container, every display type, the card designer's
  card, the size sheet, "add all" on a look, a frequency cap on strips.
- Search: `getSearchSettings`, `getSearchSuggestions`, recent searches kept only with
  the visitor's consent, `offset`, `sort`, `category` and `refinement` options on
  `search()`, `trackSearchOpen` / `trackSearchClose`, `trackSuggestionClick`,
  `trackSearchAddToCart`, a `category` argument on `trackSearchClick`, search A/B
  tests, `SelwiseSearchPanel`, and a much larger `useSelwiseSearch`.
- App push: `setPushPermission`, `registerPushToken`, `unregisterPushToken`,
  `trackPushOpen`.
- Screen experiments: `resolveScreenSlot`, `trackScreenSlotExposure` (a point of a
  screen compared across arms); every tap on a tested surface or strip is reported
  as the arm's click goal.
- Segments on app facts: `platform` and `appVersion` options on `init()`, the
  language and notification permission, and the screens opened in the last days are
  sent with every segment request.
- `isConsentRequired()` and `isAwaitingConsent()`.
- Orders: `originalPrice` on a line and `marketingConsent` on the order.
- `explain()`: why a campaign or strip is not on the screen, in the dashboard's own
  reason codes ([Why something is not on the screen](#why-something-is-not-on-the-screen-explain)).

**Breaking**

- `readSearchBehavior` and the `SearchBehavior` helper type are no longer exported
  from the package root. Read `await selwise.getSearchSettings()` (the whole
  settings document; `settings.behavior` has `minChars` and `debounceMs`) or keep
  using `getSearchBehavior()`.
- A surface's `placement.position` is a value of its type's own list (a dock's `top`
  or `bottom`, a floating button's corner, a window's `center`, `bottom`, `right`,
  `left`); a stored value the type does not offer (a website's `bottom-right`
  newsletter) now reads as the type's default. `placement.slot` names the point a
  surface is placed in, or `null`. Code that drew from `getSurfaces()` itself and
  read other positions must follow.
- `surface.content` also carries the keys a renderer reads (`title`, `text`,
  `subtext`, `placeholder`, `successMessage`…), filled from the keys the dashboard
  stores (`headline`, `subtitle`, `emailPlaceholder`…). The originals stay; draw from
  the shorter ones.
- A pop-up whose trigger is "when the visitor leaves" fires when the app goes to the
  background, and no longer when iOS reports `inactive` (the control centre, a system
  dialog).
- `/experiments/track` is sent with the channel's API key (the server requires it for
  an app channel); a client that sends its own request to it must send the key too.

**Migrating from 1.x**

1. Install 2.0.0. Nothing you already call is removed except the two exports above, so
   an app that drew everything itself keeps working as it is.
2. To use the components, give the client the context they follow: call
   `setScreen('app://product', { screenName, pageType })` on every screen change,
   `setProduct(...)` on a product screen, `setCart(...)` on every basket change, and
   pass `platform: Platform.OS`, `appVersion` and `locale` to `init()`.
3. Wrap the app once: `<SelwiseProvider client={selwise} host={host}>`, put
   `<SelwiseSurfaces />` once at the root, and mount `<SelwiseSlot screen slot />` where
   a strip, a counter or an enrichment block may go. Hand over what only your app can
   do through `host` (how to open a link, how to add to your basket, a WebView).
4. Drop what the components now do: your own overlay for campaigns, the add-to-cart
   or favourites buttons you wired by hand onto a strip's card (`host.addToCart`,
   `host.toggleWishlist`), counters you computed yourself. Keep `renderItem` or
   `renderers` where you want your own look.
5. If the dashboard's cookie consent asks before tracking, call `setConsent()` when the
   visitor answers; until then nothing is sent and every figure stays at zero.
6. Send a test order and check the channel's Application connection card in the
   dashboard: it lists this SDK's version, the screens the app showed and the points it
   mounted.

## Documentation

- [Mobile overview](https://selwise.com/docs/mobile/overview)
- [Mobile setup](https://selwise.com/docs/mobile/setup)
- [Mobile tracking](https://selwise.com/docs/mobile/tracking)
- [Campaigns and widgets in the app](https://selwise.com/docs/mobile/surfaces)
- [Enrichment in an app](https://selwise.com/docs/product-enrichment/mobile-app)
- [Mobile recommendations](https://selwise.com/docs/mobile/recommendations)
- [WebView bridge](https://selwise.com/docs/mobile/webview-bridge)
- [Public API reference](https://selwise.com/docs/api-reference/public-api)
- [Errors and limits](https://selwise.com/docs/api-reference/errors-and-limits)

Building for the web instead? Use [`@selwise/widget`](https://www.npmjs.com/package/@selwise/widget).

## Development

The source is public: [selimgunaydin/selwise-integrations](https://github.com/selimgunaydin/selwise-integrations/tree/main/react-native)
(a one-way mirror — issues are welcome there, pull requests cannot be merged).

```bash
cd react-native
npm install
npm test
npm run build
```

52 tests, covering queue persistence and pruning, the session window, the
consent gate, retry classification, WebView payload shapes and order
de-duplication.

## License

MIT — see [LICENSE](./LICENSE).
