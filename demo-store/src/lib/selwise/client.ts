'use client';
/**
 * Every call the storefront makes to Selwise goes through this file.
 *
 * This is the integration a "custom" merchant writes by hand, and it is
 * deliberately the documented one — the data layer (`window.selwiseLayer`) for
 * basket and account events, `Selwise.track` for what the layer has no shape
 * for, `Selwise.trackOrder` on the thank-you page. If Selwise is not loaded
 * (no site key, ad blocker, outage) every function here is a no-op: the store
 * must never depend on it.
 *
 * Page views and product views are NOT sent from here: the data layer's page
 * and product modules record them from the URL and the product page's JSON-LD,
 * which is what most merchants rely on.
 */
import type { CartLine, CartView } from '../store/cart';

type Payload = { entityType?: string; entityId?: string; metadata?: Record<string, unknown> };

export interface SelwiseGlobal {
  q?: unknown[];
  track?: (name: string, payload?: Payload) => void;
  trackOrder?: (order: Record<string, unknown>) => Promise<unknown>;
  identify?: (id: string, traits?: Record<string, unknown>) => Promise<unknown>;
  setTraits?: (traits: Record<string, unknown>) => unknown;
  requestPushPermission?: () => Promise<string>;
  pushPermissionState?: () => Promise<string>;
  showConsentPreferences?: () => void;
  getConsentState?: () => ConsentState | null;
  grantConsent?: (categories?: Partial<ConsentState>) => void;
  revokeConsent?: (categories?: Array<keyof ConsentState>) => void;
  withdrawConsent?: () => void;
  getVisitorId?: () => string;
  getSessionId?: () => string;
  getSiteUserId?: () => string | null;
  getJourneyState?: () => { journeyId: string | null; age: number | null; isValid: boolean };
  getCart?: () => { known: boolean; total: number; itemCount: number; currency: string | null };
  getDataLayer?: () => Record<string, unknown>[];
  getActiveExperiments?: () => Array<Record<string, unknown>>;
  getExperimentVariant?: (experimentId: string) => string | null;
  getVariant?: (experimentId: string) => Record<string, unknown> | undefined;
  setLocale?: (locale: string) => void;
}

export interface ConsentState {
  necessary: boolean;
  analytics: boolean;
  marketing: boolean;
  preferences: boolean;
}

declare global {
  interface Window {
    Selwise?: SelwiseGlobal;
    selwiseLayer?: Record<string, unknown>[];
    ArdisaCart?: { add: (ref: string, qty?: number, size?: string) => Promise<boolean>; open: () => void };
  }
}

const CURRENCY = 'TRY';

function sw(): SelwiseGlobal | null {
  return typeof window !== 'undefined' && window.Selwise ? window.Selwise : null;
}

export function pushLayer(event: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  window.selwiseLayer = window.selwiseLayer || [];
  window.selwiseLayer.push(event);
}

export function track(name: string, payload: Payload) {
  try {
    sw()?.track?.(name, payload);
  } catch {
    /* never let analytics break the store */
  }
}

const basketProduct = (l: Pick<CartLine, 'code' | 'qty' | 'price' | 'title' | 'category' | 'brand' | 'colorName' | 'size'>) => ({
  sku: l.code,
  quantity: l.qty,
  price: l.price,
  totalPrice: Math.round(l.price * l.qty * 100) / 100,
  title: l.title,
  category: l.category,
  brand: l.brand,
  variant: `${l.colorName} / ${l.size}`,
});

/**
 * Basket events: the changed line FIRST, then the rest of the basket, plus the
 * basket total — the layer reads `products[0]` as the tracked item and the
 * whole array as the cart's contents.
 */
/**
 * What the basket is WORTH: the products after the coupon, before shipping and
 * gift wrap — GA4's `value`, and the figure this store's own free-shipping
 * rule is written against (`freeShippingRemaining` in lib/store/cart). It used
 * to send `cart.total`, which carries the shipping fee below the threshold, so
 * a Selwise goal bar on the cart page said ₺341 to go where the store's own bar
 * said ₺401 — the 59,90 TL of shipping counted toward free shipping.
 */
