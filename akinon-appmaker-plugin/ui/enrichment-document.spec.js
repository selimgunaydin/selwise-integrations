'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
  buildEnrichmentDocument,
  parseEnrichmentMessage,
  MAX_ENRICHMENT_DOCUMENT_BYTES,
} = require('./enrichment-document.js');
const attrs = require('./enrichment-attrs.js');

/** One rendered rule, exactly as `app/enrichments` returns it. */
function item(overrides) {
  return Object.assign(
    {
      assignmentId: 'rule-1',
      placementKey: 'pdp-specs',
      order: 0,
      html:
        '<div data-selwise-root="true" data-selwise-entity-type="enrichment" ' +
        'data-selwise-entity-id="rule-1"><div data-selwise-enrichment="b1">' +
        '<table><tr><td>Garanti</td><td>24 ay</td></tr></table></div></div>',
      css: '[data-selwise-enrichment="b1"] td { padding: 6px }',
    },
    overrides || {}
  );
}

// The contract lives in the Selwise monorepo; the public mirror of this plugin
// does not carry it, so there the drift check is skipped, never failed.
const CONTRACT_SOURCE = path.join(__dirname, '../../widget-contract/src/product-enrichment.ts');
const itInMonorepo = fs.existsSync(CONTRACT_SOURCE) ? it : it.skip;

describe('the attribute names this plugin restates', () => {
  /**
   * The plugin is plain CommonJS with no build step, so it cannot import the
   * TypeScript contract. This is what keeps the copy honest — the same
   * arrangement `apps/client/src/core/theme.ts` uses for its token regex.
   */
  itInMonorepo('match the contract they were copied from', () => {
    const contract = fs.readFileSync(CONTRACT_SOURCE, 'utf8');

    const declared = (name) => {
      const match = new RegExp(
        'export const ' + name + " = '([^']+)'"
      ).exec(contract);
      return match ? match[1] : null;
    };

    expect(attrs.ENRICHMENT_ROOT_ATTR).toBe(declared('ENRICHMENT_ROOT_ATTR'));
    expect(attrs.ENRICHMENT_ENTITY_ID_ATTR).toBe(declared('ENRICHMENT_ENTITY_ID_ATTR'));
    expect(attrs.ENRICHMENT_ENTITY_TYPE_ATTR).toBe(declared('ENRICHMENT_ENTITY_TYPE_ATTR'));
    expect(attrs.ENRICHMENT_ENTITY_TYPE).toBe(declared('ENRICHMENT_ENTITY_TYPE'));
  });
});

