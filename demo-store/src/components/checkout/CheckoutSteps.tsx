'use client';

import { usePathname } from 'next/navigation';
import { Check } from 'lucide-react';

const STEPS = [
  { key: 'cart', label: 'Sepet', match: '/cart' },
  { key: 'shipping', label: 'Teslimat', match: '/checkout/shipping' },
  { key: 'payment', label: 'Ödeme', match: '/checkout/payment' },
  { key: 'done', label: 'Onay', match: '/checkout/success' },
];

export function CheckoutSteps() {
  const path = usePathname() || '';
  const current = path.startsWith('/checkout/success') ? 3 : path.startsWith('/checkout/payment') || path.startsWith('/checkout/3d-secure') ? 2 : 1;
  return (
    <ol className="mx-auto flex max-w-xl items-center justify-between" aria-label="Sipariş adımları">
      {STEPS.map((s, i) => (
        <li key={s.key} className="flex flex-1 items-center last:flex-none">
          <div className="flex flex-col items-center gap-1.5">
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${
                i < current ? 'bg-ok text-white' : i === current ? 'bg-ink text-paper' : 'border border-line-strong text-ink-muted'
              }`}
            >
              {i < current ? <Check size={14} /> : i + 1}
            </span>
            <span className={`text-2xs ${i === current ? 'font-semibold text-ink' : 'text-ink-muted'}`}>{s.label}</span>
          </div>
          {i < STEPS.length - 1 && <span className={`mx-2 mb-5 h-px flex-1 ${i < current ? 'bg-ok' : 'bg-line-strong'}`} />}
        </li>
      ))}
    </ol>
  );
}
