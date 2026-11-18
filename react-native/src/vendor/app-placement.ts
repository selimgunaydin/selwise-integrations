// GENERATED FILE — DO NOT EDIT.
//
// Vendored from packages/widget-contract/src/app-placement.ts by
// scripts/sync-vendored-page-targeting.js. Edit the source, then run:
//
//   node scripts/sync-vendored-page-targeting.js
//
// It is copied rather than imported because @selwise/widget-contract is private
// and this SDK is published: a dependency on it would not resolve for anyone
// who installs @selwise/react-native from npm.

/**
 * Where an app draws each campaign type, and what it reads from its content.
 *
 * ## Placement (roadmap K8)
 *
 * A website places a campaign with a position (`top`, `bottom-right`, …) or a
 * CSS selector. An app has no document: a surface is drawn in one of four ways,
 * and `APP_WIDGET_PLACEMENT` says which, per type:
 *
 *  - `dock`      a bar pinned to the top or bottom of the screen
 *  - `floating`  a button over the screen, in one of the four corners
 *  - `modal`     a window over everything, centred, or sliding in from an edge
 *  - `slot`      a named point the app mounts (`<SelwiseSlot>`), inside the screen's own flow
 *
 * A type can ALSO be placed in a slot (`slot: 'optional'`: an announcement bar
 * the merchant wants inside the product screen rather than docked) or REQUIRE
 * one (`slot: 'required'`: a viewers counter has no place but a point on the
 * product screen). The selector and the insert position of the web form have no
 * meaning here and are not offered (`channel-fields.ts`).
 *
 * ## Content
 *
 * The dashboard writes content under the keys of `TYPE_CONTENT_FIELDS`
 * (`headline`, `emailPlaceholder`, `successMessage`, …) and the web renderer
 * reads them through `normalizeContentFields`, which fills the legacy aliases
 * (`titleText`, `ctaText`, `description`, `subtitle`). The app renderers used to
 * read whatever key the plugin's author remembered (`placeholder`,
 * `successText`), so a newsletter's headline and success message never reached a
 * phone. `normalizeAppSurfaceContent` is the ONE mapping from what the dashboard
 * stores to what an app renderer reads, and `APP_CONTENT_RULES` is that mapping
 * as data: `app-placement.spec.ts` fails when a content field of an app type is
 * neither read by a rule nor declared hidden with a reason in `channel-fields.ts`.
 *
 * NOT re-exported from the barrel: import the subpath,
 *   import { APP_WIDGET_PLACEMENT } from '@selwise/widget-contract/app-placement'
 */

/**
 * The campaign types an app can draw (each is a `WidgetType` of `types.ts`;
 * `app-placement.spec.ts` holds that, because this file is vendored into the
 * published SDK and so imports nothing). Everything else is a place only a web
 * page has: `inline_banner` and `embedded_card` are inserted at an element,
 * `tab_talk` rewrites a browser tab, `cookie_consent` is the consent owner's
 * (`channelSupportsWidgetType` in the dashboard says the same, and a spec holds
 * the two together).
 */
export const APP_WIDGET_TYPES = [
  'announcement_bar',
  'countdown_timer',
  'goal_bar',
  'sticky_footer',
  'floating_button',
  'exit_intent_popup',
  'slide_in',
  'newsletter',
  'custom',
  'product_view_count',
  'cart_count',
] as const;

export type AppWidgetType = (typeof APP_WIDGET_TYPES)[number];

export function isAppWidgetType(type: string): type is AppWidgetType {
  return (APP_WIDGET_TYPES as readonly string[]).includes(type);
}

export type AppPlacementMode = 'dock' | 'floating' | 'modal' | 'slot';
export type AppSlotRequirement = 'none' | 'optional' | 'required';

