import type { Metadata } from 'next';
import { DevNav } from '@/components/developer/DevNav';
import { PUBLIC_REPO_URL } from '@/lib/developer';

export const metadata: Metadata = {
  title: { default: 'Geliştirici', template: '%s · Geliştirici | Ardisa' },
  description: 'Ardisa’nın Selwise entegrasyonu: hangi parça nerede, canlı olarak.',
};

export default function DeveloperLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="container py-10 md:py-14">
      <p className="eyebrow">Geliştirici</p>
      <h1 className="mt-3 font-display text-4xl md:text-5xl">Selwise entegrasyonu, canlı</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">
        Bu mağaza, Selwise’ı özel altyapıyla (<code>custom</code>) kuran bir mağazanın eksiksiz örneğidir. Kaynağı açık:{' '}
        <a href={PUBLIC_REPO_URL} className="link" target="_blank" rel="noreferrer">
          {PUBLIC_REPO_URL.replace(/^https:\/\//, '')}
        </a>
        .
      </p>
      <DevNav />
      <div className="mt-8">{children}</div>
    </div>
  );
}
