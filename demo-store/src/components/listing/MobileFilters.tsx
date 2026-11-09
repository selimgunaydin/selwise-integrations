'use client';

import { SlidersHorizontal, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';

export function MobileFilters({ children, count }: { children: ReactNode; count: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="chip lg:hidden" onClick={() => setOpen(true)}>
        <SlidersHorizontal size={14} /> Filtrele {count > 0 && <span className="rounded-full bg-ink px-1.5 text-[10px] text-paper">{count}</span>}
      </button>
      {open && (
        <div className="fixed inset-0 z-drawer bg-ink/40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-y-0 left-0 w-[86%] max-w-sm overflow-y-auto bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-6 flex items-center justify-between">
              <p className="font-display text-2xl">Filtrele</p>
              <button onClick={() => setOpen(false)} aria-label="Kapat">
                <X size={20} />
              </button>
            </div>
            <div onClick={(e) => (e.target as HTMLElement).closest('a') && setOpen(false)}>{children}</div>
          </div>
        </div>
      )}
    </>
  );
}
