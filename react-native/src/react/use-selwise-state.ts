import { useEffect, useState } from 'react';
import { useSelwise } from './context.js';
import type { ProductState, ScreenState } from '../core/state.js';

/**
 * The client's state, as hooks: each reads the current value, subscribes with
 * `Selwise.on()`, and renders again when it moves. The components of
 * `@selwise/react-native/ui` draw from these and nothing else, so an app that
 * draws its own can too.
 */

/** `init()` has finished. A component that needs the client waits for this instead of throwing. */
export function useSelwiseReady(): boolean {
  const client = useSelwise();
  const [ready, setReady] = useState(client.isInitialized);
  useEffect(() => {
    // Read again: `init()` may have finished between the render and this effect.
    setReady(client.isInitialized);
    return client.on('ready', setReady);
  }, [client]);
  return ready;
}

/** The screen the host last named (`Selwise.setScreen`). */
export function useScreen(): ScreenState {
  const client = useSelwise();
  const [screen, setScreen] = useState(() => client.getScreen());
  useEffect(() => {
    setScreen(client.getScreen());
    return client.on('screen', setScreen);
  }, [client]);
  return screen;
}

/** The product on the current product screen (`Selwise.setProduct`), `{ pending: true }` while it loads, or `null`. */
export function useProduct(): ProductState {
  const client = useSelwise();
  const [product, setProduct] = useState(() => client.getProduct());
  useEffect(() => {
    setProduct(client.getProduct());
    return client.on('product', setProduct);
  }, [client]);
  return product;
}

/** A number that moves whenever the basket changes: a dependency for "ask again". */
export function useCartVersion(): number {
  const client = useSelwise();
  const [version, setVersion] = useState(0);
  useEffect(() => client.on('cart', () => setVersion((value) => value + 1)), [client]);
  return version;
}

/** A number that moves whenever the brand theme's tokens arrive or change. */
export function useThemeVersion(): number {
  const client = useSelwise();
  const [version, setVersion] = useState(0);
  useEffect(() => client.on('theme', () => setVersion((value) => value + 1)), [client]);
  return version;
}

/** The app's language (`Selwise.setLocale`); the merchant's text is asked again in it. */
export function useLocale(): string | undefined {
  const client = useSelwise();
  const [locale, setLocale] = useState(() => client.getLocale());
  useEffect(() => {
    setLocale(client.getLocale());
    return client.on('locale', setLocale);
  }, [client]);
  return locale;
}

/** A number that moves whenever the visitor's A/B arms are dropped and asked for again (a QA link, a consent answer). */
export function useExperimentsVersion(): number {
  const client = useSelwise();
  const [version, setVersion] = useState(0);
  useEffect(() => client.on('experiments', (next) => setVersion(next)), [client]);
  return version;
}

/** A number that moves whenever the channel's configuration changed while the app was open: a dependency for "ask again". */
export function useConfigVersion(): number {
  const client = useSelwise();
  const [version, setVersion] = useState(0);
  useEffect(() => client.on('config', (next) => setVersion(next)), [client]);
  return version;
}
