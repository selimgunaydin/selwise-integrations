/**
 * GA4 gap-fill for PZ Next storefronts.
 *
 * ## Why this exists
 *
 * `pz_next_project/src/utils/gtm.ts` pushes a solid GA4 set — `view_item`,
 * `view_item_list`, `select_item`, `add_to_cart`, `remove_from_cart`,
 * `view_cart`, `begin_checkout`, `add_shipping_info`, `add_payment_info`,
 * `purchase`, `login`, `add_to_wishlist`.
 *
 * Three standard events are MISSING: `search`, `sign_up` and `page_view`.
 * Consequences:
 *
 *   • no `search`   → the Selwise search report and every search-sourced
 *                     attribution stays empty, even though the site has search
 *   • no `sign_up`  → the registration funnel has no completion step
 *   • no `page_view`→ handled elsewhere, see below
 *
 * ## What this module does and does not push
 *
 * `search` and `sign_up` go into `window.dataLayer`, the shared layer. They are
 * standard GA4 events the site should be emitting anyway, so the merchant's own
 * GA4 property benefits too — this is a gap being closed, not Selwise-specific
 * instrumentation.
 *
 * `page_view` is deliberately NOT pushed here. GTM containers almost always
 * track page views themselves via a History Change trigger, and Selwise
 * auto-tracks them from `history.pushState`. Adding a third source would
 * double-count sessions in GA4.
 *
 * ## Install
 *
 * Copy to `src/utils/selwise-events.ts`, then add the two call sites.
 *
 * Search — `src/views/header/search/index.tsx`, where the query is submitted:
 *
 *     import { pushSearchEvent } from '@theme/utils/selwise-events';
 *     ...
 *     const url = `${ROUTES.LIST}/?search_text=${searchQuery}`;
 *     pushSearchEvent(searchQuery);       // add this line
 *     router.push(url);
 *
 * Registration — wherever the register mutation resolves
 * (`src/views/register/*`), after the account is created:
 *
 *     import { pushSignUpEvent } from '@theme/utils/selwise-events';
 *     ...
 *     pushSignUpEvent('email');
 *
 * Zero-results — on the list page, once the result count is known and the
 * request carried a `search_text`:
 *
 *     import { pushSearchEvent } from '@theme/utils/selwise-events';
 *     ...
 *     pushSearchEvent(searchText, data?.pagination?.total_count ?? 0);
 */

type DataLayerRecord = Record<string, unknown>;

function push(payload: DataLayerRecord): void {
  if (typeof window === 'undefined') return;

  const win = window as typeof window & { dataLayer?: DataLayerRecord[] };
  win.dataLayer = win.dataLayer || [];
  win.dataLayer.push(payload);
}

/**
 * GA4 `search`.
 *
 * `resultCount` is optional but worth passing: Selwise reads it to separate a
 * search that found nothing from one that was never measured, which is what
 * drives the zero-results report and the synonym suggestions built on it.
 */
export function pushSearchEvent(searchTerm: string, resultCount?: number): void {
  const term = (searchTerm ?? '').trim();
  if (!term) return;

  push({
    event: 'search',
    search_term: term,
    ...(typeof resultCount === 'number' ? { search_results: resultCount } : {}),
  });
}

/** GA4 `sign_up`. `method` is the signup route: `email`, `google`, `apple`, `otp`. */
export function pushSignUpEvent(method = 'email'): void {
  push({ event: 'sign_up', method });
}

/**
 * Search-result click.
 *
 * PZ Next already pushes `select_item` for category and recommendation lists.
 * Passing `item_list_name: 'search_results'` is what lets Selwise attribute the
 * click to the search rather than to a generic list — without it a search click
 * and a category click are indistinguishable server-side.
 */
export function pushSearchResultClick(
  searchTerm: string,
  item: { item_id: string; item_name?: string; price?: number; index?: number },
  currency?: string
): void {
  const term = (searchTerm ?? '').trim();
  if (!term || !item?.item_id) return;

  // Clear the previous ecommerce object first: this is the documented way to
  // stop GTM merging consecutive ecommerce payloads, and PZ Next's own
  // `gtm.ts` does the same before each push.
  push({ ecommerce: null });
  push({
    event: 'select_item',
    search_term: term,
    ecommerce: {
      ...(currency ? { currency } : {}),
      item_list_id: 'search_results',
      item_list_name: 'search_results',
      items: [
        {
          item_id: item.item_id,
          ...(item.item_name ? { item_name: item.item_name } : {}),
          ...(typeof item.price === 'number' ? { price: item.price } : {}),
          ...(typeof item.index === 'number' ? { index: item.index } : {}),
        },
      ],
    },
  });
}
