// GENERATED FILE — DO NOT EDIT.
//
// Vendored from packages/search-contract/src/settings.ts by
// scripts/sync-vendored-page-targeting.js. Edit the source, then run:
//
//   node scripts/sync-vendored-page-targeting.js
//
// It is copied rather than imported because @selwise/search-contract is private
// and this SDK is published: a dependency on it would not resolve for anyone
// who installs @selwise/react-native from npm.

/**
 * THE SEARCH SETTINGS DOCUMENT.
 *
 * One versioned document (`search_configs.settings_json`) holds everything a
 * channel's instant search is: where the shopper types, what opens it, what it
 * draws on a desktop and on a phone, what it shows, how it looks, every word it
 * says, and how it adds to the cart. It replaced ~60 columns and two style bags
 * (168 + 61 keys) on 2026-11-06, after a review found the same question asked in
 * three places, behaviour stored inside the style bag (so "reset styles" also
 * reset the trigger takeover), and a single `position` enum that locked four
 * independent decisions into six fixed combinations.
 *
 * Three functions read it, and nothing else may (`pnpm search:settings:check`):
 *
 *   normalizeSearchSettings   tolerant. Unknown keys are dropped, a value out of
 *                             range or out of its list falls back to the default.
 *                             The widget reads with it: the API and the widget
 *                             are deployed apart, and on 2026-09-13 a strict
 *                             reader turned search OFF on every storefront for
 *                             two style keys it had not heard of yet.
 *   validateSearchSettings    strict, for a WRITE. Every problem is reported by
 *                             its path (`placement.desktop.surface`) so the
 *                             dashboard can put it next to the control.
 *   resolveSearchPlacement    (placement.ts) — what the widget actually draws on
 *                             a given viewport.
 *
 * Words are `LocalizedText` (`@selwise/locale-contract` shape, re-declared here
 * so the widget's chunk does not import a second package): the public API
 * resolves them to the visitor's language on the way out, and an empty one means
 * "the platform's own sentence" (`SEARCH_TEXT_KEYS` → shopper strings).
 */

import { mergeOverride } from './devices.js';
import { SEARCH_POPULAR_BLOCKED_MAX_ITEMS, SEARCH_POPULAR_MANUAL_MAX_ITEMS } from './search-bounds.js';
import {
  SEARCH_PHONE_BREAKPOINT,
  filterSearchDevicePatch,
  normalizeSearchDevicePatch,
  searchDevicePatchPaths,
  type SearchDevices,
} from './search-devices.js';

export const SEARCH_SETTINGS_VERSION = 2 as const;

/* --------------------------------------------------------------------------
   Vocabulary
   -------------------------------------------------------------------------- */

/** Who sees search: nobody, only browsers with the test flag, everyone. */
export const SEARCH_MODES = ['off', 'test', 'live'] as const;
export type SearchMode = (typeof SEARCH_MODES)[number];

/**
 * What the widget draws.
 *
 *   dropdown    hangs under the field the shopper types into (store or embedded)
 *   panel       full-width sheet docked under the storefront header
 *   modal       centred sheet with its own field
 *   drawer      full-height sheet from a side, with its own field
 *   fullscreen  the whole viewport, with its own field
 */
export const SEARCH_SURFACES = ['dropdown', 'panel', 'modal', 'drawer', 'fullscreen'] as const;
export type SearchSurface = (typeof SEARCH_SURFACES)[number];

export const SEARCH_EMBED_INSERTS = ['append', 'prepend', 'before', 'after', 'replace'] as const;
export type SearchEmbedInsert = (typeof SEARCH_EMBED_INSERTS)[number];

export const SEARCH_FLOATING_CORNERS = ['bottom-right', 'bottom-left', 'top-right', 'top-left'] as const;
export type SearchFloatingCorner = (typeof SEARCH_FLOATING_CORNERS)[number];

export const SEARCH_DRAWER_SIDES = ['right', 'left'] as const;
export type SearchDrawerSide = (typeof SEARCH_DRAWER_SIDES)[number];

/**
 * `grid` draws the channel's product card; `list` and `compact` draw a row
 * (compact without the image) whose parts are `results.fields`.
 */
export const SEARCH_RESULT_LAYOUTS = ['grid', 'list', 'compact'] as const;
export type SearchResultLayout = (typeof SEARCH_RESULT_LAYOUTS)[number];

export const SEARCH_CATEGORY_DISPLAYS = ['none', 'chips', 'rail', 'dropdown'] as const;
export type SearchCategoryDisplay = (typeof SEARCH_CATEGORY_DISPLAYS)[number];

export const SEARCH_CATEGORY_NAMINGS = ['full_path', 'last_part', 'first_part'] as const;
export type SearchCategoryNaming = (typeof SEARCH_CATEGORY_NAMINGS)[number];

export const SEARCH_SUGGESTION_LAYOUTS = ['mega', 'stacked'] as const;
export type SearchSuggestionLayout = (typeof SEARCH_SUGGESTION_LAYOUTS)[number];

export const SEARCH_SUGGESTION_SOURCES = ['manual', 'dynamic', 'both'] as const;
export type SearchSuggestionSource = (typeof SEARCH_SUGGESTION_SOURCES)[number];

export const SEARCH_TERM_DISPLAYS = ['chips', 'list'] as const;
export type SearchTermDisplay = (typeof SEARCH_TERM_DISPLAYS)[number];

export const SEARCH_CATEGORY_CARD_DISPLAYS = ['list', 'cards'] as const;
export type SearchCategoryCardDisplay = (typeof SEARCH_CATEGORY_CARD_DISPLAYS)[number];

export const SEARCH_SUGGESTION_SECTIONS = ['recent', 'popularSearches', 'popularCategories', 'popularProducts'] as const;
export type SearchSuggestionSection = (typeof SEARCH_SUGGESTION_SECTIONS)[number];

export const SEARCH_DENSITIES = ['comfortable', 'compact'] as const;
export type SearchDensity = (typeof SEARCH_DENSITIES)[number];

export const SEARCH_IMAGE_ASPECTS = ['auto', '1/1', '3/4', '4/3'] as const;
export type SearchImageAspect = (typeof SEARCH_IMAGE_ASPECTS)[number];

export const SEARCH_GRID_COLUMNS = ['auto', '2', '3', '4', '5', '6'] as const;
export type SearchGridColumns = (typeof SEARCH_GRID_COLUMNS)[number];

/** `$i18n` map or a plain string in the account's default language. */
export type SearchText = string | { $i18n: Record<string, string> };

