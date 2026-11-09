'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Accordion } from '../pdp/Accordion';
import type { FaqCategory } from '@/lib/content/faq';

const TR: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', i: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };

/** Case- and accent-insensitive in Turkish: "iade" finds "İade", "odeme" finds "Ödeme". */
function fold(s: string) {
  return s
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıöşüâîû]/g, (c) => TR[c] || c)
    .replace(/\s+/g, ' ')
    .trim();
}

export function FaqBrowser({ categories }: { categories: FaqCategory[] }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<string | null>(null);
  const q = fold(query);

  const sections = useMemo(() => {
    const words = q.split(' ').filter(Boolean);
    return categories
      .filter((c) => !active || c.slug === active)
      .map((c) => ({
        ...c,
        items: words.length ? c.items.filter((it) => {
          const hay = fold(`${it.q} ${it.a}`);
          return words.every((w) => hay.includes(w));
        }) : c.items,
      }))
      .filter((c) => c.items.length > 0);
  }, [categories, active, q]);

  const total = sections.reduce((s, c) => s + c.items.length, 0);

  return (
    <div className="mt-10 grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-12">
      <div className="space-y-4 lg:sticky lg:top-32 lg:self-start">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" />
          <label htmlFor="faq-search" className="sr-only">Sorularda ara</label>
          <input
            id="faq-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Sorularda ara"
            className="input h-11 pl-10 pr-10"
            autoComplete="off"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="Aramayı temizle" className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-ink-muted hover:text-ink">
              <X size={14} />
            </button>
          )}
        </div>
        <nav aria-label="Konular" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0">
          {[{ slug: null as string | null, title: 'Tüm konular' }, ...categories.map((c) => ({ slug: c.slug as string | null, title: c.title }))].map((c) => {
            const on = active === c.slug;
            return (
              <button
                key={c.slug ?? 'all'}
                type="button"
                onClick={() => setActive(c.slug)}
                aria-pressed={on}
                className={`shrink-0 rounded-full px-4 py-2 text-left text-xs transition-colors lg:rounded-lg lg:px-3 lg:text-sm ${
                  on ? 'bg-ink text-paper lg:bg-sand lg:font-medium lg:text-ink' : 'border border-line-strong bg-white text-ink-soft hover:border-ink lg:border-0 lg:bg-transparent lg:hover:bg-sand/60'
                }`}
              >
                {c.title}
              </button>
            );
          })}
        </nav>
      </div>

      <div aria-live="polite">
        {q && <p className="mb-6 text-xs text-ink-muted">“{query.trim()}” için {total} sonuç</p>}
        {sections.length === 0 ? (
          <div className="card px-6 py-12 text-center">
            <p className="font-display text-2xl">Sonuç bulunamadı</p>
            <p className="mt-2 text-sm text-ink-soft">Farklı bir kelimeyle aramayı deneyin ya da sorunuzu bize iletin.</p>
            <Link href="/iletisim" className="btn-primary btn-sm mt-6">Bize Yazın</Link>
          </div>
        ) : (
          <div className="space-y-12">
            {sections.map((c) => (
              <section key={c.slug} id={`sss-${c.slug}`} aria-labelledby={`sss-${c.slug}-title`} className="scroll-mt-32">
                <h2 id={`sss-${c.slug}-title`} className="mb-2 font-display text-2xl">{c.title}</h2>
                {/* Keyed by the query so a new search starts with its matches open. */}
                <Accordion
                  key={`${c.slug}:${q}`}
                  items={c.items.map((it) => ({
                    title: it.q,
                    open: Boolean(q),
                    body: <p className="max-w-2xl text-sm leading-relaxed text-ink-soft">{it.a}</p>,
                  }))}
                />
              </section>
            ))}
          </div>
        )}
        <div className="mt-14 flex flex-col items-start gap-4 rounded-2xl bg-sand p-6 md:flex-row md:items-center md:justify-between md:p-8">
          <div>
            <p className="font-display text-2xl">Cevabı bulamadınız mı?</p>
            <p className="mt-1 text-sm text-ink-soft">Müşteri hizmetlerimiz hafta içi 09:00 – 21:00 arasında yanınızda.</p>
          </div>
          <Link href="/iletisim" className="btn-primary">İletişime Geçin</Link>
        </div>
      </div>
    </div>
  );
}
