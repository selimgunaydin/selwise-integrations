'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { productClick, productImpression } from '@/lib/selwise/client';

/**
 * Listing impressions and clicks, the way a GA4 merchant measures them: a card
 * counts as seen once half of it has been on screen, once per page view.
 */
export function ListTracker({ children, className, resetKey = '' }: { children: ReactNode; className?: string; resetKey?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const key = `${pathname}?${resetKey}`;

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const seen = new Set<string>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          const code = el.dataset.ardisaCard!;
          if (seen.has(code)) continue;
          seen.add(code);
          productImpression(code, el.dataset.list || 'list', Number(el.dataset.position || 0), Number(el.dataset.price || 0));
          io.unobserve(el);
        }
      },
      { threshold: 0.5 },
    );
    root.querySelectorAll<HTMLElement>('[data-ardisa-card]').forEach((el) => io.observe(el));
    const onClick = (ev: MouseEvent) => {
      const card = (ev.target as HTMLElement).closest<HTMLElement>('[data-ardisa-card]');
      const link = (ev.target as HTMLElement).closest('a');
      if (!card || !link) return;
      productClick(card.dataset.ardisaCard!, card.dataset.list || 'list', Number(card.dataset.position || 0), Number(card.dataset.price || 0));
    };
    root.addEventListener('click', onClick, true);
    return () => {
      io.disconnect();
      root.removeEventListener('click', onClick, true);
    };
  }, [key]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
