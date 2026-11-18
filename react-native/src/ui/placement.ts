import { appScreenOfUrl } from '../vendor/app-surfaces.js';
import { appWidgetPlacement, type AppPlacementMode } from '../vendor/app-placement.js';
import { LEGACY_INTERRUPTING_TYPE_ALIASES } from '../vendor/interrupting-types.js';
import type { Surface } from '../core/surfaces.js';

/**
 * Where an app draws a campaign (`APP_WIDGET_PLACEMENT`, roadmap K8).
 *
 * Plain Node, like `triggers.ts`, so it is tested without React Native.
 *
 * A website places a campaign with a position or a CSS selector; an app has no
 * document, so a surface is drawn one of four ways — a bar docked to the top or
 * bottom of the screen, a button floating in a corner, a modal (centred, or
 * rising from or sliding in from an edge) or a named point the app mounted
 * (`<SelwiseSlot>`). The type decides which; the merchant's position and point
 * choose within it, and the selector, the insert position and the platform
 * notes of the web form do not exist here.
 *
 * `core/surfaces.ts` has already put the stored position in the type's own list
 * and read the point off the stored selector (`placement.slot`), so what is here
 * only says what a drawn surface IS.
 */

export type SurfaceMode = AppPlacementMode;

export interface SurfaceLayout {
  mode: SurfaceMode;
  /** The position inside the mode: a dock's `top` / `bottom`, a corner, a modal's `center` / `bottom` / `right` / `left`. Empty for a point. */
  position: string;
  /** The point the surface is drawn at, or null. */
  slot: string | null;
}

export function layoutOf(surface: Pick<Surface, 'type' | 'placement'>): SurfaceLayout {
  const { slot, position } = surface.placement;
  if (slot) return { mode: 'slot', position: '', slot };
  const known = appWidgetPlacement(surface.type);
  if (known) return { mode: known.mode, position: position || known.defaultPosition, slot: null };
  // The legacy types the overlay still draws that the placement table has no row for: centred modals.
  if ((LEGACY_INTERRUPTING_TYPE_ALIASES as readonly string[]).includes(surface.type)) return { mode: 'modal', position: position || 'center', slot: null };
  return { mode: 'dock', position: position || 'top', slot: null };
}

/**
 * A surface that takes over the screen and waits for its trigger. A newsletter
 * the merchant put in a point sits in the screen's flow and has no trigger, as
 * the web's inline newsletter card has none.
 */
export function isModalSurface(surface: Pick<Surface, 'type' | 'placement'>): boolean {
  return layoutOf(surface).mode === 'modal';
}

/** True when the surface slides in from an edge (the type's table says so). */
export function slidesIn(type: string): boolean {
  return appWidgetPlacement(type)?.animated === true;
}

/**
 * Whether `slot` is one of the points the screen at `pageUrl` has. A point is
 * drawn only on its own screen: a screen that stays mounted behind another keeps
 * its points mounted, and a surface for the screen in front must not be drawn
 * (and counted) in one nobody can see.
 */
export function slotBelongsToScreen(slot: string, pageUrl: string | null | undefined): boolean {
  return appScreenOfUrl(pageUrl)?.slots.includes(slot) ?? false;
}

