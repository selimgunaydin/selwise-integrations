'use strict';

/**
 * The attributes the server stamps onto every rendered enrichment root.
 *
 * Restated here rather than imported: this plugin is plain CommonJS dropped
 * into an App Maker project with no build step, so it cannot import a
 * TypeScript workspace package. The values are asserted against the contract
 * by `enrichment-document.spec.js`, which is what keeps the copy honest — the
 * same arrangement `apps/client/src/core/theme.ts` uses for its token regex.
 *
 * Canonical source: `ENRICHMENT_ROOT_ATTR` / `ENRICHMENT_ENTITY_ID_ATTR` in
 * `packages/widget-contract/src/product-enrichment.ts`.
 */

const ENRICHMENT_ROOT_ATTR = 'data-selwise-root';
const ENRICHMENT_ENTITY_ID_ATTR = 'data-selwise-entity-id';
const ENRICHMENT_ENTITY_TYPE_ATTR = 'data-selwise-entity-type';
const ENRICHMENT_ENTITY_TYPE = 'enrichment';

module.exports = {
  ENRICHMENT_ROOT_ATTR,
  ENRICHMENT_ENTITY_ID_ATTR,
  ENRICHMENT_ENTITY_TYPE_ATTR,
  ENRICHMENT_ENTITY_TYPE,
};
