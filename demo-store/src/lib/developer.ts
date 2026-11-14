/**
 * The developer section (/gelistirici): where each piece of the integration
 * lives in this store's source, and the Selwise docs page that explains it.
 *
 * The source links point at the public mirror of this store
 * (scripts/public-mirror in the Selwise monorepo publishes it), so a merchant's
 * developer can read the exact code that runs on the page they are looking at.
 */
export const PUBLIC_REPO_URL = (process.env.DEMO_PUBLIC_REPO_URL || 'https://github.com/selimgunaydin/selwise-integrations').replace(/\/+$/, '');
export const PUBLIC_REPO_BRANCH = 'main';
export const PUBLIC_REPO_DIR = 'demo-store';
export const DOCS_URL = 'https://selwise.com/docs';

export const sourceUrl = (path: string) => `${PUBLIC_REPO_URL}/blob/${PUBLIC_REPO_BRANCH}/${PUBLIC_REPO_DIR}/${path}`;
export const docsUrl = (path: string) => `${DOCS_URL}/${path.replace(/^\/+/, '')}`;

export interface IntegrationPoint {
  title: string;
  what: string;
  files: string[];
  docs: Array<[string, string]>;
  /** A page in this section that shows it live. */
  live?: string;
}

export const INTEGRATION_MAP: IntegrationPoint[] = [
  {
    title: 'Kurulum kodu',
    what: 'Head kodu (komut kuyruğu ve sayfa çizilmeden önce gizleme) ve client.js, sunucu HTML’inin head bölümünde, en üstte. Alan adı doğrulaması ana sayfanın ham HTML’inde data-site-key arar.',
    files: ['src/components/selwise/SelwiseHead.tsx', 'src/lib/selwise/head-bootstrap.ts', 'src/lib/selwise/config.ts'],
    docs: [['Widget kurulumu', 'integration/widget-installation']],
  },
  {
    title: 'Veri katmanı ve olaylar',
    what: 'Sepet, üyelik ve giriş olayları selwiseLayer’a; kategori, liste gösterimi, favori ve ödeme adımı Selwise.track ile. Sayfa ve ürün görüntüleme URL’den ve JSON-LD’den kendiliğinden ölçülür.',
    files: ['src/lib/selwise/client.ts', 'src/components/listing/CategoryViewTracker.tsx', 'src/components/product/ListTracker.tsx'],
    docs: [
      ['Veri katmanı', 'integration/data-layer'],
      ['Olaylar', 'integration/events'],
    ],
    live: '/gelistirici',
  },
  {
    title: 'Kimlik ve imzalı kimlik',
    what: 'Giriş yapmış müşteri her sayfada identify edilir; müşteri numarası sunucuda kanalın gizli anahtarıyla imzalanır, tarayıcıya yalnızca imza gider.',
    files: ['src/lib/selwise/identity.ts', 'src/components/selwise/Identify.tsx', 'src/lib/store/auth.ts'],
    docs: [
      ['Kullanıcı kimliklendirme', 'integration/identify'],
      ['İmzalı kimlik', 'integration/identity-verification'],
    ],
    live: '/gelistirici/kimlik',
  },
  {
    title: 'Sipariş',
    what: 'Teşekkür sayfasında Selwise.trackOrder, bir kez; ödeme sırasında verilen e-posta/SMS izniyle birlikte.',
    files: ['src/app/checkout/success/[token]/SuccessTracker.tsx', 'src/lib/selwise/client.ts'],
    docs: [['Sipariş takibi', 'integration/order-tracking']],
  },
  {
    title: 'Sipariş durumu ve iş olayları (sunucu)',
    what: 'Kargoya verildi, teslim edildi, iade: mağazanın arka ofisi orders_write anahtarıyla bildirir. İş olayları senaryoları tetikler.',
    files: ['src/lib/selwise/server.ts', 'src/lib/store/order-status.ts'],
    docs: [
      ['Sipariş API’si', 'api-reference/orders-api'],
      ['İş olayları', 'integration/business-events'],
    ],
  },
  {
    title: 'Ürün feed’i ve dil feed’i',
    what: 'Google Merchant XML: her renk bir ürün, bedenler <variant> olarak, sepet kodu ayrı alan. İngilizce dil feed’i yalnızca metin taşır.',
    files: ['src/app/feeds/google.xml/route.ts', 'src/app/feeds/google.en.xml/route.ts', 'src/lib/catalog/en.ts'],
    docs: [
      ['Feed biçimleri', 'product-feeds/formats'],
      ['Dil feed’leri', 'product-feeds/language-feeds'],
    ],
  },
  {
    title: 'Sepet köprüsü',
    what: 'Öneri ve arama kartlarındaki “Sepete ekle”, window.ArdisaCart.add üzerinden mağazanın kendi sepetine gider (platform: custom).',
    files: ['src/components/Providers.tsx'],
    docs: [['Sepete ekleme', 'recommendations/add-to-cart']],
  },
  {
    title: 'Yuvalar ve arama kutusu',
    what: 'Öneri şeritleri, zenginleştirme ve satır içi kampanyalar [data-selwise-slot] yuvalarına; Selwise arama mağazanın kendi #site-search kutusuna bağlanır.',
    files: ['src/components/selwise/Slot.tsx', 'src/components/layout/Header.tsx'],
    docs: [
      ['Yerleşim', 'widgets/placement'],
      ['Arama kurulumu', 'search/setup'],
    ],
  },
  {
    title: 'Sunucu taraflı zenginleştirme',
    what: 'Ürün sayfasındaki blok HTML’in içinde gelir; widget onu tanır, ikinci kez çizmez, yalnızca ölçer.',
    files: ['src/lib/selwise/ssr.ts', 'src/app/p/[slug]/page.tsx'],
    docs: [['Sunucu taraflı render', 'product-enrichment/server-side']],
  },
  {
    title: 'Headless: kendi kartınızla öneri ve arama',
    what: 'Sunucuda anonim şerit ve arama sonucu; tarayıcıda ziyaretçiye özel şerit, gösterim ve tıklama ölçümüyle.',
    files: ['src/lib/selwise/headless.ts', 'src/components/selwise/headless/PersonalStrip.tsx', 'src/app/gelistirici/headless/page.tsx'],
    docs: [
      ['Öneri API’si', 'api-reference/recommendations-api'],
      ['Arama API’si', 'api-reference/search-api'],
      ['SSR API', 'api-reference/ssr-api'],
    ],
    live: '/gelistirici/headless',
  },
  {
    title: 'Çerez onayı',
    what: 'Varsayılan: Selwise’ın bandı. SELWISE_CONSENT_UI=store ile mağazanın kendi bandı kararı grantConsent / revokeConsent ile iletir.',
    files: ['src/components/selwise/StoreConsentBanner.tsx', 'src/components/layout/ConsentLink.tsx'],
    docs: [['Onay yönetimi', 'integration/consent']],
    live: '/gelistirici/onay',
  },
  {
    title: 'Kodla A/B testi',
    what: 'Ziyaretçinin kolunu okuyup mağazanın kendi arayüzünü değiştirmek: getActiveExperiments, getExperimentVariant.',
    files: ['src/components/selwise/ExperimentLab.tsx'],
    docs: [['Geliştirici için deneyler', 'experiments/developer']],
    live: '/gelistirici/deney',
  },
  {
    title: 'Dil',
    what: 'Widget dili <html lang>’den okur; sunucu çağrıları lang= ile. Para birimi kanalın para birimidir: başka bir pazar ayrı bir kanaldır.',
    files: ['src/lib/selwise/locale.ts', 'src/app/api/locale/route.ts'],
    docs: [
      ['JavaScript API — Dil', 'integration/javascript-api'],
      ['İçerik dilleri', 'settings/content-languages'],
    ],
    live: '/gelistirici/dil',
  },
  {
    title: 'Giden webhook',
    what: 'Selwise’ın gönderdiği olaylar HMAC-SHA256 imzasıyla doğrulanır (timingSafeEqual).',
    files: ['src/app/api/webhooks/selwise/route.ts'],
    docs: [['Webhook’lar', 'outbound/webhooks']],
  },
  {
    title: 'Bülten ve web push',
    what: 'Bülten kaydı kanal başına seçilen kanallarla; tarayıcı bildirimi servis çalışanı kök dizinde.',
    files: ['src/lib/selwise/client.ts', 'public/selwise-sw.js'],
    docs: [
      ['Onay ve bülten API’si', 'api-reference/consent-newsletter-api'],
      ['Web push', 'messaging/web-push'],
    ],
  },
  {
    title: 'Geçmiş veri aktarımı',
    what: 'Mağazanın veritabanından kullanıcı ve sipariş geçmişini Selwise’ın NDJSON biçiminde dışa aktaran betik ve örnek dosyalar.',
    files: ['scripts/export-selwise-history.ts', 'examples/data-import/users.sample.ndjson', 'examples/data-import/orders.sample.ndjson'],
    docs: [['Veriyi hazırlama', 'data-import/preparing-data']],
    live: '/gelistirici/veri-aktarimi',
  },
];

export const DEVELOPER_PAGES: Array<[string, string]> = [
  ['/gelistirici', 'Genel bakış'],
  ['/gelistirici/kimlik', 'İmzalı kimlik'],
  ['/gelistirici/onay', 'Çerez onayı'],
  ['/gelistirici/headless', 'Headless'],
  ['/gelistirici/deney', 'Kodla A/B'],
  ['/gelistirici/dil', 'Dil'],
  ['/gelistirici/veri-aktarimi', 'Geçmiş veri'],
];
