import type { ReactNode } from 'react';
import { docsUrl, sourceUrl } from '@/lib/developer';

/** Small shared pieces of the developer section. Server-safe (no hooks). */

export function SourceLink({ path }: { path: string }) {
  return (
    <a href={sourceUrl(path)} target="_blank" rel="noreferrer" className="font-mono text-xs text-accent hover:underline">
      {path}
    </a>
  );
}

export function DocLink({ path, children }: { path: string; children: ReactNode }) {
  return (
    <a href={docsUrl(path)} target="_blank" rel="noreferrer" className="link text-sm">
      {children}
    </a>
  );
}

export function Panel({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-5 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-xl">{title}</h2>
        {aside}
      </div>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-ink-soft">{children}</div>
    </section>
  );
}

export function Code({ children }: { children: string }) {
  return <pre className="overflow-x-auto rounded-xl bg-ink p-4 text-xs leading-relaxed text-paper">{children}</pre>;
}

export function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-line py-2 last:border-0 sm:flex-row sm:gap-4">
      <dt className="w-44 shrink-0 text-xs uppercase tracking-label text-ink-muted">{label}</dt>
      <dd className="min-w-0 break-all font-mono text-xs text-ink">{value ?? '—'}</dd>
    </div>
  );
}