/* --------------------------------------------------------------------------
   The document
   -------------------------------------------------------------------------- */

/**
 * The field the shopper types into.
 *
 *   store            the storefront's own search field(s). `takeover` stops the
 *                    theme's own click/focus handlers on it (its own popup), but
 *                    never `input`: a framework-controlled field needs to see
 *                    every keystroke to keep its value.
 *   selwise/surface  the widget draws its field inside the surface it opens.
 *   selwise/embed    the widget writes its field into a storefront element —
 *                    without deleting what is there; `replace` hides the element
 *                    and puts it back on teardown.
 */
export type SearchInputPlacement =
  | { source: 'store'; selectors: string[]; takeover: boolean }
  | { source: 'selwise'; mount: 'surface' }
  | { source: 'selwise'; mount: 'embed'; selector: string; insert: SearchEmbedInsert };

/**
 * Something else that opens search: a storefront element (a phone header's
 * search icon), the widget's own floating button, a keyboard shortcut. A field
 * the shopper types into (`input`) opens search by itself and is not listed.
 */
export type SearchOpener =
  | { kind: 'element'; selector: string; takeover: boolean }
  | { kind: 'floating_button'; corner: SearchFloatingCorner }
  | { kind: 'hotkey'; key: string };

export interface SearchPlacement {
  input: SearchInputPlacement;
  openers: SearchOpener[];
  desktop: { surface: SearchSurface };
  /** `same` follows the desktop; below `breakpoint` CSS pixels this applies. */
  mobile: { surface: SearchSurface | 'same'; breakpoint: number };
  /**
   * The element a panel docks under. Empty: the nearest header of the field or
   * opener that opened it, else the top of the viewport.
   */
  anchorSelector: string;
}

export interface SearchBehavior {
  minChars: number;
  debounceMs: number;
  maxResults: number;
  /** Keep the surface open after a "view all" or result click (SPA storefronts). */
  keepOpen: boolean;
}

export interface SearchResultFields {
  image: boolean;
  price: boolean;
  oldPrice: boolean;
  discount: boolean;
  stock: boolean;
  category: boolean;
  description: boolean;
}

export interface SearchResults {
  layout: SearchResultLayout;
  /** Row parts for `list` / `compact`; the product card decides its own. */
  fields: SearchResultFields;
  /** Mark the matched part of a title. */
  highlight: boolean;
  excludeOutOfStock: boolean;
  categories: { display: SearchCategoryDisplay; maxVisible: number; naming: SearchCategoryNaming };
  /**
   * The storefront's own results page. `url` takes `{query}`, or the term is
   * added as `param`. Empty url: no "view all", and Enter submits the
   * storefront's own form.
   */
  viewAll: { enabled: boolean; url: string; param: string; newTab: boolean };
}

export interface SearchPopularCategory {
  name: string;
  imageUrl: string;
}

export interface SearchSuggestions {
  layout: SearchSuggestionLayout;
  /** Section order for `stacked`; `mega` arranges its own. */
  order: SearchSuggestionSection[];
  recent: { enabled: boolean; max: number; display: SearchTermDisplay };
  popularSearches: {
    enabled: boolean;
    source: SearchSuggestionSource;
    manual: string[];
    /**
     * Terms kept off the AUTOMATIC list (a query that contains one is never
     * offered). Private to the merchant: it never reaches the storefront.
     */
    blocked: string[];
    max: number;
    display: SearchTermDisplay;
  };
  popularCategories: {
    enabled: boolean;
    source: SearchSuggestionSource;
    manual: SearchPopularCategory[];
    max: number;
    display: SearchCategoryCardDisplay;
  };
  popularProducts: { enabled: boolean; source: SearchSuggestionSource; manual: string[]; max: number };
}

/**
 * How it looks. Colours left empty follow the channel's brand
 * (`var(--selwise-*)`, `packages/widget-contract/src/theme.ts`); everything a
 * product looks like belongs to the product card, not here.
 */
export interface SearchAppearance {
  colors: {
    accent: string;
    background: string;
    text: string;
    muted: string;
    border: string;
    highlight: string;
  };
  radius: number;
  density: SearchDensity;
  font: string;
  input: { height: number; radius: number; icon: boolean };
  grid: { columns: SearchGridColumns; minCardWidth: number; imageAspect: SearchImageAspect };
  chipRadius: number;
  overlayOpacity: number;
  sizes: { panelMaxWidth: number; modalWidth: number; drawerWidth: number; drawerSide: SearchDrawerSide };
  floatingButton: { size: number; background: string; color: string };
  customCss: string;
}

export interface SearchCart {
  enabled: boolean;
  /** Null follows the channel's commerce platform. */
  platform: string | null;
  script: string;
}

export interface SearchSettings {
  v: typeof SEARCH_SETTINGS_VERSION;
  placement: SearchPlacement;
  behavior: SearchBehavior;
  results: SearchResults;
  suggestions: SearchSuggestions;
  appearance: SearchAppearance;
  /** Partial: a missing key says the platform's own sentence (`SEARCH_TEXT_KEYS`). */
  texts: Partial<Record<SearchTextKey, SearchText>>;
  cart: SearchCart;
  /**
   * What differs on a phone: a partial document over this one, only paths in
   * `SEARCH_DEVICE_FIELDS` (`./devices`). Read through
   * `resolveSearchSettingsForDevice`, never directly.
   */
  devices: SearchDevices;
}

/* --------------------------------------------------------------------------
   Words
   -------------------------------------------------------------------------- */

/**
 * Every word the widget says, mapped to the platform sentence it says when the
 * merchant wrote none (`@selwise/locale-contract/shopper-strings`). One list:
 * the dashboard's text section, the widget and the validator all read it.
 *
 * `cartAdd` is the idle add-to-cart button's word, and an APP's alone: the
 * storefront's button says what the product card says (`APP_ONLY_SEARCH_TEXT_KEYS`
 * keeps it out of the website's text section, and `title`, `refine` and
 * `categories`, which the app's screen has no place for, out of the app's).
 */
