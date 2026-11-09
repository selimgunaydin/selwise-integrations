'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DEVELOPER_PAGES } from '@/lib/developer';

export function DevNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Geliştirici bölümleri" className="no-scrollbar mt-8 flex gap-1 overflow-x-auto border-b border-line">
      {DEVELOPER_PAGES.map(([href, label]) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm ${active ? 'border-ink font-medium text-ink' : 'border-transparent text-ink-muted hover:text-ink'}`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
