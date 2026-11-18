import { createContext, createElement, useContext, type ReactNode } from 'react';
import type { Selwise } from '../client.js';
import type { SelwiseHost } from './host.js';

const SelwiseContext = createContext<Selwise | null>(null);
const HostContext = createContext<SelwiseHost>({});

export interface SelwiseProviderProps {
  client: Selwise;
  /**
   * What the app can do that the SDK cannot: open a link, add to its basket,
   * hand over a WebView. Every member is optional. Pass a stable object (a
   * module constant, or one memoised) — a new one on every render redraws every
   * component below.
   */
  host?: SelwiseHost;
  children?: ReactNode;
}

/**
 * Provides the client to the hooks and to `@selwise/react-native/ui`'s
 * components, and the app's `host` to the components that need it.
 *
 * Written with `createElement` rather than JSX so this package compiles without
 * a JSX runtime configured in the consuming app's Babel setup.
 */
export function SelwiseProvider({ client, host, children }: SelwiseProviderProps) {
  return createElement(
    SelwiseContext.Provider,
    { value: client },
    createElement(HostContext.Provider, { value: host ?? NO_HOST }, children)
  );
}

const NO_HOST: SelwiseHost = Object.freeze({});

export function useSelwise(): Selwise {
  const client = useContext(SelwiseContext);
  if (!client) {
    throw new Error(
      '[Selwise] useSelwise() must be called inside <SelwiseProvider client={...}>'
    );
  }
  return client;
}

/**
 * The client of the nearest `<SelwiseProvider>`, or `null` when there is none —
 * for a component that works either way (it uses the provider the app already
 * mounted so the app's `host` is not shadowed, and mounts its own only as a
 * fallback). Everything else calls `useSelwise()`.
 */
export function useOptionalSelwise(): Selwise | null {
  return useContext(SelwiseContext);
}

/** The `host` the provider was given; an empty one when it was given none. */
export function useSelwiseHost(): SelwiseHost {
  return useContext(HostContext);
}
