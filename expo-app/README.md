# Ardisa — Expo uygulamasında Selwise

[`@selwise/react-native`](https://www.npmjs.com/package/@selwise/react-native)
ile Selwise'a bağlanmış küçük ama eksiksiz bir React Native (Expo SDK 58)
mağaza uygulaması. Ardisa web mağazasının (`../demo-store`) uygulama kanalı
karşılığıdır: aynı katalog, aynı Selwise hesabı, ayrı bir kanal.

Selwise'a giden her çağrı birkaç dosyadadır; her biri uyduğu kuralı yorumunda
söyler:

| Ne | Nerede |
|---|---|
| Tek istemci, AsyncStorage, cevaba kadar bekletilen onay, uygulama durumu | `src/selwise.ts` |
| Onay ekranı → `setConsent` | `src/components/ConsentSheet.tsx` |
| Ekran adları (`app://home`, `app://product`, …) → `trackScreenView` | `src/screens/*` |
| Uygulamanın kendi kartıyla öneri şeritleri, gösterim + tıklama | `src/components/Strip.tsx` |
| Kampanyalar (`getSurfaces`) native çizim, sepeti izleyen hedef çubuğu | `src/components/Surfaces.tsx` |
| Ürün görüntüleme, zenginleştirme blokları, benzer ürünler | `src/screens/ProductScreen.tsx` |
| Anlık arama (`useSelwiseSearch`) | `src/screens/SearchScreen.tsx` |
| Sepet → `setCart` (mutlak tutar), ekleme/çıkarma olayları | `src/store.tsx` |
| Sipariş → `trackOrder` (beklenir, aynı numara iki kez sayılmaz) | `src/screens/CartScreen.tsx` |
| **İmzalı kimlikle** giriş → `identify(id, traits, { userHash, userHashTs })` | `src/store.tsx`, `src/screens/AccountScreen.tsx` |

## Çalıştırma

```bash
cp .env.example .env      # kanal anahtarını ve API anahtarını yazın
npm install
npx expo start            # i = iOS simülatörü, a = Android emülatörü
```

Selwise'ta bir **uygulama kanalı** ve hem `mobile_read` hem `mobile_write`
kapsamı olan bir API anahtarı gerekir (amaç: "Mobile app"). Ürünler isteği bir
POST'tur; yalnızca okuma yetkili anahtar orada ve yalnızca orada 403 alır.

Panelde öneri şeritlerini ve kampanyaları bu uygulamanın gönderdiği ekran
adlarına hedefleyin (`app://home`, `app://product`, `app://basket`,
`app://search`, `app://account`): web'deki adreslerin yerini bunlar alır.

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
- Zenginleştirme içeriği metin olarak gösterilir. Gerçek bir uygulama onu bir
  WebView'da ya da native bileşenlerle çizer.
- Sepet bellektedir; ödeme adımı yoktur, sipariş yalnızca Selwise'a bildirilir.

## Dokümanlar

- SDK başvurusu: npm'deki paket README'si
- Mobil rehber: https://selwise.com/docs/mobile/overview
- İmzalı kimlik: https://selwise.com/docs/integration/identity-verification

MIT lisanslıdır.