const basketValue = (cart: CartView) => Math.round((cart.subtotal - cart.discount) * 100) / 100;

export function basketEvent(step: 'add' | 'remove' | 'update', changed: CartLine & { delta?: number }, cart: CartView) {
  const rest = cart.lines.filter((l) => !(l.code === changed.code && l.size === changed.size));
  const event = step === 'add' ? 'add_to_cart' : step === 'remove' ? 'remove_from_cart' : 'update_cart';
  const first = { ...basketProduct(changed), quantity: changed.delta ?? changed.qty };
  pushLayer({
    event,
    basket: {
      id: cart.id,
      step,
      products: [first, ...rest.map(basketProduct)],
      total: basketValue(cart),
      // The whole basket's units. `products[0]` carries the changed line's
      // DELTA, so summing the lines would undercount; this is what a goal bar
      // counting items reads.
      itemCount: cart.itemCount,
      currency: CURRENCY,
    },
  });
}

export function cartView(cart: CartView) {
  track('cart_view', {
    entityType: 'basket',
    entityId: cart.id,
    metadata: {
      cartId: cart.id,
      itemCount: cart.itemCount,
      cartValue: basketValue(cart),
      currency: CURRENCY,
      productItemCodes: cart.lines.map((l) => l.code),
    },
  });
}

export function categoryView(path: string[], slug: string, resultCount: number) {
  track('category_view', {
    entityType: 'page',
    entityId: slug,
    metadata: { categoryPath: path.join(' > '), categoryName: path[path.length - 1], categorySlug: slug, resultCount },
  });
}

export function productImpression(code: string, list: string, position: number, price: number) {
  track('product_impression', {
    entityType: 'product',
    entityId: code,
    metadata: { productItemCode: code, listName: list, position, productPrice: price, currency: CURRENCY },
  });
}

export function productClick(code: string, list: string, position: number, price: number) {
  track('product_click', {
    entityType: 'product',
    entityId: code,
    metadata: { productItemCode: code, listName: list, position, productPrice: price, currency: CURRENCY },
  });
}

export function wishlist(code: string, action: 'add' | 'remove', price: number) {
  track('wishlist', {
    entityType: 'product',
    entityId: code,
    metadata: { productItemCode: code, action, productPrice: price, currency: CURRENCY },
  });
}

export function checkoutOption(step: number, option: string, value: string) {
  track('checkout_option', { entityType: 'checkout', metadata: { step, option, value, currency: CURRENCY } });
}

export function customEvent(name: string, metadata: Record<string, unknown>) {
  track('custom_event', { entityType: 'custom', entityId: name, metadata: { eventName: name, ...metadata } });
}

export interface ShopperTraits {
  selwiseId: string;
  /** The server's HMAC of `selwiseId:selwiseIdHashTs` (lib/selwise/identity) — null when the channel has no identity secret here. */
  selwiseIdHash?: string | null;
  selwiseIdHashTs?: number | null;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  birthday?: string | null;
  gender?: string | null;
  loyaltyPoints?: number;
  memberSince?: string;
}

function traitsOf(u: ShopperTraits) {
  const tier = (u.loyaltyPoints ?? 0) >= 1500 ? 'gold' : (u.loyaltyPoints ?? 0) >= 500 ? 'silver' : 'bronze';
  return {
    firstName: u.firstName,
    lastName: u.lastName,
    fullName: `${u.firstName} ${u.lastName}`,
    ...(u.birthday ? { birthday: u.birthday } : {}),
    ...(u.gender ? { gender: u.gender } : {}),
    loyalty_points: u.loyaltyPoints ?? 0,
    loyalty_tier: tier,
    ...(u.memberSince ? { member_since: u.memberSince.slice(0, 10) } : {}),
  };
}

/**
 * The signed-identity proof, in the two spellings Selwise reads: `idHash` /
 * `idHashTs` on a data-layer `user`, `userHash` / `userHashTs` beside the
 * traits of `Selwise.identify`. Never written into an event — the widget lifts
 * it out and sends it with the identify call only.
 */
