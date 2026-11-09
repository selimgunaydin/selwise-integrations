import type { Metadata } from 'next';
import Link from 'next/link';
import { Mail, Package, RotateCcw, Ruler } from 'lucide-react';
import { FAQ } from '@/lib/content/faq';
import { FaqBrowser } from '@/components/content/FaqBrowser';

export const metadata: Metadata = {
  title: 'Yardım',
  description: 'Sipariş, kargo, iade, ödeme ve üyelikle ilgili sıkça sorulan sorular.',
};

const SHORTCUTS = [
  { href: '/siparis-takip', icon: Package, title: 'Sipariş Takibi', text: 'Siparişiniz nerede?' },
  { href: '/sozlesmeler/iade-kosullari', icon: RotateCcw, title: 'İade ve Değişim', text: '30 gün ücretsiz iade' },
  { href: '/beden-rehberi', icon: Ruler, title: 'Beden Rehberi', text: 'Doğru bedeni bulun' },
  { href: '/iletisim', icon: Mail, title: 'Bize Yazın', text: '24 saat içinde yanıt' },
];

export default function HelpPage() {
  return (
    <div id="help">
      <section className="border-b border-line bg-sand">
        <div className="container py-12 md:py-16">
          <p className="eyebrow">Yardım Merkezi</p>
          <h1 className="mt-2 font-display text-4xl md:text-5xl">Sıkça Sorulan Sorular</h1>
          <p className="mt-3 max-w-xl text-sm text-ink-soft">Aradığınız cevabı bulmak için bir kelime yazın ya da bir konu seçin.</p>
        </div>
      </section>
      <div className="container">
        <div className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-4">
          {SHORTCUTS.map(({ href, icon: Icon, title, text }) => (
            <Link key={href} href={href} className="card flex items-start gap-3 p-4 transition-colors hover:border-line-strong">
              <Icon size={18} strokeWidth={1.6} className="mt-0.5 shrink-0 text-accent" />
              <span>
                <span className="block text-sm font-medium">{title}</span>
                <span className="block text-2xs text-ink-muted">{text}</span>
              </span>
            </Link>
          ))}
        </div>
        <FaqBrowser categories={FAQ} />
      </div>
    </div>
  );
}
