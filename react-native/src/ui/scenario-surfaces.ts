import type { Surface } from '../core/surfaces.js';
import { isModal } from './triggers.js';

type DockSurface = Pick<Surface, 'type'> & { id?: string; placement?: Partial<Surface['placement']> };

/**
 * Where a surface sits, as far as two of them competing for it is concerned — the
 * overlay's own grouping (`top`, `bottom`, `floating`, every modal in front of the
 * shopper). Two bars docked at the top overlap and two popups open at once, so a
 * group holds one.
 */
export function dockOf(surface: DockSurface): 'modal' | 'floating' | 'bottom' | 'top' {
  if (isModal(surface.type)) return 'modal';
  if (surface.type === 'floating_button') return 'floating';
  if (surface.type === 'sticky_footer' || (surface.placement && surface.placement.position === 'bottom')) {
    return 'bottom';
  }
  return 'top';
}

/**
 * A scenario's surfaces laid over the screen's own.
 *
 * The scenario step chose THIS shopper for THIS message, so it takes its dock: a
 * surface the screen would have drawn in the same dock is held back while the
 * scenario's is on screen (it comes back when the claim is answered and the list
 * is built again). Two scenario surfaces for one dock: the first draws, the second
 * waits — it is neither drawn nor acknowledged, so it is offered again.
 *
 * Pure and order-stable, so it is tested without React Native.
 */
export function mergeScenarioSurfaces<S extends DockSurface>(
  base: S[] | null | undefined,
  scenarioSurfaces: ReadonlyArray<{ surface?: S } | null | undefined> | null | undefined
): S[] {
  const own: S[] = Array.isArray(base) ? base : [];
  const claims = Array.isArray(scenarioSurfaces) ? scenarioSurfaces : [];
  if (claims.length === 0) return own;

  const taken = new Set<string>();
  const chosen: S[] = [];
  for (const claim of claims) {
    const surface = claim && claim.surface;
    if (!surface) continue;
    const dock = dockOf(surface);
    if (taken.has(dock)) continue;
    taken.add(dock);
    chosen.push(surface);
  }
  return own.filter((surface) => !taken.has(dockOf(surface))).concat(chosen);
}
