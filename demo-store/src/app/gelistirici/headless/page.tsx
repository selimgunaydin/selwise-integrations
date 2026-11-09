import { DocLink, Panel, SourceLink } from '@/components/developer/DevBits';
import { HeadlessCard } from '@/components/selwise/headless/HeadlessCard';
import { PersonalStrip } from '@/components/selwise/headless/PersonalStrip';
import { SearchResults } from '@/components/selwise/headless/SearchResults';
import { PRODUCTS } from '@/lib/catalog';
import { selwiseConfig } from '@/lib/selwise/config';
import { recommendationStrips, searchProducts, ssrRecommendation, type SsrRecommendation } from '@/lib/selwise/headless';
import { storeLocale } from '@/lib/selwise/locale';

export const metadata = { title: 'Headless' };

const SKIPPED: Record<string, string> = {
  personal_strategy: 'Strateji ziyaretçinin geçmişini ya da sepetini okuyor: sunucuda basılmaz, tarayıcıda çizilir (aşağıda).',
  anchor_missing: 'Ürün bağlamlı strateji ama code gönderilmedi.',
  test_mode: 'Şerit test modunda: önbelleğe donsa herkese giderdi.',
  segment_targeted: 'Şerit bir segmente hedefli: sunucu ziyaretçiyi bilmez.',
  inactive: 'Şerit kapalı.',
  not_found: 'Bu kimlikte şerit yok.',
};

// Product-context strategies (similar, bought together…) need an anchor; any
// in-stock product of the catalogue will do for the demonstration.
const ANCHOR = PRODUCTS.find((p) => p.sizes.some((s) => s.stock > 0))?.code;

export default async function HeadlessPage({ searchParams }: { searchParams: { q?: string } }) {
  const cfg = selwiseConfig();
  const lang = storeLocale();
  const query = (searchParams.q || 'keten').slice(0, 80);

  const [strips, search] = await Promise.all([recommendationStrips(`${cfg.publicUrl}/`, lang), searchProducts(query, { limit: 12, lang })]);

  const candidates = strips.ok ? strips.data.slice(0, 4) : [];
  const ssr = await Promise.all(candidates.map((w) => ssrRecommendation(w.id, { code: ANCHOR, lang })));
  const rendered = candidates.map((w, i) => ({ strip: w, result: ssr[i] }));
  const personal =
    rendered.find((r) => r.result.ok && r.result.data.meta.skipped === 'personal_strategy')?.strip ?? candidates[0];

  return (
    <div className="space-y-6">
      <Panel
        title="1 · Sunucuda basılan şerit"
        aside={<SourceLink path="src/lib/selwise/headless.ts" />}
      >
        <p>
          <code>GET /ssr/recommendations/:widgetId</code>, <code>ssr_read</code> anahtarıyla, sayfa HTML’i üretilirken. Yanıt anonimdir: sayfa önbelleğe
          konabilir ve JavaScript çalıştırmayan botlar ürünleri görür. Kayıt yazmaz, bu yüzden gösterim ve tıklama <strong>ölçülmez</strong>; ölçüm gereken
          şeridi tarayıcıya bırakın.
        </p>
        {!strips.ok ? (
          <p className="text-sale">Şeritler okunamadı: {strips.reason}</p>
        ) : rendered.length === 0 ? (
          <p className="text-ink-muted">Ana sayfaya hedefli şerit yok.</p>
        ) : (
          <div className="space-y-6">
            {rendered.map(({ strip, result }) => (
              <SsrStrip key={strip.id} name={strip.title || strip.name || strip.id} strategy={strip.strategy} result={result} />
            ))}
          </div>
        )}
      </Panel>

      <Panel title="2 · Tarayıcıda, kendi kartınızla — ölçülen" aside={<SourceLink path="src/components/selwise/headless/PersonalStrip.tsx" />}>
        <p>
          <code>POST /recommendations/:widgetId/products</code> alışverişçinin tarayıcısından; doğrulanmış mağaza adresi kimliktir, tarayıcıya anahtar
          gitmez. Ziyaretçi yalnızca pazarlama izniyle gönderilir; gösterim ve tıklama <code>track/event</code> ile ölçülür, tıklama olmadan şerit ciro
          atfı almaz.
        </p>
        {personal && cfg.siteKey ? (
          <PersonalStrip apiUrl={cfg.apiUrl} siteKey={cfg.siteKey} widgetId={personal.id} title={personal.title || personal.name || 'Öneriler'} lang={lang} />
        ) : (
          <p className="text-ink-muted">Gösterilecek şerit yok.</p>
        )}
      </Panel>

      <Panel title="3 · Arama API’si, sunucuda" aside={<SourceLink path="src/components/selwise/headless/SearchResults.tsx" />}>
        <form className="flex max-w-md gap-2" action="/gelistirici/headless">
          <input name="q" defaultValue={query} className="input h-10" aria-label="Arama sorgusu" />
          <button className="btn-primary btn-sm" type="submit">
            Ara
          </button>
        </form>
        {!search.ok ? (
          <p className="text-sale">Arama yapılamadı: {search.reason}</p>
        ) : search.data.redirect ? (
          <p>
            Bu sorgu bir yönlendirme kuralına takıldı: <code>{search.data.redirect}</code>. Sonuç sayfası yerine alışverişçiyi oraya gönderin.
          </p>
        ) : (
          <>
            <p className="text-xs text-ink-muted">
              {search.data.total} sonuç · {search.data.took ?? '—'} ms
              {search.data.expandedQuery?.length ? ` · aranan: ${search.data.expandedQuery.join(', ')}` : ''}
              {search.data.suggestions?.length ? ` · bunu mu demek istediniz: ${search.data.suggestions.join(', ')}` : ''}
            </p>
            {cfg.siteKey && <SearchResults apiUrl={cfg.apiUrl} siteKey={cfg.siteKey} query={query} hits={search.data.hits} total={search.data.total} />}
          </>
        )}
        <p>
          Sunucudaki arama çağrısı hiçbir şey kaydetmez. Sorguyu (<code>search/log</code>, sonuç yoksa <code>search/zero-results</code>) ve sonuç
          tıklamasını (<code>search/click</code>) tarayıcı, analiz izniyle bildirir.
        </p>
        <div className="flex flex-wrap gap-x-4">
          <DocLink path="api-reference/search-api">Arama API’si</DocLink>
          <DocLink path="api-reference/recommendations-api">Öneri API’si</DocLink>
          <DocLink path="api-reference/ssr-api">SSR API</DocLink>
        </div>
      </Panel>
    </div>
  );
}

function SsrStrip({ name, strategy, result }: { name: string; strategy: string; result: Awaited<ReturnType<typeof ssrRecommendation>> }) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-lg">{name}</h3>
        <p className="font-mono text-xs text-ink-muted">{strategy}</p>
      </div>
      {!result.ok ? (
        <p className="mt-2 text-sale">{result.reason}</p>
      ) : result.data.meta.skipped ? (
        <p className="mt-2 text-ink-muted">
          <code>meta.skipped: {result.data.meta.skipped}</code> — {SKIPPED[result.data.meta.skipped] ?? 'Sunucuda basılmadı.'}
        </p>
      ) : (
        <SsrProducts data={result.data} />
      )}
    </div>
  );
}

function SsrProducts({ data }: { data: SsrRecommendation }) {
  if (data.products.length === 0) return <p className="mt-2 text-ink-muted">Strateji ürün bulamadı.</p>;
  return (
    <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      {data.products.slice(0, 6).map((p) => (
        <HeadlessCard key={p.itemCode} product={p} />
      ))}
    </div>
  );
}
