import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Beden Rehberi',
  description: 'Ardisa giyim, jean ve ayakkabı beden tabloları; doğru ölçü almanın yolları.',
};

// Same figures as the PDP's size-guide modal (components/pdp/BuyBox.tsx).
const WOMEN = [
  ['XS', '32-34', '80-84', '60-64', '86-90'],
  ['S', '36', '84-88', '64-68', '90-94'],
  ['M', '38', '88-92', '68-72', '94-98'],
  ['L', '40', '92-98', '72-78', '98-104'],
  ['XL', '42', '98-104', '78-84', '104-110'],
];
const MEN = [
  ['XS', '44', '84-88', '70-74', '86-90'],
  ['S', '46', '88-94', '74-80', '90-96'],
  ['M', '48-50', '94-100', '80-86', '96-102'],
  ['L', '52', '100-106', '86-92', '102-108'],
  ['XL', '54', '106-112', '92-98', '108-114'],
];
const DENIM = [
  ['26', 'XS', '64-66', '88-90', '32'],
  ['27', 'XS', '66-68', '90-92', '32'],
  ['28', 'S', '69-71', '92-94', '32'],
  ['29', 'S', '71-73', '94-96', '32'],
  ['30', 'M', '74-76', '97-99', '32'],
  ['31', 'M', '76-78', '99-101', '32'],
  ['32', 'L', '79-81', '102-104', '34'],
  ['34', 'XL', '84-86', '107-109', '34'],
];
const SHOES = [
  ['36', '23,0', '3,5', '5,5'],
  ['37', '23,7', '4', '6'],
  ['38', '24,3', '5', '7'],
  ['39', '25,0', '6', '8'],
  ['40', '25,7', '6,5', '8,5'],
  ['41', '26,3', '7,5', '9,5'],
  ['42', '27,0', '8', '10'],
  ['43', '27,7', '9', '11'],
  ['44', '28,3', '9,5', '11,5'],
  ['45', '29,0', '10,5', '12,5'],
];

function SizeTable({ caption, head, rows, note }: { caption: string; head: string[]; rows: string[][]; note?: ReactNode }) {
  return (
    <div>
      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full min-w-[480px] text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-line bg-sand/60 text-left text-2xs uppercase tracking-label text-ink-muted">
              {head.map((h) => (
                <th key={h} scope="col" className="px-4 py-3 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r[0]}>
                {r.map((c, i) =>
                  i === 0 ? (
                    <th key={i} scope="row" className="px-4 py-3 text-left font-semibold">
                      {c}
                    </th>
                  ) : (
                    <td key={i} className="px-4 py-3 text-ink-soft">
                      {c}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {note && <p className="mt-3 text-xs text-ink-muted">{note}</p>}
    </div>
  );
}

const SECTIONS = [
  { id: 'kadin', label: 'Kadın giyim' },
  { id: 'erkek', label: 'Erkek giyim' },
  { id: 'jean', label: 'Jean & pantolon' },
  { id: 'ayakkabi', label: 'Ayakkabı' },
  { id: 'olcu', label: 'Nasıl ölçülür?' },
];

export default function SizeGuidePage() {
  const apparelHead = ['Beden', 'TR', 'Göğüs (cm)', 'Bel (cm)', 'Basen (cm)'];
  return (
    <div className="container py-10 md:py-16" id="size-guide">
      <div className="max-w-2xl">
        <p className="eyebrow">Yardım</p>
        <h1 className="mt-2 font-display text-4xl md:text-5xl">Beden Rehberi</h1>
        <p className="mt-4 text-sm leading-relaxed text-ink-soft">
          Tablolardaki ölçüler vücut ölçüsüdür. İki beden arasında kalıyorsanız rahat kalıp için büyük bedeni, oturan kalıp için küçük bedeni
          tercih edin. Beden değişimi tüm mağazalarımızda ücretsizdir.
        </p>
      </div>

      <nav aria-label="Bölümler" className="no-scrollbar -mx-4 mt-8 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="chip shrink-0">
            {s.label}
          </a>
        ))}
      </nav>

      <div className="mt-12 space-y-16">
        <section id="kadin" aria-labelledby="kadin-title" className="scroll-mt-32">
          <h2 id="kadin-title" className="mb-5 font-display text-3xl">Kadın giyim</h2>
          <SizeTable caption="Kadın giyim beden tablosu" head={apparelHead} rows={WOMEN} note="Elbise, bluz, gömlek, triko, etek ve dış giyim için geçerlidir." />
        </section>

        <section id="erkek" aria-labelledby="erkek-title" className="scroll-mt-32">
          <h2 id="erkek-title" className="mb-5 font-display text-3xl">Erkek giyim</h2>
          <SizeTable caption="Erkek giyim beden tablosu" head={apparelHead} rows={MEN} note="Tişört, gömlek, sweatshirt, şort ve dış giyim için geçerlidir." />
        </section>

        <section id="jean" aria-labelledby="jean-title" className="scroll-mt-32">
          <h2 id="jean-title" className="mb-5 font-display text-3xl">Jean & pantolon</h2>
          <SizeTable
            caption="Jean ve pantolon beden tablosu"
            head={['Bel numarası', 'Harf beden', 'Bel (cm)', 'Basen (cm)', 'Boy (inç)']}
            rows={DENIM}
            note="Jeanlerimiz bel numarasıyla satılır. Streç olmayan modellerde bir büyük numarayı tercih edebilirsiniz."
          />
        </section>

        <section id="ayakkabi" aria-labelledby="ayakkabi-title" className="scroll-mt-32">
          <h2 id="ayakkabi-title" className="mb-5 font-display text-3xl">Ayakkabı</h2>
          <SizeTable
            caption="Ayakkabı numara tablosu"
            head={['Numara (EU)', 'Ayak uzunluğu (cm)', 'UK', 'US']}
            rows={SHOES}
            note="Kadın ayakkabıları 36-41, erkek ayakkabıları 40-45 numara aralığında üretilir. Yarım numara giyiyorsanız bir büyük numarayı seçin."
          />
        </section>

        <section id="olcu" aria-labelledby="olcu-title" className="scroll-mt-32">
          <h2 id="olcu-title" className="mb-5 font-display text-3xl">Nasıl ölçülür?</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Göğüs', 'Mezurayı göğsün en geniş yerinden, kolların altından geçirerek yere paralel tutun.'],
              ['Bel', 'Belin en ince yerinden, göbek deliğinin hemen üstünden ölçün. Mezurayı sıkmayın.'],
              ['Basen', 'Ayaklarınız bitişikken kalçanın en geniş yerinden ölçün.'],
              ['Ayak', 'Topuğunuzu duvara dayayın; topuktan en uzun parmağın ucuna kadar olan mesafeyi ölçün. Akşam ölçmek daha doğru sonuç verir.'],
            ].map(([t, d], i) => (
              <div key={t} className="card p-5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sand text-xs font-semibold">{i + 1}</span>
                <p className="mt-4 font-medium">{t}</p>
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">{d}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="mt-16 flex flex-col items-start gap-4 rounded-2xl bg-sand p-6 md:flex-row md:items-center md:justify-between md:p-8">
        <div>
          <p className="font-display text-2xl">Bedeniniz uymadı mı?</p>
          <p className="mt-1 text-sm text-ink-soft">30 gün içinde kargoyla veya mağazadan ücretsiz değişim ve iade.</p>
        </div>
        <Link href="/sozlesmeler/iade-kosullari" className="btn-outline">İade ve Değişim Koşulları</Link>
      </div>
    </div>
  );
}