function layerSignature(u: ShopperTraits) {
  return u.selwiseIdHash && u.selwiseIdHashTs ? { idHash: u.selwiseIdHash, idHashTs: u.selwiseIdHashTs } : {};
}

function identifySignature(u: ShopperTraits) {
  return u.selwiseIdHash && u.selwiseIdHashTs ? { userHash: u.selwiseIdHash, userHashTs: u.selwiseIdHashTs } : {};
}

export function userEvent(kind: 'user_signup' | 'user_login', u: ShopperTraits, method = 'email') {
  pushLayer({
    event: kind,
    user: {
      id: u.selwiseId,
      loggedIn: true,
      ...layerSignature(u),
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      fullName: `${u.firstName} ${u.lastName}`,
      gender: u.gender ?? undefined,
      birthday: u.birthday ?? undefined,
      newCustomer: kind === 'user_signup',
      customerSince: u.memberSince,
      method,
    },
  });
  void sw()?.setTraits?.(traitsOf(u));
}

/** Called on every page while signed in. The widget skips a repeat for free. */
export function identify(u: ShopperTraits) {
  try {
    void sw()?.identify?.(u.selwiseId, { email: u.email, ...traitsOf(u), ...identifySignature(u) });
  } catch {
    /* ignore */
  }
}

export function setTraits(traits: Record<string, unknown>) {
  try {
    void sw()?.setTraits?.(traits);
  } catch {
    /* ignore */
  }
}

export function logoutEvent() {
  pushLayer({ event: 'user_logout' });
}

export interface OrderForSelwise {
  number: string;
  total: number;
  subtotal: number;
  discount: number;
  shipping: number;
  coupon: string | null;
  status: string;
  createdAt: string;
  email: string;
  phone?: string;
  marketingEmail: boolean;
  marketingSms: boolean;
  selwiseUserId?: string | null;
  /** Where it ships and how it was paid — province and district only, never the street. */
  shippingCity?: string;
  shippingDistrict?: string;
  shippingMethod?: string;
  paymentMethod?: string;
  installments?: number;
  lines: Array<Pick<CartLine, 'code' | 'title' | 'qty' | 'price' | 'lineTotal' | 'size' | 'colorName' | 'category'>>;
}

/**
 * The purchase. Sent once per order (sessionStorage guard — the thank-you page
 * can be reloaded or revisited from the account page).
 */
export function trackOrder(o: OrderForSelwise) {
  const key = `ardisa_tracked_${o.number}`;
  try {
    if (sessionStorage.getItem(key)) return;
  } catch {
    /* private mode */
  }
  const consent: Array<Record<string, unknown>> = [];
  if (o.marketingEmail) consent.push({ kind: 'email', value: o.email, optIn: true, siteUserId: o.selwiseUserId || undefined, note: 'checkout' });
  if (o.marketingSms && o.phone) consent.push({ kind: 'phone', value: o.phone, optIn: true, siteUserId: o.selwiseUserId || undefined, note: 'checkout' });
  const s = sw();
  if (!s?.trackOrder) return;
  void s
    .trackOrder({
      orderId: o.number,
      currency: CURRENCY,
      total: o.total,
      subtotal: o.subtotal,
      discountTotal: o.discount,
      shippingTotal: o.shipping,
      status: o.status,
      placedAt: o.createdAt,
      ...(o.selwiseUserId ? { siteUserId: o.selwiseUserId } : {}),
      metadata: {
        ...(o.coupon ? { couponCode: o.coupon } : {}),
        ...(o.shippingCity ? { shippingAddress: { city: o.shippingCity, district: o.shippingDistrict || undefined, country: 'TR' } } : {}),
        ...(o.shippingMethod ? { shippingMethod: o.shippingMethod } : {}),
        ...(o.paymentMethod ? { paymentMethod: o.paymentMethod, installments: o.installments || 1 } : {}),
      },
      items: o.lines.map((l) => ({
        productItemCode: l.code,
        name: l.title,
        quantity: l.qty,
        unitPrice: l.price,
        totalPrice: l.lineTotal,
        metadata: { size: l.size, color: l.colorName, category: l.category },
      })),
      ...(consent.length ? { marketingConsent: consent } : {}),
    })
    .then(() => {
      try {
        sessionStorage.setItem(key, '1');
      } catch {
        /* ignore */
      }
    })
    .catch(() => undefined);
}

