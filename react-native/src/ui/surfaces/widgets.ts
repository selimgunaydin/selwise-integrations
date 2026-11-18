import { createElement as h, Fragment, useEffect, useRef, useState, type ReactElement } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { useSelwiseHost } from '../../react/context.js';
import { countdownUnitLabels, type GoalBarView } from '../../vendor/dynamic-content.js';
import { counterIconName, counterParts, counterTemplate, COUNTER_ICON_GLYPHS, countDuration, formatCount } from '../counter.js';
import { countdownSeparator, type CountdownUnits } from '../countdown.js';
import { goalBarLook } from '../goal-bar.js';
import { socialProofMinCount } from '../../vendor/social-proof.js';
import { SelwiseText as Text } from '../host-hooks.js';
import { appLanguage } from '../strings.js';
import { imageLayout } from '../image-layout.js';
import { layoutOf } from '../placement.js';
import { color, containerStyle, nativeStyle, nativeValues, px, textStyle } from '../styles.js';
import { base, CloseButton, SurfaceButton, SurfaceImage, useCountUp, usePulse } from './parts.js';
import { pickId } from '../pick-ids.js';
import { contentOf, stylesOf, type SurfaceRendererProps } from './types.js';

/**
 * The bars, the floating button, the two counters, the countdown and the goal
 * bar: every surface that is drawn in a dock, in a corner or in a point.
 */

/** `text - subtext` is one sentence on the web; a second line is not drawn when it only repeats the first. */
function distinctSubtext(text: unknown, subtext: unknown): string {
  const main = String(text ?? '').trim();
  const sub = String(subtext ?? '').trim();
  return sub && sub.toLowerCase() !== main.toLowerCase() ? sub : '';
}

export function AnnouncementBar(props: SurfaceRendererProps): ReactElement {
  const { surface, onPress, onDismiss } = props;
  const styles = stylesOf(surface);
  const content = contentOf(surface);
  const layout = imageLayout('announcement_bar', styles);

  return h(
    View,
    { testID: pickId('container'), style: [base.bar, containerStyle(styles)] },
    content['imageUrl']
      ? h(View, { style: [base.barImage, { marginRight: layout.spacing }] }, h(SurfaceImage, { uri: content['imageUrl'], layout }))
      : null,
    h(
      Text,
      { testID: pickId('text', 'text'), style: [base.barText, textStyle(styles, { defaultSize: 14 })], numberOfLines: 2 },
      String(content['text'] || '')
    ),
    h(SurfaceButton, { styles: styles, label: content['buttonText'], onPress: onPress }),
    h(CloseButton, { styles: styles, onPress: onDismiss })
  );
}

export function StickyFooter(props: SurfaceRendererProps): ReactElement {
  const { surface, onPress, onDismiss } = props;
  const styles = stylesOf(surface);
  const content = contentOf(surface);
  const subtext = distinctSubtext(content['text'], content['subtext']);

  return h(
    View,
    { testID: pickId('container'), style: [base.footer, containerStyle(styles)] },
    h(
      View,
      { style: base.footerText },
      content['text']
        ? h(Text, { testID: pickId('text', 'text'), style: textStyle(styles, { defaultSize: 14 }), numberOfLines: 2 }, String(content['text']))
        : null,
      subtext
        ? h(
            Text,
            { testID: pickId('text', 'subtext'), style: [textStyle(styles, { sizeKey: 'textFontSize', defaultSize: 12 }), { opacity: 0.8 }], numberOfLines: 2 },
            subtext
          )
        : null
    ),
    h(SurfaceButton, { styles: styles, label: content['buttonText'], onPress: onPress }),
    h(CloseButton, { styles: styles, onPress: onDismiss })
  );
}

/** How long the tooltip stays after the button appears, and after a long press. */
export const TOOLTIP_MS = 5000;

/**
 * The round action button, in the corner the merchant chose.
 *
 * `borderRadius: '50%'` needs the element's own size, which is why the size is
 * resolved first and handed to the translator. The offsets are from the screen's
 * edges; the status bar and the home indicator sit in that space, so the safe
 * area is added rather than replacing them. The label is the merchant's text (an
 * emoji is text), and the tooltip is their words next to it: shown for a few
 * seconds when the button appears — there is no hover on a phone — and again on
 * a long press.
 */
