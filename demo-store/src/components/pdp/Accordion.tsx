'use client';

import { ChevronDown } from 'lucide-react';
import { useState, type ReactNode } from 'react';

export function Accordion({ items, className = '' }: { items: Array<{ title: string; body: ReactNode; open?: boolean }>; className?: string }) {
  const [open, setOpen] = useState<number[]>(items.map((it, i) => (it.open ? i : -1)).filter((i) => i >= 0));
  return (
    <div className={`divide-y divide-line border-y border-line ${className}`}>
      {items.map((it, i) => {
        const isOpen = open.includes(i);
        return (
          <div key={it.title}>
            <button
              className="flex w-full items-center justify-between py-4 text-left text-sm font-medium"
              onClick={() => setOpen((o) => (isOpen ? o.filter((x) => x !== i) : [...o, i]))}
              aria-expanded={isOpen}
            >
              {it.title}
              <ChevronDown size={16} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {/* Kept mounted (hidden) so the description is in the HTML for crawlers and selectors. */}
            <div className={isOpen ? 'pb-5' : 'hidden'}>{it.body}</div>
          </div>
        );
      })}
    </div>
  );
}