export async function subscribeNewsletter(
  siteKey: string,
  apiUrl: string,
  input: { email: string; fullName?: string; phone?: string; sms?: boolean; emailChannel?: boolean; source: string },
) {
  const s = sw();
  // The channels the shopper actually ticked: SMS alone must not opt the
  // e-mail address in too.
  const channels = [input.emailChannel === false ? null : 'email', input.sms && input.phone ? 'sms' : null].filter(Boolean);
  if (channels.length === 0) return null;
  const res = await fetch(`${apiUrl}/public/sites/${siteKey}/newsletter`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: input.email,
      ...(input.fullName ? { fullName: input.fullName } : {}),
      ...(input.phone ? { phone: input.phone } : {}),
      channels,
      locale: 'tr',
      sourcePath: input.source,
      ...(s?.getVisitorId ? { visitorId: s.getVisitorId() } : {}),
      ...(s?.getSiteUserId?.() ? { siteUserId: s.getSiteUserId() } : {}),
    }),
  });
  if (!res.ok) throw new Error(`newsletter ${res.status}`);
  return res.json();
}

export async function requestPush(): Promise<string> {
  const s = sw();
  if (!s?.requestPushPermission) return 'unsupported';
  return s.requestPushPermission();
}

export async function pushState(): Promise<string> {
  const s = sw();
  if (!s?.pushPermissionState) return 'unsupported';
  return s.pushPermissionState();
}

/**
 * Who draws the cookie banner: Selwise (`selwise`, the default — the channel's
 * "Show the Selwise consent banner" is on) or the store itself (`store`, the
 * store's own CMP, the Selwise banner off and the decision handed over with
 * grantConsent / revokeConsent). The layout writes it on <html>.
 */
export function consentUi(): 'selwise' | 'store' {
  if (typeof document === 'undefined') return 'selwise';
  return document.documentElement.dataset.consentUi === 'store' ? 'store' : 'selwise';
}

export const OPEN_STORE_CONSENT_EVENT = 'ardisa:open-consent';

export function openConsentPreferences() {
  if (consentUi() === 'store') {
    window.dispatchEvent(new Event(OPEN_STORE_CONSENT_EVENT));
    return;
  }
  sw()?.showConsentPreferences?.();
}

/**
 * The value-returning methods (getVisitorId, getConsentState, getExperimentVariant…)
 * exist only once client.js has replaced the install snippet's queue stub, so
 * wait for the real instance — the pattern docs/integration/javascript-api
 * calls "Hazır olma". Gives up after 10 seconds (ad blocker, no site key).
 */
export function withSelwise(callback: (s: SelwiseGlobal) => void): () => void {
  const ready = () => {
    const s = sw();
    return s && typeof s.getVisitorId === 'function' ? s : null;
  };
  const now = ready();
  if (now) {
    callback(now);
    return () => undefined;
  }
  let tries = 0;
  const timer = window.setInterval(() => {
    tries += 1;
    const s = ready();
    if (s) {
      window.clearInterval(timer);
      callback(s);
    } else if (tries > 100) {
      window.clearInterval(timer);
    }
  }, 100);
  return () => window.clearInterval(timer);
}

/** Queued methods: safe before client.js arrives, replayed in order once it does. */
export function grantConsent(categories?: Partial<ConsentState>) {
  sw()?.grantConsent?.(categories);
}

export function revokeConsent(categories?: Array<keyof ConsentState>) {
  sw()?.revokeConsent?.(categories);
}

export function withdrawConsent() {
  sw()?.withdrawConsent?.();
}

export function selwiseInstance(): SelwiseGlobal | null {
  const s = sw();
  return s && typeof s.getVisitorId === 'function' ? s : null;
}
