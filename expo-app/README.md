# Ardisa — Expo uygulamasında Selwise

[`@selwise/react-native`](https://www.npmjs.com/package/@selwise/react-native)
ile Selwise'a bağlanmış küçük ama eksiksiz bir React Native (Expo SDK 58)
mağaza uygulaması. Ardisa web mağazasının (`../demo-store`) uygulama kanalı
karşılığıdır: aynı katalog, aynı Selwise hesabı, ayrı bir kanal.

Selwise'a giden her çağrı birkaç dosyadadır; her biri uyduğu kuralı yorumunda
söyler. Ekrana çizilen her şey (kampanya, öneri şeridi, arama, zenginleştirme)
SDK'nın hazır bileşenleridir (`@selwise/react-native/ui`); uygulamaya düşen,
Selwise'ın uygulamayı bilmediği yerlerdir: bağlantı açma, sepet, WebView, favori.

| Ne | Nerede |
|---|---|
| Tek istemci, AsyncStorage, cevaba kadar bekletilen onay, uygulama durumu | `src/selwise.ts` |
| Bileşenlerin uygulamadan istedikleri: `navigate`, `addToCart`, `WebView`, favoriler (`SelwiseHost`) | `src/host.tsx` |
| Bir kez bağlanan `SelwiseProvider` ve her kampanyayı çizen tek `SelwiseSurfaces` katmanı | `App.tsx` |
| Onay ekranı → `setConsent` | `src/components/ConsentSheet.tsx` |
| Ekran adları (`app://home`, `app://product`, …) → `trackScreenView` | `src/screens/*` |
| Ekrandaki bağlama noktaları (`SelwiseSlot`): hangi şeridin nerede çıkacağını panel seçer | `src/screens/HomeScreen.tsx`, `ProductScreen.tsx`, `CartScreen.tsx`, `SearchScreen.tsx` |
| Ürüne özel zenginleştirme blokları (`SelwiseEnrichment`, WebView'da) | `src/screens/ProductScreen.tsx`, `CartScreen.tsx` |
| Arama ekranı (`SelwiseSearchPanel`): kutu, öneriler, sonuçlar, filtreler | `src/screens/SearchScreen.tsx` |
| Favoriler: ürün kartındaki kalp (`host.toggleWishlist`) ve uygulamanın kendi düğmesi | `src/favourites.ts`, `src/host.tsx`, `src/screens/ProductScreen.tsx` |
| Bildirimler: izin, belirteç, bildirime dokunma (`setPushPermission`, `registerPushToken`, `trackPushOpen`) | `src/push.ts` |
| Sepet → `setCart` (mutlak tutar), ekleme/çıkarma olayları | `src/store.tsx` |
| Sipariş → `trackOrder` (beklenir, aynı numara iki kez sayılmaz) | `src/screens/CartScreen.tsx` |
| **İmzalı kimlikle** giriş → `identify(id, traits, { userHash, userHashTs })` | `src/store.tsx`, `src/screens/AccountScreen.tsx` |

## Çalıştırma

```bash
cp .env.example .env      # kanal anahtarını ve API anahtarını yazın
npm install
npx expo install --fix    # react-native-webview ve expo-notifications'ı Expo sürümünüze hizalar
npx expo start            # i = iOS simülatörü, a = Android emülatörü
```

Bildirim belirteci gerçek bir cihaz ister; simülatörde ve Expo Go'da `src/push.ts`
sessizce atlar, uygulama aynı çalışır.

Selwise'ta bir **uygulama kanalı** ve hem `mobile_read` hem `mobile_write`
kapsamı olan bir API anahtarı gerekir (amaç: "Mobile app"). Ürünler isteği bir
POST'tur; yalnızca okuma yetkili anahtar orada ve yalnızca orada 403 alır.

Panelde öneri şeritlerini ve kampanyaları bu uygulamanın gönderdiği ekran
adlarına hedefleyin (`app://home`, `app://product`, `app://basket`,
`app://search`, `app://account`): web'deki adreslerin yerini bunlar alır.

### Bağlama noktaları

Bu uygulama şu noktaları monte eder; panelde bir şeridin "Kapsayıcı" alanı
bunlardan birini seçer, kodda bir şey değişmez:

| Ekran | Noktalar (yukarıdan aşağıya) |
|---|---|
| `app://home` | `home-top`, `home-bottom` |
| `app://product` | `pdp-under-cart`, `pdp-under-info`, `pdp-bottom` |
| `app://basket` | `basket-under-items`, `basket-bottom` |
| `app://search` | `search-bottom` |

Panel başka bir nokta da sunar (`plp-top`, `favourites-bottom`, …); uygulamanın
olmayan bir ekranı için o noktayı monte etmek tek satırdır:
`<SelwiseSlot screen="app://list" slot="plp-top" />`.

### Bildirimler

Selwise'ta bir senaryoya **Uygulama bildirimi** adımı koyup Ayarlar → Mesajlaşma'dan
kendi sağlayıcınızı bağlayın (Firebase, Apple ya da Expo hesabınız). Uygulama
üç şey bildirir: işletim sisteminin verdiği izin, cihazın belirteci ve bir
bildirime dokunulduğu. `.env`'e `EXPO_PUBLIC_EXPO_PROJECT_ID` yazarsanız Expo'nun
push servisi kullanılır; yazmazsanız cihazın kendi belirteci (Android'de FCM,
iOS'ta APNs) kaydedilir. İzin ekranı, onay sheet'inde **Pazarlama** açıldığında
çıkar: bildirim bir pazarlama kararıdır, onaysız belirteç gönderilmez.

### İmzalı kimlik

Kimlik sırrı uygulamaya hiç girmez. Uygulama kendi arka ucuna giriş yapar —
burada Ardisa demo mağazasının `POST /api/auth/login` ucu
(`EXPO_PUBLIC_STORE_URL`) — ve yanıt müşteriyle **birlikte** sunucunun
`<müşteriNo>:<unixSaniye>` metnine attığı HMAC-SHA256 imzasını getirir. Uygulama
bu imzayı `identify`'a verir. Hesabı önce web mağazasında açın; uygulama aynı
hesapla giriş yapar.

## Bu örnekte olmayanlar

- Gezinme `App.tsx`'teki bir sekme çubuğudur, Expo Router değil: konu Selwise
  bağlantısı, yönlendirme değil.
- Favoriler bellektedir (`src/favourites.ts`): gerçek bir uygulama bunları kendi
  arka ucunda tutar; Selwise yalnızca "favori mi?", "değiştir" ve "değişti"yi sorar.
- Sepet bellektedir; ödeme adımı yoktur, sipariş yalnızca Selwise'a bildirilir.

## Dokümanlar

- SDK başvurusu: npm'deki paket README'si
- Mobil rehber: https://selwise.com/docs/mobile/overview
- İmzalı kimlik: https://selwise.com/docs/integration/identity-verification

MIT lisanslıdır.
