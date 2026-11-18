// GENERATED FILE — DO NOT EDIT.
//
// Vendored from packages/widget-contract/src/category-list.ts by
// scripts/sync-vendored-page-targeting.js. Edit the source, then run:
//
//   node scripts/sync-vendored-page-targeting.js
//
// It is copied rather than imported because @selwise/widget-contract is private
// and this SDK is published: a dependency on it would not resolve for anyone
// who installs @selwise/react-native from npm.

/**
 * Category lists by PATH, not by substring — the pure half, shared by the API
 * (SQL spells the same rule in `apps/api/src/common/helpers/category-list.ts`)
 * and by the storefront widget's search results.
 *
 * `products.categories` carries one or more category paths (`A > B > C`,
 * several separated by `|`, `;` or — see {@link splitCategoryList} — `,`). It is
 * the ONE place that splits that value: nothing else may carry its own splitter
 * (`contract:copies:check`). The SQL spelling in the API must agree with it.
 *
 * What "matches a target" means depends on the caller (`CategoryMatchMode`): a
 * tree node or a typed name. Separators are compared without their spacing
 * (`A>B` = `A > B`) and case is folded, because feeds spell both freely.
 */

const PATH_SEPARATOR = /\s*>\s*/g;

/**
 * The pieces of a `categories` value, trimmed and in feed order (not
 * normalised, not unique — callers that compare normalise, a picker shows them).
 *
 * `|` and `;` always separate. A comma is read per piece:
 *  - a piece with no `>` is a flat list: "Erkek, Kadın" is two categories;
 *  - a piece with `>` is split at its commas only when EVERY non-empty part is
 *    itself a path ("A > B, C > D" is two paths, the shape a feed that joins
 *    full paths uses); when some part is not ("A > B, C", "Erkek > Kazak, Hırka")
 *    the comma is inside a name and the piece stays whole.
 *
 * {@link CATEGORY_PATHS_FROM_SQL} makes the same decision in Postgres; the two
 * must agree.
 */
export function splitCategoryList(categories: string | null | undefined): string[] {
  if (!categories) return [];
  const pieces: string[] = [];
  for (const raw of categories.split(/[|;]/)) {
    const piece = raw.trim();
    if (!piece) continue;
    const parts = piece.split(',');
    const commaSeparates =
      !piece.includes('>') ||
      parts.every((part) => part.trim().length === 0 || part.includes('>'));
    for (const part of commaSeparates ? parts : [piece]) {
      const trimmed = part.trim();
      if (trimmed) pieces.push(trimmed);
    }
  }
  return pieces;
}

/** One path, in the spelling the SQL below compares. */
export function normalizeCategoryPath(path: string): string {
  return String(path ?? '')
    .trim()
    .replace(PATH_SEPARATOR, '>')
    // Not `toLocaleLowerCase('tr')`: the SQL side folds with Postgres
    // `lower()`, which maps "I" to "i" as this does.
    .toLowerCase();
}

/** A product's `categories` value split into its paths, normalised, unique. */
export function categoryPathsOf(categories: string | null | undefined): string[] {
  if (!categories) return [];
  return [
    ...new Set(
      splitCategoryList(categories)
        .map(normalizeCategoryPath)
        .filter((path) => path.length > 0),
    ),
  ];
}

/**
 * A product's top-level category: the first segment of its FIRST path. One
 * category per product, so a breakdown's groups add up to its total — a
 * product listed under two top-level categories is reported under the first.
 */
export function primaryTopCategory(categories: string | null | undefined): string | null {
  const firstPath = splitCategoryList(categories)[0];
  const top = firstPath?.split('>')[0]?.trim();
  return top ? top : null;
}

/**
 * What a target MEANS — the caller must say, there is no default.
 *
 *  - `subtree`: a NODE of the category tree. A product matches when one of its
 *    paths IS the target or lies UNDER it, counted from the root. The facet, the
 *    tree picker and the product list select a node, and the node's count must
 *    equal what the click returns.
 *  - `named`: a category NAME a merchant typed into a rule. The target is a run
 *    of whole segments ANYWHERE in a path, so `Ayakkabı` is `Ayakkabı > Erkek
 *    Ayakkabı` and `Kadın > Ayakkabı` alike — a feed files one category at two
 *    depths and a rule means the category, not a position in a tree. Whole
 *    segments only: `Giyim` never reaches `İç Giyim`.
 *
 * Reading both through one root-anchored rule narrowed a live rule from 17,055
 * shoes to 3,024 (underarmour.com.tr, 14 November 2026). The SQL spelling is
 * `categoryPathMatchSql` in the API; the two must agree.
 */
export type CategoryMatchMode = 'subtree' | 'named';

/** Whether a product's categories match any target, read as `mode` says. */
export function matchesCategoryPaths(
  categories: string | null | undefined,
  targets: string[],
  mode: CategoryMatchMode,
): boolean {
  const normalizedTargets = targets.map(normalizeCategoryPath).filter(Boolean);
  return categoryPathsOf(categories).some((path) =>
    normalizedTargets.some((target) =>
      mode === 'named'
        ? // Wrapped in separators so `giyim` never reaches `iç giyim`.
          `>${path}>`.includes(`>${target}>`)
        : path === target || path.startsWith(`${target}>`),
    ),
  );
}

/**
 * The most product ids a category condition resolves to. The ids go back into
 * a Prisma `in`, and Postgres binds at most 32,767 parameters per statement;
 * a category larger than this is read as its first 10,000 rows.
 */
export const CATEGORY_MATCH_ID_CAP = 10_000;