export const SEARCH_TEXT_KEYS = {
  placeholder: 'search.placeholder',
  title: 'search.header',
  loading: 'search.loading',
  empty: 'search.empty',
  error: 'search.error',
  refine: 'search.refine',
  didYouMean: 'search.didYouMean',
  viewAll: 'search.viewAll',
  footer: 'search.footer',
  showing: 'search.showing',
  inStock: 'search.inStock',
  outOfStock: 'search.outOfStock',
  categories: 'search.categories',
  all: 'search.all',
  // The accessible name of the active category chip's "×" (`categoryChipModel`).
  categoryRemove: 'search.categoryRemove',
  clear: 'search.clear',
  close: 'search.close',
  recentSearches: 'search.recentSearches',
  clearRecent: 'search.clearRecent',
  popularSearches: 'search.popularSearches',
  popularCategories: 'search.popularCategories',
  popularProducts: 'search.popularProducts',
  cartAdd: 'cart.add',
  cartAdding: 'cart.adding',
  cartAdded: 'cart.added',
  cartError: 'cart.error',
} as const;
export type SearchTextKey = keyof typeof SEARCH_TEXT_KEYS;
export const SEARCH_TEXT_KEY_LIST = Object.keys(SEARCH_TEXT_KEYS) as SearchTextKey[];

/** A text that still has its `{token}`s must keep them, or the count reads blank. */
export const SEARCH_TEXT_TOKENS: Partial<Record<SearchTextKey, string[]>> = {
  footer: ['{total}'],
  showing: ['{shown}', '{total}'],
};

export const SEARCH_TEXT_MAX_LENGTH = 200;

/* --------------------------------------------------------------------------
   Bounds and defaults
   -------------------------------------------------------------------------- */

export const SEARCH_SETTINGS_BOUNDS = {
  minChars: { min: 1, max: 10 },
  debounceMs: { min: 0, max: 2000 },
  maxResults: { min: 1, max: 50 },
  categoryMaxVisible: { min: 3, max: 50 },
  suggestionMax: { min: 1, max: 20 },
  breakpoint: { min: 320, max: 1280 },
  radius: { min: 0, max: 32 },
  inputHeight: { min: 32, max: 64 },
  inputRadius: { min: 0, max: 999 },
  minCardWidth: { min: 120, max: 320 },
  chipRadius: { min: 0, max: 999 },
  overlayOpacity: { min: 0, max: 100 },
  panelMaxWidth: { min: 640, max: 2400 },
  modalWidth: { min: 360, max: 1200 },
  drawerWidth: { min: 280, max: 720 },
  floatingButtonSize: { min: 40, max: 80 },
} as const;

export const SEARCH_SETTINGS_TEXT_LIMITS = {
  selector: 255,
  hotkey: 20,
  url: 500,
  param: 40,
  color: 120,
  font: 120,
  imageUrl: 1000,
  term: 100,
  customCss: 20000,
  cartScript: 20000,
} as const;

export const SEARCH_MAX_STORE_SELECTORS = 5;
export const SEARCH_MAX_OPENERS = 8;

/** A hotkey the widget can actually read: Ctrl/⌘ plus one key. */
export const SEARCH_HOTKEY_PATTERN = /^(ctrl|cmd)\+[a-z0-9/.]$/;

export function defaultSearchSettings(): SearchSettings {
  return {
    v: SEARCH_SETTINGS_VERSION,
    placement: {
      input: { source: 'store', selectors: [], takeover: false },
      openers: [],
      desktop: { surface: 'panel' },
      // A 1440px sheet in a 390px viewport is a column of slivers; the phone gets
      // the whole screen and a field of its own (Algolia's detached mode).
      mobile: { surface: 'fullscreen', breakpoint: 768 },
      anchorSelector: '',
    },
    behavior: { minChars: 2, debounceMs: 250, maxResults: 12, keepOpen: false },
    results: {
      layout: 'grid',
      fields: { image: true, price: true, oldPrice: true, discount: true, stock: false, category: false, description: false },
      highlight: true,
      excludeOutOfStock: false,
      categories: { display: 'chips', maxVisible: 8, naming: 'last_part' },
      viewAll: { enabled: false, url: '', param: 'q', newTab: false },
    },
    suggestions: {
      layout: 'mega',
      order: ['recent', 'popularSearches', 'popularCategories', 'popularProducts'],
      recent: { enabled: true, max: 6, display: 'chips' },
      popularSearches: { enabled: true, source: 'dynamic', manual: [], blocked: [], max: 8, display: 'chips' },
      popularCategories: { enabled: true, source: 'dynamic', manual: [], max: 6, display: 'list' },
      popularProducts: { enabled: true, source: 'dynamic', manual: [], max: 6 },
    },
    appearance: {
      colors: { accent: '', background: '', text: '', muted: '', border: '', highlight: '' },
      radius: 12,
      density: 'comfortable',
      font: '',
      input: { height: 44, radius: 10, icon: true },
      grid: { columns: 'auto', minCardWidth: 180, imageAspect: 'auto' },
      chipRadius: 999,
      overlayOpacity: 45,
      sizes: { panelMaxWidth: 1440, modalWidth: 720, drawerWidth: 480, drawerSide: 'right' },
      floatingButton: { size: 56, background: '', color: '' },
      customCss: '',
    },
    texts: {},
    cart: { enabled: true, platform: null, script: '' },
    devices: { mobile: {} },
  };
}

/* --------------------------------------------------------------------------
   Reading: tolerant
   -------------------------------------------------------------------------- */

type Rec = Record<string, unknown>;

function rec(value: unknown): Rec {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Rec) : {};
}

function pick<T extends string>(value: unknown, list: readonly T[], fallback: T): T {
  return typeof value === 'string' && (list as readonly string[]).includes(value) ? (value as T) : fallback;
}

function int(value: unknown, bounds: { min: number; max: number }, fallback: number): number {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
  return Math.min(bounds.max, Math.max(bounds.min, Math.round(n)));
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function str(value: unknown, max: number, fallback = ''): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : fallback;
}

function strList(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const text = str(item, maxLength);
    const key = text.toLocaleLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= maxItems) break;
  }
  return out;
}

function text(value: unknown): SearchText | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim().slice(0, SEARCH_TEXT_MAX_LENGTH);
    return trimmed ? trimmed : undefined;
  }
  const map = rec(rec(value).$i18n);
  const out: Record<string, string> = {};
  for (const [locale, said] of Object.entries(map)) {
    if (typeof said === 'string' && said.trim()) out[locale] = said.trim().slice(0, SEARCH_TEXT_MAX_LENGTH);
  }
  return Object.keys(out).length > 0 ? { $i18n: out } : undefined;
}

