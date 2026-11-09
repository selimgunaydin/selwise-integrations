# Selwise — Akinon Entegrasyon Kiti

Akinon vitrinlerine Selwise kurmak için kopyala-yapıştır hazır parçalar ve
proje başına kurulum sırası.

Bu kit **müşteri projesine elle uygulanmak** üzere yazıldı: dosyalar bu repoda
durur, ilgili Akinon projesine kopyalanır. Hiçbir parçası Selwise sunucusunda
değişiklik gerektirmez — hepsi bugünkü API ve panel yetenekleriyle çalışır.

---

## Hangi çalışma zamanı?

| Tespit | Çalışma zamanı | Bu kitteki klasör |
|---|---|---|
| `manage.py` var | Project Zero (Django) | [`pz-classic/`](./pz-classic) |
| `@akinon/next` bağımlılığı | PZ Next | [`pz-next/`](./pz-next) |
| `react-native` bağımlılığı | Appmaker | [`@selwise/react-native`](https://www.npmjs.com/package/@selwise/react-native) |

Ortak parçalar: [`shared/`](./shared)

---

## Dosya haritası

```
shared/
  selwise-ee-shim.js      Enhanced Ecommerce olay adı belirsizliğini çözer   ← Django PZ için kritik
  selwise-basket-hook.js  Selwise sepete ekledikten sonra eski temada mini sepet ← yalnız eski Django temaları
  selwise-loader.js       Çoklu pazar: hostname → siteKey                     ← tek pazarda gerekmez
  page-patterns.json      Panele girilecek düzeltilmiş sayfa desenleri        ← her projede gerekli
pz-classic/
  selwise.html            base.html'e include edilecek template
  selwise-order.html      Teşekkür sayfası sipariş takibi
  selwise_ssr.py          Sunucu taraflı zenginleştirme (Jinja2 global)        ← SEO için
pz-next/
  SelwiseScript.tsx       Kod ile kurulum (CMS widget'ı tercih edilmezse)
  selwise-events.ts       Eksik GA4 event'leri: search, sign_up
  selwise-ssr.ts          Sunucu taraflı zenginleştirme (server component)     ← SEO için
```

---

## Sunucu taraflı zenginleştirme (SSR)

Selwise'ın sayfaya koyduğu her şey normalde tarayıcıda, JavaScript ile
eklenir. Bir alışverişçi için bu fark edilmez. Ürün sayfasını okuyan
istemcilerin artan bölümü için içerik **hiç yoktur**: GPTBot, ClaudeBot,
PerplexityBot ve bütün bağlantı önizleme botları JavaScript çalıştırmaz,
Bing ve Yandex güvenilmez biçimde çalıştırır.

Zenginleştirme kuralları bu yüzden sunucuda oluşturulabilir. Akış:

1. Panelde kurala bir **yuva adı** verin (`urun-aciklama-alti`) ve
   "Nerede oluşturulur" seçeneğini **Sunucu, tarayıcı yedekli** yapın.
2. Panelden `ssr_read` kapsamlı bir site API anahtarı alın
   (`swpk_live_…`). **Bu anahtar tarayıcıya çıkmaz** — sunucudan sunucuya
   kullanılır.
3. Yığınınıza göre parçayı kopyalayın ve şablonunuzda aynı yuva adını çağırın:

   | Yığın | Dosya | Çağrı |
   |---|---|---|
   | Django PZ | `pz-classic/selwise_ssr.py` | `{{ selwise_enrichment("urun-aciklama-alti", product.sku) }}` |
   | PZ Next | `pz-next/selwise-ssr.ts` | `await getSelwiseEnrichment('urun-aciklama-alti', product.sku)` |

Her iki parça da **fail-open** yazıldı: zaman aşımı, ağ hatası veya eksik
yapılandırma boş dize döndürür ve widget yuvayı tarayıcıda doldurur. Bozulma
merdiveni şu sırayla iner ve hiçbir basamak diğerini beklemez:

```
SSR başarılı        → içerik ilk baytta, crawler görür, widget ölçümü devralır
SSR başarısız       → şablon hiçbir şey basmaz → widget normal yoldan basar
widget de yoksa     → sayfa mağazanın kendi hâliyle çıkar, hiçbir şey kırılmaz
```

Dönen HTML **zaten temizlenmiş ve kapsamlanmış** olarak gelir; endpoint'in ham
veri yerine markup döndürmesinin tek sebebi bu. Üstünden ikinci bir
sanitizer geçirmeyin: genel amaçlı bir sanitizer `data-selwise-*` niteliklerini
siler, widget bloğu tanıyamaz ve içerik iki kez basılır.

Müşteriye dönük tam anlatım: `content/docs/product-enrichment/server-side.mdx`
ve `content/docs/api-reference/ssr-api.mdx`.

---

## Neden `dataLayer` değil `selwiseLayer`

Kitin en önemli kararı bu, o yüzden baştan net olsun.

Django PZ'nin kutudan gelen GTM adaptörü ürün **detay**, **tıklama** ve
**impression** olaylarının üçünü de tek bir `eeEvent` adıyla basıyor
(`shop-packages/analytics/action-params.js`). Selwise gelen olayları **ada göre**
eşliyor — `eeEvent` tek başına hangisinin kastedildiğini söyleyemez, eşlemek
tıklamaları görüntüleme olarak kaydeder.

Adın taşımadığı ayrım `ecommerce` payload'ında var: **action anahtarı niyetin
kendisi.** `selwise-ee-shim.js` o anahtarı okuyup olayı doğru GA4 adıyla
**özel bir katmana** aynalıyor.

Özel katman olması şart: yeniden adlandırılmış olayları `window.dataLayer`'a
geri yazmak müşterinin kendi GTM container'ını da besler ve her GA4 hit'ini
çift sayar. Shim `dataLayer`'a **hiçbir şey yazmaz**.

GA4 şeklindeki olaylar **değiştirilmeden** aynalanır, yani özel katman sitenin
yayımladığı her şeyin tam üst kümesi. Kendi GA4 katmanını yazmış projeler
(birkaç canlı Akinon vitrini) için özel bir durum yok — shim'i her
yere kurun.

Panelde karşılığı: **Integrations → Data Layer → Source variable name =
`selwiseLayer`**. Bu ayar yapılmazsa Selwise `dataLayer`'ı dinlemeye devam eder
ve shim etkisiz kalır.

---

## Kurulum: Project Zero (Django)

**1. Panel — Sites → Installation**
Site oluştur, domain'i doğrula (`isVerified`). Doğrulanmadan hiçbir widget
render edilmez ve olaylar reddedilir.

**2. Panel — Integrations → Data Layer**

| Alan | Değer |
|---|---|
| Platform | `akinon` |
| Source variable name | `selwiseLayer` |
| Page detection | `patterns` |
| Page patterns | [`shared/page-patterns.json`](./shared/page-patterns.json) içeriği |

> Platformu **elle** seçin. Otomatik tespit Akinon'da güvenilmez:
> `scripts.includes('akinon')`, `window.akinonBasket` ve `body.akinon`
> koşullarının hiçbiri `magaza.com.tr` veya `brand.pl` üzerinde tutmuyor.

**3. Dosyalar**

```
shared/selwise-ee-shim.js     →  templates/utils/selwise-ee-shim.js
shared/selwise-basket-hook.js →  templates/utils/selwise-basket-hook.js
pz-classic/selwise.html    →  templates/layout/selwise.html
pz-classic/selwise-order.html → templates/orders/selwise-order.html
```

**4. `templates/layout/base.html`** — `<head>` içinde, GTM snippet'inin ve
`window["dataLayer"] = ...` satırının **üstüne**:

```jinja
{% include "layout/selwise.html" %}
```

Sıra önemli: shim `dataLayer.push`'u sarmalıyor ve adaptörler olayları GTM
yüklenene kadar biriktirip topluca boşaltıyor. Yine de shim dizide hazır olanı
da yeniden oynatır, yani sıra kayarsa veri kaybı değil, sadece gecikme olur.

**5. Sipariş takibi** — checkout success template'inin sonuna:

```jinja
{% include "orders/selwise-order.html" %}
```

Template'teki üç context ifadesini projenin kendi order objesine göre
düzeltin — `order.number`, `order.amount`, `order.orderitem_set` PZ
varsayılanları ama her projede aynı değil.

**6. Mini sepet (yalnız eski temalar)** — güncel PZ temaları widget'ın
`refresh-basket` olayını ve `<pz-mini-basket>` bileşenini zaten dinler; bir şey
yapmanız gerekmez. Başlıktaki sepet sayısını sunucuda basan eski bir Django
temasında, Selwise'ın bir öneri şeridinden eklediği ürün sayfa yenilenene kadar
sayıya yansımaz. O temada:

- başlıktaki sayaç öğesine `data-selwise-basket-count` niteliğini ekleyin;
- teme özgü başka bir şey gerekiyorsa (mini sepet parçasını yeniden çizmek,
  çekmeceyi açmak) `window.selwiseRefreshMiniBasket = function (basket) {…}`
  tanımlayın; `basket` eklemenin döndürdüğü sepettir.

**7. Yedek kimlik** — `selwise.html`, oturum açmış üyenin Akinon kullanıcı
kimliğini (`current_user.pk`) `Selwise.identify` ile gönderir: sunucu
bağlantısının bu üyenin siparişlerine ve izinlerine yazdığı kimlik budur, tema
veri katmanında kullanıcıyı adlandırmasa da ziyaret ve sipariş aynı müşteride
buluşur. Yalnız kimlik gider; e-posta tarayıcıda okunmaz. Ziyaretçinin onayını
her `identify` gibi bekler ve reddedilirse hiç gönderilmez; aynı kimlik bir
kez gönderilir.

**8. Doğrulama** — canlıda:

```javascript
localStorage.setItem('selwise_debug', 'true')
// sayfayı yenile, sonra:
window.selwiseLayer          // eeEvent yerine view_item / select_item görmelisiniz
window.dataLayer[0].event    // ORİJİNAL adı korumalı (eeEvent)
```

---

## Kurulum: PZ Next

**1–2. Panel** — Django ile aynı, tek fark: `Source variable name` çoğu PZ Next
projesinde `dataLayer` kalabilir, çünkü bu projeler tam GA4 seti basıyor ve
`eeEvent` sorunu yok. Shim'e ihtiyaç duyup duymadığınızı şöyle kontrol edin:

```bash
grep -c "eeEvent\|eeCart" src/utils/gtm.ts   # 0 ise shim gerekmez
```

**3. Script** — iki yol var:

**(a) Kod deploy'u olmadan (önerilen).** PZ Next kök layout'u Omnitron'daki
`external-gtm` CMS widget'ının ham `head` HTML'ini basıyor. Panelden şu bloğu
o widget'a yapıştırın — dört satırın dördü de gerekli, ortadaki komut kuyruğu
olmadan `async` yükleme sipariş çağrılarını sessizce düşürür:

```html
<link rel="preconnect" href="https://widget.selwise.com" crossorigin>
<link rel="preconnect" href="https://api.selwise.com" crossorigin>
<script>window.Selwise=window.Selwise||{};window.Selwise.q=window.Selwise.q||[];['track','trackOrder','identify','setTraits','pushDataLayer','grantConsent','revokeConsent','showConsentPreferences','withdrawConsent','endJourney'].forEach(function(m){if(!window.Selwise[m])window.Selwise[m]=function(){window.Selwise.q.push([m,arguments])}});</script>
<script async src="https://widget.selwise.com/client.js" data-site-key="SITE_KEY"></script>
```

**(b) Kod ile.** [`pz-next/SelwiseScript.tsx`](./pz-next/SelwiseScript.tsx)
dosyasını `src/components/selwise-script.tsx`'e kopyalayıp kök layout'un
`<head>`'ine ekleyin.

**4. Eksik GA4 event'leri** —
[`pz-next/selwise-events.ts`](./pz-next/selwise-events.ts) dosyasını
`src/utils/selwise-events.ts`'e kopyalayın ve iki çağrı noktasını ekleyin.

`pz_next_project`'in GA4 katmanında `search`, `sign_up` ve `page_view` **yok**.
`search` olmadan arama raporu ve aramadan gelen her attribution boş kalır.
Dosyanın başındaki yorum blogu tam satır numaralarıyla nereye ekleneceğini
anlatıyor.

**5. Çoklu pazar** — proje tek deploy'dan birden fazla pazar servis ediyorsa
(`src/utils/market-context.ts` içinde `SUPPORTED_CURRENCIES` uzunsa), pazar
başına **ayrı bir Selwise sitesi** gerekir: bir Selwise sitesi tek domain, tek
para birimi ve tek ürün feed'i taşır.

Enjeksiyon noktası paylaşımlı olduğu için (`external-gtm` locale/currency
parametresi olmadan çekiliyor) sabit bir `data-site-key` yedi pazarın trafiğini
tek siteye yığar. Çözüm: [`shared/selwise-loader.js`](./shared/selwise-loader.js)
veya `SelwiseScript.tsx` — ikisi de `location.hostname`'den anahtarı çözer.

Eşlenmeyen bir host **hiçbir şey yüklemez**. Kasıtlı: varsayılan bir anahtara
düşmek staging ziyaretini üretim cirosu olarak kaydeder.

---

## Kurulum: Appmaker (React Native)

Ayrı paket: [`@selwise/react-native`](https://www.npmjs.com/package/@selwise/react-native) — kurulum,
API anahtarı scope'ları, ekran adlandırma ve WebView köprüsü orada anlatılıyor.

Üç şey burada da vurgulanmalı:

1. **API anahtarı hem `mobile_read` HEM `mobile_write` taşımalı.** Native
   `fetch` Origin göndermediği için sunucu anahtar + scope doğrulamasına düşer,
   ve öneri *ürünleri* endpoint'i bir POST — sadece okuma anahtarı **yalnızca
   orada** 403 döner.
2. **WebView köprüsünü kurun.** Akinon vitrinleri uygulama içi WebView'da
   dataLayer'ı `ReactNativeWebView.postMessage`'a yönlendirip `window.dataLayer`'a
   hiç yazmıyor (`isInAppWebView()`), yani checkout akışı köprü olmadan tamamen
   görünmez.
3. **Bedenli ürün için varyant gruplamasını açın.** Sepete ekleme Akinon'un
   numerik varyant pk'sını ister; feed'de `variantGrouping` açık olmadan kartta
   beden seçici çıkmaz ve ürün detayına yönlendirmek gerekir. Aşağıdaki *Ürün
   feed'i alan eşlemesi* bölümüne bakın.

---

## Ürün kimliği — bir kere karar verin

Kitin en sessiz tuzağı bu.

Selwise ürün feed'indeki `item_code`, sitenin GA4 `item_id` değeriyle **birebir
aynı** olmalı. Akinon projelerinde konvansiyon **proje başına** değişiyor:

| Proje | GA4 `item_id` | PDP JSON-LD |
|---|---|---|
| `pz_classic_project` | `sku` | `sku` |
| `pz_next_project` | `base_code.color` | `sku` |

`pz_next_project` örneğinde aynı sayfa iki farklı kod yayımlıyor: Selwise'ın DOM
okuyucusu JSON-LD `sku`'sunu, dataLayer köprüsü `item_id`'yi alır → tek ürün iki
kodla kaydedilir.

Kurulumdan önce şunu çalıştırın:

```bash
grep -n "item_id" src/utils/gtm.ts                    # PZ Next
grep -rn "item_id" templates/utils/buildGA4Item.js    # Django PZ
```

Sonra feed'i o değere göre üretin. `sku` kolonuna varyant SKU'sunu da yazın —
analitiğin bir kısmı `itemCode OR sku` ile çözüyor, ama hepsi değil.

---

## Testler

```bash
cd apps/client && npx jest --config ../../integrations/akinon/jest.config.js
```

24 test: shim'in olay adı çözümü (özellikle `eeEvent` + `click` → `select_item`,
`eeEvent` + `detail` → `view_item` ayrımı), `dataLayer`'ı kirletmeme garantisi,
çift include'a karşı idempotency, ve loader'ın host eşleme kuralları
(alt alan adı devralma, en uzun suffix kazanır, benzer domain eşleşmez).

> `integrations/*` henüz `pnpm-workspace.yaml` kapsamında değil, o yüzden
> `pnpm --filter` çalışmıyor ve CI bu testleri koşmuyor. Workspace ve CI'a
> eklemek, paylaşımlı yapılandırma dosyalarına dokunan bir sonraki turun işi.

---

## Öneri şeridi sunucuda: PZ Dynamic Widget

PZ'nin **Dynamic Widget — API** veri kaynağı bir öneri şeridini JavaScript
olmadan, sayfanın ilk baytında basabilir. Kaynak adresi:

```
GET https://api.selwise.com/api/v1/public/sites/SITE_KEY/ssr/recommendations/WIDGET_ID?code={{ product.sku }}&lang={{ LANGUAGE_CODE }}
x-selwise-api-key: swpk_live_…   (ssr_read kapsamlı anahtar — tarayıcıya çıkmaz)
```

Yanıt şeridin başlığı ve ürünleridir (`products[].itemCode/title/url/imageUrl/price/originalPrice/cartCode`);
kart şablonu sizindir. Ziyaretçiye göre değişen bir şerit (son bakılanlar,
kişiye özel, segment hedefli, test modundaki) boş döner ve `meta.skipped`
sebebini söyler — sayfa önbelleğine donsa herkese giderdi. Sunucuda basılan
şeridin gösterim ve tıklamaları ölçülmez; ölçüm ve A/B testi gereken şeridi
tarayıcıda widget'a bırakın. Sözleşme: `selwise.com/docs/api-reference/ssr-api`.

---

## Sunucu bağlantısı (siparişler, iadeler, izinler, katalog)

Vitrin kiti tarayıcıda olanı ölçer. Mağaza içi satış, çağrı merkezi siparişi,
iptal ve iade, üyenin e-posta/SMS izni, fiyat ve stok değişimi tarayıcıdan
geçmez: bunları panelde **Ayarlar → Entegrasyonlar → E-ticaret bağlantısı**
okur (Omnitron entegrasyon kullanıcısıyla bir kez bağlanılır; parola
saklanmaz). Kanalın e-ticaret platformu **Kanal ayarları**'nda `Akinon`
seçilmelidir. Ayrıntı: `selwise.com/docs/integration/commerce-connection`.

---

## Kit ile sunucu tarafı arasındaki iş bölümü

Denetimdeki maddelerin tamamı kapatıldı. Ama iki yol var ve hangisini
kullandığınız kurulumu etkiliyor:

| Konu | Sunucu tarafı (bugün canlı) | Kit alternatifi |
|---|---|---|
| **`eeEvent` belirsizliği** | Ters eşleme `event + ecommerce action` bileşik anahtarını destekliyor (`eeEvent:detail`, `eeEvent:click`, …). Panelde platform `akinon` seçmek yeter. | `selwise-ee-shim.js` — aynı sorunu Akinon tarafından çözer, panelde `selwiseLayer` ayarı ister. Sürüm yükseltemeyen projeler için. |
| **Sayfa tipi** | Profildeki desenler gerçek rotalara güncellendi (`/list/?search_text=`, `/baskets/basket`, `/product/`). | `page-patterns.json` — panelden ezmek isterseniz. |
| **Çoklu pazar** | `SiteDomain` alias tablosu: aynı katalog/para birimini paylaşan hostlar tek siteye bağlanır. | `selwise-loader.js` — farklı para birimli pazarlar hâlâ ayrı site ister, snippet hostname'den anahtarı çözer. |
| **Sepet endpoint'i** | Otomatik tespit: PZ Next'te `/api/client/baskets/basket/`, Django'da `/baskets/basket/`. | — |
| **Beden seçici** | Feed'de `variantGrouping` açıksa kart beden seçici render eder ve varyant pk'sıyla ekler. | — |
| **Türkçe arama** | Aksan katlama canlı (`gomlek` → `Gömlek`). Dil bazlı kök bulma henüz yok. | — |
| **Consent** | IAB TCF v2 ve Google Consent Mode v2 otomatik okunuyor. | — |

---

## Ürün feed'i alan eşlemesi — Akinon uyumu

Kurulumun en çok zaman kaybettiren adımı bu, o yüzden ayrı bir bölüm.

### Tek tuşla ön ayar

Panelde **Feed → Alan Eşleme → Hazır Eşleme** altından `Akinon (Project Zero /
PZ Next)` seçin. Bu, `fieldMapping`'e gerçek değerleri yazar (bir ön ayar
kimliği saklamaz), yani tabloda gördüğünüz şey parser'ın kullanacağı şeydir ve
her satır düzenlenebilir kalır.

