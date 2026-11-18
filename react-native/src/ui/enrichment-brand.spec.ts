import { createElement as h } from 'react';
import { SelwiseEnrichment } from './SelwiseEnrichment.js';
import { el, mount, recordingHost, resetHarness, settle, startClient, state, teardownHarness } from './test/strip-harness.js';

/**
 * A product enrichment block draws in a WebView of its own, so the brand's
 * tokens are written into that document as `:root` custom properties — the rule
 * the dashboard's preview frame writes (`brandTokenCss`).
 */

beforeEach(resetHarness);
afterEach(teardownHarness);

it('carries every brand token into the block’s document', async () => {
  state.enrichmentItems = [
    {
      assignmentId: 'rule-1',
      placementKey: 'pdp-specs',
      order: 0,
      html: '<div data-selwise-root="true" data-selwise-entity-id="rule-1"><p style="color:var(--selwise-brand, #111)">Bakım</p></div>',
      css: '',
    },
  ];
  const client = await startClient();
  const { host } = recordingHost({ WebView: 'FakeWebView' as never });
  const renderer = await mount(client, host, h(SelwiseEnrichment, { code: 'KM1', slot: 'pdp-specs' }));
  await settle();

  const web = renderer.root.findByType(el('FakeWebView'));
  const html = (web.props.source as { html: string }).html;
  expect(html).toContain(':root { --selwise-brand: #d3145a; --selwise-text: #222222; --selwise-font: "Inter", sans-serif; }');
  expect(html.indexOf(':root {')).toBeLessThan(html.indexOf('Bakım'));
});

it('reports its slot as a mounted point, as a <SelwiseSlot> does', async () => {
  const client = await startClient();
  const registered: string[] = [];
  const original = client.registerSlot.bind(client);
  client.registerSlot = (slot: string) => {
    registered.push(slot);
    original(slot);
  };
  const { host } = recordingHost({ WebView: 'FakeWebView' as never });
  await mount(client, host, h(SelwiseEnrichment, { code: 'KM1', slot: 'pdp-specs' }));
  await settle();
  expect(registered).toEqual(['pdp-specs']);
});

it('gives a block with no padding of its own the default side padding, and the host config wins', async () => {
  state.enrichmentItems = [
    {
      assignmentId: 'rule-1',
      placementKey: 'pdp-specs',
      order: 0,
      html: '<div data-selwise-root="true" data-selwise-entity-id="rule-1"><p>Kargo</p></div>',
      css: '',
    },
  ];
  const client = await startClient();
  const { host } = recordingHost({ WebView: 'FakeWebView' as never });
  const renderer = await mount(client, host, h(SelwiseEnrichment, { code: 'KM1', slot: 'pdp-specs' }));
  await settle();
  const html = (renderer.root.findByType(el('FakeWebView')).props.source as { html: string }).html;
  expect(html).toContain('#selwise-slot{display:flow-root;padding:0 16px;');

  const configured = recordingHost({ WebView: 'FakeWebView' as never, enrichment: { padding: '0px' } });
  const second = await mount(client, configured.host, h(SelwiseEnrichment, { code: 'KM1', slot: 'pdp-specs' }));
  await settle();
  const html2 = (second.root.findByType(el('FakeWebView')).props.source as { html: string }).html;
  expect(html2).toContain('#selwise-slot{display:flow-root;padding:0px;');
});
