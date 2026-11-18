/**
 * A light stand-in for `react-native`, for the component tests.
 *
 * Mapped over the package by `jest.config.js`, so the components import it as
 * `react-native` and `react-test-renderer` draws them as plain host elements
 * (`View`, `Text`, `Pressable`, …) a test can find by type and read props from.
 * It is not React Native: no layout, no native modules — only the shapes the
 * components touch. Not part of the build.
 */
import { createElement, forwardRef, Fragment, useImperativeHandle, type ReactNode } from 'react';

type Props = Record<string, unknown> & { children?: ReactNode };

export const View = 'View';
export const Text = 'Text';
export const TextInput = 'TextInput';
export const ScrollView = 'ScrollView';
export const Pressable = 'Pressable';
export const Image = 'Image';
export const ActivityIndicator = 'ActivityIndicator';

/** The visible window, an `AppState` and a `Linking` a test can drive. */
export const controls = {
  appState: 'active',
  appStateListeners: new Set<(state: string) => void>(),
  linkingOpened: [] as string[],
  window: { width: 390, height: 844 },
  deviceEvents: new Map<string, Set<() => void>>(),
  /** What `Animated.timing` was asked to do, in order. */
  animations: [] as Array<{ from: number; to: number; duration: number }>,
  loops: 0,
  /** Offsets a list was asked to scroll to, in order. */
  scrolls: [] as number[],
  reset(): void {
    controls.appState = 'active';
    controls.appStateListeners.clear();
    controls.linkingOpened = [];
    controls.deviceEvents.clear();
    controls.animations = [];
    controls.loops = 0;
    controls.scrolls = [];
  },
  emitAppState(state: string): void {
    controls.appState = state;
    for (const listener of [...controls.appStateListeners]) listener(state);
  },
  emitDeviceEvent(name: string): void {
    for (const listener of [...(controls.deviceEvents.get(name) ?? [])]) listener();
  },
};

export const AppState = {
  get currentState(): string {
    return controls.appState;
  },
  addEventListener(_type: string, listener: (state: string) => void) {
    controls.appStateListeners.add(listener);
    return { remove: () => controls.appStateListeners.delete(listener) };
  },
};

export const DeviceEventEmitter = {
  addListener(name: string, listener: () => void) {
    const set = controls.deviceEvents.get(name) ?? new Set();
    controls.deviceEvents.set(name, set);
    set.add(listener);
    return { remove: () => set.delete(listener) };
  },
};

export const Linking = {
  openURL(url: string): Promise<void> {
    controls.linkingOpened.push(url);
    return Promise.resolve();
  },
};

export const Dimensions = {
  get(_name: string) {
    return controls.window;
  },
};

/**
 * `Animated`, finished the instant it starts: a test reads where an animation
 * went from and to (`controls.animations`) and the interpolation a style carries
 * (`__interpolated`), not a frame. It is not the real thing — no clock, no
 * native driver.
 */
class AnimatedValue {
  _value: number;
  constructor(value: number) {
    this._value = value;
  }
  setValue(value: number): void {
    this._value = value;
  }
  interpolate(config: { inputRange: number[]; outputRange: number[] }): { __interpolated: unknown; __source: unknown } {
    return { __interpolated: config, __source: this };
  }
}

interface AnimationHandle {
  start(callback?: (result: { finished: boolean }) => void): void;
  stop(): void;
}

export const Animated = {
  Value: AnimatedValue,
  View: 'Animated.View',
  timing(value: AnimatedValue, config: { toValue: number; duration?: number }): AnimationHandle {
    return {
      start(callback) {
        controls.animations.push({ from: value._value, to: config.toValue, duration: config.duration ?? 0 });
        value.setValue(config.toValue);
        callback?.({ finished: true });
      },
      stop() {},
    };
  },
  sequence(list: AnimationHandle[]): AnimationHandle {
    return {
      start(callback) {
        for (const item of list) item.start();
        callback?.({ finished: true });
      },
      stop() {},
    };
  },
  loop(animation: AnimationHandle): AnimationHandle {
    controls.loops += 1;
    return { start: () => animation.start(), stop() {} };
  },
};

export const Easing = {
  out: (fn: unknown) => fn,
  in: (fn: unknown) => fn,
  quad: 'quad',
  cubic: 'cubic',
  ease: 'ease',
  inOut: (fn: unknown) => fn,
};

export const Platform = { OS: 'ios' };
export const StatusBar = { currentHeight: 24 };

export const StyleSheet = {
  create<T>(styles: T): T {
    return styles;
  },
  absoluteFill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
};

/** A list's header, footer and separator: an element, or a component to draw. */
function listPart(part: unknown): ReactNode {
  if (!part) return null;
  return typeof part === 'function' ? createElement(part as () => ReactNode) : (part as ReactNode);
}

/**
 * Draws its rows through `renderItem`, as the real list does for the rows it has
 * laid out — with the header, the separators between rows and the footer a list
 * carries. `onEndReached` and the rest stay on the host element for a test to call.
 */
type FlatListProps = Props & {
  data: ReadonlyArray<unknown>;
  renderItem: (entry: { item: unknown; index: number }) => ReactNode;
  keyExtractor?: (item: unknown, index: number) => string;
  ListHeaderComponent?: unknown;
  ListFooterComponent?: unknown;
  ItemSeparatorComponent?: unknown;
};

function FlatListImpl(props: FlatListProps, ref: unknown) {
  const { data, renderItem, keyExtractor, ListHeaderComponent, ListFooterComponent, ItemSeparatorComponent, ...rest } = props;
  // A list's imperative handle: what a test reads is where a component asked it to scroll.
  useImperativeHandle(
    ref as never,
    () => ({
      scrollToOffset: (options: { offset: number; animated?: boolean }) => {
        controls.scrolls.push(options.offset);
      },
    }),
    []
  );
  return createElement(
    'FlatList',
    { ...rest, data },
    listPart(ListHeaderComponent),
    ...data.map((item, index) =>
      createElement(
        Fragment,
        { key: keyExtractor ? keyExtractor(item, index) : String(index) },
        index > 0 ? listPart(ItemSeparatorComponent) : null,
        renderItem({ item, index })
      )
    ),
    listPart(ListFooterComponent)
  );
}

export const FlatList = forwardRef(FlatListImpl as never) as unknown as (props: FlatListProps & { ref?: unknown }) => ReactNode;

export function Modal(props: Props & { visible?: boolean }) {
  return props.visible === false ? null : createElement('Modal', props, props.children);
}
