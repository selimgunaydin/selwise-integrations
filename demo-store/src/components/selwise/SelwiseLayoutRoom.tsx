'use client';

import { useEffect } from 'react';

/**
 * Make room for Selwise's fixed surfaces, the way a real theme would.
 *
 * The widget draws its top bars (announcement, countdown) `position: fixed;
 * top: 0` on <body> — it has no inline placement for them — so on this store
 * they covered the sticky header and the logo, and two bars on one page sat on
 * top of each other. Its bottom surfaces (sticky footer, floating button) sat
 * on the product page's mobile buy bar.
 *
 * This measures them and publishes two CSS variables that globals.css uses:
 * --selwise-top-bar (the stacked height of every top bar: the page is padded
 * and the header offset by it) and --store-bottom-bar (the height of the
 * store's own mobile buy bar, which Selwise's bottom surfaces sit above). Both
 * are 0 when there is nothing to make room for.
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
      let offset = 0;
      document.querySelectorAll<HTMLElement>('.selwise-bar.selwise-bar-top').forEach((bar) => {
        watch(bar);
        bar.style.top = `${offset}px`;
        offset += Math.round(bar.getBoundingClientRect().height);
      });
      root.style.setProperty('--selwise-top-bar', `${offset}px`);

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
      root.style.removeProperty('--selwise-top-bar');
      root.style.removeProperty('--store-bottom-bar');
    };
  }, []);

  return null;
}