API'den:

```bash
GET  /api/v1/sites/:siteId/feed/presets
POST /api/v1/sites/:siteId/feed/preset/akinon
```

Ön ayar mevcut eşlemeyi **tamamen değiştirir** — yarım bir eşleme (eski
`imageUrl: image` ile yeni `productimage_set.0.image` bir arada) kimsenin
akıl yürütemeyeceği bir durumdur ve eski değer kazanırdı.

### Eşlemenin kendisi

| Selwise alanı | Akinon yolu | Neden |
|---|---|---|
| `id` | `base_code` | Akinon'da "ürün" modeldir; her beden/renk ayrı satırdır. Satırın `sku`'sunu kullanmak **her bedeni ayrı ürün** yapar. |
| `variantCode` | `pk` | `/baskets/basket/` **yalnızca numerik varyant pk'sını** kabul eder. `sku` bariz kimlik gibi görünür ve reddedilir — sku ile kurulan seçici doğru render olur, sonra her eklemede patlar. |
| `sku` | `sku` | Bazı projeler GA4 `item_id` olarak varyant sku'sunu basıyor; analitik iki kolonu da çözüyor. |
| `itemGroupId` | `base_code` | Varyant gruplama anahtarı. |
| `title` | `name` | |
| `originalPrice` | `retail_price` | Akinon'un liste fiyatı. Bu olmadan **her ürün indirimsiz görünür** — jenerik alias'lar yalnızca `old_price`/`compare_at_price` biliyor. |
| `currency` | `currency_type` | |
| `imageUrl` | `productimage_set.0.image` | Skaler URL değil, sıralı görsel nesnesi dizisi. |
| `url` | `absolute_url` | |
| `brand` | `attributes_kwargs.integration_brand.label` | Attribute torbasında, etiketli. |
| `size` | `attributes.pre_ent_beden` | Attribute anahtarı **proje kararı** — farklıysa bu satırı düzenleyin. |
| `color` | `attributes.pre_ent_filtrelenebilir_renk` | Aynı şekilde. |

