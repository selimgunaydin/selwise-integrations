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
  selwise-ee-shim.js      Enhanced Ecommerce olaylarını GA4 adlarına yansıtır ← gerekmez (ön ayar ikisini de okur); yalnız istisna
  selwise-basket-hook.js  Selwise sepete ekledikten sonra eski temada mini sepet ← yalnız eski Django temaları
  selwise-cart-bridge-core.js  PZ Next köprüsünün bağımlılıksız çekirdeği (SelwiseCartBridge.tsx kullanır)
  selwise-loader.js       Çoklu pazar: hostname → siteKey                     ← tek pazarda gerekmez
  page-patterns.json      Sayfa desenleri (Akinon ön ayarındakilerle aynı)    ← yalnız ezmek isterseniz
pz-classic/
  selwise.html            base.html'e include edilecek template
  selwise-order.html      Teşekkür sayfası sipariş takibi
  selwise_ssr.py          Sunucu taraflı zenginleştirme (Jinja2 global)        ← SEO için
pz-next/
  SelwiseScript.tsx       Kod ile kurulum (CMS widget'ı tercih edilmezse)
  selwise-events.ts       Eksik GA4 event'leri: search, sign_up
  selwise-ssr.ts          Sunucu taraflı zenginleştirme (server component)     ← SEO için
  SelwiseCartBridge.tsx   Selwise'tan eklenen ürünü temanın sepetine yansıtır   ← her PZ Next projesinde
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

Tam anlatım: `selwise.com/docs/product-enrichment/server-side` ve
`selwise.com/docs/api-reference/ssr-api`.

---

## Sürüm notları

**18 Kasım 2026** — kopyalarınızı güncelleyin:

- `pz-classic/selwise.html`: varsayılan kurulum artık shim'siz; Selwise
  mağazanın kendi `dataLayer`'ını Akinon ön ayarıyla okur (panelde
  **External Data Layer Name** `dataLayer`). Kullanılmayan `window.selwiseProduct`
  bloğu kaldırıldı. Başlıkta CSP notu var.
- `shared/selwise-ee-shim.js`: olay adı taşımayan itmeleri (`{ cd_userId, … }`)
  ve rıza komutlarını (`['consent', …]`) da aynalar; önceki sürüm shim'li bir
  kurulumda üye kimliğini ve çerez bandının kararını düşürüyordu.
