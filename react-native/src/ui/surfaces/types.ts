import type { Surface } from '../../core/surfaces.js';

/** What every structured renderer is handed. */
export interface SurfaceRendererProps {
  surface: Surface;
  onPress: () => void;
  onDismiss: () => void;
}

export type Content = Record<string, unknown>;

export const contentOf = (surface: Surface): Content => surface.content || {};
export const stylesOf = (surface: Surface): Content => surface.styles || {};
