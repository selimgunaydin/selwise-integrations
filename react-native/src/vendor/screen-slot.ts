// GENERATED FILE — DO NOT EDIT.
//
// Vendored from packages/experiment-contract/src/screen-slot.ts by
// scripts/sync-vendored-page-targeting.js. Edit the source, then run:
//
//   node scripts/sync-vendored-page-targeting.js
//
// It is copied rather than imported because @selwise/experiment-contract is private
// and this SDK is published: a dependency on it would not resolve for anyone
// who installs @selwise/react-native from npm.

/**
 * The SCREEN experiment: the app's counterpart of a page experiment.
 *
 * ## Why it exists
 *
 * A website experiment can rewrite the merchant's own page (`onsite`), because
 * there is a DOM to select into. An app has none, so the only thing an app
 * merchant can compare is WHAT Selwise draws at a place the app named: a point
 * of a screen (`APP_SCREENS` in `@selwise/widget-contract/app-surfaces`, e.g.
 * `app://product` / `pdp-under-info`). Arm A is a recommendation strip, arm B
 * another, arm C an enrichment block, arm D a campaign, and an arm may show
 * nothing. That is a `screen_slot` target.
 *
 * ## What an arm is
 *
 * `variant.targetType = 'screen_slot'` and `variant.configOverride`:
 *
 * ```
 * { screen: 'app://product', slot: 'pdp-under-info', module: { kind, id } }
 * ```
 *
 * The experiment owns the PLACE: for a visitor in the experiment, what the
 * point would have drawn by its own targeting (strips and campaigns sent there,
 * the enrichment rule named after it) is replaced by the arm's module, and a
 * module that is named by an arm is not ALSO drawn there by its own targeting —
 * the point draws the arm or the native content, never both. Elsewhere a module
 * keeps its own targeting. A visitor outside the experiment (its traffic share,
 * its audience, no consent) sees the point as it always was and is not counted.
 *
 * ## The arm that shows nothing IS the holdout arm
 *
 * `module.kind = 'none'` is spelled `isHoldout: true` with no override — the
 * one statement the holdout machinery already reads (the click goal is not
 * collected where a shopper has nothing to click, orders judge the test, every
 * shown arm is compared against it directly). `normalizeScreenSlotVariants`
 * turns the `none` spelling into that flag, so there is one record of it, never
 * two that can disagree. It is exposed to a client as an arm whose `module` is
 * `none` (`screenSlotArmConfigOf`).
 *
 * Pure and dependency-free: the screen / point catalogue is the API's to check
 * (it imports `@selwise/widget-contract/app-surfaces`), this file checks shape.
 */

export const SCREEN_SLOT_TARGET_TYPE = 'screen_slot' as const;

/** What an arm can draw at the point. `none` is the holdout arm. */
export const SCREEN_SLOT_MODULE_KINDS = ['recommendation', 'enrichment', 'campaign', 'none'] as const;

export type ScreenSlotModuleKind = (typeof SCREEN_SLOT_MODULE_KINDS)[number];

export interface ScreenSlotModule {
  kind: ScreenSlotModuleKind;
  /** The strip, the enrichment rule or the campaign; absent for `none`. */
  id?: string;
}

export interface ScreenSlotArmConfig {
  /** The screen's address (`app://product`), lower case. */
  screen: string;
  /** The point's name (`pdp-under-info`), lower case. */
  slot: string;
  module: ScreenSlotModule;
}

/** The most arms a screen experiment may have: one point cannot meaningfully host more. */
export const SCREEN_SLOT_MAX_ARMS = 6;

export function isScreenSlotTarget(targetType: unknown): boolean {
  return targetType === SCREEN_SLOT_TARGET_TYPE;
}

const SCREEN_PATTERN = /^app:\/\/[a-z0-9]+(?:\/[a-z0-9]+)*$/;
const SLOT_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export type ScreenSlotArmParse =
  | { ok: true; config: ScreenSlotArmConfig }
  | { ok: false; message: string };

/**
 * One arm's override, checked for shape. `kind: 'none'` is accepted here (it is
 * the spelling a caller may use); `normalizeScreenSlotVariants` is what turns it
 * into the holdout flag.
 */
export function parseScreenSlotArm(value: unknown): ScreenSlotArmParse {
  if (!isRecord(value)) {
    return { ok: false, message: 'a screen experiment arm needs { screen, slot, module }' };
  }
  const extra = Object.keys(value).filter((key) => !['screen', 'slot', 'module'].includes(key));
  if (extra.length > 0) {
    return { ok: false, message: `invalid screen experiment field: ${extra.join(', ')}` };
  }
  const screen = typeof value.screen === 'string' ? value.screen.trim().toLowerCase() : '';
  if (!SCREEN_PATTERN.test(screen)) {
    return { ok: false, message: 'a screen experiment arm needs a screen address such as app://product' };
  }
  const slot = typeof value.slot === 'string' ? value.slot.trim().toLowerCase() : '';
  if (!SLOT_PATTERN.test(slot) || slot.length > 64) {
    return { ok: false, message: 'a screen experiment arm needs the name of a point of the screen' };
  }
  const module = value.module;
  if (!isRecord(module)) return { ok: false, message: 'a screen experiment arm needs a module' };
  const kind = module.kind;
  if (!(SCREEN_SLOT_MODULE_KINDS as readonly unknown[]).includes(kind)) {
    return {
      ok: false,
      message: `a module is one of ${SCREEN_SLOT_MODULE_KINDS.join(', ')}`,
    };
  }
  if (kind === 'none') {
    if (module.id !== undefined && module.id !== null) {
      return { ok: false, message: 'an arm that shows nothing names no module' };
    }
    return { ok: true, config: { screen, slot, module: { kind: 'none' } } };
  }
  if (typeof module.id !== 'string' || !UUID_PATTERN.test(module.id)) {
    return { ok: false, message: `a ${String(kind)} module needs the id of the module` };
  }
  return {
    ok: true,
    config: { screen, slot, module: { kind: kind as ScreenSlotModuleKind, id: module.id.toLowerCase() } },
  };
}

