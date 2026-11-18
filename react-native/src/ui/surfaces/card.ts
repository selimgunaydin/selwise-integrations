import { createElement as h, type ReactElement, type ReactNode } from 'react';
import { Animated, Modal, Pressable, StyleSheet, View, type TextStyle, type ViewStyle } from 'react-native';
import { SelwiseText as Text, useSafeAreaInsets } from '../host-hooks.js';
import { imageLayout } from '../image-layout.js';
import { entranceOf } from '../motion.js';
import { layoutOf } from '../placement.js';
import { containerStyle, overlayStyle, px, textStyle } from '../styles.js';
import { CloseButton, SurfaceButton, SurfaceImage, useEntrance } from './parts.js';
import { pickId } from '../pick-ids.js';
import { contentOf, stylesOf, type SurfaceRendererProps } from './types.js';

/**
 * The card a popup, a slide-in and a newsletter are drawn on: the merchant's
 * words, picture and button as the dashboard designed them, and the same card
 * whether it floats in a window, slides in from an edge or sits in a point on a
 * screen.
 */

/** What each type does when the merchant never touched a size or a spacing (the web's own defaults). */
interface CardDefaults {
  padding: number;
  titleSize: number;
  titleWeight: TextStyle['fontWeight'];
  textSize: number;
  /** The gap between the blocks of the card: the picture, the words, the button. */
  gap: number;
  alignment: 'left' | 'center';
  maxWidth: number;
}

function defaultsOf(type: string): CardDefaults {
  if (type === 'slide_in') {
    return { padding: 16, titleSize: 18, titleWeight: '600', textSize: 14, gap: 8, alignment: 'left', maxWidth: 320 };
  }
  if (type === 'newsletter') {
    return { padding: 16, titleSize: 20, titleWeight: '700', textSize: 14, gap: 10, alignment: 'left', maxWidth: 360 };
  }
  return { padding: 24, titleSize: 24, titleWeight: '700', textSize: 16, gap: 16, alignment: 'center', maxWidth: 480 };
}

/** The card's own style without its padding, and the padding apart: a picture may bleed past the padding, so the card holds none. */
function splitPadding(style: ViewStyle): { outer: ViewStyle; padding: ViewStyle } {
  const outer: Record<string, unknown> = {};
  const padding: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(style)) {
    (key.startsWith('padding') ? padding : outer)[key] = value;
  }
  return { outer: outer as ViewStyle, padding: padding as ViewStyle };
}

export interface SurfaceCardProps extends SurfaceRendererProps {
  /** Drawn between the words and the button (the newsletter's form). */
  children?: ReactNode;
  /** The picture's own link was tapped (`imageLinkUrl`). */
  onImagePress?: (url: string) => void;
  /** The button's label, when it is not the content's (the newsletter's working and finished states). */
  buttonLabel?: unknown;
  buttonDisabled?: boolean;
  /** The words' style keys, when the type has its own (the newsletter's headline). */
  titleKeys?: { sizeKey: string; weightKey: string };
}

/** The card, with no window and no motion around it. */
export function SurfaceCard(props: SurfaceCardProps): ReactElement {
  const { surface, onPress, onDismiss, onImagePress, children, buttonLabel, buttonDisabled, titleKeys } = props;
  const styles = stylesOf(surface);
  const content = contentOf(surface);
  const d = defaultsOf(surface.type);

  const { outer, padding } = splitPadding(containerStyle(styles));
  const bodyPadding = Object.keys(padding).length > 0 ? padding : { padding: d.padding };
  const alignment = styles['contentAlignment'] === 'left' || styles['contentAlignment'] === 'right' || styles['contentAlignment'] === 'center'
    ? (styles['contentAlignment'] as 'left' | 'center' | 'right')
    : d.alignment;
  const alignItems = alignment === 'center' ? 'center' : alignment === 'right' ? 'flex-end' : 'flex-start';
  const gap = px(styles['imageSpacing'], d.gap);

  const layout = imageLayout(surface.type, styles);
  const imageLink = typeof content['imageLinkUrl'] === 'string' ? content['imageLinkUrl'].trim() : '';
  const picture = content['imageUrl']
    ? h(SurfaceImage, { uri: content['imageUrl'], layout })
    : null;
  const pictureNode =
    picture && imageLink && onImagePress
      ? h(Pressable, { onPress: () => onImagePress(imageLink), accessibilityRole: 'link', style: layout.horizontal ? card.sideImage : null }, picture)
      : picture && layout.horizontal
        ? h(View, { style: card.sideImage }, picture)
        : picture;

  const keys = titleKeys ?? { sizeKey: 'titleFontSize', weightKey: 'titleFontWeight' };
  const title = content['title']
    ? h(
        Text,
        {
          testID: pickId('title', 'title'),
          style: [
            { textAlign: alignment, fontWeight: d.titleWeight },
            textStyle(styles, { ...keys, defaultSize: d.titleSize }),
          ],
        },
        String(content['title'])
      )
    : null;
  const text = content['text']
    ? h(
        Text,
        {
          testID: pickId('text', 'text'),
          style: [
            { textAlign: alignment, ...(surface.type === 'slide_in' ? { opacity: 0.8 } : {}) },
            textStyle(styles, { sizeKey: 'textFontSize', defaultSize: d.textSize }),
          ],
        },
        String(content['text'])
      )
    : null;
  const label = buttonLabel !== undefined ? buttonLabel : content['buttonText'];
  const button = h(SurfaceButton, {
    styles,
    label,
    onPress,
    fullWidthDefault: true,
    ...(buttonDisabled ? { disabled: true } : {}),
  });

  // Words, then whatever the type draws between them and the button, then the button.
  const hasWords = Boolean(title || text || children || label);
  const words = hasWords
    ? h(View, { style: [card.words, { gap: surface.type === 'slide_in' ? d.gap : gap, alignItems }] }, title, text, children ?? null, button)
    : null;

  const topPicture = pictureNode && !layout.horizontal && layout.position === 'top' ? pictureNode : null;
  const bottomPicture = pictureNode && !layout.horizontal && layout.position === 'bottom' ? pictureNode : null;

  const body = layout.horizontal
    ? h(
        View,
        { style: [bodyPadding, { flexDirection: layout.position === 'right' ? 'row-reverse' : 'row', gap, alignItems: 'stretch' }] },
        pictureNode,
        words
      )
    : h(
        View,
        { style: [bodyPadding, { gap: surface.type === 'slide_in' ? layout.spacing : gap }] },
        layout.bleed ? null : topPicture,
        words,
        layout.bleed ? null : bottomPicture
      );

  return h(
    View,
    { testID: pickId('container'), style: [card.card, { maxWidth: d.maxWidth }, outer] },
    // Absolutely positioned: the card is a column, so an in-flow × would become
    // its own full-width row above the title.
    h(CloseButton, { styles, onPress: onDismiss, onSurface: true }),
    layout.bleed ? topPicture : null,
    body,
    layout.bleed ? bottomPicture : null
  );
}

