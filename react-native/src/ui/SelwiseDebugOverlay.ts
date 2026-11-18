import { createElement as h, Fragment, useEffect, useRef, useState, type ReactElement } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NotShownReport } from '../core/not-shown.js';
import { useSelwise } from '../react/context.js';
import { useScreen } from '../react/use-selwise-state.js';
import { debugBoardOf, SCREEN_STRIPS } from './debug-board.js';
import { debugReasonText } from './debug-reasons.js';
import { useSafeAreaInsets } from './host-hooks.js';

/**
 * The on-device "why is this not on my screen?": a small floating "S" at the
 * bottom-left that opens a sheet with what Selwise did on the CURRENT screen.
 *
 * Development only. It exists when the host started the client with
 * `debug: true` (`client.debugOverlayEnabled`) and for nobody else: with debug
 * off the component renders nothing, subscribes to nothing and the screens'
 * reports are never written (`debug-board.ts`). `<SelwiseSurfaces />` mounts it,
 * so an app that mounts the overlay once at its root gets it with no code; an app
 * without `<SelwiseSurfaces />` mounts `<SelwiseDebugOverlay />` once itself. A
 * second mount is harmless: one overlay draws per client (`claimOverlay`), the
 * others render nothing.
 *
 * It says what the SDK already knows, from the same lists the screen was drawn
 * from: the screen's address and page type, the campaigns and widgets drawn, the
 * strips drawn per point, and every report of `Selwise.explain()` with its reason
 * in a sentence. It decides nothing, and it never shows a visitor's identifier.
 */
export function SelwiseDebugOverlay(): ReactElement | null {
  const client = useSelwise();
  if (!client.debugOverlayEnabled) return null;
  return h(DebugPanel, null);
}

function DebugPanel(): ReactElement | null {
  const client = useSelwise();
  const board = debugBoardOf(client);
  const screen = useScreen();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [, setVersion] = useState(0);
  const token = useRef<symbol>();
  if (!token.current) token.current = Symbol('selwise-debug-overlay');
  const mine = token.current;

  // The ONE board subscription of the panel and its sheet: what was drawn changed
  // (a surface, a strip) or the claim moved, and the open sheet draws it again.
  useEffect(() => {
    const release = board.claimOverlay(mine);
    const stop = board.onChange(() => setVersion((value) => value + 1));
    return () => {
      stop();
      release();
    };
  }, [board, mine]);

  // Not the first mount for this client (or not claimed yet): nothing to draw.
  if (!board.drawsOverlay(mine)) return null;

  return h(
    Fragment,
    null,
    h(
      Pressable,
      {
        testID: 'selwise-debug-button',
        accessibilityRole: 'button',
        accessibilityLabel: 'Selwise diagnostics',
        onPress: () => setOpen(true),
        style: [styles.button, { left: 12, bottom: 12 + insets.bottom }],
      },
      h(Text, { style: styles.buttonText }, 'S')
    ),
    open
      ? h(
          Modal,
          { visible: true, transparent: true, animationType: 'slide', onRequestClose: () => setOpen(false) },
          h(
            View,
            { style: styles.scrim },
            h(Pressable, { style: styles.scrimTap, accessibilityLabel: 'Close', onPress: () => setOpen(false) }),
            h(DebugSheet, {
              pageUrl: screen.pageUrl,
              screenName: screen.screenName,
              pageType: screen.pageType,
              onClose: () => setOpen(false),
              onRefresh: () => setVersion((value) => value + 1),
            })
          )
        )
      : null
  );
}