function normalizeInput(value: unknown, d: SearchInputPlacement): SearchInputPlacement {
  const v = rec(value);
  if (v.source === 'store') {
    return {
      source: 'store',
      selectors: strList(v.selectors, SEARCH_MAX_STORE_SELECTORS, SEARCH_SETTINGS_TEXT_LIMITS.selector),
      takeover: bool(v.takeover, false),
    };
  }
  if (v.source === 'selwise' && v.mount === 'embed') {
    return {
      source: 'selwise',
      mount: 'embed',
      selector: str(v.selector, SEARCH_SETTINGS_TEXT_LIMITS.selector),
      insert: pick(v.insert, SEARCH_EMBED_INSERTS, 'append'),
    };
  }
  if (v.source === 'selwise') return { source: 'selwise', mount: 'surface' };
  return d;
}

function normalizeOpeners(value: unknown): SearchOpener[] {
  if (!Array.isArray(value)) return [];
  const out: SearchOpener[] = [];
  let floating = false;
  let hotkey = false;
  for (const raw of value) {
    const v = rec(raw);
    if (v.kind === 'element') {
      const selector = str(v.selector, SEARCH_SETTINGS_TEXT_LIMITS.selector);
      if (selector) out.push({ kind: 'element', selector, takeover: bool(v.takeover, false) });
    } else if (v.kind === 'floating_button' && !floating) {
      floating = true;
      out.push({ kind: 'floating_button', corner: pick(v.corner, SEARCH_FLOATING_CORNERS, 'bottom-right') });
    } else if (v.kind === 'hotkey' && !hotkey) {
      const key = str(v.key, SEARCH_SETTINGS_TEXT_LIMITS.hotkey).toLowerCase();
      if (SEARCH_HOTKEY_PATTERN.test(key)) {
        hotkey = true;
        out.push({ kind: 'hotkey', key });
      }
    }
    if (out.length >= SEARCH_MAX_OPENERS) break;
  }
  return out;
}

/**
 * Any value in, a complete `SearchSettings` out. Idempotent:
 * `normalize(normalize(x))` equals `normalize(x)`. Never throws and never
 * refuses — a reader that refuses is how a storefront loses its search over a
 * key it does not know yet.
 */