describe('buildEnrichmentDocument', () => {
  it('puts the merchant markup and styles into one document', () => {
    const document_ = buildEnrichmentDocument([item()]);

    expect(document_.html).toContain('24 ay');
    expect(document_.html).toContain('padding: 6px');
    expect(document_.ruleCount).toBe(1);
  });

  // One WebView per slot, not per rule: three rules on a product screen would
  // otherwise be three browser instances.
  it('stacks a slot rules into one document in the order given', () => {
    const document_ = buildEnrichmentDocument([
      item({ assignmentId: 'a', html: '<div data-selwise-entity-id="a">FIRST</div>' }),
      item({ assignmentId: 'b', html: '<div data-selwise-entity-id="b">SECOND</div>' }),
    ]);

    expect(document_.ruleCount).toBe(2);
    expect(document_.html.indexOf('FIRST')).toBeLessThan(document_.html.indexOf('SECOND'));
  });

  it('ships a shared block stylesheet once', () => {
    const shared = '[data-selwise-enrichment="b1"] td { padding: 6px }';
    const document_ = buildEnrichmentDocument([
      item({ assignmentId: 'a', css: shared }),
      item({ assignmentId: 'b', css: shared }),
    ]);

    expect(document_.html.split('padding: 6px').length - 1).toBe(1);
  });

  // An empty WebView is still a native view with a measurement pass.
  it('returns nothing when there is nothing to draw', () => {
    expect(buildEnrichmentDocument([])).toBeNull();
    expect(buildEnrichmentDocument(null)).toBeNull();
    expect(buildEnrichmentDocument([item({ html: '   ' })])).toBeNull();
    expect(buildEnrichmentDocument(['nope'])).toBeNull();
  });

  // A block with no styling of its own should look like it belongs to the app,
  // not like a browser default serif.
  it('applies the host base typography', () => {
    const document_ = buildEnrichmentDocument([item()], {
      textColor: '#1a1a1a',
      fontFamily: 'Inter, sans-serif',
      fontSize: '15px',
      padding: '16px',
      background: '#ffffff',
    });

    expect(document_.html).toContain('font-family:Inter, sans-serif');
    expect(document_.html).toContain('font-size:15px');
    expect(document_.html).toContain('color:#1a1a1a');
    expect(document_.html).toContain('padding:16px');
    expect(document_.html).toContain('background:#ffffff');
  });

  it('defaults to a transparent ground so it does not paint over the screen', () => {
    expect(buildEnrichmentDocument([item()]).html).toContain('background:transparent');
  });

  it('keeps images and tables inside the viewport', () => {
    const html = buildEnrichmentDocument([item()]).html;
    expect(html).toContain('#selwise-slot img{max-width:100%');
    expect(html).toContain('border-collapse:collapse');
  });

  it('reports height and attributes clicks from inside the document', () => {
    const html = buildEnrichmentDocument([item()]).html;

    expect(html).toContain('ReactNativeWebView');
    expect(html).toContain('ResizeObserver');
    // Click attribution walks up to the rule root, so a tapped link in a
    // three-rule document credits the right rule.
    expect(html).toContain('data-selwise-entity-id');
  });

  // Enrichment blocks carry HTML and CSS and nothing else, so nothing in the
  // page can reach the app — the custom widget verbs are deliberately absent.
  it('exposes no window.selwise verbs, unlike a custom widget', () => {
    const html = buildEnrichmentDocument([item()]).html;

    expect(html).not.toContain('window.selwise');
    expect(html).not.toContain('addToCart');
  });

  it('stops adding rules past the document cap rather than stalling the thread', () => {
    const big = 'x'.repeat(Math.floor(MAX_ENRICHMENT_DOCUMENT_BYTES / 2) + 1);
    const document_ = buildEnrichmentDocument([
      item({ assignmentId: 'a', html: '<div>' + big + '</div>', css: '' }),
      item({ assignmentId: 'b', html: '<div>' + big + '</div>', css: '' }),
      item({ assignmentId: 'c', html: '<div>' + big + '</div>', css: '' }),
    ]);

    expect(document_.ruleCount).toBe(1);
  });
});

describe('parseEnrichmentMessage', () => {
  const wrap = (type, payload) =>
    JSON.stringify({ __selwise: 1, type: type, payload: payload });

  it('reads a height report', () => {
    expect(parseEnrichmentMessage(wrap('height', { height: 240.4 }))).toEqual({
      type: 'height',
      height: 241,
    });
  });

  // A bad number would push the rest of the product screen off.
  it('refuses an impossible height', () => {
    expect(parseEnrichmentMessage(wrap('height', { height: 0 }))).toBeNull();
    expect(parseEnrichmentMessage(wrap('height', { height: -5 }))).toBeNull();
    expect(parseEnrichmentMessage(wrap('height', { height: 99999 }))).toBeNull();
    expect(parseEnrichmentMessage(wrap('height', { height: 'tall' }))).toBeNull();
  });

  it('reads a click with the rule it belongs to', () => {
    expect(
      parseEnrichmentMessage(wrap('click', { url: '/kargo', assignmentId: 'rule-1' }))
    ).toEqual({ type: 'click', url: '/kargo', assignmentId: 'rule-1' });
  });

  it('accepts a click on a rule root with no link', () => {
    expect(parseEnrichmentMessage(wrap('click', { assignmentId: 'rule-1' }))).toEqual({
      type: 'click',
      url: '',
      assignmentId: 'rule-1',
    });
  });

  it('ignores a click that names neither a link nor a rule', () => {
    expect(parseEnrichmentMessage(wrap('click', {}))).toBeNull();
  });

  // Untrusted input from a page assembled out of merchant markup.
  it('refuses anything it does not recognise', () => {
    expect(parseEnrichmentMessage('not json')).toBeNull();
    expect(parseEnrichmentMessage(JSON.stringify({ type: 'height' }))).toBeNull();
    expect(parseEnrichmentMessage(wrap('exec', { code: 'rm -rf /' }))).toBeNull();
    expect(parseEnrichmentMessage(null)).toBeNull();
    expect(parseEnrichmentMessage('x'.repeat(20001))).toBeNull();
  });

  it('bounds the strings it forwards', () => {
    const message = parseEnrichmentMessage(
      wrap('click', { url: 'https://x/' + 'a'.repeat(5000), assignmentId: 'b'.repeat(200) })
    );

    expect(message.url.length).toBe(2048);
    expect(message.assignmentId.length).toBe(64);
  });
});