export interface AppWidgetPlacement {
  mode: AppPlacementMode;
  /** The positions the dashboard offers, in order. Empty for a surface that lives only in a slot. */
  positions: readonly string[];
  slot: AppSlotRequirement;
  /** The position of a new campaign of this type. Empty with `positions`. */
  defaultPosition: string;
  /** The point a surface that REQUIRES one starts on, until the merchant picks another. */
  defaultSlot?: string;
  /** The modal arrives by sliding, not by fading in (`slide_in`). */
  animated?: boolean;
}

/**
 * A bar docked on an app screen. The BOTTOM comes first and is the default: a
 * top dock sits over the host app's own header (the SDK cannot push the host's
 * content down), so a bar a merchant did not place on purpose must not cover it.
 * `top` stays offered, with a note (`channel-fields.ts`, `campaign.position.*.top`).
 */
const DOCK_POSITIONS = ['bottom', 'top'] as const;

export const APP_WIDGET_PLACEMENT: Readonly<Record<AppWidgetType, AppWidgetPlacement>> = {
  announcement_bar: { mode: 'dock', positions: DOCK_POSITIONS, slot: 'optional', defaultPosition: 'bottom' },
  countdown_timer: { mode: 'dock', positions: DOCK_POSITIONS, slot: 'optional', defaultPosition: 'bottom' },
  goal_bar: { mode: 'dock', positions: DOCK_POSITIONS, slot: 'optional', defaultPosition: 'bottom' },
  sticky_footer: { mode: 'dock', positions: ['bottom'], slot: 'none', defaultPosition: 'bottom' },
  floating_button: {
    mode: 'floating',
    positions: ['bottom-right', 'bottom-left', 'top-right', 'top-left'],
    slot: 'none',
    defaultPosition: 'bottom-right',
  },
  exit_intent_popup: { mode: 'modal', positions: ['center', 'bottom'], slot: 'none', defaultPosition: 'center' },
  slide_in: {
    mode: 'modal',
    positions: ['right', 'left', 'bottom'],
    slot: 'none',
    defaultPosition: 'right',
    animated: true,
  },
  newsletter: { mode: 'modal', positions: ['center', 'bottom'], slot: 'optional', defaultPosition: 'center' },
  custom: { mode: 'dock', positions: DOCK_POSITIONS, slot: 'optional', defaultPosition: 'bottom' },
  product_view_count: {
    mode: 'slot',
    positions: [],
    slot: 'required',
    defaultPosition: '',
    defaultSlot: 'pdp-under-info',
  },
  cart_count: { mode: 'slot', positions: [], slot: 'required', defaultPosition: '', defaultSlot: 'pdp-under-info' },
};

/** The placement of an app-renderable type; null for one an app cannot draw. */
export function appWidgetPlacement(type: string): AppWidgetPlacement | null {
  return isAppWidgetType(type) ? APP_WIDGET_PLACEMENT[type] : null;
}

/**
 * The positions the dashboard offers for `type` on an APP channel. Not the
 * website's list filtered: an app has positions the web has not (a modal that
 * rises from the bottom) and lacks ones it has (`bottom-left` on a newsletter).
 * Empty for a type that lives only in a slot, and for one an app cannot draw.
 */
export function appPlacementPositions(type: string): readonly string[] {
  return appWidgetPlacement(type)?.positions ?? [];
}

/* ----------------------------------------------------------------------------
   Content
   -------------------------------------------------------------------------- */

/**
 * One value an app renderer reads: `out` is the key it reads, `field` the
 * dashboard content field it carries, `aliases` the older keys a stored
 * campaign may hold it under (the web's `normalizeContentFields` fills the same).
 */
export interface AppContentRule {
  out: string;
  field: string;
  aliases?: readonly string[];
}

const rule = (field: string, out: string = field, aliases?: readonly string[]): AppContentRule =>
  aliases ? { out, field, aliases } : { out, field };

const TITLE_ALIASES = ['titleText', 'headline'] as const;
const TEXT_ALIASES = ['description', 'subtitle'] as const;
const CTA = [rule('buttonText', 'buttonText', ['ctaText']), rule('buttonUrl', 'buttonUrl', ['ctaUrl'])] as const;