export function normalizeSearchSettings(raw: unknown): SearchSettings {
  const d = defaultSearchSettings();
  const r = rec(raw);
  const B = SEARCH_SETTINGS_BOUNDS;
  const L = SEARCH_SETTINGS_TEXT_LIMITS;

  const p = rec(r.placement);
  const desktop = rec(p.desktop);
  const mobile = rec(p.mobile);
  const placement: SearchPlacement = {
    input: normalizeInput(p.input, d.placement.input),
    openers: normalizeOpeners(p.openers),
    // Absent: the default. Present but unknown (a newer API in front of an older
    // widget): the one surface that works on every storefront — a sheet with a
    // field of its own.
    desktop: {
      surface:
        desktop.surface === undefined
          ? d.placement.desktop.surface
          : pick(desktop.surface, SEARCH_SURFACES, 'fullscreen'),
    },
    mobile: {
      surface:
        mobile.surface === undefined
          ? d.placement.mobile.surface
          : mobile.surface === 'same'
            ? 'same'
            : pick(mobile.surface, SEARCH_SURFACES, 'fullscreen'),
      // One platform-wide phone width since 2026-11-09 (`./devices`): a card,
      // a strip and a campaign turn into their phone shape at it, and search
      // must not be a phone at 700px while the card in it is not. The field
      // stays in the document because a cached older widget reads it.
      breakpoint: SEARCH_PHONE_BREAKPOINT,
    },
    anchorSelector: str(p.anchorSelector, L.selector),
  };

  const b = rec(r.behavior);
  const behavior: SearchBehavior = {
    minChars: int(b.minChars, B.minChars, d.behavior.minChars),
    debounceMs: int(b.debounceMs, B.debounceMs, d.behavior.debounceMs),
    maxResults: int(b.maxResults, B.maxResults, d.behavior.maxResults),
    keepOpen: bool(b.keepOpen, d.behavior.keepOpen),
  };

  const res = rec(r.results);
  const f = rec(res.fields);
  const cat = rec(res.categories);
  const va = rec(res.viewAll);
  const df = d.results.fields;
  const results: SearchResults = {
    layout: pick(res.layout, SEARCH_RESULT_LAYOUTS, d.results.layout),
    fields: {
      image: bool(f.image, df.image),
      price: bool(f.price, df.price),
      oldPrice: bool(f.oldPrice, df.oldPrice),
      discount: bool(f.discount, df.discount),
      stock: bool(f.stock, df.stock),
      category: bool(f.category, df.category),
      description: bool(f.description, df.description),
    },
    highlight: bool(res.highlight, d.results.highlight),
    excludeOutOfStock: bool(res.excludeOutOfStock, d.results.excludeOutOfStock),
    categories: {
      display: pick(cat.display, SEARCH_CATEGORY_DISPLAYS, d.results.categories.display),
      maxVisible: int(cat.maxVisible, B.categoryMaxVisible, d.results.categories.maxVisible),
      naming: pick(cat.naming, SEARCH_CATEGORY_NAMINGS, d.results.categories.naming),
    },
    viewAll: {
      enabled: bool(va.enabled, d.results.viewAll.enabled),
      url: str(va.url, L.url),
      param: str(va.param, L.param) || 'q',
      newTab: bool(va.newTab, d.results.viewAll.newTab),
    },
  };

  const s = rec(r.suggestions);
  const ds = d.suggestions;
  const order = strList(s.order, SEARCH_SUGGESTION_SECTIONS.length, 40).filter((key): key is SearchSuggestionSection =>
    (SEARCH_SUGGESTION_SECTIONS as readonly string[]).includes(key)
  );
  for (const key of SEARCH_SUGGESTION_SECTIONS) if (!order.includes(key)) order.push(key);
  const rcs = rec(s.recent);
  const ps = rec(s.popularSearches);
  const pc = rec(s.popularCategories);
  const pp = rec(s.popularProducts);
  const suggestions: SearchSuggestions = {
    layout: pick(s.layout, SEARCH_SUGGESTION_LAYOUTS, ds.layout),
    order,
    recent: {
      enabled: bool(rcs.enabled, ds.recent.enabled),
      max: int(rcs.max, B.suggestionMax, ds.recent.max),
      display: pick(rcs.display, SEARCH_TERM_DISPLAYS, ds.recent.display),
    },
    popularSearches: {
      enabled: bool(ps.enabled, ds.popularSearches.enabled),
      source: pick(ps.source, SEARCH_SUGGESTION_SOURCES, ds.popularSearches.source),
      manual: strList(ps.manual, SEARCH_POPULAR_MANUAL_MAX_ITEMS, L.term),
      blocked: strList(ps.blocked, SEARCH_POPULAR_BLOCKED_MAX_ITEMS, L.term),
      max: int(ps.max, B.suggestionMax, ds.popularSearches.max),
      display: pick(ps.display, SEARCH_TERM_DISPLAYS, ds.popularSearches.display),
    },
    popularCategories: {
      enabled: bool(pc.enabled, ds.popularCategories.enabled),
      source: pick(pc.source, SEARCH_SUGGESTION_SOURCES, ds.popularCategories.source),
      manual: (Array.isArray(pc.manual) ? pc.manual : [])
        .map((item) => {
          const v = rec(typeof item === 'string' ? { name: item } : item);
          return { name: str(v.name, L.term), imageUrl: str(v.imageUrl, L.imageUrl) };
        })
        .filter((item) => item.name)
        .slice(0, SEARCH_POPULAR_MANUAL_MAX_ITEMS),
      max: int(pc.max, B.suggestionMax, ds.popularCategories.max),
      display: pick(pc.display, SEARCH_CATEGORY_CARD_DISPLAYS, ds.popularCategories.display),
    },
    popularProducts: {
      enabled: bool(pp.enabled, ds.popularProducts.enabled),
      source: pick(pp.source, SEARCH_SUGGESTION_SOURCES, ds.popularProducts.source),
      manual: strList(pp.manual, SEARCH_POPULAR_MANUAL_MAX_ITEMS, L.term),
      max: int(pp.max, B.suggestionMax, ds.popularProducts.max),
    },
  };

  const a = rec(r.appearance);
  const da = d.appearance;
  const ac = rec(a.colors);
  const ai = rec(a.input);
  const ag = rec(a.grid);
  const az = rec(a.sizes);
  const afb = rec(a.floatingButton);
  const appearance: SearchAppearance = {
    colors: {
      accent: str(ac.accent, L.color),
      background: str(ac.background, L.color),
      text: str(ac.text, L.color),
      muted: str(ac.muted, L.color),
      border: str(ac.border, L.color),
      highlight: str(ac.highlight, L.color),
    },
    radius: int(a.radius, B.radius, da.radius),
    density: pick(a.density, SEARCH_DENSITIES, da.density),
    font: str(a.font, L.font),
    input: {
      height: int(ai.height, B.inputHeight, da.input.height),
      radius: int(ai.radius, B.inputRadius, da.input.radius),
      icon: bool(ai.icon, da.input.icon),
    },
    grid: {
      columns: pick(typeof ag.columns === 'number' ? String(ag.columns) : ag.columns, SEARCH_GRID_COLUMNS, da.grid.columns),
      minCardWidth: int(ag.minCardWidth, B.minCardWidth, da.grid.minCardWidth),
      imageAspect: pick(ag.imageAspect, SEARCH_IMAGE_ASPECTS, da.grid.imageAspect),
    },
    chipRadius: int(a.chipRadius, B.chipRadius, da.chipRadius),
    overlayOpacity: int(a.overlayOpacity, B.overlayOpacity, da.overlayOpacity),
    sizes: {
      panelMaxWidth: int(az.panelMaxWidth, B.panelMaxWidth, da.sizes.panelMaxWidth),
      modalWidth: int(az.modalWidth, B.modalWidth, da.sizes.modalWidth),
      drawerWidth: int(az.drawerWidth, B.drawerWidth, da.sizes.drawerWidth),
      drawerSide: pick(az.drawerSide, SEARCH_DRAWER_SIDES, da.sizes.drawerSide),
    },
    floatingButton: {
      size: int(afb.size, B.floatingButtonSize, da.floatingButton.size),
      background: str(afb.background, L.color),
      color: str(afb.color, L.color),
    },
    customCss: typeof a.customCss === 'string' ? a.customCss.slice(0, L.customCss) : '',
  };

  const t = rec(r.texts);
  const texts: Partial<Record<SearchTextKey, SearchText>> = {};
  for (const key of SEARCH_TEXT_KEY_LIST) {
    const said = text(t[key]);
    if (said !== undefined) texts[key] = said;
  }

  const c = rec(r.cart);
  const cart: SearchCart = {
    enabled: bool(c.enabled, d.cart.enabled),
    platform: typeof c.platform === 'string' && c.platform.trim() ? c.platform.trim().slice(0, 40) : null,
    script: typeof c.script === 'string' ? c.script.slice(0, L.cartScript) : '',
  };

  const base: SearchSettings = {
    v: SEARCH_SETTINGS_VERSION,
    placement,
    behavior,
    results,
    suggestions,
    appearance,
    texts,
    cart,
    devices: { mobile: {} },
  };
  const phone = normalizeSearchDevicePatch(base, rec(rec(r.devices).mobile), normalizeSearchSettings);
  return { ...base, devices: { mobile: phone } };
}

/* --------------------------------------------------------------------------
   Writing: strict
   -------------------------------------------------------------------------- */

/**
 * One problem with a write, at the path of the control that caused it.
 * `code` is stable and the dashboard words it; `bound` carries the limit the
 * sentence needs ("en fazla 50").
 */
export interface SearchSettingsIssue {
  path: string;
  code:
    | 'required'
    | 'unknown_key'
    | 'type'
    | 'one_of'
    | 'min'
    | 'max'
    | 'max_length'
    | 'max_items'
    | 'pattern'
    | 'tokens'
    | 'incompatible'
    | 'nothing_opens'
    | 'duplicate';
  bound?: number | string;
}

export interface ValidateSearchSettingsOptions {
  /** The cart platforms the API accepts (`RECOMMENDATION_PLATFORMS`). */
  platforms?: readonly string[];
  /**
   * False for a channel with no storefront (an app): its app draws its own
   * search box, so nothing has to be picked or opened on a page. The shape of
   * `placement` is still checked — a typo is a typo — but an empty field
   * list, a surface without a page field and "nothing opens" are not raised
   * there. Default true.
   */
  storefront?: boolean;
}


