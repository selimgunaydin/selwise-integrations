# Ardisa — Selwise entegrasyonunun eksiksiz örneği

Ardisa, Selwise'ı **özel altyapıyla** (`custom`) kuran kurgusal bir giyim, ev
ve bakım mağazasıdır. Next.js 14 (App Router) ile yazılmıştır; üyeler, sepet
ve siparişler kendi SQLite dosyasındadır. Selwise mağazayı yalnızca gerçek bir
mağazanın konuştuğu yollardan duyar: kurulum kodu, veri katmanı, JavaScript
API'si, ürün feed'i ve sunucudan sunucuya çağrılar.

- Canlı: **https://demo.selwise.com**
- Entegrasyonun canlı haritası: **https://demo.selwise.com/gelistirici**
- Selwise dokümanları: https://selwise.com/docs

> Ardisa kurgusaldır. Ürünler, markalar, fiyatlar ve görseller (kodla çizilen
> SVG'ler) gerçek değildir. Ödeme alınmaz.

## Neyin nerede olduğu

| Parça | Dosya | Doküman |
|---|---|---|
| Kurulum kodu (komut kuyruğu + `client.js`) | `src/components/selwise/SelwiseHead.tsx` | [Widget kurulumu](https://selwise.com/docs/integration/widget-installation) |
| Veri katmanı ve olaylar | `src/lib/selwise/client.ts` | [Veri katmanı](https://selwise.com/docs/integration/data-layer) |
| Kimlik + **imzalı kimlik** | `src/lib/selwise/identity.ts`, `src/components/selwise/Identify.tsx` | [İmzalı kimlik](https://selwise.com/docs/integration/identity-verification) |
| Sipariş (`trackOrder`) | `src/app/checkout/success/[token]/SuccessTracker.tsx` | [Sipariş takibi](https://selwise.com/docs/integration/order-tracking) |
| Sipariş durumu ve iş olayları (sunucu) | `src/lib/selwise/server.ts` | [Sipariş API'si](https://selwise.com/docs/api-reference/orders-api) |
| Ürün feed'i ve İngilizce dil feed'i | `src/app/feeds/google.xml`, `src/app/feeds/google.en.xml` | [Dil feed'leri](https://selwise.com/docs/product-feeds/language-feeds) |
| Sepet köprüsü (`window.ArdisaCart`) | `src/components/Providers.tsx` | [Sepete ekleme](https://selwise.com/docs/recommendations/add-to-cart) |
| Yuvalar (`[data-selwise-slot]`) ve arama kutusu | `src/components/selwise/Slot.tsx`, `src/components/layout/Header.tsx` | [Yerleşim](https://selwise.com/docs/widgets/placement) |
| Sunucu taraflı zenginleştirme | `src/lib/selwise/ssr.ts` | [Sunucu taraflı render](https://selwise.com/docs/product-enrichment/server-side) |
| Headless öneri ve arama | `src/lib/selwise/headless.ts`, `src/components/selwise/headless/` | [Öneri API'si](https://selwise.com/docs/api-reference/recommendations-api) |
| Çerez onayı: Selwise bandı ya da mağazanın kendi bandı | `src/components/selwise/StoreConsentBanner.tsx` | [Onay yönetimi](https://selwise.com/docs/integration/consent) |
| Kodla A/B testi | `src/components/selwise/ExperimentLab.tsx` | [Geliştirici için deneyler](https://selwise.com/docs/experiments/developer) |
| Dil (`<html lang>`, `setLocale`, `lang=`) | `src/lib/selwise/locale.ts` | [JavaScript API](https://selwise.com/docs/integration/javascript-api) |
| Giden webhook (HMAC doğrulama) | `src/app/api/webhooks/selwise/route.ts` | [Webhook'lar](https://selwise.com/docs/outbound/webhooks) |
| Web push servis çalışanı | `public/selwise-sw.js` | [Web push](https://selwise.com/docs/messaging/web-push) |
| Geçmiş veri dışa aktarımı | `scripts/export-selwise-history.ts`, `examples/data-import/` | [Veriyi hazırlama](https://selwise.com/docs/data-import/preparing-data) |

`/gelistirici` bölümü aynı haritayı canlı gösterir: bu sayfada Selwise'ın ne
bildiği (ziyaretçi, oturum, onay, sepet, veri katmanı), imzalı kimlik, onay
API'si düğme düğme, headless şeritler, kodla A/B ve dil.

## Çalıştırma

Node 20 gerekir (`better-sqlite3`).

```bash
npm install
cp .env.example .env.local   # en azından SELWISE_SITE_KEY
npm run dev                  # http://localhost:3003
```

`SELWISE_SITE_KEY` boşsa mağaza Selwise olmadan çalışır; her Selwise çağrısı
sessizce hiçbir şey yapmaz. Mağaza Selwise'a hiçbir zaman bağımlı olmamalıdır.

Docker ile:

```bash
docker build -t ardisa .
docker run -p 3003:3003 --env-file .env.local -v ardisa-data:/data ardisa
```

Testler: `npm test`.

## Panelde neyin ayarlı olduğu

Mağaza aşağıdaki panel ayarlarını bekler. Kendi kanalınızla denerken bunları
kurun; ayrıntı ilgili doküman sayfasındadır.

| Ekran | Ayar |
|---|---|
| Kanallar | Web kanalı, adres = mağaza, para birimi TRY. Alan adı doğrulaması ana sayfanın ham HTML'indeki `data-site-key`'i okur. |
| Kanallar → API anahtarları | `ssr_read` → `SELWISE_SSR_API_KEY`; `mobile_read + mobile_write` → `SELWISE_SERVER_API_KEY`; `orders_write` → `SELWISE_ORDERS_API_KEY` |
| Kanallar → Signed identity | Sır → `SELWISE_IDENTITY_SECRET`; mod Report (her identify imzalı olunca Enforce) |
| Katalog → Ürün feed'i | `<mağaza>/feeds/google.xml`, Google Merchant hazır eşlemesi + `cart_code → cartCode`, `discount_rate`, `category_hierarchy`, `rating`, `review_count`, `is_new`, `is_bestseller`; varyant gruplama **nested** |
| Katalog → Ürün feed'i → Diller | İngilizce: `<mağaza>/feeds/google.en.xml`, ürün koduyla eşleşme (hesapta İngilizce açık olmalı) |
| Kanallar → Veri katmanı | Platform `custom`, değişken `selwiseLayer`, sayfa tespiti otomatik, altı izleme modülü açık |
| Kitle → Çerez onayı | Takipten önce onay iste + cevaba kadar beklet. `SELWISE_CONSENT_UI=store` ise "Show the Selwise consent banner" kapalı |
| Öneriler | Şeritler `[data-selwise-slot="…"]` yuvalarında (listesi `src/components/selwise/Slot.tsx`); sepet platformu `custom`, sepet betiği `window.ArdisaCart && window.ArdisaCart.add(product.variantId \|\| productItemCode, quantity)` |
| Arama | Mağazanın kutuları: `#site-search`, `#mobile-search` |
| Zenginleştirme | Yuva `pdp-under-description`, "sunucu + tarayıcı yedeği" |
| Ayarlar → Entegrasyonlar | Webhook → `<mağaza>/api/webhooks/selwise`, HMAC sırrı → `SELWISE_WEBHOOK_SECRET` |

## Yalnızca demo için olanlar

Gerçek bir mağazada karşılığı olmayan, gösterim amaçlı parçalar:

- `/demo-panel` ve `/api/demo/*`: fiyat, stok ve kupon değiştirme, sipariş
  durumunu ilerletme, iş olayı gönderme, gelen kutusu. `DEMO_PANEL_KEY` ile
  kilitlenir.
- `/gelistirici`: entegrasyonun canlı haritası.
- Ödeme ve 3D Secure adımları taklittir.

## Lisans

MIT.
