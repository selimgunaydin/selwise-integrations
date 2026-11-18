// GENERATED FILE — DO NOT EDIT.
//
// Vendored from packages/locale-contract/src/shopper-strings.ts by
// scripts/sync-vendored-page-targeting.js. Edit the source, then run:
//
//   node scripts/sync-vendored-page-targeting.js
//
// It is copied rather than imported because @selwise/locale-contract is private
// and this SDK is published: a dependency on it would not resolve for anyone
// who installs @selwise/react-native from npm.

/**
 * What the widget says by ITSELF — the words a shopper reads when the merchant
 * left a field empty: the cookie notice's buttons, "no products found", the
 * look total, a social-proof line.
 *
 * Every one of these used to be an English literal, or a `tr ? … : …` decided
 * from `<html lang>` in five different places. They are one dictionary now,
 * read through `shopperString` with the language the bootstrap resolved
 * (`config.locale.resolved`), so a Turkish store's cookie notice is Turkish
 * without anybody typing it.
 *
 * Turkish and English are complete. Another account language falls back to
 * English for these words until it is added here; the merchant's own text for
 * a field always wins over this dictionary.
 *
 * A subpath of its own (`@selwise/locale-contract/shopper-strings`): the
 * widget imports it from lazy chunks, and nothing else in the package needs
 * to come with it.
 */

const EN = {
  'search.placeholder': 'Search products...',
  'search.empty': 'No products found',
  'search.error': 'Search is temporarily unavailable',
  'search.viewAll': 'View all results',
  'search.close': 'Close search',
  'search.clear': 'Clear search',
  'search.header': 'Search',
  'search.loading': 'Searching...',
  'search.didYouMean': 'Did you mean?',
  'search.inStock': 'In stock',
  'search.outOfStock': 'Out of stock',
  'search.categories': 'Categories',
  'search.all': 'All',
  'search.categoryRemove': 'Remove category filter',
  'search.footer': '{total} results',
  'search.showing': 'Showing {shown} of {total}',
  'search.refine': 'Try a shorter or more general term.',
  'search.recentSearches': 'Recent searches',
  'search.clearRecent': 'Clear',
  'search.popularSearches': 'Popular searches',
  'search.popularCategories': 'Popular categories',
  'search.popularProducts': 'Popular products',
  'cart.add': 'Add to cart',
  'cart.adding': 'Adding...',
  'cart.added': 'Added!',
  'cart.error': 'Could not add',
  // What the add-to-cart toast says (Design -> Recommendations -> Cart -> After add).
  'cart.toast.added': 'Added to your cart',
  'cart.toast.outOfStock': 'This option is out of stock',
  'cart.toast.chooseOption': 'Choose an option first',
  'cart.toast.limit': 'The limit for this product in your cart is reached',
  'cart.toast.network': 'Connection problem. Please try again',
  'cart.toast.failed': 'Could not add to your cart',
  // The window a card opens to ask which option (size, number) goes in the basket.
  'cart.chooseOption': 'Choose an option',
  'cart.soldOut': 'Sold out',
  'cart.close': 'Close',
  // A campaign's close button and the name of its popup, for a screen reader.
  'campaign.close': 'Close',
  'campaign.dialog': 'Message',

  'consent.headline': 'We use cookies',
  'consent.description': 'We use cookies to run this site, measure how it is used and personalise what you see.',
  'consent.accept': 'Accept all',
  'consent.decline': 'Reject optional',
  'consent.customize': 'Customize',
  'consent.save': 'Save preferences',
  'consent.back': 'Back',
  'consent.customizeTitle': 'Customize your preferences',
  'consent.reopen': 'Cookie preferences',
  'consent.alwaysOn': 'always on',
  'consent.necessary.label': 'Essential',
  'consent.necessary.description': 'Required for the site to work',
  'consent.analytics.label': 'Analytics',
  'consent.analytics.description': 'How the site is used',
  'consent.marketing.label': 'Marketing',
  'consent.marketing.description': 'Personalised offers and ads',
  'consent.preferences.label': 'Preferences',
  'consent.preferences.description': 'Remembers your settings',

  'newsletter.success': 'You are subscribed.',
  'newsletter.pending': 'Please check your inbox and confirm your subscription.',
  'newsletter.invalidEmail': 'Please enter a valid email address.',
  'newsletter.invalidPhone': 'Please enter a valid phone number.',
  'newsletter.failed': 'Unable to subscribe right now.',
  'newsletter.privacyNotice': 'How we process your data',

  'look.total': 'Look total',
  'look.addAll': 'Add all to basket',
  'addAll.added': '{added} of {requested} added to the basket',
  'addAll.needsSize': 'choose a size for {count}',
  'addAll.failed': '{count} could not be added',

  'socialProof.cart': '{count} people added this to their basket',
  'socialProof.views': '{count} people viewed this product',

  'button.default': 'Click me',

  // A product card's buttons, when the card names none of its own.
  'card.addToCart': 'Add to Cart',
  'card.review': 'Review',
  'card.quickView': 'Quick View',
  'card.viewProduct': 'View Product',
  'card.view': 'View',
  'card.wishlist': 'Add to wishlist',
} as const;

export type ShopperStringKey = keyof typeof EN;

