import { createContext, createElement as h, useContext, type ReactElement } from 'react';
import type { TextProps } from 'react-native';
import { SelwiseText } from './host-hooks.js';

/**
 * The search's own font — the stack the merchant set in Search → Appearance —
 * handed down to every text of the search screen, so a part of it does not need
 * to be passed the font to draw in it. Empty: the brand's.
 */
export const SearchFont = createContext<string | undefined>(undefined);

/** `Text` in the search's font, mapped to the app's own through `host.fontFamily`. */
export function SearchText(props: TextProps): ReactElement {
  const stack = useContext(SearchFont);
  return h(SelwiseText, stack ? { ...props, fontStack: stack } : props);
}
