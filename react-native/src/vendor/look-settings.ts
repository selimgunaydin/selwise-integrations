// GENERATED FILE — DO NOT EDIT.
//
// Vendored from packages/recommendation-contract/src/look-settings.ts by
// scripts/sync-vendored-page-targeting.js. Edit the source, then run:
//
//   node scripts/sync-vendored-page-targeting.js
//
// It is copied rather than imported because @selwise/recommendation-contract is private
// and this SDK is published: a dependency on it would not resolve for anyone
// who installs @selwise/react-native from npm.

/**
 * The settings of a `look` strip, and their defaults — the half of `./look`
 * that carries no logic and no imports.
 *
 * Split out so the app SDK can vendor it (`scripts/sync-vendored-page-targeting.js`):
 * `./look` reads the account's languages and the platform catalogue to NORMALIZE
 * a stored row, which the app never does — the public payload's `look` arrives
 * normalized — but the app draws a look with the same caption modes, alignments
 * and defaults the storefront does. `./look` re-exports everything here, so
 * every existing import keeps working.
 */

/**
 * What a look's card is captioned with: its body slot ("Alt giyim"), its role
 * ("Jean") or nothing. The role repeats what the product title already says;
 * the slot says what part of the outfit the card is.
 */
export const LOOK_CAPTION_MODES = ['slot', 'role', 'none'] as const;
export type LookCaptionMode = (typeof LOOK_CAPTION_MODES)[number];

/** The merchant's own wording for the total and the add-all button. */
export const LOOK_LABEL_MAX_LENGTH = 60;

/**
 * How the total and the add-all button are drawn. An empty value (`''`) is the
 * storefront's own look — the same the strip drew before these were settings —
 * so a stored row without them is unchanged on a storefront.
 */
export const LOOK_ALIGNS = ['start', 'center', 'end'] as const;
export type LookAlign = (typeof LOOK_ALIGNS)[number];

export const LOOK_SIZES = ['sm', 'md', 'lg'] as const;
export type LookSize = (typeof LOOK_SIZES)[number];

export const LOOK_TOTAL_WEIGHTS = ['normal', 'semibold', 'bold'] as const;
export type LookTotalWeight = (typeof LOOK_TOTAL_WEIGHTS)[number];

/** `inline` "Look total: ₺2,297", `stacked` the label over the amount, `split` the label left and the amount right. */
export const LOOK_TOTAL_LAYOUTS = ['inline', 'stacked', 'split'] as const;
export type LookTotalLayout = (typeof LOOK_TOTAL_LAYOUTS)[number];

/** The button's own alignment adds `stretch`: the full width of the strip. */
export const LOOK_BUTTON_ALIGNS = ['start', 'center', 'end', 'stretch'] as const;
export type LookButtonAlign = (typeof LOOK_BUTTON_ALIGNS)[number];

export const LOOK_BUTTON_SHAPES = ['square', 'rounded', 'pill'] as const;
export type LookButtonShape = (typeof LOOK_BUTTON_SHAPES)[number];

/** `solid` a filled button, `outline` a hairline one, `text` a link-looking one. */
export const LOOK_BUTTON_VARIANTS = ['solid', 'outline', 'text'] as const;
export type LookButtonVariant = (typeof LOOK_BUTTON_VARIANTS)[number];

/** The colour settings, in the order the builder shows them. */
export type LookColorKey = 'totalColor' | 'totalBackground' | 'addAllColor' | 'addAllTextColor';

export interface LookSettings {
  caption: LookCaptionMode;
  /**
   * Slots the look never takes ("no socks in a look", "no lip balm in a
   * look"): a body slot (`LookSlot`) or, for a role that has none, `role:<key>`.
   * The builder offers only the slots the catalogue's approved pairs reach.
   */
  hiddenSlots: string[];
  /** "Look total: ₺…" under the cards — only ever drawn when every card is priced in one currency. */
  showTotal: boolean;
  /** "Add all to basket" — only ever drawn where the platform reports each add (`ADD_ALL_PLATFORMS`). */
  showAddAll: boolean;
  /** Empty = the storefront's language default ("Kombin toplamı" / "Look total"). */
  totalLabel: string;
  /** Empty = the storefront's language default ("Hepsini sepete ekle" / "Add all to basket"). */
  addAllLabel: string;
  totalAlign: LookAlign;
  totalSize: LookSize;
  totalWeight: LookTotalWeight;
  totalLayout: LookTotalLayout;
  /** The total's text colour; empty = the strip's own text colour. */
  totalColor: string;
  /** A filled box behind the total; empty = none. */
  totalBackground: string;
  addAllAlign: LookButtonAlign;
  addAllSize: LookSize;
  addAllShape: LookButtonShape;
  addAllVariant: LookButtonVariant;
  /** The button's fill (solid) or outline and text (outline, text); empty = the brand colour. */
  addAllColor: string;
  /** The label of a solid button; empty = the brand's text colour. */
  addAllTextColor: string;
}

export const DEFAULT_LOOK_SETTINGS: Readonly<LookSettings> = {
  caption: 'slot',
  hiddenSlots: [],
  showTotal: true,
  showAddAll: true,
  totalLabel: '',
  addAllLabel: '',
  totalAlign: 'start',
  totalSize: 'md',
  totalWeight: 'semibold',
  totalLayout: 'inline',
  totalColor: '',
  totalBackground: '',
  addAllAlign: 'start',
  addAllSize: 'md',
  addAllShape: 'rounded',
  addAllVariant: 'solid',
  addAllColor: '',
  addAllTextColor: '',
};

