import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Hammer, Leaf, Recycle, Store } from 'lucide-react';
import { CATEGORY_TREE, PRODUCTS } from '@/lib/catalog';
import { STORES } from '@/lib/content/stores';

export const metadata: Metadata = {
  title: 'Hakkımızda',
  description: 'Ardisa’nın hikâyesi: 2014’te İstanbul’da başlayan, az ama iyi parçalara inanan bir yaşam markası.',
};

const VALUES = [
  { icon: Leaf, title: 'Doğal lifler', text: 'Keten, organik pamuk, yün ve kaşmir karışımları. Koleksiyonlarımızın büyük bölümü doğal ya da geri dönüştürülmüş liflerden üretilir.' },
  { icon: Hammer, title: 'Uzun ömür', text: 'Bir sezon değil, yıllarca kullanılacak parçalar tasarlıyoruz. Dikişten düğmeye her detayı dayanıklılık için test ediyoruz.' },
  { icon: Recycle, title: 'Sorumlu üretim', text: 'Üreticilerimizin çoğu Türkiye’de ve uzun yıllardır birlikte çalıştığımız atölyeler. Adil ücret ve güvenli çalışma koşulları ilk şartımız.' },
  { icon: Store, title: 'Yakın mağazacılık', text: 'Online siparişinizi mağazadan teslim alabilir, iade ve değişimi size en yakın Ardisa mağazasında yapabilirsiniz.' },
];

const CITY_COUNT = new Set(STORES.map((s) => s.city)).size;

const TIMELINE = [
  ['2014', 'İlk mağaza', 'Nişantaşı’nda, keten gömlek ve triko odaklı küçük bir mağaza olarak açıldık.'],
  ['2017', 'Ardisa Home', 'Ev tekstili ve ev kokularıyla evin içine taşındık.'],
  ['2019', 'Online mağaza', 'Tüm koleksiyonu internetten satışa sunduk; mağazadan teslim seçeneğini başlattık.'],
  ['2021', 'Ardisa Beauty', 'Sade içerikli cilt bakımı ve makyaj ürünlerinden oluşan kozmetik serimizi tanıttık.'],
  ['2024', 'Ardisa Active', 'Günlük hareket için tasarlanmış spor koleksiyonunu ekledik.'],
  ['2026', `${STORES.length} mağaza`, `Bugün ${CITY_COUNT} şehirde ${STORES.length} mağaza ve online mağazamızla hizmet veriyoruz.`],
];

