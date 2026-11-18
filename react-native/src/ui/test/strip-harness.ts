import { createElement as h, type ElementType, type ReactElement, type ReactNode } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { Selwise } from '../../client.js';
import { MemoryStorage } from '../../core/storage.js';
import type { Strip } from '../../core/strips.js';
import { SelwiseProvider } from '../../react/context.js';
import type { SelwiseCartItem, SelwiseHost, SelwiseNavigationTarget } from '../../react/host.js';
import type { SelwiseProduct } from '../../types.js';
import { controls } from './react-native.mock.js';

/**
 * The recommendation strip's components, drawn against the light `react-native`
 * stand-in with the real client and a faked network: what the display types, the
 * card and the sheet draw, and what a press reports.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export interface Call {
  url: string;
  body: Record<string, unknown> | null;
}

export const state = {
  calls: [] as Call[],
  theme: { '--selwise-brand': '#d3145a', '--selwise-text': '#222222', '--selwise-font': '"Inter", sans-serif' } as Record<string, string>,
  /** What `/app/enrichments` answers with. */
  enrichmentItems: [] as unknown[],
};

export function installFetch(): void {
  state.calls = [];
  (globalThis as { fetch?: unknown }).fetch = jest.fn(async (url: unknown, init?: { body?: unknown }) => {
    const href = String(url);
    state.calls.push({ url: href, body: init && init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null });
    let payload: unknown = {};
    if (href.includes('/app/enrichments')) {
      payload = { v: 'stamp.1', code: 'KM1', resolved: true, slots: ['pdp-specs'], items: state.enrichmentItems };
    } else if (href.includes('/products')) payload = { products: [] };
    else if (/\/recommendations(\?|$)/.test(href)) payload = { widgets: [] };
    else if (href.includes('/config')) {
      payload = {
        campaigns: [],
        widgets: [],
        enrichment: { enabled: false, v: 'stamp.1', slots: [], keys: ['pdp-specs'] },
        theme: state.theme,
        channel: { currency: 'TRY' }, // currency-check-allow: a test fixture's channel, the data the code under test formats
      };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify(payload) } as unknown as Response;
  });
}

export const el = (name: string) => name as unknown as ElementType;

export const eventsOf = (name?: string) =>
  state.calls
    .filter((call) => call.url.includes('/events/batch'))
    .flatMap((call) => (call.body as { events: Array<Record<string, unknown>> }).events)
    .filter((event) => !name || event['name'] === name);

export const product = (code: string, extra?: Record<string, unknown>): SelwiseProduct =>
  // currency-check-allow: a test fixture's product carries its own currency, as the API sends it
  ({ id: code, itemCode: code, title: 'Ürün ' + code, price: 100, currency: 'TRY', url: '/p/' + code, ...(extra ?? {}) }) as SelwiseProduct;

export const live: Selwise[] = [];
export const renderers: ReactTestRenderer[] = [];

export async function startClient(): Promise<Selwise> {
  const selwise = new Selwise();
  live.push(selwise);
  await selwise.init({
    siteKey: 'site-key',
    apiKey: 'api-key',
    apiUrl: 'https://api.test/api/v1',
    storage: new MemoryStorage(),
    flushIntervalMs: 0,
    reportIntegration: false,
  });
  // The brand arrives with `/config`.
  await selwise.getSurfaces('app://home');
  return selwise;
}

export interface Recorded {
  host: SelwiseHost;
  navigated: SelwiseNavigationTarget[];
  added: SelwiseCartItem[];
}

export function recordingHost(extra?: SelwiseHost, answer: { success: boolean; message?: string } = { success: true }): Recorded {
  const navigated: SelwiseNavigationTarget[] = [];
  const added: SelwiseCartItem[] = [];
  return {
    navigated,
    added,
    host: {
      navigate: (target) => {
        navigated.push(target);
        return true;
      },
      addToCart: (item) => {
        added.push(item);
        return answer;
      },
      ...(extra ?? {}),
    },
  };
}

export async function mount(client: Selwise, host: SelwiseHost, ...children: ReactNode[]): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(h(SelwiseProvider, { client, host }, ...children) as ReactElement, {
      createNodeMock: () => ({
        measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) =>
          callback(0, 100, 390, 200),
      }),
    });
  });
  renderers.push(renderer);
  return renderer;
}

export const textOf = (node: ReactTestInstance): string =>
  node.children.map((child) => (typeof child === 'string' ? child : textOf(child))).join('');
export const texts = (renderer: ReactTestRenderer) => renderer.root.findAllByType(el('Text')).map(textOf);

/**
 * A press: calls `onPress` and lets the microtasks it starts settle. It does not
 * wait for what `onPress` returns — a press that opens a sheet answers only when
 * the shopper does.
 */
export const press = async (node: ReactTestInstance) => {
  await act(async () => {
    void (node.props as { onPress: () => unknown }).onPress();
    for (let i = 0; i < 30; i += 1) await Promise.resolve();
  });
};

/** What a press finds: the pressable whose text is `label`. */
export const pressableWith = (renderer: ReactTestRenderer, label: string): ReactTestInstance => {
  const found = renderer.root.findAll(
    (node) => (node.type as unknown) === 'Pressable' && textOf(node) === label && typeof (node.props as { onPress?: unknown }).onPress === 'function'
  );
  if (found.length === 0) throw new Error(`no pressable says "${label}"`);
  return found[0]!;
};

export const flat = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...(([] as unknown[]).concat(style).flat(Infinity) as Array<Record<string, unknown> | null | undefined>).filter(Boolean));

export function strip(widget: Record<string, unknown>, products: SelwiseProduct[], productCard: Record<string, unknown> | null = null): Strip {
  return { listed: { id: String(widget['id']) }, widget: widget as Strip['widget'], products, productCard };
}

export async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 30; i += 1) await Promise.resolve();
  });
}

export function resetHarness(): void {
  controls.reset();
  installFetch();
  state.theme = { '--selwise-brand': '#d3145a', '--selwise-text': '#222222', '--selwise-font': '"Inter", sans-serif' };
  state.enrichmentItems = [];
}

export async function teardownHarness(): Promise<void> {
  jest.useRealTimers();
  for (const renderer of renderers.splice(0)) await act(async () => renderer.unmount());
  await Promise.all(live.splice(0).map((selwise) => selwise.destroy().catch(() => undefined)));
  delete (globalThis as { fetch?: unknown }).fetch;
}

/** A card tree as the API ships it (v3), built from nodes. */
export function cardTree(children: unknown[], extra?: Record<string, unknown>): Record<string, unknown> {
  return {
    mode: 'schema',
    renderVersion: 3,
    variantSelection: 'none',
    cardTree: {
      version: 3,
      root: { id: 'root', type: 'root', style: {}, children },
      entrance: 'none',
      hover: 'none',
      transitionMs: 200,
      ...(extra ?? {}),
    },
  };
}

/** The pressable whose text contains `label` (a card is one pressable with its title, price and button inside). */
export const pressableContaining = (renderer: ReactTestRenderer, label: string): ReactTestInstance => {
  const found = renderer.root.findAll(
    (node) => (node.type as unknown) === 'Pressable' && textOf(node).includes(label) && typeof (node.props as { onPress?: unknown }).onPress === 'function'
  );
  if (found.length === 0) throw new Error(`no pressable contains "${label}"`);
  return found[0]!;
};
