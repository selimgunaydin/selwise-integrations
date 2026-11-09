'use strict';

/**
 * React Native renderers, one per surface type.
 *
 * ## Why these live in the plugin and not in the SDK
 *
 * The SDK ships no UI on purpose: an App Maker app owns its own themed
 * components, and a Selwise-branded banner would look foreign beside them. But
 * a campaign still has to appear on screen, and the merchant authored its
 * colours, padding and copy in the dashboard — so SOMETHING has to draw it.
 *
 * The plugin is the right place: it is Akinon-specific, it can read the app's
 * theme, and a merchant who wants their own rendering passes their own
 * component through `renderers` instead of forking the SDK.
 *
 * Every renderer draws ONLY from the merchant's `stylesJson`, translated by
 * `../styles.js`. Nothing here invents a colour.
 */

const React = require('react');
const {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} = require('react-native');

const {
  containerStyle,
  textStyle,
  buttonStyle,
  overlayStyle,
  closeGlyphColor,
  px,
  color,
} = require('../styles.js');
const CustomWidget = require('./CustomWidget.js');
const { goalBarLook } = require('../goal-bar.js');

const h = React.createElement;

/** The merchant's button, or nothing when they wrote no label. */
function SurfaceButton(props) {
  const { styles, label, onPress } = props;
  if (!label) return null;

  const button = buttonStyle(styles);
  return h(
    Pressable,
    {
      onPress: onPress,
      accessibilityRole: 'button',
      style: [base.button, button.container],
    },
    h(Text, { style: button.label, numberOfLines: 1 }, label)
  );
}

/**
 * The close affordance. Only drawn when the merchant enabled it.
 *
 * `onSurface` is not cosmetic. A bar or a footer paints its own brand-coloured
 * ground, so white is the readable default there; a modal card is white, and
 * the same default made the × invisible — a popup the visitor could not
 * dismiss at all. The per-type style allow-list does not offer
 * `closeButtonColor` on every type, so the DEFAULT has to be right rather than
 * something a merchant can correct.
 */
function CloseButton(props) {
  const { styles, onPress, onSurface } = props;
  if (styles && styles.showCloseButton === false) return null;

  return h(
    Pressable,
    {
      onPress: onPress,
      accessibilityRole: 'button',
      accessibilityLabel: 'Kapat',
      // Bigger than the glyph: a 12pt × is below every touch-target guideline.
      hitSlop: 12,
      style: onSurface ? base.closeCorner : base.close,
    },
    h(
      Text,
      { style: [base.closeGlyph, { color: closeGlyphColor(styles, { onSurface: onSurface }) }] },
      '×'
    )
  );
}

function AnnouncementBar(props) {
  const { surface, onPress, onDismiss } = props;
  const styles = surface.styles;
  const content = surface.content;

  return h(
    View,
    { style: [base.bar, containerStyle(styles)] },
    h(
      Text,
      { style: [base.barText, textStyle(styles, { defaultSize: 13 })], numberOfLines: 2 },
      String(content.text || '')
    ),
    h(SurfaceButton, { styles: styles, label: content.buttonText, onPress: onPress }),
    h(CloseButton, { styles: styles, onPress: onDismiss })
  );
}

function StickyFooter(props) {
  const { surface, onPress, onDismiss } = props;
  const styles = surface.styles;
  const content = surface.content;

  return h(
    View,
    { style: [base.footer, containerStyle(styles)] },
    h(
      View,
      { style: base.footerText },
      content.title
        ? h(
            Text,
            {
              style: textStyle(styles, { sizeKey: 'titleFontSize', weightKey: 'titleFontWeight', defaultSize: 15 }),
              numberOfLines: 1,
            },
            String(content.title)
          )
        : null,
      content.text
        ? h(
            Text,
            { style: textStyle(styles, { sizeKey: 'textFontSize', defaultSize: 13 }), numberOfLines: 2 },
            String(content.text)
          )
        : null
    ),
    h(SurfaceButton, { styles: styles, label: content.buttonText, onPress: onPress }),
    h(CloseButton, { styles: styles, onPress: onDismiss })
  );
}

/**
 * The round action button.
 *
 * `borderRadius: '50%'` needs the element's own size, which is why the size is
 * resolved first and handed to the translator.
 */
function FloatingButton(props) {
  const { surface, onPress } = props;
  const styles = surface.styles;
  const size = px(styles.size, 56);
  const offsetX = px(styles.offsetX, 16);
  // The merchant's offset is from the bottom of the screen; the home indicator
  // sits in that space, so the inset is added rather than replacing it.
  const offsetY = px(styles.offsetY, 16) + (props.bottomInset || 0);

  return h(
    Pressable,
    {
      onPress: onPress,
      accessibilityRole: 'button',
      accessibilityLabel: String(surface.content.text || 'Selwise'),
      style: [
        base.floating,
        { width: size, height: size, right: offsetX, bottom: offsetY },
        containerStyle(styles, { sizeForPercent: size }),
      ],
    },
    h(
      Text,
      { style: [base.floatingLabel, textStyle(styles, { defaultSize: 20 })] },
      String(surface.content.iconType === 'chat' ? '💬' : surface.content.text || '★')
    )
  );
}

