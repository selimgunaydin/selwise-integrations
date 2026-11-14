# @selwise/react-native

[![npm](https://img.shields.io/npm/v/@selwise/react-native.svg)](https://www.npmjs.com/package/@selwise/react-native)
[![license](https://img.shields.io/npm/l/@selwise/react-native.svg)](./LICENSE)

The Selwise SDK for React Native apps: recommendations, search, event tracking
and order attribution — without a DOM.

> **Why a separate package.** [`@selwise/widget`](https://www.npmjs.com/package/@selwise/widget)
> is DOM-bound from top to bottom (`document`, `window`, `localStorage`). Native
> apps render their own screens — product detail, product list, search, basket —
> and a browser widget cannot run there. This package delivers **data** and
> leaves rendering to the app's own themed components. There are deliberately no
> UI components in it: your app already owns product cards and sliders, and a
> Selwise-branded card would look foreign beside them.

---

## Install

```bash
npm install @selwise/react-native
```

No required dependencies. `react` is needed only for the hooks under
`@selwise/react-native/react` and is declared as an **optional peer**, so the
core SDK stays importable from services, sagas and redux middleware.

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
(the app may not get another chance), and it drives the **live heartbeat**. The
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
| `debug` | `boolean` | `false` | Diagnostics via `console.log`. |
| `clientPlatform` | `string` | `react-native` | Sent as `x-selwise-client-platform`. |
| `clientVersion` | `string` | SDK version | Sent as `x-selwise-client-version`. |
| `locale` | `string` | — | The app's language (`'en'`, `'tr-TR'`). See [Languages](#languages-since-0140). |

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
events are attributed to that screen either way.

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
asking for products — the App Maker plugin uses it to decide how to draw a
strip before asking. An arm whose strip answers the basket ("complete to free
shipping") is followed like any such strip; the slot's own strategy does not
decide (see [the basket](#the-basket-setcart)).

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

### Known limit: variants and sizes

The Selwise product model is currently **flat** — there is no variant table —
while native carts typically want a numeric variant id. In sized categories
(apparel, footwear) you cannot add to cart straight from a recommendation card;
route the user to product detail instead. For single-variant categories
(cosmetics, accessories) the app can add to cart through its own basket service
and let the SDK record the event.

---

## Campaigns and widgets

`getSurfaces()` answers one question: **which campaigns and widgets is this
screen allowed to show right now.** It returns data, not UI — the host app
already owns its own themed components. If you are on Akinon App Maker, the
`selwise-akinon-appmaker` plugin renders all of it natively and you do not call
this yourself.

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
   campaign shows on every screen until your product screen says it is one.
   The App Maker plugin labels its screens for you.
3. Country targeting, using the country the server resolved from the request ip
   (`getSurfaces(url, { country })` overrides it).
4. Experiment exclusion — a control the variant replaced does not render
   alongside it.
5. Segment targeting. Membership is asked of the server and cached for five
   minutes. An unreachable server means "member of nothing", so `include`
   hides and `exclude` shows — the same failure directions as the web.
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
  from the package root since 0.10.0 — the hook runs on it, and so does the
  App Maker plugin's `RecommendationStrips`):

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

The App Maker plugin feeds this from the app's own basket.

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

The plugin does this for you. With no theme configured, the literal fallback
inside the `var()` applies — the same value the web falls back to.

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

The Akinon plugin renders this for you:
`<SelwiseEnrichment plugin={Selwise} code={product.sku} slot="pdp-specs" />`.

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

```tsx
import { useSelwiseSearch } from '@selwise/react-native/react';

const { query, setQuery, hits, loading, redirect, isZeroResults, trackClick, clear } = useSelwiseSearch({
  limit: 20,
});
```

`minChars` (shorter queries are treated as empty) and `debounceMs` (the wait
after typing) default to the channel's own setting — Search → Configuration →
Behaviour in the dashboard, read once with `selwise.getSearchBehavior()` — so
the app and the storefront search on the same keystrokes. Until it arrives, or
if it cannot be read, the hook uses 2 characters and 250 ms. Pass either
option to override the channel.

`redirect` is the address the merchant set for the term you searched (for
example "shipping" → the shipping page), or `null`. A redirected term returns
no hits, so check `redirect` before drawing results: it is not a zero-result
search and `isZeroResults` stays `false` for it.

**Know what this searches:** the Selwise product feed, not the storefront's own
product index. It therefore has **no facets and no sorters**. Keep the app's
existing list screen for "see all results" and use Selwise search as the fast
instant-search layer above it.

Without hooks: `selwise.search(query, options, signal)` and
`selwise.trackSearchClick(query, itemCode, position)`.

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
| `subscribeNewsletter(email, extra?)` | `Promise<void>` | Signs up and records `user_signup`. |
| `getEnrichment(code, slots, signal?)` | `Promise<EnrichmentResult>` | The merchant's markup for a product, in named slots. |
| `enrichmentForSlot(result, slot)` | `EnrichmentItem[]` | One slot's rules, in stacking order. |
| `getEnrichmentSlots()` | `string[]` | Every placement key a live rule carries. |
| `trackEnrichmentView(item)` | `void` | One impression per rule. Call when it draws. |
| `trackEnrichmentClick(item, metadata?)` | `void` | — |
| `invalidateEnrichment()` | `void` | Drops the cached markup. |
| `search(query, options?, signal?)` | `Promise<SearchResult>` | Product search. Check `result.redirect` first. |
| `trackSearchClick(query, itemCode, position?)` | `void` | Required for click-through reporting. |
| `trackDeepLink(url)` | `DeepLinkAttribution \| null` | The link that opened the app: landing page view and, for a message link, the message click. |
| `trackOrder(order)` | `Promise<{ success, created, id? }>` | Await it. Idempotent on `orderId`. |
| `isInitialized` | `boolean` | — |
| `endpoints` | `Endpoints` | Resolved API paths. |

### React bindings — `@selwise/react-native/react`

| Export | Notes |
| --- | --- |
| `SelwiseProvider` | Puts a client on the context: `<SelwiseProvider client={selwise}>`. |
| `useSelwise()` | The client from context. |
| `useRecommendationWidget(widgetId, options?)` | `{ products, productCard, loading, error, followsCart, widget, experiment, reload, trackImpression, trackClick }` |
| `useSelwiseSearch(options?)` | `{ query, setQuery, hits, loading, error, redirect, isZeroResults, trackClick, clear }` |

### Also exported

`SDK_VERSION`, `Endpoints`, `WebViewBridge`, `WEBVIEW_BRIDGE_SCRIPT`,
`RecommendationWidgetLoader`, `CART_REFRESH_DEBOUNCE_MS`,
`EMPTY_RECOMMENDATION_WIDGET_STATE` (with the types
`RecommendationWidgetState` and `RecommendationWidgetSource`),
`DEFAULT_CONSENT`, `MemoryStorage`, `STORAGE_KEYS`, `SESSION_TIMEOUT_MS`,
`generateId`, `SelwiseApiError`, and the types `SelwiseInitOptions`,
`SelwiseStorage`, `SelwiseProduct`, `TrackOptions`, `EntityType`,
`ConsentSnapshot`, `ConsentCategory`, `OrderInput`, `OrderItemInput`,
`RecommendationContext`, `RecommendationWidgetSummary`,
`RecommendationProductsResult`, `ResolvedRecommendationWidget`,
`RecommendationExperiment`, `SearchOptions`, `SearchResult`, `Surface`,
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
