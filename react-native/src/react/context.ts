import { createContext, createElement, useContext, type ReactNode } from 'react';
import type { Selwise } from '../client.js';

const SelwiseContext = createContext<Selwise | null>(null);

export interface SelwiseProviderProps {
  client: Selwise;
  children: ReactNode;
}

/**
 * Provides the initialised client to the hooks below.
 *
 * Written with `createElement` rather than JSX so this package compiles without
 * a JSX runtime configured in the consuming app's Babel setup.
 */
export function SelwiseProvider({ client, children }: SelwiseProviderProps) {
  return createElement(SelwiseContext.Provider, { value: client }, children);
}

export function useSelwise(): Selwise {
  const client = useContext(SelwiseContext);
  if (!client) {
    throw new Error(
      '[Selwise] useSelwise() must be called inside <SelwiseProvider client={...}>'
    );
  }
  return client;
}