interface ScreenSlotVariantLike {
  name?: unknown;
  isControl?: unknown;
  isHoldout?: unknown;
  configOverride?: unknown;
}

/**
 * Put every arm in its ONE canonical form: a shown arm carries the parsed
 * `{ screen, slot, module }` and `isHoldout: false`; an arm that shows nothing
 * (spelled `module.kind: 'none'` or `isHoldout: true`) carries `isHoldout: true`
 * and no override. Returns the first thing wrong, by arm name, instead when the
 * set cannot be read.
 */
export function normalizeScreenSlotVariants<T extends ScreenSlotVariantLike>(
  variants: readonly T[]
): { ok: true; variants: Array<T & { isHoldout: boolean; configOverride: ScreenSlotArmConfig | null }> } | { ok: false; message: string } {
  const out: Array<T & { isHoldout: boolean; configOverride: ScreenSlotArmConfig | null }> = [];
  for (const variant of variants) {
    const name = typeof variant.name === 'string' && variant.name.trim() ? `variant "${variant.name.trim()}": ` : '';
    const empty =
      variant.configOverride === undefined ||
      variant.configOverride === null ||
      (isRecord(variant.configOverride) && Object.keys(variant.configOverride).length === 0);

    if (variant.isHoldout === true && empty) {
      out.push({ ...variant, isHoldout: true, configOverride: null });
      continue;
    }
    const parsed = parseScreenSlotArm(variant.configOverride);
    if (!parsed.ok) return { ok: false, message: `${name}${parsed.message}` };
    if (parsed.config.module.kind === 'none') {
      out.push({ ...variant, isHoldout: true, configOverride: parsed.config });
      continue;
    }
    if (variant.isHoldout === true) {
      return { ok: false, message: `${name}an arm that shows nothing cannot name a module` };
    }
    out.push({ ...variant, isHoldout: false, configOverride: parsed.config });
  }
  return { ok: true, variants: out };
}

/** The shape a stored arm is WRITTEN in: the `none` arm keeps no override (it is the holdout flag). */
export function storedScreenSlotConfig(config: ScreenSlotArmConfig | null): ScreenSlotArmConfig | null {
  return config && config.module.kind !== 'none' ? config : null;
}

/**
 * The point an experiment's arms share, or why they do not. Read off the shown
 * arms (a holdout arm stores none); the set must have at least one.
 */
export function screenSlotOfVariants(
  variants: ReadonlyArray<{ isHoldout?: unknown; configOverride?: unknown }>
): { screen: string; slot: string } | null {
  for (const variant of variants) {
    if (variant.isHoldout === true) continue;
    const parsed = parseScreenSlotArm(variant.configOverride);
    if (parsed.ok) return { screen: parsed.config.screen, slot: parsed.config.slot };
  }
  return null;
}

/**
 * What a client is handed for an arm: always `{ screen, slot, module }`, with
 * `none` for the holdout arm (its own row stores nothing).
 */
export function screenSlotArmConfigOf(
  variant: { isHoldout?: unknown; configOverride?: unknown },
  shared: { screen: string; slot: string }
): ScreenSlotArmConfig {
  if (variant.isHoldout === true) return { ...shared, module: { kind: 'none' } };
  const parsed = parseScreenSlotArm(variant.configOverride);
  return parsed.ok ? parsed.config : { ...shared, module: { kind: 'none' } };
}

/**
 * The structural rules of a screen experiment's variant set, on top of the
 * holdout and goal rules every entity experiment has. Returns the first
 * problem, or null.
 *
 *  - at least two arms, at most `SCREEN_SLOT_MAX_ARMS`;
 *  - every arm readable (`parseScreenSlotArm`);
 *  - ONE point: every arm names the same screen and the same slot;
 *  - a module is in at most one arm (the same strip in two arms is two
 *    identical arms, and a dead heat nobody can distrust);
 *  - at least one arm shows a module (an experiment of "nothing" against
 *    "nothing" measures nothing).
 */
export function screenSlotVariantSetProblem(variants: readonly ScreenSlotVariantLike[]): string | null {
  if (variants.length < 2) return 'a screen experiment needs at least two arms';
  if (variants.length > SCREEN_SLOT_MAX_ARMS) {
    return `a screen experiment has at most ${SCREEN_SLOT_MAX_ARMS} arms`;
  }
  const normalized = normalizeScreenSlotVariants(variants);
  if (!normalized.ok) return normalized.message;

  const shown = normalized.variants.filter((variant) => !variant.isHoldout);
  if (shown.length === 0) return 'at least one arm must show a module';

  const points = new Set(
    normalized.variants
      .map((variant) => variant.configOverride)
      .filter((config): config is ScreenSlotArmConfig => config !== null)
      .map((config) => `${config.screen}|${config.slot}`)
  );
  if (points.size > 1) return 'every arm of a screen experiment names the same screen and the same point';

  const seen = new Set<string>();
  for (const variant of shown) {
    const module = variant.configOverride!.module;
    const key = `${module.kind}:${module.id}`;
    if (seen.has(key)) return 'the same module cannot be in two arms of one screen experiment';
    seen.add(key);
  }
  return null;
}
