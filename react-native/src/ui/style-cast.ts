import type { TextStyle, ViewStyle } from 'react-native';

/**
 * A style the translation table built (`Record<string, unknown>`) as a React
 * Native one. The table checks every value it writes; TypeScript cannot follow
 * a string out of it into RN's string-literal unions (`'center'`, `'600'`), so
 * the cast is made once, here, instead of at every `View`.
 */
export const asView = (style: object): ViewStyle => style as ViewStyle;
export const asText = (style: object): TextStyle => style as TextStyle;