function DebugSheet(props: {
  pageUrl: string | null;
  screenName: string | null;
  pageType: string | null;
  onClose: () => void;
  onRefresh: () => void;
}): ReactElement {
  const client = useSelwise();
  const drawn = debugBoardOf(client).snapshot(props.pageUrl);
  // Read on every render of the open sheet: the ledger has no event of its own.
  const notShown = client.explain();

  return h(
    View,
    { style: styles.sheet, testID: 'selwise-debug-sheet' },
    h(
      View,
      { style: styles.header },
      h(Text, { style: styles.title }, 'Selwise diagnostics'),
      h(
        View,
        { style: styles.headerButtons },
        h(Pressable, { testID: 'selwise-debug-refresh', onPress: props.onRefresh, style: styles.link }, h(Text, { style: styles.linkText }, 'Refresh')),
        h(Pressable, { testID: 'selwise-debug-close', onPress: props.onClose, style: styles.link }, h(Text, { style: styles.linkText }, 'Close'))
      )
    ),
    h(
      ScrollView,
      null,
      h(Section, { title: 'Screen' }, [
        h(Line, { key: 'url', text: props.pageUrl ? props.pageUrl : 'no screen named yet (Selwise.setScreen)' }),
        h(Line, { key: 'type', text: 'page type: ' + (props.pageType ? props.pageType : 'not set') }),
        ...(props.screenName ? [h(Line, { key: 'name', text: 'screen name: ' + props.screenName })] : []),
      ]),
      h(
        Section,
        { title: 'Surfaces drawn (' + drawn.surfaces.length + ')' },
        drawn.surfaces.length === 0
          ? [h(Line, { key: 'none', text: 'none', muted: true })]
          : drawn.surfaces.map((surface) => h(Line, { key: surface.id, text: surface.id + ' · ' + surface.type + ' · ' + surface.where }))
      ),
      h(
        Section,
        { title: 'Strips drawn per point' },
        drawn.strips.length === 0
          ? [h(Line, { key: 'none', text: 'none', muted: true })]
          : drawn.strips.map((entry) =>
              h(Line, {
                key: entry.point,
                text:
                  (entry.point === SCREEN_STRIPS ? 'whole screen' : entry.point) +
                  ': ' +
                  entry.strips.map((strip) => (strip.name ? strip.name + ' (' + strip.id + ')' : strip.id)).join(', '),
              })
            )
      ),
      h(
        Section,
        { title: 'Not shown (' + notShown.length + ')' },
        notShown.length === 0
          ? [h(Line, { key: 'none', text: 'nothing is on record against this screen', muted: true })]
          : notShown.map((report) => h(NotShownRow, { key: report.kind + ':' + report.id, report }))
      )
    )
  );
}

function NotShownRow(props: { report: NotShownReport }): ReactElement {
  const { report } = props;
  const detail = Object.entries(report.detail)
    .map(([key, value]) => key + '=' + String(value))
    .join(', ');
  return h(
    View,
    { style: styles.row, testID: 'selwise-debug-not-shown' },
    h(
      Text,
      { style: styles.rowTitle },
      report.id + ' · ' + report.kind + (report.type ? ' · ' + report.type : '') + (report.waiting ? ' · waiting' : '')
    ),
    h(Text, { style: styles.line }, report.reason + ': ' + debugReasonText(report.reason)),
    detail ? h(Text, { style: styles.muted }, detail) : null
  );
}

function Section(props: { title: string; children?: ReactElement[] }): ReactElement {
  return h(View, { style: styles.section }, h(Text, { style: styles.sectionTitle }, props.title), ...(props.children ?? []));
}

function Line(props: { text: string; muted?: boolean }): ReactElement {
  return h(Text, { style: props.muted ? styles.muted : styles.line }, props.text);
}

const styles = StyleSheet.create({
  // Above every surface (docks are 9999), under nothing.
  button: {
    position: 'absolute',
    zIndex: 10000,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  scrimTap: { flex: 1 },
  sheet: { maxHeight: '75%', backgroundColor: '#ffffff', borderTopLeftRadius: 12, borderTopRightRadius: 12, padding: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  headerButtons: { flexDirection: 'row' },
  title: { fontSize: 16, fontWeight: '700', color: '#111827' },
  link: { paddingHorizontal: 8, paddingVertical: 4 },
  linkText: { fontSize: 14, color: '#2563eb' },
  section: { marginTop: 12 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 4 },
  row: { marginBottom: 8 },
  rowTitle: { fontSize: 13, fontWeight: '600', color: '#111827' },
  line: { fontSize: 13, color: '#374151' },
  muted: { fontSize: 12, color: '#6b7280' },
});