export interface SurfaceModalProps extends SurfaceCardProps {
  /** A tap on the scrim closes the surface (recorded as a close). The web popup does; the newsletter does not. */
  dismissOnBackdrop?: boolean;
}

/**
 * A surface that takes over the screen: the exit-intent popup and the newsletter.
 *
 * `Modal` rather than an absolutely positioned view, so it sits above the app's
 * own navigation and the Android back button closes it — which is the gesture a
 * visitor reaches for and the one an overlay silently ignores. Centred, or
 * risen from the bottom edge, as the merchant's position says; it arrives as
 * the type's `animation` says (`entranceOf`).
 *
 * The scrim closes the surface on the web's popup and not on the newsletter
 * (there is no overlay on the web's newsletter card, and a stray tap must not
 * throw away a half-typed address), so `dismissOnBackdrop` is the type's choice.
 */
export function SurfaceModal(props: SurfaceModalProps): ReactElement {
  const { surface, onDismiss, dismissOnBackdrop } = props;
  const layout = layoutOf(surface);
  const insets = useSafeAreaInsets();
  const entrance = useEntrance(entranceOf(surface.type, layout.position, surface.styles));
  const atBottom = layout.position === 'bottom';
  const scrim = [StyleSheet.absoluteFill, overlayStyle(stylesOf(surface))];

  return h(
    Modal,
    { visible: true, transparent: true, animationType: 'none', onRequestClose: onDismiss },
    h(
      View,
      {
        style: [
          card.root,
          atBottom ? card.rootBottom : card.rootCenter,
          atBottom ? { paddingBottom: 20 + insets.bottom } : null,
        ],
      },
      dismissOnBackdrop === false
        ? h(View, { style: scrim })
        : h(Pressable, { style: scrim, onPress: onDismiss, accessibilityLabel: 'Kapat' }),
      h(Animated.View, { style: [card.window, entrance] }, h(SurfaceCard, props))
    )
  );
}

/**
 * The slide-in: a card that comes in from the edge its position names and
 * stays, with no scrim — the screen behind it stays the visitor's, as the web's
 * slide-in leaves the page. It is the overlay's to mount (a layer above the
 * screen), so a tap outside it reaches the app.
 */
export function SlideIn(props: SurfaceCardProps & { bottomInset?: number }): ReactElement {
  const { surface, bottomInset } = props;
  const styles = stylesOf(surface);
  const layout = layoutOf(surface);
  const entrance = useEntrance(entranceOf(surface.type, layout.position, styles));
  const offsetX = px(styles['offsetX'], 16);
  const offsetY = px(styles['offsetY'], 16) + (bottomInset ?? 0);
  const width = px(styles['width'], 320);

  const place: ViewStyle =
    layout.position === 'bottom'
      ? { bottom: offsetY, left: offsetX, right: offsetX, alignItems: 'center' }
      : layout.position === 'left'
        ? { bottom: offsetY, left: offsetX }
        : { bottom: offsetY, right: offsetX };

  return h(
    Animated.View,
    { style: [card.slide, place, entrance], pointerEvents: 'box-none' },
    h(View, { style: { width, maxWidth: '100%' } }, h(SurfaceCard, props))
  );
}

const card = StyleSheet.create({
  card: { width: '100%', backgroundColor: '#ffffff', overflow: 'hidden', borderRadius: 12 },
  words: { width: '100%' },
  sideImage: { flexShrink: 0 },
  root: { flex: 1, alignItems: 'center', padding: 20 },
  rootCenter: { justifyContent: 'center' },
  rootBottom: { justifyContent: 'flex-end' },
  window: { width: '100%', alignItems: 'center' },
  slide: { position: 'absolute', zIndex: 9999 },
});