- `pz-next/SelwiseScript.tsx`: `async` bileşen, `await headers()` (Next.js 15/16,
  `@akinon/next` 2.x şartı; eski sürüm 2.x'te çalışmıyordu), host önce
  `x-forwarded-host`'tan okunur.

**Önceki sürüm:**

- `pz-classic/selwise.html`: yedek kimlik, Django şablon bağlamındaki `user`
  değişkenini okur (`current_user` bağlamda yoktur; önceki sürüm hiç çalışmıyordu).
- `pz-classic/selwise-order.html`: sipariş satırı fiyatı `discounted_price` /
  `price` alanından okunur (`unit_price` yoktur), para birimi nesnesi
  (`{value, label}`) metne çevrilir. Eski kopya sipariş sayfasında hata verebilir.
- `shared/selwise-ee-shim.js`: küçük harfli `eepurchase` tanınır; `eeCheckout`
  1. adım sepet görünümü (`view_cart`), 3. adım `add_shipping_info`, 4. adım
  `add_payment_info` olarak yansıtılır. Shim'i kullanmıyorsanız bir şey yapmanız gerekmez.

---

## Veri katmanı: mağazanın kendi `dataLayer`'ı

Django PZ'nin kutudan gelen GTM adaptörü ürün **detay**, **tıklama** ve
**impression** olaylarının üçünü de tek bir `eeEvent` adıyla basıyor; anlam
`ecommerce` içindeki eylem anahtarında. Selwise'ın **Akinon ön ayarı** bunu
bilir (`eeEvent` + `detail` → ürün görüntüleme, `eeEvent` + `click` → tıklama
…) ve GA4 adlarını da okur; her olay için sayfada ilk görülen lehçe kazanır,
çift sayım olmaz. Bu yüzden varsayılan kurulumda **çeviri katmanı yoktur**:
panelde **External Data Layer Name** `dataLayer` kalır.

`selwise-ee-shim.js` yalnız ön ayarı kullanamayan bir tema içindir (ör. olay
adları standart dışı): `eeEvent`'i GA4 adlarıyla **özel bir katmana**
(`selwiseLayer`) aynalar, mağazanın `dataLayer`'ına hiçbir şey yazmaz. O
durumda panelde **External Data Layer Name** `selwiseLayer` olur; kurulum
`pz-classic/selwise.html` başlığında.

---

## Kurulum: Project Zero (Django)

**0. Ön kontrol — CSP.** Proje `django-csp` kullanıyorsa
(`omnife_base/settings.py` içinde `CSPMiddleware`), `CSP_SCRIPT_SRC` ve
`CSP_STYLE_SRC` listelerine `https://widget.selwise.com`, `CSP_CONNECT_SRC`
listesine `https://api.selwise.com` ekleyin. Eklenmezse etiket GTM'den de
gelse hiçbir şey yüklenmez ve hata yalnız tarayıcı konsolunda görünür.

**1. Panel — kanal.** Web kanalını oluşturun; **Kanal ayarları**'nda e-ticaret
platformu **Akinon** olsun. Kanal anahtarı ve kurulum kodu kanalın kurulum
kartındadır. Alan adı doğrulanmadan hiçbir yüzey çizilmez ve olaylar reddedilir.

**2. Panel — Integrations → Data Layer Configuration**

| Alan | Değer |
|---|---|
| Enable Data Layer | açık (varsayılan kapalı) |
| E-commerce Platform Preset | Akinon |
| Use External Data Layer | açık |
| External Data Layer Name | `dataLayer` |

Sayfa tipi önce Project Zero'nun `GLOBALS.page` değerinden okunur; ön ayarın
URL desenleri yalnız onun söylemediği sayfalar içindir. `page-patterns.json`'ı
yalnız bunları ezmek isterseniz girin.

**3. Dosyalar**

```
shared/selwise-basket-hook.js →  templates/utils/selwise-basket-hook.js
pz-classic/selwise.html       →  templates/layout/selwise.html
pz-classic/selwise-order.html →  templates/orders/selwise-order.html
```

Eski nesil temalarda temel şablon `templates/base.html`'dir; dosyayı onun
yanına koyun ve include yolunu buna göre yazın. Birden çok temel şablonu olan
tema (marka ya da site görünümü başına bir tane) include'u her birine ister.

**4. Temel şablon** — `<head>` içinde **ilk** satır olarak, GTM snippet'inin ve
`window["dataLayer"] = ...` satırının üstüne:

```jinja
{% include "layout/selwise.html" %}
```

İlk sırada olması sayfa deneylerinin ilk boyamadan önce gizlenmesi içindir.
Kurulum kodunun güncel hâli panelde kanalın kurulum kartındadır.

**5. Sipariş takibi** — sipariş başarı şablonu (`orders/success/index.html`)
çoğu temada bir alt şablondur: include'u `{% block content %}` **içine**, temanın
kendi `{% include "analytics/success.html" %}` satırının yanına koyun (blok
dışına yazılan bir include hiçbir şey basmaz):

```jinja
{% include "orders/selwise-order.html" %}
```

Template'teki üç context ifadesini projenin kendi order objesine göre
düzeltin — `order.number`, `order.amount`, `order.orderitem_set` PZ
varsayılanları ama her projede aynı değil.

**6. Mini sepet** — Selwise bir öneri şeridinden ürün eklediğinde mağazanın
sepet sayısının ve mini sepetinin güncellenmesi, temanın widget'ın yaydığı
`refresh-basket` olayını dinlemesine bağlıdır. Project Zero çekirdeği bu
dinleyiciyi sağlar ama **her tema kaydetmez**: tema kodunuzda
`refresh-basket` geçmiyorsa temanız dinlemiyordur. Widget bu durumda da
`<pz-mini-basket>` bileşeninin kendi `onBasketRefresh` metodunu çağırarak
sayacı ve listeyi doğru çizer; ancak temanın redux sepet deposu eski sepette
kalır (depoya abone diğer kodlar — analitik, hatırlatma push'ları — eklemeyi
görmez). Temanın giriş dosyasında (`layout/index.js`) şunu ekleyin:

```js
import store from 'shop-packages/redux/store';
import { fetchBasket } from 'shop-packages/redux/basket/actions';

// Selwise (ya da herhangi bir betik) sepeti kendi eklediğinde depoyu yeniler.
document.addEventListener('refresh-basket', () => {
  store.dispatch(fetchBasket());
});
```

İçe aktarmalar dosyada zaten varsa yalnızca dinleyiciyi ekleyin. Sayfada
birden çok `<pz-mini-basket>` varsa (masaüstü ve telefon başlığı) widget
hepsini günceller; yalnız ekranda görünen olanı açar.

Başlıktaki sepet sayısını sunucuda basan **eski bir Django temasında**,
Selwise'ın bir öneri şeridinden eklediği ürün sayfa yenilenene kadar sayıya
yansımaz. O temada:

- başlıktaki sayaç öğesine `data-selwise-basket-count` niteliğini ekleyin;
- teme özgü başka bir şey gerekiyorsa (mini sepet parçasını yeniden çizmek,
  çekmeceyi açmak) `window.selwiseRefreshMiniBasket = function (basket) {…}`
  tanımlayın; `basket` eklemenin döndürdüğü sepettir.

**7. Yedek kimlik** — Selwise üyeyi temanın veri katmanından (`cd_userId`) kod
gerektirmeden tanır; oturumu kapalı sayfada basılan `None` gibi boş değerler
kimlik sayılmaz. Ek olarak `selwise.html`, oturum açmış üyenin Akinon kullanıcı
kimliğini (şablon değişkeni `user.id`; `current_user` Django bağlamında yoktur) `Selwise.identify` ile gönderir: sunucu
bağlantısının bu üyenin siparişlerine ve izinlerine yazdığı kimlik budur, tema
veri katmanında kullanıcıyı adlandırmasa da ziyaret ve sipariş aynı müşteride
buluşur. Yalnız kimlik gider; e-posta tarayıcıda okunmaz. Ziyaretçinin onayını
her `identify` gibi bekler ve reddedilirse hiç gönderilmez; aynı kimlik bir
kez gönderilir.

**8. Doğrulama** — canlıda:

```javascript
localStorage.setItem('selwise_debug', 'true')
// sayfayı yenile, sonra:
Selwise.explain()            // yüklenen, bekleyen ve çizilmeyen yüzeyler ve nedenleri
```

Panelde kanalın kurulum kartındaki **Verify Now** etiketi sayfanın HTML'inde
ya da sayfanın GTM kapsayıcısında arar; GTM ile kurulan kanal "GTM üzerinden"
doğrulanır.

---

## Kurulum: PZ Next

**1–2. Panel** — Django ile aynı (External Data Layer Name `dataLayer`). PZ
Next projeleri çoğunlukla GA4, bir kısmı EE basar; Akinon ön ayarı ikisini de
okur. Next'te `GLOBALS` yoktur, sayfa tipi ön ayarın URL desenlerinden gelir:
`/product/<pk>`, `/group-product/<pk>`, `/category/<pk>`, `/list/` (listeleme;
`search_text` varsa arama), `/baskets/basket`, `/orders/checkout`. Mağazanın
özel (pretty) ürün ve kategori adresleri için deseni panelde ekleyin.

**3. Script** — iki yol var:

**(a) Kod deploy'u olmadan: mağazanın GTM kapsayıcısı.** Omnitron ve ACC'de
vitrine script ekleyen bir alan yok. GTM'de bir **Custom HTML** etiketi açıp
panelde kanalın kurulum kartındaki kodu olduğu gibi yapıştırın, tetikleyici
**All Pages** (`selwise.com/docs/integration/widget-installation`). Kodu
elle kısaltmayın: komut kuyruğu olmadan `async` yükleme erken sipariş
çağrılarını sessizce düşürür. Bazı projelerin kök layout'u bir Omnitron CMS
widget'ının script'ini de basar (adı projeye göre değişir: `external-gtm`,
`pznext-external-gtm`); bu alan **JavaScript olarak** çalıştırılır, birden çok
etiketli HTML orada sözdizimi hatası verir ve aynı alandaki GTM kodunu da
durdurabilir. Oraya yalnız saf JavaScript olan `shared/selwise-loader.js`
yapıştırılabilir. GTM ile kurulan kanal panelde **GTM üzerinden** doğrulanır.

GTM yoluyla gelmeyenler: ilk boyamadan önce gizleme (etiket GTM ile geç gelir;
sayfa deneyinde kısa bir yanıp sönme olabilir), sunucu taraflı zenginleştirme
ve 3b'deki sepet köprüsü. Bunlar kod ister.

**(b) Kod ile.** [`pz-next/SelwiseScript.tsx`](./pz-next/SelwiseScript.tsx)
dosyasını `src/components/selwise-script.tsx`'e kopyalayıp kök layout'un
`<head>`'ine ekleyin (`@akinon/next` 1.x: `src/app/[commerce]/[locale]/[currency]/layout.tsx`,
2.x: `src/app/[pz]/layout.tsx`). Bileşen `async`'tir; Next.js 14, 15 ve 16'da
çalışır.

