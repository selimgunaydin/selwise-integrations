import Link from 'next/link';
import { Instagram, Facebook, Youtube, Twitter } from 'lucide-react';
import { selwiseConfig } from '@/lib/selwise/config';
import { NewsletterForm } from './NewsletterForm';
import { ConsentLink } from './ConsentLink';
import { CATEGORY_TREE } from '@/lib/catalog';

const COLUMNS: Array<{ title: string; links: Array<[string, string]> }> = [
  {
    title: 'Kurumsal',
    links: [
      ['/hakkimizda', 'Hakkımızda'],
      ['/magazalar', 'Mağazalarımız'],
      ['/kampanyalar', 'Kampanyalar'],
      ['/markalar', 'Markalarımız'],
      ['/iletisim', 'İletişim'],
    ],
  },
  {
    title: 'Yardım',
    links: [
      ['/yardim', 'Sıkça Sorulan Sorular'],
      ['/siparis-takip', 'Sipariş Takibi'],
      ['/sozlesmeler/iade-kosullari', 'İade ve Değişim'],
      ['/sozlesmeler/teslimat-kosullari', 'Teslimat Koşulları'],
      ['/beden-rehberi', 'Beden Rehberi'],
    ],
  },
  {
    title: 'Hesabım',
    links: [
      ['/account', 'Hesabım'],
      ['/account/siparislerim', 'Siparişlerim'],
      ['/account/favorilerim', 'Favorilerim'],
      ['/karsilastir', 'Karşılaştırma Listem'],
      ['/register', 'Üye Ol'],
      ['/gelistirici', 'Geliştirici'],
    ],
  },
];

export function Footer() {
  const cfg = selwiseConfig();
  return (
    <footer className="mt-24 border-t border-line bg-white">
      <div className="border-b border-line bg-sand">
        <div className="container grid gap-8 py-12 md:grid-cols-2 md:items-center">
          <div>
            <p className="font-display text-3xl">Bültenimize katılın, %10 kazanın</p>
            <p className="mt-2 text-sm text-ink-soft">Yeni koleksiyonlardan, size özel kampanyalardan ilk siz haberdar olun.</p>
          </div>
          <NewsletterForm siteKey={cfg.siteKey} apiUrl={cfg.apiUrl} />
        </div>
      </div>
      <div className="container grid gap-10 py-14 md:grid-cols-6">
        <div className="md:col-span-2">
          <p className="font-display text-3xl font-semibold">ardisa<span className="text-accent">.</span></p>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-soft">
            Gündelik hayatı güzelleştiren giyim, ev ve bakım ürünleri. Sade tasarım, uzun ömürlü malzeme.
          </p>
          <div className="mt-6 flex gap-3 text-ink-soft">
            {[Instagram, Facebook, Twitter, Youtube].map((Icon, i) => (
              <span key={i} className="flex h-9 w-9 items-center justify-center rounded-full border border-line-strong">
                <Icon size={16} />
              </span>
            ))}
          </div>
        </div>
        <div>
          <p className="eyebrow mb-4">Kategoriler</p>
          <ul className="space-y-2.5 text-sm text-ink-soft">
            {CATEGORY_TREE.map((c) => (
              <li key={c.slug}>
                <Link href={`/c/${c.slug}`} className="hover:text-ink">{c.name}</Link>
              </li>
            ))}
          </ul>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <p className="eyebrow mb-4">{col.title}</p>
            <ul className="space-y-2.5 text-sm text-ink-soft">
              {col.links.map(([href, label]) => (
                <li key={href}>
                  <Link href={href} className="hover:text-ink">{label}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="container flex flex-col gap-4 py-6 text-2xs text-ink-muted md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/sozlesmeler/kvkk-aydinlatma-metni" className="hover:text-ink">KVKK Aydınlatma Metni</Link>
            <Link href="/sozlesmeler/gizlilik-politikasi" className="hover:text-ink">Gizlilik Politikası</Link>
            <Link href="/sozlesmeler/cerez-politikasi" className="hover:text-ink">Çerez Politikası</Link>
            <Link href="/sozlesmeler/mesafeli-satis-sozlesmesi" className="hover:text-ink">Mesafeli Satış Sözleşmesi</Link>
            <ConsentLink />
          </div>
          <div className="flex items-center gap-2">
            {['VISA', 'Mastercard', 'Troy', 'Havale/EFT'].map((p) => (
              <span key={p} className="rounded border border-line-strong px-2 py-1 font-semibold text-ink-soft">{p}</span>
            ))}
          </div>
        </div>
        <p className="container pb-8 text-2xs text-ink-faint">
          © 2026 Ardisa — Bu site Selwise'ın demo mağazasıdır. Ardisa kurgusal bir markadır; ürünler, fiyatlar ve stoklar gerçek değildir, ödeme alınmaz.
        </p>
      </div>
    </footer>
  );
}
