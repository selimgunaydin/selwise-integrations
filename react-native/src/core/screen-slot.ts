import type { RecommendationWidgetSummary } from '../types.js';
import { appScreenOfUrl, appSlotSelector } from '../vendor/app-surfaces.js';
import { appWidgetPlacement } from '../vendor/app-placement.js';
import { normalizePageTargeting } from '../vendor/page-targeting.js';
import {
  SCREEN_SLOT_MODULE_KINDS,
  SCREEN_SLOT_TARGET_TYPE,
  type ScreenSlotModuleKind,
} from '../vendor/screen-slot.js';

export type { ScreenSlotModuleKind };
import type { ExperimentAssignment } from './eligibility.js';
import { normalizeSurface, type Surface } from './surfaces.js';
import { isRecord } from './records.js';

/**
 * A SCREEN experiment: which module is drawn at ONE point of a screen.
 *
 * Plain Node, like `strips.ts`, so every rule is tested without React Native.
 *
 * ## What the arm is
 *
 * The API (`/public/experiments/assign`, capability `screen_slot`) hands each
 * arm `{ screen, slot, module: { kind, id } }` as its `config`, with the module's
 * own data beside it (`moduleData`): a recommendation strip as `/recommendations`
 * serves it, a campaign as `/config` serves it, an enrichment rule as its id and
 * `placementKey`. `kind: 'none'` is the arm that shows nothing (the holdout arm).
 *
 * ## The rule: the point has ONE owner
 *
 * For a visitor in the experiment the point draws the arm's module and nothing
 * else. What the point's own targeting would have put there (the strips and
 * campaigns sent to it, the enrichment rule named after it) is replaced, and a
 * module an arm names is not ALSO drawn there by its own targeting — the point
 * draws the arm or the native content, never both. Elsewhere every module keeps
 * its own targeting. A visitor outside the experiment (its traffic share, its
 * audience, no consent, a client that is not asked) sees the point as it was
 * and is not counted.
 *
 * Where each half is enforced: `SelwiseSlot` draws the arm's strip, enrichment
 * or nothing and withholds the native strips and enrichment; the client's
 * `getSurfaces` withholds the native campaigns of a claimed point and adds the
 * arm's campaign (`slotArmSurface`) — it is a campaign, decided by the one
 * overlay that decides every campaign, drawn by the point.
 */


export interface ScreenSlotArm {
  experimentId: string;
  variantId: string;
  variantName?: string;
  /** The screen's address (`app://product`), as the catalogue spells it. */
  screen: string;
  /** The point's name (`pdp-under-info`). */
  slot: string;
  module: { kind: ScreenSlotModuleKind; id?: string };
  /** The module's data as the API sent it, for the kinds that carry any. */
  moduleData: unknown;
  /** The arm shows nothing — the holdout arm of the experiment. */
  holdout: boolean;
  /** The assignment, which the exposure and the click are recorded against. */
  assignment: ExperimentAssignment;
}

/** The catalogue's spelling of a screen address, or the lower-cased text when it is not one. */
export function screenKey(screen: string | null | undefined): string {
  const text = String(screen ?? '').trim().toLowerCase();
  return appScreenOfUrl(text)?.url ?? text;
}

/** One assignment as a screen arm — null for any other experiment, or an arm this SDK cannot read. */
export function screenSlotArmOf(assignment: ExperimentAssignment | null | undefined): ScreenSlotArm | null {
  if (!assignment || assignment.targetType !== SCREEN_SLOT_TARGET_TYPE) return null;
  const config = assignment.config ?? assignment.variantConfig;
  if (!isRecord(config) || !isRecord(config['module'])) return null;
  const screen = typeof config['screen'] === 'string' ? screenKey(config['screen']) : '';
  const slot = typeof config['slot'] === 'string' ? config['slot'].trim().toLowerCase() : '';
  const kind = config['module']['kind'] as ScreenSlotModuleKind;
  if (!screen || !slot || !(SCREEN_SLOT_MODULE_KINDS as readonly string[]).includes(kind)) return null;
  const id = typeof config['module']['id'] === 'string' ? config['module']['id'] : undefined;
  // A shown arm without a module is an arm nothing can draw: read as not assigned.
  if (kind !== 'none' && !id) return null;
  return {
    experimentId: assignment.experimentId,
    variantId: assignment.variantId,
    ...(assignment.variantName ? { variantName: assignment.variantName } : {}),
    screen,
    slot,
    module: { kind, ...(id ? { id } : {}) },
    moduleData: assignment.moduleData ?? null,
    holdout: kind === 'none' || assignment.holdout === true,
    assignment,
  };
}