**3b. Sepet köprüsü** — Selwise bir öneri şeridinden ya da aramadan ürün
eklediğinde PZ Next'te başlıktaki sayı ve mini sepet **güncellenmez**: sepet
RTK Query önbelleğinde tutulur, depo dışarıdan erişilemez ve tema kendiliğinden
yeniden çekmez. [`pz-next/SelwiseCartBridge.tsx`](./pz-next/SelwiseCartBridge.tsx)
bunu çözer: Selwise'ın `selwise:cart:added` olayını dinler ve temanın **kendi**
sepet sorgularını geçersiz kılar; sayı ve mini sepet sunucudaki sepetten yeniden
çizilir (native eklemenin bıraktığı veriyle aynı).

1. [`shared/selwise-cart-bridge-core.js`](./shared/selwise-cart-bridge-core.js)
   dosyasını bileşenin yanına kopyalayın (düz JS; PZ Next projeleri JS içe
   aktarmaya izin verir).
2. `SelwiseCartBridge.tsx`'i `src/components/selwise-cart-bridge.tsx`'e kopyalayıp
   Redux sağlayıcısının altında **bir kez** render edin (kök layout'ta
   `<PzRoot>` çocukları yanında olağan yer).
3. Seçenekler: `openMiniBasket` (varsayılan `true`: mini sepeti açar ve eklenen
   satırı vurgular; temanın native ekleme bunu yapmıyorsa `false` yapın, sayı yine
   güncellenir), `onAdded(detail)` (projenin kendi toast'ı) ve `onError(detail)`
   (`detail.code` nedenin kapalı listesi, `detail.message` mağazanın cümlesi).

`@akinon/next` 1.126.x ve 2.x'te aynı yolları kullanır; daha eski bir sürüm
sabitlenmişse `@akinon/next/redux/reducers/root` içinde `openMiniBasket` ve
`setHighlightedItem` olduğunu kontrol edin. `<LiveCommerce />` bileşenini
mount etmek **yeterli değildir**: yalnız `refresh-basket` olayını dinler,
sayacı `MiniBasket` etiketinden okuyan temalarda sayıyı güncellemez.

**4. Üyelik olayı** —
[`pz-next/selwise-events.ts`](./pz-next/selwise-events.ts) temanın GA4
katmanında olmayan `sign_up`'ı ekler; kaydolan üye o anda tanınır. Arama için
gerekmez: Selwise araması açıkken aramayı Selwise'ın kendi API'si kaydeder ve
Akinon ön ayarı veri katmanındaki `search` olayını bu yüzden eşlemez.

Üye kimliği PZ Next'te veri katmanından okunur: `user_data_updated` olayı ya
da `{ user_id, user_logged_in }` sayfa değişkenleri. Temanız ikisini de
basmıyorsa üye yalnız `login` / `sign_up` anında tanınır; o durumda oturum
açmış kullanıcı için `Selwise.identify(String(user.pk))` çağırın.

**5. Çoklu pazar** — proje tek deploy'dan birden fazla pazar servis ediyorsa
(`src/utils/market-context.ts` içinde `SUPPORTED_CURRENCIES` uzunsa), pazar
başına **ayrı bir Selwise sitesi** gerekir: bir Selwise sitesi tek domain, tek
para birimi ve tek ürün feed'i taşır.

Enjeksiyon noktası paylaşımlı olduğu için (GTM kapsayıcısı ya da CMS widget'ı
locale/currency olmadan gelir) sabit bir `data-site-key` bütün pazarların
trafiğini tek kanala yığar. Çözüm: [`shared/selwise-loader.js`](./shared/selwise-loader.js)
veya `SelwiseScript.tsx` — ikisi de `location.hostname`'den anahtarı çözer.

Eşlenmeyen bir host **hiçbir şey yüklemez**. Kasıtlı: varsayılan bir anahtara
düşmek staging ziyaretini üretim cirosu olarak kaydeder.

---

## Kurulum: App Maker (React Native)

Akinon App Maker uygulaması Selwise eklentisiyle (`akinon-appmaker-plugin/`)
kurulur; düz bir React Native / Expo uygulaması doğrudan
[`@selwise/react-native`](https://www.npmjs.com/package/@selwise/react-native)
ile. Adım adım: `selwise.com/docs/mobile/app-maker` ve
`selwise.com/docs/mobile/setup`. App kanalının API anahtarı `mobile_read` ve
`mobile_write` kapsamlarını birlikte taşır; uygulama içi WebView'daki ödeme
akışı için `selwise.com/docs/mobile/webview-bridge`.

---

## Ürün kimliği — bir kere karar verin

Feed'in `item_code`'u (Akinon ön ayarında `sku`) mağazanın veri katmanının
ürün kimliğiyle aynı uzayda olmalı. Akinon projelerinde bu proje başına
değişir: `sku`, `base_code`, `base_code.renk`, hatta `pk`. Selwise sinyalleri
`item_code`, `sku`, `cart_code` ve grup kodu (`base_code`) üzerinden çözer;
bu dördü dışındaki bir değer (ör. `base_code.renk` birleşimi) hiçbir ürüne
bağlanmaz. Kurulumdan önce temanın ne bastığına bakın:

```bash
grep -rn "item_id\|\"id\":" src/utils/gtm.ts src/utils/analytics   # PZ Next
grep -rn "item_id\|'id':" templates/analytics templates/utils        # Django PZ
```

Değer bu dört koddan biri değilse feed'e o değeri taşıyan bir kolon ekleyin ya
da temanın bastığı kimliği düzeltin.

---

## Testler

```bash
npx jest --config jest.config.js
```

Shim'in olay adı çözümü (özellikle `eeEvent` + `click` → `select_item`,
`eeEvent` + `detail` → `view_item` ayrımı, üye ve rıza kayıtlarının aynalanması),
`dataLayer`'ı kirletmeme garantisi, çift include'a karşı idempotency, sepet
köprüsü ve loader'ın host eşleme kuralları (alt alan adı devralma, en uzun
suffix kazanır, benzer domain eşleşmez).

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
geçmez: bunları panelde **Integrations → Store connection** okur (Omnitron
entegrasyon kullanıcısıyla bir kez bağlanılır; parola saklanmaz). Kullanıcı
kanalın Data Warehouse'unu okuyabilmeli (staff); okuyamıyorsa bağlantı bunu
söyleyerek reddedilir. Kanalın e-ticaret platformu **Kanal ayarları**'nda `Akinon`
seçilmelidir. Ayrıntı: `selwise.com/docs/integration/commerce-connection`.

