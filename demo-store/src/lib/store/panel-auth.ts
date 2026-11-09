import { cookies } from 'next/headers';

export const PANEL_COOKIE = 'ardisa_panel';

/**
 * The test panel changes the shared catalogue (prices, stock, coupons), so on
 * the public demo it sits behind a key (`DEMO_PANEL_KEY`), entered once at
 * /demo-panel and remembered in a cookie (set by /api/demo/unlock). Unset =
 * open, which is what local development wants.
 */
export function panelAllowed() {
  const key = process.env.DEMO_PANEL_KEY;
  if (!key) return true;
  return cookies().get(PANEL_COOKIE)?.value === key;
}
