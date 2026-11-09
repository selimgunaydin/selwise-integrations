'use client';

import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';

export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-modal flex items-end justify-center bg-ink/40 sm:items-center sm:p-4 animate-fade-in" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className={`max-h-[88vh] w-full overflow-y-auto rounded-t-2xl bg-white sm:rounded-2xl ${wide ? 'max-w-3xl' : 'max-w-lg'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-line bg-white px-6 py-4">
          <p className="font-display text-xl">{title}</p>
          <button onClick={onClose} aria-label="Kapat" className="-mr-2 p-2 text-ink-muted hover:text-ink">
            <X size={18} />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