export default function AboutPage() {
  const models = new Set(PRODUCTS.map((p) => p.groupCode)).size;
  const numbers = [
    ['2014', 'kuruluş yılı'],
    [String(STORES.length), 'mağaza'],
    [String(CITY_COUNT), 'şehir'],
    [`${models}+`, 'model'],
  ];

  return (
    <div id="about">
      <section className="border-b border-line bg-sand">
        <div className="container grid items-center gap-10 py-12 md:grid-cols-2 md:py-20">
          <div className="max-w-xl">
            <p className="eyebrow">Hakkımızda</p>
            <h1 className="mt-4 font-display text-5xl leading-[1.05] md:text-6xl">Az ama iyi. 2014’ten beri.</h1>
            <p className="mt-6 text-base leading-relaxed text-ink-soft">
              Ardisa, gündelik hayatı güzelleştiren sade parçalar üretmek için İstanbul’da kuruldu. Giyimden eve, bakımdan spora; uzun yıllar
              kullanılacak, kolay eşleşen ve iyi yaşlanan ürünler tasarlıyoruz.
            </p>
          </div>
          <img src="/img/c/kadin.svg" alt="Ardisa kadın koleksiyonundan ürünler" className="aspect-[5/4] w-full rounded-2xl object-cover" />
        </div>
      </section>

      <div className="container">
        <section className="mt-16 grid grid-cols-2 gap-6 md:grid-cols-4" aria-label="Rakamlarla Ardisa">
          {numbers.map(([n, label]) => (
            <div key={label} className="border-l border-line-strong pl-5">
              <p className="font-display text-4xl md:text-5xl">{n}</p>
              <p className="mt-1 text-sm text-ink-muted">{label}</p>
            </div>
          ))}
        </section>

        <section className="mt-20 grid items-center gap-10 md:grid-cols-2" aria-labelledby="about-story">
          <img src="/img/c/ev-yasam.svg" alt="Ardisa Home koleksiyonu" className="aspect-[5/4] w-full rounded-2xl object-cover md:order-2" />
          <div className="max-w-lg">
            <p className="eyebrow">Hikâyemiz</p>
            <h2 id="about-story" className="mt-3 font-display text-4xl leading-tight">Bir keten gömlekle başladı</h2>
            <div className="mt-5 space-y-4 text-sm leading-relaxed text-ink-soft">
              <p>
                İlk koleksiyonumuz on iki parçadan oluşuyordu: keten gömlekler, yün trikolar ve iki kaban. Hepsi aynı soruyla tasarlandı: “Bu parçayı
                beş yıl sonra da giymek ister miyiz?”
              </p>
              <p>
                O soruyu hâlâ soruyoruz. Tasarım ekibimiz İstanbul’da; üreticilerimizin çoğu Bursa, Denizli ve İstanbul’daki atölyeler. Her yeni
                kategoriye aynı özenle giriyoruz: önce kendimiz kullanıyor, sonra mağazaya koyuyoruz.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-20" aria-labelledby="about-values">
          <p className="eyebrow">Değerlerimiz</p>
          <h2 id="about-values" className="mt-2 font-display text-3xl">Neye önem veriyoruz?</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {VALUES.map(({ icon: Icon, title, text }) => (
              <div key={title} className="card p-6">
                <Icon size={22} strokeWidth={1.5} className="text-accent" />
                <p className="mt-4 font-medium">{title}</p>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-20 grid gap-10 lg:grid-cols-[1fr_1.2fr]" aria-labelledby="about-timeline">
          <div>
            <p className="eyebrow">Yolculuğumuz</p>
            <h2 id="about-timeline" className="mt-2 font-display text-3xl">On iki yılda neler oldu?</h2>
            <div className="mt-8 grid grid-cols-2 gap-3">
              <img src="/img/c/kozmetik.svg" alt="Ardisa Beauty ürünleri" className="aspect-square w-full rounded-2xl object-cover" />
              <img src="/img/c/erkek.svg" alt="Ardisa erkek koleksiyonu" className="aspect-square w-full rounded-2xl object-cover" />
            </div>
          </div>
          <ol className="relative space-y-8 border-l border-line-strong pl-8">
            {TIMELINE.map(([year, title, text]) => (
              <li key={year} className="relative">
                <span className="absolute -left-[37px] top-1.5 h-2.5 w-2.5 rounded-full bg-accent ring-4 ring-paper" aria-hidden />
                <p className="text-2xs font-semibold uppercase tracking-label text-accent">{year}</p>
                <p className="mt-1 font-display text-xl">{title}</p>
                <p className="mt-1 text-sm text-ink-soft">{text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-20 rounded-2xl border border-line bg-white p-8 md:p-12" aria-labelledby="about-cta">
          <div className="grid items-center gap-8 md:grid-cols-[1fr_auto]">
            <div>
              <h2 id="about-cta" className="font-display text-3xl">Koleksiyonu keşfedin</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {CATEGORY_TREE.map((c) => (
                  <Link key={c.slug} href={`/c/${c.slug}`} className="chip">
                    {c.name}
                  </Link>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/magazalar" className="btn-outline">
                Mağazalarımız
              </Link>
              <Link href="/c/yeni-gelenler" className="btn-primary">
                Yeni Gelenler <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </section>

        <p className="mt-10 text-xs text-ink-faint">
          Ardisa, Selwise kişiselleştirme platformunun demo mağazası için yaratılmış kurgusal bir markadır. Bu sayfadaki hikâye, rakamlar ve mağazalar
          gerçek değildir.
        </p>
      </div>
    </div>
  );
}
