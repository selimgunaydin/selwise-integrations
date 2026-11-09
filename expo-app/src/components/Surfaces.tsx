import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { Surface } from '@selwise/react-native';
import { LOCALE, selwise } from '../selwise';
import { colors, styles } from '../ui';

/**
 * Campaigns for one screen, drawn natively. `getSurfaces` returns DATA after
 * every gate (page targeting, segments, test mode, frequency cap, conflicts);
 * the app decides how a type looks. This example draws the text types as a
 * bar and the goal bar with its progress; a real app adds its own renderers.
 *
 * The contract per surface: `recordSurfaceShown` + `trackSurfaceView` when it
 * is actually on screen, `trackSurfaceClick` on a tap, `dismissSurface` on close.
 */
function textOf(s: Surface): string {
  const c = s.content as Record<string, unknown>;
  for (const key of ['message', 'text', 'title', 'headline', 'body']) {
    if (typeof c[key] === 'string' && c[key]) return c[key] as string;
  }
  return '';
}

export function Surfaces({ screen }: { screen: string }) {
  const [surfaces, setSurfaces] = useState<Surface[]>([]);
  const [, redraw] = useState(0);

  useEffect(() => {
    let live = true;
    selwise
      .getSurfaces(screen, { locale: LOCALE })
      .then((list) => live && setSurfaces(list))
      .catch(() => live && setSurfaces([]));
    // A goal bar follows the basket: redraw on every cart change.
    const off = selwise.onCartChange(() => redraw((n) => n + 1));
    return () => {
      live = false;
      off();
    };
  }, [screen]);

  return (
    <>
      {surfaces.map((s) => (
        <SurfaceView key={s.id} surface={s} onClose={() => setSurfaces((all) => all.filter((x) => x.id !== s.id))} />
      ))}
    </>
  );
}

function SurfaceView({ surface, onClose }: { surface: Surface; onClose: () => void }) {
  const goal = surface.type === 'goal_bar' ? selwise.resolveGoalBar(surface, { locale: LOCALE }) : null;
  const text = goal ? goal.text : textOf(surface);
  const visible = goal ? goal.visible : Boolean(text);

  useEffect(() => {
    if (!visible) return;
    void selwise.recordSurfaceShown(surface);
    selwise.trackSurfaceView(surface);
  }, [visible, surface]);

  if (!visible) return null;
  const progress = goal?.progress ? Math.min(1, goal.progress.value / Math.max(goal.progress.target, 1)) : null;

  return (
    <Pressable onPress={() => selwise.trackSurfaceClick(surface)} style={{ backgroundColor: colors.ink, paddingHorizontal: 16, paddingVertical: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ flex: 1, color: colors.paper, fontSize: 13 }}>{text}</Text>
        <Pressable
          onPress={() => {
            void selwise.dismissSurface(surface);
            onClose();
          }}
          accessibilityLabel="Kapat"
          hitSlop={12}
        >
          <Text style={{ color: colors.paper, fontSize: 16 }}>×</Text>
        </Pressable>
      </View>
      {progress != null ? (
        <View style={{ height: 4, borderRadius: 2, backgroundColor: '#4A463F', marginTop: 8 }}>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.paper, width: `${Math.round(progress * 100)}%` }} />
        </View>
      ) : null}
      {surface.isTestMode ? <Text style={[styles.muted, { color: '#D5CEC2', marginTop: 4 }]}>test modu</Text> : null}
    </Pressable>
  );
}