/**
 * Per type, what an app renderer reads from the content a campaign stores.
 * `title` is a heading, `text` the message or description, `subtext` the line
 * beneath it; the web conflates the last two (its `subtext` falls back to
 * `text`), an app draws them apart.
 */
export const APP_CONTENT_RULES: Readonly<Record<AppWidgetType, readonly AppContentRule[]>> = {
  announcement_bar: [rule('text', 'text', TEXT_ALIASES), ...CTA, rule('imageUrl')],
  floating_button: [rule('text', 'label'), rule('tooltip'), rule('buttonUrl', 'buttonUrl', ['ctaUrl'])],
  exit_intent_popup: [
    rule('title', 'title', TITLE_ALIASES),
    rule('text', 'text', TEXT_ALIASES),
    ...CTA,
    rule('imageUrl'),
    rule('imageLinkUrl'),
  ],
  slide_in: [
    rule('title', 'title', TITLE_ALIASES),
    rule('text', 'text', TEXT_ALIASES),
    ...CTA,
    rule('imageUrl'),
  ],
  sticky_footer: [rule('text', 'text', TEXT_ALIASES), rule('subtext'), ...CTA],
  countdown_timer: [
    rule('title', 'title', TITLE_ALIASES),
    rule('text', 'subtext', TEXT_ALIASES),
    rule('countdownMode'),
    rule('endDate'),
    rule('dailyCutoff'),
    rule('cutoffTimeZone'),
    ...CTA,
  ],
  custom: [rule('html'), rule('css')],
  product_view_count: [
    rule('template'),
    rule('customText'),
    rule('timePeriod'),
    rule('showIcon'),
    rule('iconType'),
    rule('minCount'),
    rule('productId'),
  ],
  cart_count: [
    rule('template'),
    rule('customText'),
    rule('metricType'),
    rule('showIcon'),
    rule('iconType'),
    rule('minCount'),
    rule('productId'),
  ],
  newsletter: [
    rule('headline', 'title', ['title', 'titleText']),
    rule('text', 'text', TEXT_ALIASES),
    rule('emailPlaceholder', 'placeholder', ['placeholder']),
    rule('collectPhone'),
    rule('phonePlaceholder'),
    rule('smsConsentText'),
    rule('privacyNoticeText'),
    rule('privacyNoticeUrl'),
    rule('buttonText', 'buttonText', ['ctaText']),
    rule('successMessage', 'successText', ['successText']),
    rule('errorMessage'),
    rule('submittingButtonText'),
    rule('successButtonText'),
  ],
  goal_bar: [
    rule('metric'),
    rule('thresholds'),
    rule('text', 'text', TEXT_ALIASES),
    rule('completeText'),
    rule('showWhenEmpty'),
    rule('showBar'),
    ...CTA,
    rule('completeButtonText'),
    rule('completeButtonUrl'),
  ],
};

export type AppSurfaceContent = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The content an app renderer reads, from the content a campaign stores.
 *
 * Every other key is kept as it was (a `custom` campaign's script settings, a
 * content state's overrides already merged), exactly as the web's
 * `normalizeContentFields` keeps them; the rules only ADD the keys a renderer
 * reads. A value the content does not carry is not invented: an absent field
 * stays absent, so a renderer's own default applies. `''` counts as written —
 * a merchant who cleared a field meant it empty.
 */
export function normalizeAppSurfaceContent(type: string, content: unknown): AppSurfaceContent {
  const source = isRecord(content) ? content : {};
  const out: AppSurfaceContent = { ...source };
  if (!isAppWidgetType(type)) return out;
  for (const entry of APP_CONTENT_RULES[type]) {
    for (const key of [entry.field, ...(entry.aliases ?? [])]) {
      if (source[key] !== undefined && source[key] !== null) {
        out[entry.out] = source[key];
        break;
      }
    }
  }
  return out;
}
