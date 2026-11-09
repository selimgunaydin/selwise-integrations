'use client';

import type { ReactNode } from 'react';

export async function post<T = Record<string, unknown>>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
  return data as T;
}

/** A titled block of the back office. Quiet on purpose: the content is the point. */
export function Panel({ title, hint, action, children, id }: { title: string; hint?: ReactNode; action?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className="rounded-xl border border-line bg-white" id={id}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {hint && <p className="mt-1 max-w-xl text-xs leading-relaxed text-ink-muted">{hint}</p>}
        </div>
        {action}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

const TONES = {
  neutral: 'bg-sand text-ink-soft',
  ok: 'bg-ok/10 text-ok',
  warn: 'bg-warn/10 text-warn',
  bad: 'bg-sale/10 text-sale',
  accent: 'bg-accent-soft text-accent-deep',
} as const;

export function Badge({ tone = 'neutral', children, title }: { tone?: keyof typeof TONES; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-4 ${TONES[tone]}`}>
      {children}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-line-strong px-4 py-6 text-center text-xs text-ink-muted">{children}</p>;
}
