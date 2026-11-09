'use client';

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { useStore } from '../Providers';

export function CopyButton({ value, label = 'Kopyala', className = 'btn-outline btn-sm' }: { value: string; label?: string; className?: string }) {
  const { toast } = useStore();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={className}
      aria-label={`${value} kodunu kopyala`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          toast(`${value} kopyalandı.`);
          setTimeout(() => setDone(false), 2000);
        } catch {
          toast('Kopyalanamadı, kodu elle seçebilirsiniz.', 'error');
        }
      }}
    >
      {done ? <Check size={14} /> : <Copy size={14} />}
      {done ? 'Kopyalandı' : label}
    </button>
  );
}
