import { createElement as h, type ElementType, type ReactElement, type ReactNode } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { Selwise } from '../../client.js';
import { MemoryStorage } from '../../core/storage.js';
import { SelwiseProvider } from '../../react/context.js';
import type { SelwiseHost, SelwiseNavigationTarget } from '../../react/host.js';
import { controls } from './react-native.mock.js';

/**
 * The harness the campaign specs share: the real client under the components,
 * only the network faked, a `react-native` stand-in (`react-native.mock.ts`) and
 * `react-test-renderer`. `components.spec.ts` has its own copy for the older
 * surfaces; this one is for the placement, content, image and measurement specs.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Record<string, unknown> | null;
}

export const world = {
  calls: [] as Call[],
  campaigns: [] as unknown[],
  assignments: {} as Record<string, unknown>,
  newsletterAnswer: { success: true } as Record<string, unknown>,
  /** While set, the newsletter request waits for it: a test reads the button while the signup is "sending". */
  holdNewsletter: null as Promise<void> | null,
  /** What `/product-metrics/*` answers: viewers of the product, and baskets holding it. `null` answers a 500. */
  metrics: { view: 0, cart: 0 } as { view: number | null; cart: number | null },
  config: {} as Record<string, unknown>,
};

export function resetWorld(): void {
  world.calls = [];
  world.campaigns = [];
  world.assignments = {};
  world.newsletterAnswer = { success: true };
  world.holdNewsletter = null;
  world.metrics = { view: 0, cart: 0 };
  world.config = {};
  controls.reset();
  installFetch();
}

function installFetch(): void {
  (globalThis as { fetch?: unknown }).fetch = jest.fn(async (url: unknown, init?: { body?: unknown; method?: string; headers?: Record<string, string> }) => {
    const href = String(url);
    world.calls.push({
      url: href,
      method: init?.method ?? 'GET',
      headers: init?.headers ?? {},
      body: init && init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null,
    });
    let payload: unknown = {};
    if (href.includes('/experiments/assign')) payload = world.assignments;
    else if (href.includes('/product-metrics/')) {
      const value = href.includes('/cart-count') ? world.metrics.cart : world.metrics.view;
      if (value === null) return { ok: false, status: 500, text: async () => '{}' } as unknown as Response;
      payload = { count: value };
    } else if (href.includes('/newsletter')) {
      if (world.holdNewsletter) await world.holdNewsletter;
      payload = world.newsletterAnswer;
    }
    else if (href.includes('/config')) {
      payload = {
        campaigns: world.campaigns,
        widgets: [],
        enrichment: { enabled: false, v: 'stamp.1', slots: [], keys: [] },
        theme: { '--selwise-brand': '#d3145a' },
        ...world.config,
      };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify(payload) } as unknown as Response;
  });
}

export const el = (name: string) => name as unknown as ElementType;

export const live: Selwise[] = [];
export const renderers: ReactTestRenderer[] = [];

export async function startClient(options: Record<string, unknown> = {}): Promise<Selwise> {
  const selwise = new Selwise();
  live.push(selwise);
  await selwise.init({
    siteKey: 'site-key',
    apiKey: 'api-key',
    apiUrl: 'https://api.test/api/v1',
    storage: new MemoryStorage(),
    flushIntervalMs: 0,
    reportIntegration: false,
    ...options,
  });
  return selwise;
}

export interface Recorded {
  host: SelwiseHost;
  navigated: SelwiseNavigationTarget[];
}

export function recordingHost(extra?: SelwiseHost): Recorded {
  const navigated: SelwiseNavigationTarget[] = [];
  return {
    navigated,
    host: {
      navigate: (target) => {
        navigated.push(target);
        return true;
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

export const goTo = (client: Selwise, url: string, info?: { screenName?: string; pageType?: string }) =>
  act(async () => {
    client.setScreen(url, info);
  });

export async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 30; i += 1) await Promise.resolve();
  });
}

export const textOf = (node: ReactTestInstance): string =>
  node.children.map((child) => (typeof child === 'string' ? child : textOf(child))).join('');
export const texts = (renderer: ReactTestRenderer): string[] => renderer.root.findAllByType(el('Text')).map(textOf);

export const press = async (node: ReactTestInstance) => {
  await act(async () => {
    (node.props as { onPress: () => void }).onPress();
  });
};

/** The nearest ancestor that is a host element (a `View`), skipping the components between. */
export function hostParent(node: ReactTestInstance): ReactTestInstance {
  let current = node.parent;
  while (current && typeof current.type !== 'string') current = current.parent;
  if (!current) throw new Error('no host parent');
  return current;
}

export const flatStyle = (node: ReactTestInstance): Record<string, unknown> =>
  Object.assign({}, ...(([] as unknown[]).concat(node.props.style).flat(Infinity).filter(Boolean) as Array<Record<string, unknown>>));

export const eventsOf = (name?: string) =>
  world.calls
    .filter((call) => call.url.includes('/events/batch'))
    .flatMap((call) => (call.body as { events: Array<Record<string, unknown>> }).events)
    .filter((event) => !name || event['name'] === name);

export async function teardown(): Promise<void> {
  jest.useRealTimers();
  for (const renderer of renderers.splice(0)) await act(async () => renderer.unmount());
  await Promise.all(live.splice(0).map((selwise) => selwise.destroy().catch(() => undefined)));
  delete (globalThis as { fetch?: unknown }).fetch;
}

/** A campaign as `/config` carries it. */
export function campaign(
  id: string,
  type: string,
  parts: { content?: Record<string, unknown>; styles?: Record<string, unknown>; placement?: Record<string, unknown>; targeting?: Record<string, unknown>; extra?: Record<string, unknown> } = {}
): Record<string, unknown> {
  return {
    id,
    type,
    contentJson: parts.content ?? {},
    stylesJson: parts.styles ?? {},
    placementConfigJson: parts.placement ?? {},
    pageTargetingJson: parts.targeting ?? { showOnAllPages: true },
    segmentTargetingMode: 'all',
    segmentIds: [],
    ...(parts.extra ?? {}),
  };
}