export function FloatingButton(props: SurfaceRendererProps & { insets?: { top: number; bottom: number } }): ReactElement {
  const { surface, onPress, insets } = props;
  const styles = stylesOf(surface);
  const content = contentOf(surface);
  const corner = layoutOf(surface).position || 'bottom-right';
  const top = corner.startsWith('top');
  const left = corner.endsWith('left');
  const size = px(styles['size'], 56);
  const offsetX = px(styles['offsetX'], 16);
  const offsetY = px(styles['offsetY'], 16) + (top ? insets?.top ?? 0 : insets?.bottom ?? 0);
  const pulse = usePulse(nativeValues('floating', styles)['pulse'] === true);
  const label = String(content['label'] ?? content['text'] ?? '').trim() || '★';
  const tooltipText = String(content['tooltip'] ?? '').trim();

  const [tipShown, setTipShown] = useState(true);
  const tipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showTip = () => {
    setTipShown(true);
    if (tipTimer.current) clearTimeout(tipTimer.current);
    tipTimer.current = setTimeout(() => setTipShown(false), TOOLTIP_MS);
  };
  useEffect(() => {
    showTip();
    return () => {
      if (tipTimer.current) clearTimeout(tipTimer.current);
    };
    // Shown once when the button appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tooltip = nativeStyle('tooltip', styles);
  const tip =
    tooltipText && tipShown
      ? h(
          View,
          { style: [base.tooltip, { backgroundColor: String(tooltip['backgroundColor'] ?? '#1a1a1a') }] },
          h(Text, { style: [base.tooltipText, { color: String(tooltip['color'] ?? '#ffffff') }] }, tooltipText)
        )
      : null;

  const circle = h(
    Pressable,
    {
      onPress,
      onLongPress: tooltipText ? showTip : undefined,
      accessibilityRole: 'button',
      accessibilityLabel: label,
      style: [base.floatingCircle, { width: size, height: size }, containerStyle(styles, { sizeForPercent: size })],
    },
    h(Text, { testID: pickId('text', 'label'), style: [base.floatingLabel, textStyle(styles, { defaultSize: 20 })] }, label)
  );

  return h(
    View,
    {
      pointerEvents: 'box-none',
      style: [
        base.floating,
        left ? { left: offsetX, alignItems: 'flex-start' } : { right: offsetX, alignItems: 'flex-end' },
        top ? { top: offsetY } : { bottom: offsetY },
        { gap: 8 },
      ],
    },
    // The tooltip sits on the screen side of the button: above a bottom corner's, below a top one's.
    top ? null : tip,
    h(Animated.View, { style: pulse }, circle),
    top ? tip : null
  );
}

/**
 * cart_count and product_view_count: a sentence with its number, an icon and an
 * optional urgency badge, in the point the merchant put it.
 *
 * The sentence is the web's: the merchant's custom text, else their template,
 * else the platform's, with `{count}` and `{timePeriod}` filled and the number
 * shortened and counted up as the web does. The icon is the dashboard's pick,
 * drawn by `host.renderIcon` or as a built-in glyph.
 */
export function CountBadge(
  props: SurfaceRendererProps & { value?: number; locale?: string | null }
): ReactElement | null {
  const { surface, value, locale } = props;
  const host = useSelwiseHost();
  const styles = stylesOf(surface);
  const content = contentOf(surface);
  const type = surface.type === 'cart_count' ? 'cart_count' : 'product_view_count';
  const counter = nativeValues('counter', styles);
  const count = Number(value || 0);
  const shown = useCountUp(count, counter['animate'] !== false, countDuration(counter['animationDuration']));

  // Below the merchant's threshold the badge is noise ("1 person viewed this").
  if (count < socialProofMinCount(content)) return null;

  const separator = typeof counter['thousandsSeparator'] === 'string' ? counter['thousandsSeparator'] : 'comma';
  const counterStyle = nativeStyle('counter', styles);
  const textColor = color(styles['textColor']);
  const countColor = (typeof counterStyle['color'] === 'string' ? counterStyle['color'] : null) ?? textColor ?? '#1a1a1a';
  const text = textStyle(styles, { defaultSize: 14 });
  const iconColor = color(styles['iconColor']) ?? textColor ?? '#1a1a1a';
  const iconName = counterIconName(type, content['iconType']);
  const showIcon = content['showIcon'] !== false && content['showIcon'] !== 'false';
  const iconSize = typeof text.fontSize === 'number' ? text.fontSize : 14;

  const parts = counterParts(counterTemplate(type, content, locale)).map((part, index) =>
    part === null
      ? h(Text, { key: 'n' + index, style: { fontWeight: '700', color: countColor } }, formatCount(shown, separator))
      : part
  );

  const badge = nativeValues('badge', styles);
  const badgeStyle = nativeStyle('badge', styles);

  return h(
    View,
    {
      style: [
        base.badge,
        containerStyle(styles),
        typeof counterStyle['alignSelf'] === 'string' ? { alignSelf: counterStyle['alignSelf'] as 'flex-start' | 'stretch' } : null,
      ],
    },
    badge['visible'] === true
      ? h(
          View,
          { style: [base.badgePill, { backgroundColor: String(badgeStyle['backgroundColor'] ?? '#dc2626') }] },
          h(Text, { style: [base.badgeText, { color: String(badgeStyle['color'] ?? '#ffffff') }] }, String(badge['text'] ?? 'HOT'))
        )
      : null,
    showIcon
      ? (host.renderIcon?.({ name: iconName, size: iconSize, color: iconColor }) ??
        h(Text, { style: { color: iconColor, fontSize: iconSize } }, COUNTER_ICON_GLYPHS[iconName] ?? ''))
      : null,
    h(Text, { testID: pickId('text', 'template'), style: text }, ...parts)
  );
}

/**
 * The countdown, as the web draws it: the four units, each with its label, in a
 * box of its own colour, between the merchant's title and sub-text, with the
 * button and the close. `units` is computed by the caller and re-rendered by it
 * every second; null (a deadline that has passed) draws nothing — an expired
 * countdown is not a surface.
 */
export function CountdownTimer(
  props: SurfaceRendererProps & { units?: CountdownUnits | null; locale?: string | null }
): ReactElement | null {
  const { surface, units, locale, onPress, onDismiss } = props;
  if (!units) return null;
  const styles = stylesOf(surface);
  const content = contentOf(surface);
  const timer = nativeStyle('timer', styles);
  const labels = countdownUnitLabels(appLanguage(locale));
  const separator = countdownSeparator(styles['separatorStyle']);
  const ink = String(timer['color'] ?? color(styles['textColor']) ?? '#ffffff');
  const digits = {
    color: ink,
    fontSize: typeof timer['fontSize'] === 'number' ? timer['fontSize'] : 20,
    fontWeight: (typeof timer['fontWeight'] === 'string' ? timer['fontWeight'] : '700') as '700',
  };
  const cells: Array<[keyof CountdownUnits, string]> = [
    ['days', labels.days],
    ['hours', labels.hours],
    ['minutes', labels.minutes],
    ['seconds', labels.seconds],
  ];

  return h(
    View,
    { testID: pickId('container'), style: [base.timer, containerStyle(styles)] },
    content['title']
      ? h(
          Text,
          { testID: pickId('title', 'title'), style: textStyle(styles, { sizeKey: 'titleFontSize', weightKey: 'titleFontWeight', defaultSize: 16 }) },
          String(content['title'])
        )
      : null,
    h(
      View,
      // The digits and their unit labels are what the end date and the daily cutoff set.
      { testID: pickId('text', 'endDate'), style: [base.timerBox, { backgroundColor: String(timer['backgroundColor'] ?? 'rgba(0,0,0,0.1)') }] },
      cells.map(([unit, label], index) =>
        h(
          Fragment,
          { key: unit },
          index > 0 && separator ? h(Text, { style: [base.timerSeparator, digits] }, separator) : null,
          h(
            View,
            { style: base.timerUnit },
            h(Text, { style: digits }, units[unit]),
            h(Text, { style: [base.timerLabel, { color: ink }] }, label)
          )
        )
      )
    ),
    content['subtext']
      ? h(Text, { testID: pickId('text', 'subtext'), style: textStyle(styles, { defaultSize: 14 }) }, String(content['subtext']))
      : null,
    h(SurfaceButton, { styles: styles, label: content['buttonText'], onPress: onPress }),
    h(CloseButton, { styles: styles, onPress: onDismiss })
  );
}

/**
 * The goal bar: "₺120 more for free shipping", and a bar that fills.
 *
 * Draws the VIEW it is handed — the client's `resolveGoalBar` for the current
 * cart, re-resolved by the overlay on every cart change. Nothing here decides
 * what the bar says, and a view that is not visible draws nothing (an
 * unmeasured cart, an empty one the merchant did not ask to show). The button
 * is the view's: its words and link change with the state, so `onPress` is
 * bound by the overlay to `view.buttonUrl`, not to the content's.
 */
export function GoalBar(props: SurfaceRendererProps & { view?: GoalBarView }): ReactElement | null {
  const { surface, view, onPress, onDismiss } = props;
  if (!view || !view.visible) return null;

  const styles = stylesOf(surface);
  const look = goalBarLook(surface, view);

  return h(
    View,
    { testID: pickId('container'), style: [base.goalBar, containerStyle(styles)], accessibilityLiveRegion: 'polite' },
    h(
      View,
      { style: base.bar },
      h(
        Text,
        // The words are the goal's steps' (`{goal.remaining}` and the state sentences).
        { testID: pickId('text'), style: [base.barText, textStyle(styles, { defaultSize: 14 })], numberOfLines: 2 },
        String(view.text || '')
      ),
      h(SurfaceButton, { styles: look.buttonStyles, label: view.buttonText, onPress: onPress }),
      look.showClose ? h(CloseButton, { styles: styles, onPress: onDismiss }) : null
    ),
    look.showBar
      ? h(
          View,
          {
            testID: pickId('container', 'bar'),
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
              { width: `${look.percent}%`, borderRadius: look.barHeight / 2 },
              look.fillColor ? { backgroundColor: look.fillColor } : null,
            ],
          }),
          look.markers.map((left, index) =>
            h(View, {
              key: 'marker-' + index,
              testID: pickId('container', 'markers'),
              style: [
                base.goalMarker,
                { left: `${left}%` },
                look.markerColor ? { backgroundColor: look.markerColor } : null,
              ],
            })
          )
        )
      : null
  );
}
