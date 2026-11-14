'use client';

import { useEffect } from 'react';

/**
 * Make room for Selwise's bottom surfaces, the way a real theme would.
 *
 * Top bars need nothing from the store: the widget stacks them and pads
 * <body> by their height itself, and publishes that height as `--ws-edge-top`
 * on <html> (globals.css moves the sticky header down by it). Padding the page
 * here as well would reserve the room twice.
 *
 * The bottom surfaces (sticky footer, floating button) sit on the product
 * page's mobile buy bar, which only the store knows about. This publishes
 * --store-bottom-bar, the height of that buy bar, for globals.css to lift
 * them above it; it is 0 when the buy bar is not on screen.
 */
export function SelwiseLayoutRoom() {
  useEffect(() => {
    const root = document.documentElement;
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => schedule());
    const observed = new Set<Element>();

    const watch = (el: Element) => {
      if (resize && !observed.has(el)) {
        resize.observe(el);
        observed.add(el);
      }
    };

    function apply() {
      const buyBar = document.getElementById('pdp-sticky-bar');
      if (buyBar) watch(buyBar);
      const visible = buyBar && getComputedStyle(buyBar).display !== 'none';
      root.style.setProperty('--store-bottom-bar', `${visible ? Math.round(buyBar.getBoundingClientRect().height) : 0}px`);
    }

    // Bars arrive on <body>, the buy bar with a client-side route change, so
    // the whole tree is watched — measured at most once a frame.
    let frame = 0;
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(() => {
        frame = 0;
        apply();
      });
    };
    const mutations = new MutationObserver(schedule);
    mutations.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', schedule);
    apply();

    return () => {
      cancelAnimationFrame(frame);
      mutations.disconnect();
      resize?.disconnect();
      window.removeEventListener('resize', schedule);
      root.style.removeProperty('--store-bottom-bar');
    };
  }, []);

  return null;
}