const SHAPE: Record<string, readonly string[]> = {
  '': ['v', 'placement', 'behavior', 'results', 'suggestions', 'appearance', 'texts', 'cart', 'devices'],
  devices: ['mobile'],
  placement: ['input', 'openers', 'desktop', 'mobile', 'anchorSelector'],
  'placement.desktop': ['surface'],
  'placement.mobile': ['surface', 'breakpoint'],
  behavior: ['minChars', 'debounceMs', 'maxResults', 'keepOpen'],
  results: ['layout', 'fields', 'highlight', 'excludeOutOfStock', 'categories', 'viewAll'],
  'results.fields': ['image', 'price', 'oldPrice', 'discount', 'stock', 'category', 'description'],
  'results.categories': ['display', 'maxVisible', 'naming'],
  'results.viewAll': ['enabled', 'url', 'param', 'newTab'],
  suggestions: ['layout', 'order', 'recent', 'popularSearches', 'popularCategories', 'popularProducts'],
  'suggestions.recent': ['enabled', 'max', 'display'],
  'suggestions.popularSearches': ['enabled', 'source', 'manual', 'blocked', 'max', 'display'],
  'suggestions.popularCategories': ['enabled', 'source', 'manual', 'max', 'display'],
  'suggestions.popularProducts': ['enabled', 'source', 'manual', 'max'],
  appearance: ['colors', 'radius', 'density', 'font', 'input', 'grid', 'chipRadius', 'overlayOpacity', 'sizes', 'floatingButton', 'customCss'],
  'appearance.colors': ['accent', 'background', 'text', 'muted', 'border', 'highlight'],
  'appearance.input': ['height', 'radius', 'icon'],
  'appearance.grid': ['columns', 'minCardWidth', 'imageAspect'],
  'appearance.sizes': ['panelMaxWidth', 'modalWidth', 'drawerWidth', 'drawerSide'],
  'appearance.floatingButton': ['size', 'background', 'color'],
  cart: ['enabled', 'platform', 'script'],
};

/**
 * Everything wrong with a write, or `[]`.
 *
 * Unknown keys are refused here (a typo must not be stored), unlike the
 * reader. Cross-field rules live here too: a dropdown needs a field on the
 * page to hang from, and a surface with its own field needs something to open
 * it.
 */