---

## Kit ile sunucu tarafı arasındaki iş bölümü

İki yol var ve hangisini kullandığınız kurulumu etkiliyor:

| Konu | Sunucu tarafı (bugün canlı) | Kit alternatifi |
|---|---|---|
| **`eeEvent` belirsizliği** | Ters eşleme `event + ecommerce action` bileşik anahtarını destekliyor (`eeEvent:detail`, `eeEvent:click`, …). Panelde platform `akinon` seçmek yeter. | `selwise-ee-shim.js` — aynı sorunu Akinon tarafından çözer, panelde `selwiseLayer` ayarı ister. Sürüm yükseltemeyen projeler için. |
| **Sayfa tipi** | Django'da `GLOBALS.page`; Next'te ön ayarın URL desenleri (`/list/` listeleme, `search_text` ile arama, `/baskets/basket`, `/product/`, `/group-product/`). | `page-patterns.json` — panelden ezmek isterseniz. |
| **Çoklu pazar** | `SiteDomain` alias tablosu: aynı katalog/para birimini paylaşan hostlar tek siteye bağlanır. | `selwise-loader.js` — farklı para birimli pazarlar hâlâ ayrı site ister, snippet hostname'den anahtarı çözer. |
| **Sepet endpoint'i** | Otomatik tespit: PZ Next'te `/api/client/baskets/basket/`, Django'da `/baskets/basket/`. | — |
| **Beden seçici** | Kart, bedenli ürünün bedenlerini ürün sayfasının JSON'undan (`?format=json`) okur ve seçilen bedenin pk'sıyla ekler. | — |
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
| `id` | `sku` | Bir satır bir üründür (`item_code`); bedeni ve rengi ayrı satırlar ayrı ürünlerdir, aile `itemGroupId`'de birleşir. |
| `cartCode` | `pk` | `/baskets/basket/` **yalnızca numerik ürün pk'sını** kabul eder; `sku` ile yapılan ekleme reddedilir. |
| `sku` | `sku` | |
| `itemGroupId` | `base_code` | Ailenin kodu: renk/beden kardeşleri ve `base_code` basan temaların sinyalleri buraya bağlanır. |
| `title` | `name` | |
| `originalPrice` | `retail_price` | Akinon'un liste fiyatı. Bu olmadan **her ürün indirimsiz görünür** — jenerik alias'lar yalnızca `old_price`/`compare_at_price` biliyor. |
| `currency` | `currency_type` | |
| `imageUrl` | `productimage_set.0.image` | Skaler URL değil, sıralı görsel nesnesi dizisi. |
| `url` | `absolute_url` | |
| `productType`, `stock`, `inStock` | `product_type`, `stock`, `in_stock` | |
| `brand` | `attributes_kwargs.integration_brand.label` | Attribute torbasında, etiketli. |
| `size` | `attributes.pre_ent_beden` | Attribute anahtarı **proje kararı** — farklıysa bu satırı düzenleyin. |
| `color` | `attributes.pre_ent_filtrelenebilir_renk` | Aynı şekilde. |

### İç içe yol desteği

Eşleme değerleri artık **yol** olarak çözülür, düz anahtar olarak değil:
`attributes_kwargs.integration_brand.label`, `productimage_set.0.image`,
`productimage_set[0].image` ve indeks yazılmazsa ilk eleman
(`productimage_set.image`) çalışır. `g:` ve `@_` önekleri otomatik denenir,
yani XML feed'i için önek yazmanız gerekmez.


### Kimlik kontrolü — kurulumdan önce

Temanın veri katmanının bastığı ürün kimliği beslemenin `sku`, `pk` ya da
`base_code` değerlerinden biri olmalı (bkz. *Ürün kimliği — bir kere karar
verin*).

### Diğer feed şekilleri

- `akinon_omnitron` — feed vitrin yerine PIM'den geliyorsa.
- `google_merchant` — Shopping feed'i. Akinon müşterilerinin çoğunda zaten var
  ve genelde işaret edilecek en hızlı kaynak.
