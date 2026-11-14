# Selwise entegrasyon örnekleri

[Selwise](https://selwise.com)'ı bir mağazaya, bir mobil uygulamaya ya da bir
Akinon vitrinine bağlayan **çalışan** kod. Buradaki her şey Selwise'ın kendi
kullandığı kodun aynısıdır: canlı demo mağaza bu klasörden derlenir, SDK ve
eklentinin kaynağı da burada durur.

## npm paketleri

Kurulan şey npm'dedir; bu depo yalnız kaynağı ve örnekleri taşır.

| Paket | Ne | Kurulum | Kaynak |
|---|---|---|---|
| [`@selwise/widget`](https://www.npmjs.com/package/@selwise/widget) | Mağaza vitrinine gömülen çalışma zamanı: kampanya, widget, öneri, arama, olay izleme. Aynı derleme CDN'den de sunulur. | `npm i @selwise/widget` | Bu depoda değil. Paket derlenmiş çıktıyı taşır; kurulum dokümanı [selwise.com/docs](https://selwise.com/docs/integration/overview). |
| [`@selwise/react-native`](https://www.npmjs.com/package/@selwise/react-native) | Mobil uygulama SDK'sı. | `npm i @selwise/react-native` | [`react-native/`](react-native) |
| [`selwise-akinon-appmaker`](https://www.npmjs.com/package/selwise-akinon-appmaker) | Akinon App Maker eklentisi: kampanyaları, şeritleri ve zenginleştirmeyi native çizer. | `npm i selwise-akinon-appmaker` | [`akinon-appmaker-plugin/`](akinon-appmaker-plugin) |

## Klasörler

| Klasör | Ne | Canlı |
|---|---|---|
| [`demo-store/`](demo-store) | **Ardisa**: Selwise'ı özel altyapıyla kuran eksiksiz bir Next.js mağazası. Veri katmanı, imzalı kimlik, sipariş ve sipariş durumu, ürün ve dil feed'i, sunucu taraflı zenginleştirme, headless öneri ve arama, kendi çerez bandıyla onay, kodla A/B, geçmiş veri aktarımı. | [demo.selwise.com](https://demo.selwise.com) · [/gelistirici](https://demo.selwise.com/gelistirici) |
| [`expo-app/`](expo-app) | Ardisa'nın Expo (React Native) uygulaması: onay, imzalı kimlik, ekranlar, öneri, arama, kampanya ve hedef çubuğu, zenginleştirme, sipariş. | — |
| [`react-native/`](react-native) | `@selwise/react-native` SDK'sının kaynağı. | [npm](https://www.npmjs.com/package/@selwise/react-native) |
| [`akinon/`](akinon) | Akinon Project Zero (Django) ve PZ Next için kurulum kiti. | — |
| [`akinon-appmaker-plugin/`](akinon-appmaker-plugin) | `selwise-akinon-appmaker` eklentisinin kaynağı. | [npm](https://www.npmjs.com/package/selwise-akinon-appmaker) |
| [`openapi/`](openapi) | Herkese açık API'nin OpenAPI 3 belgesi. | [selwise.com/docs](https://selwise.com/docs/api-reference/public-api) |

## Nereden başlamalı

- **Kendi altyapınız (custom) varsa:** `demo-store/README.md` → "Neyin nerede
  olduğu" tablosu. Her satır bir dosya ve bir doküman sayfasıdır.
- **Mobil uygulamanız varsa:** `expo-app/README.md`.
- **Akinon kullanıyorsanız:** `akinon/README.md`.
- **Kendi arayüzünüzü yazıyorsanız (headless):**
  `demo-store/src/lib/selwise/headless.ts` ve
  [demo.selwise.com/gelistirici/headless](https://demo.selwise.com/gelistirici/headless).

Dokümanların tamamı: **https://selwise.com/docs**

## Bu depo hakkında

Bu depo Selwise'ın ana deposunun **tek yönlü bir aynasıdır**: değişiklikler
oradan gelir ve her senkronda buradaki dosyaların yerine yazılır. Bu yüzden
pull request kabul edemiyoruz; bir hata ya da soru için issue açın ya da
Selwise hesap yöneticinize yazın.

Kod MIT lisanslıdır (`LICENSE`). "Ardisa" kurgusal bir markadır; ürünler,
fiyatlar ve görseller gerçek değildir.
