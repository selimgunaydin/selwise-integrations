// GENERATED FILE — DO NOT EDIT.
//
// Vendored from packages/search-contract/src/category-scope.ts by
// scripts/sync-vendored-page-targeting.js. Edit the source, then run:
//
//   node scripts/sync-vendored-page-targeting.js
//
// It is copied rather than imported because @selwise/search-contract is private
// and this SDK is published: a dependency on it would not resolve for anyone
// who installs @selwise/react-native from npm.

/**
 * Which category chip is lit — one rule for every renderer that draws the
 * search's category filter (the storefront's chips, rail and dropdown; the
 * app's chip row).
 *
 * Why it is a rule and not a line in each renderer: the facets an answer
 * carries are the SUBcategories of the category it was asked for. Browsing a
 * popular category ("MAKYAJ": empty term, `category = MAKYAJ`) returns
 * "Ruj · Fondöten · …", so with "all is active only without a category, a facet
 * is active only when it is the selected one" the browsed category was drawn
 * nowhere on 2026-11-18 — the input was empty, no chip was lit and nothing said
 * "you are in MAKYAJ" (seen live on an app; the storefront has the same
 * shape). The browsed parent is a SCOPE: drawn first, lit, and the way out.
 *
 * Pure and dependency-free: the SDK vendors this file
 * (`scripts/sync-vendored-page-targeting.js`), so it must import nothing.
 */

/** A category of the answer, as the API's facets carry it. */
export interface CategoryFacetInput {
  /** What filters (`category = name`). */
  name: string;
  count: number;
  /** What the shopper reads, when the API sent one. */
  label?: string;
}

export interface CategoryChip {
  /**
   * `scope`: the selected category, which is not one of the drawn facets (the
   * browsed parent, or a facet the display's `maxVisible` cuts off).
   * `all`: no category. `facet`: one of the answer's categories.
   */
  kind: 'all' | 'scope' | 'facet';
  /** What choosing it selects: the category's name, or `null` for "all". A scope's value is its own name. */
  value: string | null;
  /** Formatted with the merchant's naming. */
  label: string;
  /** The results it holds; `null` when nothing measured it. */
  count: number | null;
  active: boolean;
  /** Pressing it takes the category OFF (a scope is the only chip that does). */
  clears: boolean;
}

export interface CategoryChipModel {
  /** The scope entry, or null. Present means "all" is NOT drawn: the scope is the way back. */
  scope: CategoryChip | null;
  /** "All" — active exactly when no category is selected. Always modelled; chip-like displays skip it behind a scope. */
  all: CategoryChip;
  /** The drawn facets, cut to `maxVisible`, the selected one active. */
  facets: CategoryChip[];
  /** What a chip row or a rail draws, in order: the scope, or "all", then the facets. */
  items: CategoryChip[];
}

export interface CategoryChipInput {
  facets: readonly CategoryFacetInput[];
  /** The category the answer was asked for, or null/empty for none. */
  selected: string | null | undefined;
  /**
   * The answer's total — the count of "all", and of a scope (the scoped answer's
   * own total). Omit it when the display does not print one: the counts it
   * would have produced are then `null` (unmeasured), never a made-up zero.
   */
  total?: number;
  /** The merchant's `results.categories.maxVisible`. */
  maxVisible: number;
  /** The one name formatter of the surface (`formatCategoryName` with the naming setting). */
  format: (name: string) => string;
  /** The sentence of "all" (`searchText(settings, 'all')`). */
  allLabel: string;
}

/**
 * The chip model of one answer.
 *
 *  - A category is selected and is one of the DRAWN facets → that facet is
 *    active, "all" is not (what every display did before).
 *  - A category is selected and is not → a SCOPE chip, first and active.
 *    A selected facet that `maxVisible` cuts off is a scope too: nothing in the
 *    row would be lit otherwise, the same defect by another road.
 *  - No category → "all" is active.
 *
 * `selected` is compared exactly with a facet's `name`, as the displays always
 * did: it is a filter value, not a label.
 */
export function categoryChipModel(input: CategoryChipInput): CategoryChipModel {
  const selected = typeof input.selected === 'string' && input.selected.trim() ? input.selected : null;
  const limit = Math.max(0, Math.floor(input.maxVisible));
  const drawn = input.facets.slice(0, limit);

  const facets = drawn.map<CategoryChip>((facet) => ({
    kind: 'facet',
    value: facet.name,
    label: input.format(facet.label || facet.name),
    count: facet.count,
    active: selected !== null && selected === facet.name,
    clears: false,
  }));

  const all: CategoryChip = {
    kind: 'all',
    value: null,
    label: input.allLabel,
    count: input.total ?? null,
    active: selected === null,
    clears: false,
  };

  let scope: CategoryChip | null = null;
  if (selected !== null && !facets.some((facet) => facet.active)) {
    // A facet the cut dropped still knows its own label and count.
    const cut = input.facets.find((facet) => facet.name === selected);
    scope = {
      kind: 'scope',
      value: selected,
      label: input.format(cut?.label || cut?.name || selected),
      count: cut ? cut.count : (input.total ?? null),
      active: true,
      clears: true,
    };
  }

  return { scope, all, facets, items: [scope ?? all, ...facets] };
}