/** cart_count and product_view_count: a number with a label. */
function CountBadge(props) {
  const { surface, value } = props;
  const styles = surface.styles;
  const content = surface.content;
  const minCount = px(content.minCount, 0) || 0;

  // Below the merchant's threshold the badge is noise ("1 person viewed this").
  if (Number(value || 0) < minCount) return null;

  const template = String(content.customText || '');
  const label = template.includes('{count}')
    ? template.replace('{count}', String(value))
    : template || String(value);

  return h(
    View,
    { style: [base.badge, containerStyle(styles)] },
    content.showIcon === true
      ? h(Text, { style: { color: color(styles.iconColor) || '#f59e0b' } }, '🔥')
      : null,
    h(
      Text,
      { style: [textStyle(styles, { defaultSize: 13 }), { color: color(styles.counterColor) || color(styles.textColor) || '#1a1a1a' }] },
      label
    )
  );
}

/** The countdown. `remaining` is computed by the caller and re-rendered by it. */
function CountdownTimer(props) {
  const { surface, remaining } = props;
  const styles = surface.styles;
  const content = surface.content;
  const separator = styles.separatorStyle === 'comma' ? ', ' : ':';

  return h(
    View,
    { style: [base.timer, containerStyle(styles)] },
    content.title
      ? h(
          Text,
          { style: textStyle(styles, { sizeKey: 'titleFontSize', weightKey: 'titleFontWeight', defaultSize: 16 }) },
          String(content.title)
        )
      : null,
    h(
      Text,
      {
        style: [
          textStyle(styles, { sizeKey: 'timerFontSize', weightKey: 'timerFontWeight', defaultSize: 20 }),
          { color: color(styles.textColor) || '#ffffff' },
        ],
      },
      remaining ? remaining.join(separator) : '—'
    )
  );
}

/**
 * The goal bar: "₺120 more for free shipping", and a bar that fills.
 *
 * Draws the VIEW it is handed — the SDK's `resolveGoalBar` for the current
 * cart, re-resolved by the overlay on every `onCartChange`. Nothing here
 * decides what the bar says, and a view that is not visible draws nothing (an
 * unmeasured cart, an empty one the merchant did not ask to show). The button
 * is the view's: its words and link change with the state, so `onPress` is
 * bound by the overlay to `view.buttonUrl`, not to the content's.
 */
function GoalBar(props) {
  const { surface, view, onPress, onDismiss } = props;
  if (!view || !view.visible) return null;

  const styles = surface.styles || {};
  const look = goalBarLook(surface, view);

  return h(
    View,
    { style: [base.goalBar, containerStyle(styles)], accessibilityLiveRegion: 'polite' },
    h(
      View,
      { style: base.bar },
      h(
        Text,
        { style: [base.barText, textStyle(styles, { defaultSize: 14 })], numberOfLines: 2 },
        String(view.text || '')
      ),
      h(SurfaceButton, { styles: look.buttonStyles, label: view.buttonText, onPress: onPress }),
      look.showClose ? h(CloseButton, { styles: styles, onPress: onDismiss }) : null
    ),
    look.showBar
      ? h(
          View,
          {
            style: [
              base.goalTrack,
              { height: look.barHeight, borderRadius: look.barHeight / 2 },
              look.trackColor ? { backgroundColor: look.trackColor } : null,
            ],
            accessibilityRole: 'progressbar',
            accessibilityValue: { min: 0, max: 100, now: look.percent },
          },
          h(View, {
            style: [
              base.goalFill,
              { width: look.percent + '%', borderRadius: look.barHeight / 2 },
              look.fillColor ? { backgroundColor: look.fillColor } : null,
            ],
          }),
          look.markers.map((left, index) =>
            h(View, {
              key: 'marker-' + index,
              style: [
                base.goalMarker,
                { left: left + '%' },
                look.markerColor ? { backgroundColor: look.markerColor } : null,
              ],
            })
          )
        )
      : null
  );
}

/**
 * A surface that takes over the screen: slide_in, exit_intent_popup, and the
 * newsletter form.
 *
 * `Modal` rather than an absolutely positioned view, so it sits above the app's
 * own navigation and the Android back button closes it — which is the gesture a
 * visitor reaches for and the one an overlay silently ignores.
 */
