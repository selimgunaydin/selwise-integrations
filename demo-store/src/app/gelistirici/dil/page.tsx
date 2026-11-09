import { Code, DocLink, Field, Panel, SourceLink } from '@/components/developer/DevBits';
import { LocaleSwitch } from '@/components/developer/LocaleSwitch';
import { HeadlessCard } from '@/components/selwise/headless/HeadlessCard';
import { PRODUCTS } from '@/lib/catalog';
import { englishProduct, missingEnglishNames } from '@/lib/catalog/en';
import { selwiseConfig } from '@/lib/selwise/config';
import { searchProducts } from '@/lib/selwise/headless';
import { storeLocale } from '@/lib/selwise/locale';

export const metadata = { title: 'Dil' };

const SNIPPET = `<!-- Widget dili <html lang>'den okur; tarayıcının dilini değil -->
<html lang="en">

// lang özniteliği dili doğru söylemiyorsa (yalnızca gerçek örnekte, kuyruğa girmez)
Selwise.setLocale('en');

// Sunucu çağrıları aynı dili lang= ile ister
GET /public/sites/SITE_KEY/search?q=linen&lang=en
GET /public/sites/SITE_KEY/ssr/recommendations/WIDGET_ID?lang=en`;

export default async function LanguagePage() {
  const cfg = selwiseConfig();
  const lang = storeLocale();
  const sample = PRODUCTS[0];
  const sampleEn = englishProduct(sample);
  const missing = missingEnglishNames(PRODUCTS);
  const search = await searchProducts(lang === 'en' ? 'linen' : 'keten', { limit: 6, lang });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title="Selwise bu mağazada hangi dilde konuşuyor" aside={<LocaleSwitch current={lang} />}>
        <dl>
          <Field label="<html lang>" value={lang} />
          <Field label="Mağazanın kendi metinleri" value="Türkçe (Ardisa’nın İngilizce sayfası yok)" />
          <Field label="Selwise yüzeyleri" value={lang === 'en' ? 'İngilizce — hesapta İngilizce açıksa' : 'Türkçe (varsayılan dil)'} />
        </dl>
        <p>
          Dil seçimi yalnızca Selwise’ın çizdiklerini değiştirir: kampanya metinleri (panelde dil dil yazılan <code>{'{ $i18n }'}</code> alanları), arama
          sonuçları ve öneri şeritlerindeki ürün adları. Hesabın dillerini Selwise hesap yöneticiniz açar; açık olmayan bir dil istenirse varsayılan dil
          gelir.
        </p>
        <p className="text-xs uppercase tracking-label text-ink-muted">Arama API’si, lang={lang}</p>
        {!search.ok ? (
          <p className="text-sale">{search.reason}</p>
        ) : search.data.hits.length === 0 ? (
          <p className="text-ink-muted">
            “{lang === 'en' ? 'linen' : 'keten'}” için {lang} dilinde sonuç yok. Arama yalnızca ziyaretçinin dilinde yapılır, varsayılan dile ikinci bir arama
            yapılmaz: hesapta bu dil açık değilse ya da dil feed’i henüz okunmadıysa sonuç boş gelir.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {search.data.hits.slice(0, 6).map((h) => (
              <HeadlessCard key={h.itemCode} product={h} locale={lang === 'en' ? 'en-GB' : 'tr-TR'} />
            ))}
          </div>
        )}
      </Panel>

      <div className="space-y-6">
        <Panel title="Kataloğun dili: dil feed’i" aside={<SourceLink path="src/app/feeds/google.en.xml/route.ts" />}>
          <p>
            Ürün adları Selwise’da hiçbir zaman makineyle çevrilmez. Mağaza her dil için yalnızca <strong>kelimeleri</strong> taşıyan bir dil feed’i verir;
            satırlar ana feed’e ürün koduyla bağlanır, fiyat ve stok ana feed’den gelir.
          </p>
          <dl>
            <Field label="Ana feed" value={`${cfg.publicUrl}/feeds/google.xml`} />
            <Field label="İngilizce dil feed’i" value={`${cfg.publicUrl}/feeds/google.en.xml`} />
            <Field label="Örnek" value={`${sample.title} → ${sampleEn.title}`} />
            <Field label="Çevrilmemiş ad" value={missing.length ? missing.join(', ') : 'yok'} />
          </dl>
          <DocLink path="product-feeds/language-feeds">Dil feed’leri</DocLink>
        </Panel>
        <Panel title="Kod">
          <Code>{SNIPPET}</Code>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <SourceLink path="src/lib/selwise/locale.ts" />
            <SourceLink path="src/components/developer/LocaleSwitch.tsx" />
          </div>
          <DocLink path="integration/javascript-api">JavaScript API — Dil</DocLink>
        </Panel>
        <Panel title="Para birimi ve başka pazarlar">
          <p>
            Bir kanalın tek para birimi vardır (Ardisa: TRY). Başka bir para biriminde satılan pazar ayrı bir kanaldır: kendi site anahtarı, feed’i ve
            raporları olur. Olaylarda ve siparişte <code>currency</code> her zaman gönderilir; kanalın para birimi dışındaki bir sipariş ziyaretçiyi
            dönüştürür ama deney gelirine eklenmez.
          </p>
          <DocLink path="channels/channel-types">Kanal türleri</DocLink>
        </Panel>
      </div>
    </div>
  );
}
