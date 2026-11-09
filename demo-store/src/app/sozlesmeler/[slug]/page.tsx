import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LEGAL_PAGES, isLegalSlug } from '@/lib/legal';
import { LEGAL_DOCS, type LegalBlock } from '@/lib/content/legal-content';
import { formatDate } from '@/lib/format';

type Props = { params: { slug: string } };

export function generateMetadata({ params }: Props): Metadata {
  if (!isLegalSlug(params.slug)) return {};
  const doc = LEGAL_DOCS[params.slug];
  return { title: doc.title, description: doc.summary };
}

function Block({ block }: { block: LegalBlock }) {
  if (typeof block === 'string') return <p>{block}</p>;
  return (
    <ul className="list-disc space-y-1.5 pl-5 marker:text-ink-faint">
      {block.list.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export default function LegalPage({ params }: Props) {
  if (!isLegalSlug(params.slug)) notFound();
  const slug = params.slug;
  const doc = LEGAL_DOCS[slug];

  return (
    <div className="container py-10 md:py-16" id="legal">
      <div className="grid gap-8 lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-14">
        <nav aria-label="Sözleşmeler ve politikalar" className="lg:sticky lg:top-32 lg:self-start">
          <p className="eyebrow mb-3 hidden lg:block">Sözleşmeler</p>
          <ul className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:block lg:space-y-0.5 lg:overflow-visible lg:px-0">
            {LEGAL_PAGES.map((p) => {
              const on = p.slug === slug;
              return (
                <li key={p.slug} className="shrink-0">
                  <Link
                    href={`/sozlesmeler/${p.slug}`}
                    aria-current={on ? 'page' : undefined}
                    className={`block rounded-full border px-4 py-2 text-xs transition-colors lg:rounded-lg lg:border-0 lg:px-3 lg:py-2 lg:text-sm ${
                      on ? 'border-ink bg-ink text-paper lg:bg-sand lg:font-medium lg:text-ink' : 'border-line-strong bg-white text-ink-soft hover:border-ink lg:bg-transparent lg:hover:bg-sand/60 lg:hover:text-ink'
                    }`}
                  >
                    {p.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <article className="min-w-0 max-w-3xl">
          <p className="eyebrow">Son güncelleme: {formatDate(doc.updated)}</p>
          <h1 className="mt-2 font-display text-4xl md:text-5xl">{doc.title}</h1>
          <p className="mt-4 text-base leading-relaxed text-ink-soft">{doc.summary}</p>

          <div className="mt-6 rounded-xl border border-warn/30 bg-warn/5 p-4 text-xs leading-relaxed text-ink-soft">
            <strong className="text-ink">Demo mağaza:</strong> Ardisa kurgusal bir markadır ve bu metin yalnızca örnek amaçlıdır. Sitede gerçek satış
            yapılmaz, ödeme alınmaz.
          </div>

          <div className="mt-10 space-y-10">
            {doc.sections.map((s) => (
              <section key={s.heading}>
                <h2 className="font-display text-2xl">{s.heading}</h2>
                <div className="mt-3 space-y-3 text-sm leading-relaxed text-ink-soft">
                  {s.body.map((b, i) => (
                    <Block key={i} block={b} />
                  ))}
                </div>
              </section>
            ))}
          </div>

          <p className="mt-12 border-t border-line pt-6 text-xs text-ink-muted">
            Sorularınız için <Link href="/iletisim" className="link">iletişim sayfamızdan</Link> bize ulaşabilirsiniz.
          </p>
        </article>
      </div>
    </div>
  );
}