export function validateSearchSettings(
  raw: unknown,
  options: ValidateSearchSettingsOptions = {}
): SearchSettingsIssue[] {
  const issues: SearchSettingsIssue[] = [];
  const storefront = options.storefront !== false;
  const at = (path: string, code: SearchSettingsIssue['code'], bound?: number | string): void => {
    issues.push(bound === undefined ? { path, code } : { path, code, bound });
  };

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    at('', 'type');
    return issues;
  }

  const walkShape = (value: unknown, path: string) => {
    const allowed = SHAPE[path];
    if (!allowed) return;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      at(path, 'type');
      return;
    }
    for (const key of Object.keys(value as Rec)) {
      const child = path ? `${path}.${key}` : key;
      if (!allowed.includes(key)) {
        at(child, 'unknown_key');
        continue;
      }
      walkShape((value as Rec)[key], child);
    }
  };
  walkShape(raw, '');

  const r = raw as Rec;
  const B = SEARCH_SETTINGS_BOUNDS;
  const L = SEARCH_SETTINGS_TEXT_LIMITS;

  const checkInt = (value: unknown, path: string, bounds: { min: number; max: number }): void => {
    if (value === undefined) return;
    if (typeof value !== 'number' || !Number.isInteger(value)) at(path, 'type');
    else if (value < bounds.min) at(path, 'min', bounds.min);
    else if (value > bounds.max) at(path, 'max', bounds.max);
  };
  const checkOne = (value: unknown, path: string, list: readonly string[]) => {
    if (value === undefined) return;
    if (typeof value !== 'string' || !list.includes(value)) at(path, 'one_of', list.join('|'));
  };
  const checkBool = (value: unknown, path: string) => {
    if (value !== undefined && typeof value !== 'boolean') at(path, 'type');
  };
  const checkStr = (value: unknown, path: string, max: number): void => {
    if (value === undefined) return;
    if (typeof value !== 'string') at(path, 'type');
    else if (value.length > max) at(path, 'max_length', max);
  };

  // placement
  const p = rec(r.placement);
  const input = rec(p.input);
  if ('input' in p) {
    if (input.source === 'store') {
      for (const key of Object.keys(input)) {
        if (!['source', 'selectors', 'takeover'].includes(key)) at(`placement.input.${key}`, 'unknown_key');
      }
      if (!Array.isArray(input.selectors)) at('placement.input.selectors', 'type');
      else {
        if (storefront && input.selectors.length === 0) at('placement.input.selectors', 'required');
        if (input.selectors.length > SEARCH_MAX_STORE_SELECTORS)
          at('placement.input.selectors', 'max_items', SEARCH_MAX_STORE_SELECTORS);
        input.selectors.forEach((selector, index) => {
          if (typeof selector !== 'string' || !selector.trim()) at(`placement.input.selectors.${index}`, 'required');
          else if (selector.length > L.selector) at(`placement.input.selectors.${index}`, 'max_length', L.selector);
        });
      }
      checkBool(input.takeover, 'placement.input.takeover');
    } else if (input.source === 'selwise') {
      if (input.mount === 'embed') {
        for (const key of Object.keys(input)) {
          if (!['source', 'mount', 'selector', 'insert'].includes(key)) at(`placement.input.${key}`, 'unknown_key');
        }
        if (typeof input.selector !== 'string' || !input.selector.trim()) at('placement.input.selector', 'required');
        else checkStr(input.selector, 'placement.input.selector', L.selector);
        checkOne(input.insert ?? 'append', 'placement.input.insert', SEARCH_EMBED_INSERTS);
      } else if (input.mount === 'surface') {
        for (const key of Object.keys(input)) {
          if (!['source', 'mount'].includes(key)) at(`placement.input.${key}`, 'unknown_key');
        }
      } else at('placement.input.mount', 'one_of', 'surface|embed');
    } else at('placement.input.source', 'one_of', 'store|selwise');
  }

  if ('openers' in p) {
    if (!Array.isArray(p.openers)) at('placement.openers', 'type');
    else {
      if (p.openers.length > SEARCH_MAX_OPENERS) at('placement.openers', 'max_items', SEARCH_MAX_OPENERS);
      let floating = 0;
      let hotkey = 0;
      p.openers.forEach((rawOpener, index) => {
        const o = rec(rawOpener);
        const path = `placement.openers.${index}`;
        if (o.kind === 'element') {
          if (typeof o.selector !== 'string' || !o.selector.trim()) at(`${path}.selector`, 'required');
          else checkStr(o.selector, `${path}.selector`, L.selector);
          checkBool(o.takeover, `${path}.takeover`);
        } else if (o.kind === 'floating_button') {
          floating += 1;
          if (floating > 1) at(path, 'duplicate');
          checkOne(o.corner, `${path}.corner`, SEARCH_FLOATING_CORNERS);
        } else if (o.kind === 'hotkey') {
          hotkey += 1;
          if (hotkey > 1) at(path, 'duplicate');
          if (typeof o.key !== 'string' || !SEARCH_HOTKEY_PATTERN.test(o.key.toLowerCase()))
            at(`${path}.key`, 'pattern', 'ctrl+k');
        } else at(`${path}.kind`, 'one_of', 'element|floating_button|hotkey');
      });
    }
  }

  checkOne(rec(p.desktop).surface, 'placement.desktop.surface', SEARCH_SURFACES);
  const mobileSurface = rec(p.mobile).surface;
  if (mobileSurface !== undefined && mobileSurface !== 'same')
    checkOne(mobileSurface, 'placement.mobile.surface', SEARCH_SURFACES);
  checkInt(rec(p.mobile).breakpoint, 'placement.mobile.breakpoint', B.breakpoint);
  checkStr(p.anchorSelector, 'placement.anchorSelector', L.selector);

  // Cross-field: judged on the normalized document, so a partial write is
  // judged against the defaults it will be completed with.
  const n = normalizeSearchSettings(raw);
  if (storefront && searchPageInput(n) === null) {
    const surfaces: Array<[string, SearchSurface]> = [['placement.desktop.surface', n.placement.desktop.surface]];
    if (n.placement.mobile.surface !== 'same') surfaces.push(['placement.mobile.surface', n.placement.mobile.surface]);
    for (const [path, surface] of surfaces) {
      if (SEARCH_SURFACE_RULES[surface].field === 'page') at(path, 'incompatible', 'page_input');
    }
    if (n.placement.openers.length === 0) at('placement.openers', 'nothing_opens');
  }

  // behavior
  const b = rec(r.behavior);
  checkInt(b.minChars, 'behavior.minChars', B.minChars);
  checkInt(b.debounceMs, 'behavior.debounceMs', B.debounceMs);
  checkInt(b.maxResults, 'behavior.maxResults', B.maxResults);
  checkBool(b.keepOpen, 'behavior.keepOpen');

  // results
  const res = rec(r.results);
  checkOne(res.layout, 'results.layout', SEARCH_RESULT_LAYOUTS);
  for (const [key, value] of Object.entries(rec(res.fields))) checkBool(value, `results.fields.${key}`);
  checkBool(res.highlight, 'results.highlight');
  checkBool(res.excludeOutOfStock, 'results.excludeOutOfStock');
  const cat = rec(res.categories);
  checkOne(cat.display, 'results.categories.display', SEARCH_CATEGORY_DISPLAYS);
  checkInt(cat.maxVisible, 'results.categories.maxVisible', B.categoryMaxVisible);
  checkOne(cat.naming, 'results.categories.naming', SEARCH_CATEGORY_NAMINGS);
  const va = rec(res.viewAll);
  checkBool(va.enabled, 'results.viewAll.enabled');
  checkStr(va.url, 'results.viewAll.url', L.url);
  checkStr(va.param, 'results.viewAll.param', L.param);
  checkBool(va.newTab, 'results.viewAll.newTab');
  // An app answers "view all" with the host's own callback (`onViewAll`): it has no address to ask for.
  if (storefront && n.results.viewAll.enabled && !n.results.viewAll.url) at('results.viewAll.url', 'required');

  // suggestions
  const s = rec(r.suggestions);
  checkOne(s.layout, 'suggestions.layout', SEARCH_SUGGESTION_LAYOUTS);
  if (s.order !== undefined) {
    if (!Array.isArray(s.order)) at('suggestions.order', 'type');
    else s.order.forEach((key, index) => checkOne(key, `suggestions.order.${index}`, SEARCH_SUGGESTION_SECTIONS));
  }
  // Per section: its display list, and whether it has a source (and so a
  // manual list). A manual source with nothing in it shows an empty section —
  // asked only of a section that is on: a switched-off list is not a decision.
  const sectionChecks: Array<[SearchSuggestionSection, readonly string[] | null, boolean]> = [
    ['recent', SEARCH_TERM_DISPLAYS, false],
    ['popularSearches', SEARCH_TERM_DISPLAYS, true],
    ['popularCategories', SEARCH_CATEGORY_CARD_DISPLAYS, true],
    ['popularProducts', null, true],
  ];
  for (const [key, displays, hasSource] of sectionChecks) {
    const section = rec(s[key]);
    const path = `suggestions.${key}`;
    checkBool(section.enabled, `${path}.enabled`);
    checkInt(section.max, `${path}.max`, B.suggestionMax);
    if (displays) checkOne(section.display, `${path}.display`, displays);
    if (!hasSource) continue;
    checkOne(section.source, `${path}.source`, SEARCH_SUGGESTION_SOURCES);
    if (section.manual !== undefined) {
      if (!Array.isArray(section.manual)) at(`${path}.manual`, 'type');
      else if (section.manual.length > SEARCH_POPULAR_MANUAL_MAX_ITEMS)
        at(`${path}.manual`, 'max_items', SEARCH_POPULAR_MANUAL_MAX_ITEMS);
    }
    if (key === 'popularSearches' && section.blocked !== undefined) {
      if (!Array.isArray(section.blocked)) at(`${path}.blocked`, 'type');
      else if (section.blocked.length > SEARCH_POPULAR_BLOCKED_MAX_ITEMS)
        at(`${path}.blocked`, 'max_items', SEARCH_POPULAR_BLOCKED_MAX_ITEMS);
    }
    const normalized = n.suggestions[key] as { enabled: boolean; source: string; manual: unknown[] };
    if (normalized.enabled && normalized.source === 'manual' && normalized.manual.length === 0)
      at(`${path}.manual`, 'required');
  }

  // appearance
  const a = rec(r.appearance);
  for (const [key, value] of Object.entries(rec(a.colors))) checkStr(value, `appearance.colors.${key}`, L.color);
  checkInt(a.radius, 'appearance.radius', B.radius);
  checkOne(a.density, 'appearance.density', SEARCH_DENSITIES);
  checkStr(a.font, 'appearance.font', L.font);
  const ai = rec(a.input);
  checkInt(ai.height, 'appearance.input.height', B.inputHeight);
  checkInt(ai.radius, 'appearance.input.radius', B.inputRadius);
  checkBool(ai.icon, 'appearance.input.icon');
  const ag = rec(a.grid);
  checkOne(ag.columns, 'appearance.grid.columns', SEARCH_GRID_COLUMNS);
  checkInt(ag.minCardWidth, 'appearance.grid.minCardWidth', B.minCardWidth);
  checkOne(ag.imageAspect, 'appearance.grid.imageAspect', SEARCH_IMAGE_ASPECTS);
  checkInt(a.chipRadius, 'appearance.chipRadius', B.chipRadius);
  checkInt(a.overlayOpacity, 'appearance.overlayOpacity', B.overlayOpacity);
  const az = rec(a.sizes);
  checkInt(az.panelMaxWidth, 'appearance.sizes.panelMaxWidth', B.panelMaxWidth);
  checkInt(az.modalWidth, 'appearance.sizes.modalWidth', B.modalWidth);
  checkInt(az.drawerWidth, 'appearance.sizes.drawerWidth', B.drawerWidth);
  checkOne(az.drawerSide, 'appearance.sizes.drawerSide', SEARCH_DRAWER_SIDES);
  const afb = rec(a.floatingButton);
  checkInt(afb.size, 'appearance.floatingButton.size', B.floatingButtonSize);
  checkStr(afb.background, 'appearance.floatingButton.background', L.color);
  checkStr(afb.color, 'appearance.floatingButton.color', L.color);
  checkStr(a.customCss, 'appearance.customCss', L.customCss);

  // texts
  const t = r.texts;
  if (t !== undefined) {
    if (!t || typeof t !== 'object' || Array.isArray(t)) at('texts', 'type');
    else {
      for (const [key, value] of Object.entries(t as Rec)) {
        const path = `texts.${key}`;
        if (!(key in SEARCH_TEXT_KEYS)) {
          at(path, 'unknown_key');
          continue;
        }
        const variants =
          typeof value === 'string'
            ? [value]
            : value && typeof value === 'object' && rec(value).$i18n && typeof rec(value).$i18n === 'object'
              ? Object.values(rec(rec(value).$i18n))
              : null;
        if (!variants) {
          at(path, 'type');
          continue;
        }
        for (const said of variants) {
          if (typeof said !== 'string') {
            at(path, 'type');
            break;
          }
          if (said.length > SEARCH_TEXT_MAX_LENGTH) {
            at(path, 'max_length', SEARCH_TEXT_MAX_LENGTH);
            break;
          }
          const tokens = SEARCH_TEXT_TOKENS[key as SearchTextKey];
          if (said.trim() && tokens && tokens.some((token) => !said.includes(token))) {
            at(path, 'tokens', tokens.join(' '));
            break;
          }
        }
      }
    }
  }

  // cart
  const c = rec(r.cart);
  checkBool(c.enabled, 'cart.enabled');
  if (c.platform !== undefined && c.platform !== null) {
    if (typeof c.platform !== 'string') at('cart.platform', 'type');
    else if (options.platforms && !options.platforms.includes(c.platform))
      at('cart.platform', 'one_of', options.platforms.join('|'));
  }
  checkStr(c.script, 'cart.script', L.cartScript);

  // devices: the phone's layer. Its paths must be ones a phone may change,
  // and the PHONE's document must be valid on its own — a phone that drops
  // the store field and opens nothing is as broken as a desktop that does.
  // Its problems are reported under `devices.mobile.<path>` so the dashboard
  // hangs each under the phone's control, and only when the phone causes
  // them (a problem the desktop already has is reported once, there).
  const dv = r.devices;
  if (dv !== undefined && dv !== null && typeof dv === 'object' && !Array.isArray(dv)) {
    const phoneRaw = (dv as Rec).mobile;
    if (phoneRaw !== undefined) {
      if (!phoneRaw || typeof phoneRaw !== 'object' || Array.isArray(phoneRaw)) at('devices.mobile', 'type');
      else {
        const { patch, dropped } = filterSearchDevicePatch(phoneRaw);
        for (const path of dropped) at(`devices.mobile.${path}`, 'unknown_key');
        if (searchDevicePatchPaths(patch).length > 0) {
          const { devices: _ignored, ...desktopRaw } = r;
          // The phone's field is ONE choice (a union on `source`): merged key by
          // key over the desktop's, a phone that switches from the store's field
          // to its own would inherit the desktop's `selectors` and `takeover`
          // and be refused as "unknown keys" for a document it never wrote.
          const phoneDoc = mergeOverride(desktopRaw, patch) as Rec;
          const phoneInput = rec(rec((patch as Rec).placement).input);
          if (Object.keys(phoneInput).length > 0) {
            phoneDoc.placement = { ...rec(phoneDoc.placement), input: phoneInput };
          }
          const phoneIssues = validateSearchSettings(phoneDoc, options);
          const desktopKeys = new Set(
            issues.filter((issue) => !issue.path.startsWith('devices.')).map((issue) => `${issue.path}|${issue.code}`),
          );
          for (const issue of phoneIssues) {
            if (desktopKeys.has(`${issue.path}|${issue.code}`)) continue;
            issues.push({ ...issue, path: `devices.mobile.${issue.path}` });
          }
        }
      }
    }
  }

  return issues;
}