const TR: Record<ShopperStringKey, string> = {
  'search.placeholder': 'Ürün ara...',
  'search.empty': 'Ürün bulunamadı',
  'search.error': 'Arama şu anda kullanılamıyor',
  'search.viewAll': 'Tüm sonuçları gör',
  'search.close': 'Aramayı kapat',
  'search.clear': 'Aramayı temizle',
  'search.header': 'Ara',
  'search.loading': 'Aranıyor...',
  'search.didYouMean': 'Bunu mu demek istediniz?',
  'search.inStock': 'Stokta',
  'search.outOfStock': 'Tükendi',
  'search.categories': 'Kategoriler',
  'search.all': 'Tümü',
  'search.categoryRemove': 'Kategori filtresini kaldır',
  'search.footer': '{total} sonuç',
  'search.showing': '{total} sonuçtan {shown} tanesi',
  'search.refine': 'Daha kısa ya da daha genel bir terim deneyin.',
  'search.recentSearches': 'Son aramalar',
  'search.clearRecent': 'Temizle',
  'search.popularSearches': 'Popüler aramalar',
  'search.popularCategories': 'Popüler kategoriler',
  'search.popularProducts': 'Popüler ürünler',
  'cart.add': 'Sepete ekle',
  'cart.adding': 'Ekleniyor...',
  'cart.added': 'Eklendi!',
  'cart.error': 'Eklenemedi',
  'cart.toast.added': 'Sepetinize eklendi',
  'cart.toast.outOfStock': 'Bu seçenek tükendi',
  'cart.toast.chooseOption': 'Önce bir seçenek seçin',
  'cart.toast.limit': 'Bu ürün için sepetinizdeki sınıra ulaşıldı',
  'cart.toast.network': 'Bağlantı sorunu. Lütfen tekrar deneyin',
  'cart.toast.failed': 'Sepetinize eklenemedi',
  'cart.chooseOption': 'Seçenek seçiniz',
  'cart.soldOut': 'Tükendi',
  'cart.close': 'Kapat',
  'campaign.close': 'Kapat',
  'campaign.dialog': 'İleti',

  'consent.headline': 'Çerez kullanıyoruz',
  'consent.description':
    'Bu siteyi çalıştırmak, nasıl kullanıldığını ölçmek ve size gösterilenleri kişiselleştirmek için çerez kullanıyoruz.',
  'consent.accept': 'Tümünü kabul et',
  'consent.decline': 'İsteğe bağlı olanları reddet',
  'consent.customize': 'Özelleştir',
  'consent.save': 'Tercihleri kaydet',
  'consent.back': 'Geri',
  'consent.customizeTitle': 'Tercihlerinizi özelleştirin',
  'consent.reopen': 'Çerez tercihleri',
  'consent.alwaysOn': 'her zaman açık',
  'consent.necessary.label': 'Zorunlu',
  'consent.necessary.description': 'Sitenin çalışması için gerekli',
  'consent.analytics.label': 'Analitik',
  'consent.analytics.description': 'Sitenin nasıl kullanıldığı',
  'consent.marketing.label': 'Pazarlama',
  'consent.marketing.description': 'Kişiselleştirilmiş teklifler ve reklamlar',
  'consent.preferences.label': 'Tercihler',
  'consent.preferences.description': 'Ayarlarınızı hatırlar',

  'newsletter.success': 'Aboneliğiniz tamamlandı.',
  'newsletter.pending': 'Lütfen gelen kutunuzu kontrol edin ve aboneliğinizi onaylayın.',
  'newsletter.invalidEmail': 'Lütfen geçerli bir e-posta adresi girin.',
  'newsletter.invalidPhone': 'Lütfen geçerli bir telefon numarası girin.',
  'newsletter.failed': 'Şu anda abone olunamıyor.',
  'newsletter.privacyNotice': 'Kişisel verilerin işlenmesine ilişkin aydınlatma metni',

  'look.total': 'Kombin toplamı',
  'look.addAll': 'Hepsini sepete ekle',
  'addAll.added': '{added}/{requested} ürün sepete eklendi',
  'addAll.needsSize': '{count} ürün için beden seçin',
  'addAll.failed': '{count} ürün eklenemedi',

  'socialProof.cart': '{count} kişi sepete ekledi',
  'socialProof.views': '{count} kişi bu ürünü görüntüledi',

  'button.default': 'Tıkla',

  'card.addToCart': 'Sepete Ekle',
  'card.review': 'İncele',
  'card.quickView': 'Hızlı Bakış',
  'card.viewProduct': 'Ürünü Gör',
  'card.view': 'Gör',
  'card.wishlist': 'Favorilere ekle',
};

const DICTIONARIES: Record<string, Record<ShopperStringKey, string>> = { en: EN, tr: TR };

/** The languages this dictionary is complete in. */
export const SHOPPER_STRING_LOCALES = Object.keys(DICTIONARIES);

/**
 * One of the widget's own phrases in `locale` — its primary subtag if the
 * full tag is not here (`en-gb` → `en`), English if neither is. `{name}`
 * placeholders are filled from `params`.
 */
export function shopperString(
  key: ShopperStringKey,
  locale: string | null | undefined,
  params?: Record<string, string | number>,
): string {
  const tag = String(locale ?? '').toLowerCase();
  const dictionary = DICTIONARIES[tag] ?? DICTIONARIES[tag.split('-')[0] ?? ''] ?? EN;
  const text = dictionary[key] ?? EN[key];
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    params[name] === undefined ? match : String(params[name]),
  );
}