### İç içe yol desteği

Eşleme değerleri artık **yol** olarak çözülür, düz anahtar olarak değil:
`attributes_kwargs.integration_brand.label`, `productimage_set.0.image`,
`productimage_set[0].image` ve indeks yazılmazsa ilk eleman
(`productimage_set.image`) çalışır. `g:` ve `@_` önekleri otomatik denenir,
yani XML feed'i için önek yazmanız gerekmez.

Bu daha önce **çalışmıyordu**: düz bir arama bu alanlar için sessizce
`undefined` döndürüyor ve alan yanlış bir varsayılana düşüyordu. Marka, görsel,
beden ve renk Akinon'da tam olarak bu dört alandı.

### Kimlik kontrolü — kurulumdan önce

```bash
grep -n "item_id" src/utils/gtm.ts                    # PZ Next
grep -rn "item_id" templates/utils/buildGA4Item.js    # Django PZ
```

Feed'in `item_code`'u sitenin GA4 `item_id` değeriyle birebir aynı olmalı.
`merchant-a` her ikisinde de `sku` kullanıyor; `pz_next_project` GA4'te
`base_code.color` ama JSON-LD'de `sku` yayımlıyor. Eşleşmiyorsa gruplamayı
açmadan önce kimliği hizalayın.

### Diğer feed şekilleri

- `akinon_omnitron` — feed vitrin yerine PIM'den geliyorsa.
- `google_merchant` — Shopping feed'i. Akinon müşterilerinin çoğunda zaten var
  ve genelde işaret edilecek en hızlı kaynak.