/**
 * Per surface, which field it types into and whether it dims the page — the
 * one table the validator, the resolver, the dashboard and the widget read.
 *
 *   field   `page`   draws no field: the shopper types into the store's or
 *                    the embedded one.
 *           `own`    draws its own field; a page field becomes an opener
 *                    that hands its text over.
 *           `either` a panel: results under a page field, or a field of its
 *                    own when there is none.
 *   overlay dims the page behind it.
 */
export const SEARCH_SURFACE_RULES: Record<SearchSurface, { field: 'page' | 'own' | 'either'; overlay: boolean }> = {
  dropdown: { field: 'page', overlay: false },
  panel: { field: 'either', overlay: true },
  modal: { field: 'own', overlay: true },
  drawer: { field: 'own', overlay: true },
  fullscreen: { field: 'own', overlay: false },
};

/** Which field on the PAGE this placement has: the store's, an embedded one, or none. */
export function searchPageInput(settings: SearchSettings): 'store' | 'embed' | null {
  const input = settings.placement.input;
  if (input.source === 'store') return 'store';
  return input.mount === 'embed' ? 'embed' : null;
}

/**
 * Deep-merge a partial document onto a complete one — how an experiment arm's
 * override or a dashboard patch lands. Arrays replace; `undefined` keeps.
 */
export function mergeSearchSettings(base: SearchSettings, patch: unknown): SearchSettings {
  const merge = (target: unknown, source: unknown): unknown => {
    if (source === undefined) return target;
    if (!source || typeof source !== 'object' || Array.isArray(source)) return source;
    const out: Rec = { ...rec(target) };
    for (const [key, value] of Object.entries(source as Rec)) out[key] = merge(out[key], value);
    return out;
  };
  return normalizeSearchSettings(merge(base, patch));
}