function SurfaceModal(props) {
  const { surface, onPress, onDismiss, children } = props;
  const styles = surface.styles;
  const content = surface.content;
  const position = surface.placement.position;

  return h(
    Modal,
    { visible: true, transparent: true, animationType: 'fade', onRequestClose: onDismiss },
    h(
      View,
      { style: [base.modalRoot, position === 'bottom' ? base.modalBottom : base.modalCenter] },
      h(Pressable, { style: [StyleSheet.absoluteFill, overlayStyle(styles)], onPress: onDismiss }),
      h(
        View,
        { style: [base.modalCard, containerStyle(styles)] },
        // Absolutely positioned: the card is a column, so an in-flow × became
        // its own full-width row above the title instead of sitting in the
        // corner the title's `paddingRight` was already reserving for it.
        h(CloseButton, { styles: styles, onPress: onDismiss, onSurface: true }),
        content.title
          ? h(
              Text,
              {
                style: [
                  base.modalTitle,
                  textStyle(styles, { sizeKey: 'titleFontSize', weightKey: 'titleFontWeight', defaultSize: 18 }),
                ],
              },
              String(content.title)
            )
          : null,
        content.text
          ? h(
              Text,
              { style: [base.modalText, textStyle(styles, { sizeKey: 'textFontSize', defaultSize: 14 })] },
              String(content.text)
            )
          : null,
        children || null,
        h(SurfaceButton, { styles: styles, label: content.buttonText, onPress: onPress })
      )
    )
  );
}

/**
 * The newsletter form.
 *
 * State lives here rather than in the overlay: the overlay re-renders on every
 * navigation, and a half-typed email must survive that.
 */
function Newsletter(props) {
  const { surface, onSubmit, onDismiss } = props;
  const styles = surface.styles;
  const content = surface.content;

  const [email, setEmail] = React.useState('');
  const [state, setState] = React.useState('idle');

  const submit = async () => {
    if (!email.includes('@') || state === 'sending') return;
    setState('sending');
    try {
      await onSubmit(email);
      setState('done');
    } catch (error) {
      setState('idle');
    }
  };

  const body = state === 'done'
    ? h(
        Text,
        { style: [base.modalText, textStyle(styles, { defaultSize: 14 })] },
        String(content.successText || 'Teşekkürler!')
      )
    : h(
        View,
        { style: base.formRow },
        h(TextInput, {
          value: email,
          onChangeText: setEmail,
          placeholder: String(content.placeholder || 'E-posta adresiniz'),
          placeholderTextColor: '#9ca3af',
          keyboardType: 'email-address',
          autoCapitalize: 'none',
          autoCorrect: false,
          editable: state !== 'sending',
          style: [
            base.input,
            {
              backgroundColor: color(styles.inputBackgroundColor) || '#ffffff',
              borderColor: color(styles.inputBorderColor) || '#d9d9d9',
              color: color(styles.inputTextColor) || '#1a1a1a',
            },
          ],
        }),
        state === 'sending' ? h(ActivityIndicator, { style: base.formSpinner }) : null
      );

  return h(
    SurfaceModal,
    {
      surface: surface,
      onDismiss: onDismiss,
      onPress: state === 'done' ? onDismiss : submit,
      children: body,
    }
  );
}

const base = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%' },
  barText: { flex: 1 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 10, width: '100%' },
  footerText: { flex: 1, gap: 2 },
  button: { paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center', justifyContent: 'center' },
  close: { paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  closeCorner: {
    position: 'absolute',
    top: 8,
    right: 10,
    zIndex: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  closeGlyph: { fontSize: 20, lineHeight: 22 },
  floating: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  floatingLabel: { textAlign: 'center' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  timer: { alignItems: 'center', gap: 4, width: '100%' },
  goalBar: { width: '100%', gap: 8 },
  goalTrack: { width: '100%', overflow: 'hidden', position: 'relative' },
  goalFill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  // The browser's tick: the text colour at a quarter strength.
  goalMarker: { position: 'absolute', top: 0, bottom: 0, width: 2, marginLeft: -1, opacity: 0.25 },
  modalRoot: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCenter: { justifyContent: 'center' },
  modalBottom: { justifyContent: 'flex-end' },
  modalCard: { width: '100%', maxWidth: 420, gap: 10, padding: 20, borderRadius: 12, backgroundColor: '#ffffff' },
  modalTitle: { paddingRight: 24 },
  modalText: {},
  formRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  formSpinner: { marginLeft: 4 },
});

module.exports = {
  CustomWidget,
  AnnouncementBar,
  StickyFooter,
  FloatingButton,
  CountBadge,
  CountdownTimer,
  GoalBar,
  SurfaceModal,
  Newsletter,
  SurfaceButton,
  CloseButton,
  base,
};
