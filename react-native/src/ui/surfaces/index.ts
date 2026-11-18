import { CustomWidget } from './CustomWidget.js';

/**
 * React Native renderers, one per surface type.
 *
 * ## What they draw from
 *
 * The merchant authored colours, padding, copy and pictures in the dashboard, so
 * SOMETHING has to draw it: every renderer draws ONLY from the merchant's
 * `stylesJson` and content, translated by `../styles.ts` (the contract's table,
 * `../vendor/app-style.ts`) and read through the one content mapping
 * (`normalizeAppSurfaceContent`, applied by the SDK before a surface reaches
 * here). Nothing here invents a colour. An app that wants its own rendering
 * passes its own component through `renderers` on `<SelwiseSurfaces>` instead of
 * forking these.
 *
 * The files: `parts.ts` (the button, the close, a picture, the motions),
 * `widgets.ts` (the bars, the floating button, the counters, the countdown, the
 * goal bar), `card.ts` (the popup, the slide-in and the card they share),
 * `newsletter.ts`, `CustomWidget.ts` (the merchant's own HTML).
 */

export { CustomWidget };
export type { SurfaceRendererProps } from './types.js';
export { base, CloseButton, SurfaceButton, SurfaceImage, CLOSE_TARGET } from './parts.js';
export {
  AnnouncementBar,
  CountBadge,
  CountdownTimer,
  FloatingButton,
  GoalBar,
  StickyFooter,
  TOOLTIP_MS,
} from './widgets.js';
export { SlideIn, SurfaceCard, SurfaceModal, type SurfaceCardProps, type SurfaceModalProps } from './card.js';
export {
  Newsletter,
  newsletterConsent,
  newsletterConsentLines,
  type NewsletterConsent,
  type NewsletterProps,
} from './newsletter.js';

