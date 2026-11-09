import type { ReactNode } from 'react';
import type { OrderStatus } from '@/lib/store/orders';
import { STATUS_TONE } from '@/lib/account/shared';

export function AccountHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="mt-1 font-display text-3xl md:text-4xl">{title}</h1>
        {description && <p className="mt-2 max-w-xl text-sm text-ink-soft">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function StatusBadge({ status, label }: { status: OrderStatus; label: string }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-2xs font-semibold ${STATUS_TONE[status]}`}>{label}</span>;
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-sand text-ink-soft">{icon}</div>
      <p className="mt-5 font-display text-2xl">{title}</p>
      <p className="mt-2 max-w-sm text-sm text-ink-soft">{text}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
