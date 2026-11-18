/**
 * The attributes the server stamps onto every rendered enrichment root.
 *
 * Restated here rather than imported: the contract that owns them is not a
 * published package, so this package cannot depend on it. The values are
 * asserted against the contract by `enrichment-document.spec.ts` wherever the
 * contract is present, which is what keeps the copy honest.
 */

export const ENRICHMENT_ROOT_ATTR = 'data-selwise-root';
export const ENRICHMENT_ENTITY_ID_ATTR = 'data-selwise-entity-id';
export const ENRICHMENT_ENTITY_TYPE_ATTR = 'data-selwise-entity-type';
export const ENRICHMENT_ENTITY_TYPE = 'enrichment';