/** The visitor's arm at one point of one screen, or null when no screen experiment owns it. */
export function screenSlotArmAt(
  assignments: readonly ExperimentAssignment[],
  screen: string | null | undefined,
  slot: string | null | undefined
): ScreenSlotArm | null {
  const wantedScreen = screenKey(screen);
  const wantedSlot = String(slot ?? '').trim().toLowerCase();
  if (!wantedScreen || !wantedSlot) return null;
  for (const assignment of assignments) {
    const arm = screenSlotArmOf(assignment);
    if (arm && arm.screen === wantedScreen && arm.slot === wantedSlot) return arm;
  }
  return null;
}

/** Every arm that owns a point on `screen`. */
export function screenSlotArmsOn(
  assignments: readonly ExperimentAssignment[],
  screen: string | null | undefined
): ScreenSlotArm[] {
  const wanted = screenKey(screen);
  if (!wanted) return [];
  const arms: ScreenSlotArm[] = [];
  for (const assignment of assignments) {
    const arm = screenSlotArmOf(assignment);
    if (arm && arm.screen === wanted) arms.push(arm);
  }
  return arms;
}

/**
 * The campaign a `campaign` arm draws, as a surface of the overlay: placed at
 * the arm's point whatever its own placement says, and with the PAGE half of its
 * targeting (the screens it was sent to) replaced by the experiment's — the
 * experiment owns the place, the campaign keeps every other rule (its schedule,
 * segments, audience, test mode, behaviour). Null when the arm is not a campaign
 * arm, the data did not arrive, or the type is one an app cannot put in a point.
 */
export function slotArmSurface(arm: ScreenSlotArm): Surface | null {
  if (arm.module.kind !== 'campaign') return null;
  const surface = normalizeSurface(arm.moduleData, 'campaign');
  if (!surface) return null;
  const placement = appWidgetPlacement(surface.type);
  if (!placement || placement.slot === 'none') return null;

  const targeting = normalizePageTargeting(surface.targeting);
  return {
    ...surface,
    targeting: { ...targeting, showOnAllPages: true, includeUrls: [], excludeUrls: [], pageTypes: undefined },
    placement: { ...surface.placement, slot: arm.slot },
    rawPlacement: { ...surface.rawPlacement, selector: appSlotSelector(arm.slot) },
    // The click is the experiment's click goal.
    experiment: { experimentId: arm.experimentId, variantId: arm.variantId },
  };
}

/**
 * The campaigns of a screen after its screen experiments: the native ones that
 * sit at a point an experiment owns are withheld (the point draws the arm), and
 * the arms' own campaigns are added. A campaign that is BOTH native at a claimed
 * point and the arm's campaign appears once, as the arm's.
 */
export function applyScreenSlotArms(surfaces: readonly Surface[], arms: readonly ScreenSlotArm[]): Surface[] {
  if (arms.length === 0) return [...surfaces];
  const claimed = new Set(arms.map((arm) => arm.slot));
  const armSurfaces = arms.map(slotArmSurface).filter((surface): surface is Surface => surface !== null);
  const armIds = new Set(armSurfaces.map((surface) => surface.id));
  const native = surfaces.filter(
    (surface) => !armIds.has(surface.id) && !(surface.placement.slot && claimed.has(surface.placement.slot))
  );
  return [...native, ...armSurfaces];
}

/** The strip an arm draws, as the summary every strip component reads; null when the data did not arrive. */
export function slotArmStrip(arm: ScreenSlotArm): RecommendationWidgetSummary | null {
  if (arm.module.kind !== 'recommendation' || !arm.module.id) return null;
  const data = isRecord(arm.moduleData) && isRecord(arm.moduleData['data']) ? arm.moduleData['data'] : arm.moduleData;
  if (!isRecord(data)) return null;
  return { ...data, id: typeof data['id'] === 'string' && data['id'] ? data['id'] : arm.module.id } as RecommendationWidgetSummary;
}

/** The enrichment rule an arm draws: its id and the placement name the app asks for it by. */
export function slotArmEnrichment(arm: ScreenSlotArm): { id: string; placementKey: string } | null {
  if (arm.module.kind !== 'enrichment' || !arm.module.id) return null;
  const data = arm.moduleData;
  const placementKey = isRecord(data) && typeof data['placementKey'] === 'string' ? data['placementKey'].trim() : '';
  return placementKey ? { id: arm.module.id, placementKey } : null;
}
