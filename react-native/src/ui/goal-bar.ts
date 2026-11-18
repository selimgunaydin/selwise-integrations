import { HIDDEN_GOAL_BAR_VIEW } from '../core/goal-bar.js';
import type { Surface } from '../core/surfaces.js';
import type { GoalBarView } from '../vendor/dynamic-content.js';
import { color, px } from './styles.js';

/**
 * The goal bar's decisions that are not drawing: which view each bar shows,
 * and which `goal_reached` a cart change earns.
 *
 * Plain Node, like `countdown.ts` and `visibility.ts`, so it can be tested
 * without React Native. WHAT a bar says is never decided here: the client's
 * `resolveGoalBar` is the same resolver the browser widget and the dashboard
 * preview call, and `goalStepsCrossed` is the SDK's statement of the "crossed
 * while visible" rule. Both are passed in.
 */

type GoalSurface = Pick<Surface, 'id' | 'type'> & Partial<Pick<Surface, 'content' | 'styles'>>;

/** What a goal bar that is not drawn looks like. */
export const HIDDEN_VIEW: GoalBarView = HIDDEN_GOAL_BAR_VIEW;

/**
 * One view per goal bar on screen, keyed by surface id. A resolver that throws
 * hides its bar: there is no honest sentence to draw without it.
 */
export function goalBarViews<S extends GoalSurface>(
  surfaces: readonly S[] | null | undefined,
  resolve: ((surface: S) => GoalBarView | null | undefined) | null | undefined
): Record<string, GoalBarView> {
  const views: Record<string, GoalBarView> = {};
  for (const surface of surfaces || []) {
    if (!surface || surface.type !== 'goal_bar') continue;
    let view: GoalBarView = HIDDEN_VIEW;
    if (typeof resolve === 'function') {
      try {
        view = resolve(surface) || HIDDEN_VIEW;
      } catch {
        view = HIDDEN_VIEW;
      }
    }
    views[surface.id] = view;
  }
  return views;
}

/**
 * The `goal_reached` reports a fresh set of views earns, and the views to
 * remember for the next comparison.
 *
 * Each bar is compared with ITS OWN previous view, and only while it stays on
 * screen: a bar that left (another screen, dismissed) is forgotten, so coming
 * back to it starts fresh and a step already behind the shopper is not
 * reported — the same rule the browser widget keeps per page.
 */
export function goalReachedReports<S extends GoalSurface>(
  previousViews: Record<string, GoalBarView> | null | undefined,
  surfaces: readonly S[] | null | undefined,
  views: Record<string, GoalBarView>,
  crossed: ((previous: GoalBarView | undefined, next: GoalBarView) => number[]) | null | undefined
): { reports: Array<{ surface: S; step: number }>; remembered: Record<string, GoalBarView> } {
  const reports: Array<{ surface: S; step: number }> = [];
  const remembered: Record<string, GoalBarView> = {};
  const previous = previousViews || {};

  for (const surface of surfaces || []) {
    if (!surface || surface.type !== 'goal_bar') continue;
    const next = views[surface.id];
    if (!next) continue;
    if (typeof crossed === 'function') {
      for (const step of crossed(previous[surface.id], next) || []) {
        reports.push({ surface, step });
      }
    }
    remembered[surface.id] = next;
  }

  return { reports, remembered };
}

function isOff(value: unknown): boolean {
  return value === false || value === 'false';
}

export interface GoalBarLook {
  showBar: boolean;
  showClose: boolean;
  barHeight: number;
  trackColor: string | null;
  markerColor: string | null;
  fillColor: string | null;
  percent: number;
  markers: number[];
  buttonStyles: Record<string, unknown>;
}

/**
 * The bar's colours and sizes, from the merchant's `stylesJson` — the same keys
 * and the same fallbacks as the browser renderer: the button takes the text
 * colour when no button colour is set, and the completed fill takes the fill
 * colour when no completion colour is.
 */
export function goalBarLook(surface: Partial<GoalSurface> | null | undefined, view: GoalBarView | null | undefined): GoalBarLook {
  const styles = (surface && surface.styles) || {};
  const content = (surface && surface.content) || {};
  const complete = Boolean(view && view.progress && view.progress.complete);
  const fill = color(styles['barFillColor']);

  return {
    showBar: !isOff(content['showBar']) && Boolean(view && view.progress),
    showClose: styles['showCloseButton'] === true,
    barHeight: px(styles['barHeight'], 6),
    trackColor: color(styles['barTrackColor']),
    markerColor: color(styles['textColor']),
    fillColor: complete ? color(styles['barCompleteColor']) || fill : fill,
    percent: view && view.progress ? Math.max(0, Math.min(100, Number(view.progress.percent) || 0)) : 0,
    // Every step but the last gets a tick: the last IS the end of the bar.
    markers: view && view.progress && Array.isArray(view.progress.markers) ? view.progress.markers.slice(0, -1) : [],
    buttonStyles: Object.assign({}, styles, {
      buttonColor: styles['buttonColor'] || styles['textColor'],
      buttonTextColor: styles['buttonTextColor'] || styles['backgroundColor'],
    }),
  };
}
