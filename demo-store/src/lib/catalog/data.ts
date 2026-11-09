/**
 * The demo catalogue, as data.
 *
 * Ardisa is a fictional lifestyle store. Nothing here is a real product, brand
 * or price list. The catalogue is deliberately shaped to exercise Selwise:
 *
 *  - every model has colour siblings sharing a group code (variant grouping,
 *    "one card per group" in recommendation strips, similar-products excluding
 *    the group);
 *  - each colour row has its own numeric cart code, different from its item
 *    code (the custom cart script and `cartCode` mapping);
 *  - a share of rows are discounted (`on_sale`), new (`new_arrivals`), sold out
 *    (back-in-stock scenarios) or nearly sold out (low-in-stock);
 *  - categories are two levels deep with a breadcrumb path (category targeting,
 *    `category_based`, category_view).
 */
import type { TemplateKey } from '../art/templates';

export const COLORS = {
  siyah: { name: 'Siyah', hex: '#232323' },
  beyaz: { name: 'Beyaz', hex: '#F4F2EE' },
  ekru: { name: 'Ekru', hex: '#E9E1D3' },
  bej: { name: 'Bej', hex: '#D8C3A5' },
  kahve: { name: 'Kahverengi', hex: '#7A5236' },
  camel: { name: 'Camel', hex: '#B5854F' },
  haki: { name: 'Haki', hex: '#6B6B47' },
  zeytin: { name: 'Zeytin Yeşili', hex: '#5B6236' },
  lacivert: { name: 'Lacivert', hex: '#1F2A44' },
  mavi: { name: 'Mavi', hex: '#3A6EA5' },
  denim: { name: 'Denim Mavisi', hex: '#4A6A8F' },
  acikmavi: { name: 'Açık Mavi', hex: '#9CC3E0' },
  gri: { name: 'Gri', hex: '#8A8D91' },
  antrasit: { name: 'Antrasit', hex: '#3D4045' },
  bordo: { name: 'Bordo', hex: '#6E1F2B' },
  kirmizi: { name: 'Kırmızı', hex: '#C0392B' },
  pembe: { name: 'Pembe', hex: '#E8A0B4' },
  pudra: { name: 'Pudra', hex: '#E9C9C1' },
  lila: { name: 'Lila', hex: '#B7A6D6' },
  yesil: { name: 'Yeşil', hex: '#3E7C59' },
  mint: { name: 'Mint', hex: '#A8D5C2' },
  sari: { name: 'Sarı', hex: '#E8C547' },
  hardal: { name: 'Hardal', hex: '#C99A2E' },
  turuncu: { name: 'Turuncu', hex: '#E07B39' },
  kiremit: { name: 'Kiremit', hex: '#B4532A' },
  krem: { name: 'Krem', hex: '#F3EAD7' },
  nude: { name: 'Nude', hex: '#C99A86' },
  gul: { name: 'Gül Kurusu', hex: '#B76E79' },
  mercan: { name: 'Mercan', hex: '#E5735E' },
  sage: { name: 'Adaçayı', hex: '#9CAF88' },
} as const;

export type ColorKey = keyof typeof COLORS;

export type SizeScale = 'apparel' | 'denim' | 'shoeW' | 'shoeM' | 'one' | 'volume';

export const SIZE_SCALES: Record<SizeScale, string[]> = {
  apparel: ['XS', 'S', 'M', 'L', 'XL'],
  denim: ['26', '27', '28', '29', '30', '31', '32', '34'],
  shoeW: ['36', '37', '38', '39', '40', '41'],
  shoeM: ['40', '41', '42', '43', '44', '45'],
  one: ['Standart'],
  volume: ['Standart'],
};

export interface CategoryDef {
  slug: string;
  name: string;
  description: string;
  children: SubcategoryDef[];
}

export interface SubcategoryDef {
  slug: string;
  name: string;
  brand: string;
  sizeScale: SizeScale;
  gender?: 'Kadın' | 'Erkek' | 'Unisex';
  /** Sentence fragments the description generator stitches together. */
  copy: { lead: string; care: string };
  models: ModelDef[];
}

export interface ModelDef {
  name: string;
  type: TemplateKey;
  price: number;
  colors: ColorKey[];
  material: string;
  pattern?: 'stripe' | 'check' | 'dot';
  /** Extra feed attributes, captured by Selwise as `attr.<key>`. */
  attrs?: Record<string, string>;
  /** Volume / size note for beauty and home. */
  spec?: string;
}

const apparelCare = 'Ters çevirerek 30°C\'de yıkayın, tamburlu kurutma makinesi kullanmayın.';

export const CATEGORIES: CategoryDef[] = [
  {
    slug: 'kadin',
    name: 'Kadın',
    description: 'Sezonun yeni parçaları, gardırop klasikleri ve günlük şıklık.',
    children: [
      {
        slug: 'kadin-elbise',
        name: 'Elbise',
        brand: 'Ardisa',
        sizeScale: 'apparel',
        gender: 'Kadın',
        copy: {
          lead: 'Gündüzden akşama rahatlıkla taşınabilen, akışkan kesimli bir elbise.',
          care: apparelCare,
        },
        models: [
          { name: 'Keten Midi Elbise', type: 'dress', price: 1899, colors: ['ekru', 'sage', 'siyah'], material: '%100 Keten' },
          { name: 'Saten Askılı Elbise', type: 'dress', price: 2299, colors: ['bordo', 'siyah', 'pudra'], material: '%100 Polyester Saten' },
          { name: 'Poplin Gömlek Elbise', type: 'dress', price: 1699, colors: ['beyaz', 'acikmavi'], material: '%100 Pamuk Poplin', pattern: 'stripe' },
          { name: 'Puantiyeli Yazlık Elbise', type: 'dress', price: 1499, colors: ['lacivert', 'kirmizi'], material: '%100 Viskon', pattern: 'dot' },
          { name: 'Triko Kalem Elbise', type: 'dress', price: 2499, colors: ['camel', 'antrasit'], material: '%70 Viskon %30 Polyamid' },
          { name: 'Kruvaze Uzun Elbise', type: 'dress', price: 2799, colors: ['zeytin', 'kiremit'], material: '%100 Lyocell' },
        ],
      },
      {
        slug: 'kadin-tisort-bluz',
        name: 'Tişört & Bluz',
        brand: 'Ardisa',
        sizeScale: 'apparel',
        gender: 'Kadın',
        copy: { lead: 'Kombin yapması kolay, yumuşak dokulu bir temel parça.', care: apparelCare },
        models: [
          { name: 'Basic Pamuklu Tişört', type: 'tshirt', price: 449, colors: ['beyaz', 'siyah', 'gri', 'pembe', 'sage'], material: '%100 Organik Pamuk' },
          { name: 'Çizgili Bretonya Tişört', type: 'tshirt', price: 599, colors: ['ekru', 'lacivert'], material: '%100 Pamuk', pattern: 'stripe' },
          { name: 'Oversize Grafik Tişört', type: 'tshirt', price: 649, colors: ['krem', 'antrasit'], material: '%100 Pamuk Süprem' },
          { name: 'Fırfırlı Poplin Bluz', type: 'shirt', price: 899, colors: ['beyaz', 'mavi'], material: '%100 Pamuk' },
          { name: 'Saten Bluz', type: 'shirt', price: 1099, colors: ['pudra', 'siyah', 'sage'], material: '%100 Polyester Saten' },
        ],
      },
      {
        slug: 'kadin-gomlek',
        name: 'Gömlek',
        brand: 'Ardisa',
        sizeScale: 'apparel',
        gender: 'Kadın',
        copy: { lead: 'Hem ofiste hem hafta sonu giyilecek, net çizgili bir gömlek.', care: apparelCare },
        models: [
          { name: 'Oversize Keten Gömlek', type: 'shirt', price: 1199, colors: ['beyaz', 'bej', 'acikmavi'], material: '%100 Keten' },
          { name: 'Çizgili Poplin Gömlek', type: 'shirt', price: 999, colors: ['mavi', 'beyaz'], material: '%100 Pamuk', pattern: 'stripe' },
          { name: 'Denim Gömlek', type: 'shirt', price: 1299, colors: ['denim', 'acikmavi'], material: '%100 Pamuk Denim' },
          { name: 'Ekose Flanel Gömlek', type: 'shirt', price: 1099, colors: ['bordo', 'zeytin'], material: '%100 Pamuk Flanel', pattern: 'check' },
        ],
      },
      {
        slug: 'kadin-triko',
        name: 'Kazak & Hırka',
        brand: 'Ardisa',
        sizeScale: 'apparel',
        gender: 'Kadın',
        copy: { lead: 'Serin günlerin vazgeçilmezi, yumuşak örgülü bir triko.', care: 'Elde soğuk suda yıkayın, sererek kurutun.' },
        models: [
          { name: 'Kaşmir Karışımlı Kazak', type: 'knit', price: 2499, colors: ['camel', 'krem', 'gri'], material: '%10 Kaşmir %50 Yün %40 Viskon' },
          { name: 'Balıkçı Yaka Triko', type: 'knit', price: 1499, colors: ['siyah', 'ekru', 'bordo'], material: '%60 Pamuk %40 Akrilik' },
          { name: 'Örgü Desenli Hırka', type: 'knit', price: 1799, colors: ['krem', 'sage'], material: '%50 Yün %50 Akrilik' },
          { name: 'Çizgili Yarım Balıkçı', type: 'knit', price: 1399, colors: ['lacivert', 'kiremit'], material: '%100 Pamuk', pattern: 'stripe' },
        ],
      },
      {
        slug: 'kadin-pantolon-jean',
        name: 'Pantolon & Jean',
        brand: 'Ardisa',
        sizeScale: 'denim',
        gender: 'Kadın',
        copy: { lead: 'Gün boyu rahat eden, vücudu saran bir kalıp.', care: apparelCare },
        models: [
          { name: 'Yüksek Bel Mom Jean', type: 'jeans', price: 1399, colors: ['denim', 'acikmavi', 'siyah'], material: '%99 Pamuk %1 Elastan' },
          { name: 'Wide Leg Jean', type: 'jeans', price: 1499, colors: ['denim', 'ekru'], material: '%100 Pamuk' },
          { name: 'Pileli Kumaş Pantolon', type: 'pants', price: 1299, colors: ['siyah', 'bej', 'gri'], material: '%65 Polyester %35 Viskon' },
          { name: 'Keten Palazzo Pantolon', type: 'pants', price: 1199, colors: ['ekru', 'kiremit'], material: '%100 Keten' },
          { name: 'Kargo Pantolon', type: 'pants', price: 1349, colors: ['haki', 'siyah'], material: '%100 Pamuk Gabardin' },
        ],
      },
      {
        slug: 'kadin-etek',
        name: 'Etek',
        brand: 'Ardisa',
        sizeScale: 'apparel',
        gender: 'Kadın',
        copy: { lead: 'Hareket ettikçe dökümünü gösteren, zamansız bir etek.', care: apparelCare },
        models: [
          { name: 'Pliseli Midi Etek', type: 'skirt', price: 1199, colors: ['sage', 'siyah', 'pudra'], material: '%100 Polyester' },
          { name: 'Denim Mini Etek', type: 'skirt', price: 899, colors: ['denim', 'ekru'], material: '%100 Pamuk' },
          { name: 'Saten Midi Etek', type: 'skirt', price: 1299, colors: ['camel', 'bordo'], material: '%100 Polyester Saten' },
        ],
      },
      {
        slug: 'kadin-dis-giyim',
        name: 'Ceket & Mont',
        brand: 'Ardisa',
        sizeScale: 'apparel',
        gender: 'Kadın',
        copy: { lead: 'Kombininizi tamamlayan, mevsim geçişlerine uygun bir dış giyim parçası.', care: 'Kuru temizleme önerilir.' },
        models: [
          { name: 'Oversize Blazer Ceket', type: 'jacket', price: 2799, colors: ['siyah', 'bej', 'ekru'], material: '%68 Polyester %30 Viskon %2 Elastan' },
          { name: 'Yün Karışımlı Kaban', type: 'coat', price: 5499, colors: ['camel', 'antrasit'], material: '%50 Yün %50 Polyester' },
          { name: 'Trençkot', type: 'coat', price: 4299, colors: ['bej', 'haki'], material: '%100 Pamuk Gabardin' },
          { name: 'Denim Ceket', type: 'jacket', price: 1899, colors: ['denim', 'acikmavi'], material: '%100 Pamuk' },
          { name: 'Kapitone Şişme Mont', type: 'coat', price: 3999, colors: ['siyah', 'krem', 'zeytin'], material: '%100 Geri Dönüştürülmüş Polyester' },
        ],
      },
    ],
  },
  {
    slug: 'erkek',
    name: 'Erkek',
    description: 'Temel parçalardan dış giyime, sade ve kaliteli erkek koleksiyonu.',
    children: [
      {
        slug: 'erkek-tisort',
        name: 'Tişört & Polo',
        brand: 'Ardisa',
        sizeScale: 'apparel',
        gender: 'Erkek',
        copy: { lead: 'Gardırobun temeli: yumuşak, nefes alan ve formunu koruyan bir tişört.', care: apparelCare },
        models: [
          { name: 'Regular Fit Basic Tişört', type: 'tshirt', price: 399, colors: ['beyaz', 'siyah', 'lacivert', 'gri', 'haki'], material: '%100 Pamuk' },
          { name: 'Pike Polo Yaka Tişört', type: 'tshirt', price: 749, colors: ['lacivert', 'beyaz', 'yesil'], material: '%100 Pamuk Pike' },
          { name: 'Çizgili Tişört', type: 'tshirt', price: 549, colors: ['ekru', 'lacivert'], material: '%100 Pamuk', pattern: 'stripe' },
          { name: 'Oversize Ağır Gramaj Tişört', type: 'tshirt', price: 699, colors: ['antrasit', 'krem', 'kahve'], material: '%100 Pamuk 240 gr' },
        ],
      },
      {
        slug: 'erkek-gomlek',
        name: 'Gömlek',
        brand: 'Ardisa',
        sizeScale: 'apparel',
        gender: 'Erkek',
        copy: { lead: 'Ütü gerektirmeyen dokusuyla her güne uygun bir gömlek.', care: apparelCare },
        models: [
          { name: 'Oxford Gömlek', type: 'shirt', price: 999, colors: ['beyaz', 'acikmavi', 'pembe'], material: '%100 Pamuk Oxford' },
          { name: 'Keten Gömlek', type: 'shirt', price: 1199, colors: ['bej', 'beyaz', 'sage'], material: '%100 Keten' },
          { name: 'Ekose Oduncu Gömlek', type: 'shirt', price: 1099, colors: ['kirmizi', 'yesil'], material: '%100 Pamuk Flanel', pattern: 'check' },
          { name: 'Slim Fit Saten Gömlek', type: 'shirt', price: 1149, colors: ['siyah', 'lacivert'], material: '%97 Pamuk %3 Elastan' },
        ],
      },
      {
        slug: 'erkek-sweatshirt',
        name: 'Sweatshirt & Kazak',
        brand: 'Ardisa',
        sizeScale: 'apparel',
        gender: 'Erkek',
        copy: { lead: 'İçi şardonlu, rahat kalıplı bir üst giyim parçası.', care: apparelCare },
        models: [
          { name: 'Kapüşonlu Sweatshirt', type: 'hoodie', price: 1199, colors: ['gri', 'siyah', 'lacivert', 'zeytin'], material: '%80 Pamuk %20 Polyester' },
          { name: 'Bisiklet Yaka Sweatshirt', type: 'knit', price: 999, colors: ['krem', 'antrasit'], material: '%100 Pamuk' },
          { name: 'Yün Triko Kazak', type: 'knit', price: 1699, colors: ['lacivert', 'camel', 'bordo'], material: '%50 Yün %50 Akrilik' },
        ],
      },
      {
        slug: 'erkek-pantolon-jean',
        name: 'Pantolon & Jean',
        brand: 'Ardisa',
        sizeScale: 'denim',
        gender: 'Erkek',
        copy: { lead: 'Gün boyu formunu koruyan, rahat kalıplı bir alt giyim.', care: apparelCare },
        models: [
          { name: 'Slim Fit Jean', type: 'jeans', price: 1399, colors: ['denim', 'siyah', 'antrasit'], material: '%98 Pamuk %2 Elastan' },
          { name: 'Straight Fit Jean', type: 'jeans', price: 1349, colors: ['denim', 'acikmavi'], material: '%100 Pamuk' },
          { name: 'Chino Pantolon', type: 'pants', price: 1199, colors: ['bej', 'lacivert', 'haki'], material: '%98 Pamuk %2 Elastan' },
          { name: 'Jogger Eşofman Altı', type: 'pants', price: 899, colors: ['siyah', 'gri'], material: '%80 Pamuk %20 Polyester' },
        ],
      },
      {
        slug: 'erkek-sort',
        name: 'Şort',
        brand: 'Ardisa',
        sizeScale: 'apparel',
        gender: 'Erkek',
        copy: { lead: 'Sıcak günler için hafif ve rahat bir şort.', care: apparelCare },
        models: [
          { name: 'Keten Şort', type: 'shorts', price: 699, colors: ['bej', 'lacivert'], material: '%55 Keten %45 Pamuk' },
          { name: 'Denim Şort', type: 'shorts', price: 749, colors: ['denim', 'acikmavi'], material: '%100 Pamuk' },
          { name: 'Deniz Şortu', type: 'shorts', price: 599, colors: ['turuncu', 'mavi', 'yesil'], material: '%100 Polyester' },
        ],
      },
      {
        slug: 'erkek-dis-giyim',
        name: 'Ceket & Mont',
        brand: 'Ardisa',
        sizeScale: 'apparel',
        gender: 'Erkek',
        copy: { lead: 'Rüzgara karşı korumalı, şehir hayatına uygun bir dış giyim.', care: 'Kuru temizleme önerilir.' },
        models: [
          { name: 'Yün Kaban', type: 'coat', price: 5999, colors: ['lacivert', 'antrasit', 'camel'], material: '%60 Yün %40 Polyester' },
          { name: 'Bomber Ceket', type: 'jacket', price: 2499, colors: ['haki', 'siyah'], material: '%100 Polyamid' },
          { name: 'Şişme Mont', type: 'coat', price: 3799, colors: ['siyah', 'lacivert', 'zeytin'], material: '%100 Polyester' },
          { name: 'Keten Blazer', type: 'jacket', price: 2999, colors: ['bej', 'lacivert'], material: '%100 Keten' },
        ],
      },
    ],
  },
  {
    slug: 'ayakkabi',
    name: 'Ayakkabı',
    description: 'Sneaker, bot ve sandalet modelleri; her adımda konfor.',
    children: [
      {
        slug: 'sneaker',
        name: 'Sneaker',
        brand: 'Ardisa',
        sizeScale: 'shoeM',
        gender: 'Unisex',
        copy: { lead: 'Hafif tabanı ve destekleyici iç tabanıyla gün boyu konfor.', care: 'Nemli bezle silin, makinede yıkamayın.' },
        models: [
          { name: 'Deri Sneaker', type: 'sneaker', price: 2499, colors: ['beyaz', 'siyah'], material: 'Hakiki Deri', attrs: { taban: 'Kauçuk' } },
          { name: 'Retro Koşu Ayakkabısı', type: 'sneaker', price: 2799, colors: ['gri', 'lacivert', 'krem'], material: 'Süet ve File', attrs: { taban: 'EVA' } },
          { name: 'Kanvas Sneaker', type: 'sneaker', price: 1299, colors: ['ekru', 'siyah', 'kirmizi'], material: '%100 Pamuk Kanvas', attrs: { taban: 'Kauçuk' } },
          { name: 'Platform Sneaker', type: 'sneaker', price: 2299, colors: ['beyaz', 'pudra'], material: 'Suni Deri', attrs: { taban: 'Kauçuk 4 cm' } },
        ],
      },
      {
        slug: 'bot',
        name: 'Bot & Çizme',
        brand: 'Ardisa',
        sizeScale: 'shoeW',
        gender: 'Kadın',
        copy: { lead: 'Soğuk ve yağışlı günler için sağlam yapılı bir bot.', care: 'Deri bakım kremiyle koruyun.' },
        models: [
          { name: 'Chelsea Bot', type: 'boot', price: 3299, colors: ['siyah', 'kahve'], material: 'Hakiki Deri', attrs: { topuk: '3 cm' } },
          { name: 'Bağcıklı Postal', type: 'boot', price: 3499, colors: ['siyah', 'camel'], material: 'Hakiki Deri', attrs: { topuk: '4 cm' } },
          { name: 'Süet Topuklu Bot', type: 'boot', price: 2999, colors: ['bej', 'bordo'], material: 'Süet', attrs: { topuk: '7 cm' } },
        ],
      },
      {
        slug: 'sandalet',
        name: 'Sandalet & Terlik',
        brand: 'Ardisa',
        sizeScale: 'shoeW',
        gender: 'Kadın',
        copy: { lead: 'Yaz günleri için hafif ve şık bir sandalet.', care: 'Nemli bezle silin.' },
        models: [
          { name: 'Deri Bantlı Sandalet', type: 'sandal', price: 1499, colors: ['camel', 'siyah', 'beyaz'], material: 'Hakiki Deri' },
          { name: 'Hasır Tabanlı Terlik', type: 'sandal', price: 999, colors: ['ekru', 'kiremit'], material: 'Jüt ve Deri' },
        ],
      },
      {
        slug: 'klasik-ayakkabi',
        name: 'Klasik & Loafer',
        brand: 'Ardisa',
        sizeScale: 'shoeM',
        gender: 'Erkek',
        copy: { lead: 'Ofis ve özel günlerde kombininizi tamamlayan zarif bir model.', care: 'Ayakkabı boyasıyla düzenli bakım yapın.' },
        models: [
          { name: 'Deri Loafer', type: 'loafer', price: 2799, colors: ['kahve', 'siyah', 'bordo'], material: 'Hakiki Deri' },
          { name: 'Süet Loafer', type: 'loafer', price: 2599, colors: ['camel', 'lacivert'], material: 'Süet' },
        ],
      },
    ],
  },
  {
    slug: 'canta-aksesuar',
    name: 'Çanta & Aksesuar',
    description: 'Kombininizi tamamlayan çanta, saat, gözlük ve aksesuarlar.',
    children: [
      {
        slug: 'canta',
        name: 'Çanta',
        brand: 'Ardisa',
        sizeScale: 'one',
        gender: 'Unisex',
        copy: { lead: 'Günlük ihtiyaçlarınıza yetecek genişlikte, sağlam dikişli bir çanta.', care: 'Nemli bezle silin.' },
        models: [
          { name: 'Kanvas Tote Çanta', type: 'tote', price: 599, colors: ['ekru', 'siyah', 'sage'], material: '%100 Pamuk Kanvas', attrs: { olcu: '38 x 42 cm' } },
          { name: 'Deri Omuz Çantası', type: 'handbag', price: 3299, colors: ['siyah', 'camel', 'bordo'], material: 'Hakiki Deri', attrs: { olcu: '28 x 20 cm' } },
          { name: 'Mini El Çantası', type: 'handbag', price: 1899, colors: ['pudra', 'krem', 'siyah'], material: 'Suni Deri', attrs: { olcu: '20 x 14 cm' } },
          { name: 'Laptop Sırt Çantası', type: 'backpack', price: 1799, colors: ['siyah', 'antrasit', 'haki'], material: 'Su İtici Polyester', attrs: { olcu: '30 x 44 cm', laptop: '15.6"' } },
        ],
      },
      {
        slug: 'cuzdan-kemer',
        name: 'Cüzdan & Kemer',
        brand: 'Ardisa',
        sizeScale: 'one',
        gender: 'Unisex',
        copy: { lead: 'Uzun ömürlü olsun diye özenle seçilmiş malzemelerle üretildi.', care: 'Deri bakım kremiyle koruyun.' },
        models: [
          { name: 'Deri Kartlık Cüzdan', type: 'wallet', price: 799, colors: ['siyah', 'kahve', 'lacivert'], material: 'Hakiki Deri' },
          { name: 'Fermuarlı Uzun Cüzdan', type: 'wallet', price: 1199, colors: ['camel', 'bordo'], material: 'Hakiki Deri' },
          { name: 'Klasik Deri Kemer', type: 'belt', price: 899, colors: ['siyah', 'kahve'], material: 'Hakiki Deri' },
        ],
      },
      {
        slug: 'saat-gozluk',
        name: 'Saat & Gözlük',
        brand: 'Ardisa',
        sizeScale: 'one',
        gender: 'Unisex',
        copy: { lead: 'Sade tasarımıyla her stile uyum sağlayan bir aksesuar.', care: 'Kutusunda saklayın.' },
        models: [
          { name: 'Minimal Kol Saati', type: 'watch', price: 3499, colors: ['siyah', 'kahve', 'lacivert'], material: 'Paslanmaz Çelik Kasa, Deri Kayış', attrs: { garanti: '2 yıl', su_gecirmezlik: '5 ATM' } },
          { name: 'Hasır Kayışlı Saat', type: 'watch', price: 2999, colors: ['gri', 'camel'], material: 'Paslanmaz Çelik', attrs: { garanti: '2 yıl', su_gecirmezlik: '3 ATM' } },
          { name: 'Retro Güneş Gözlüğü', type: 'sunglasses', price: 1499, colors: ['siyah', 'kahve', 'kiremit'], material: 'Asetat Çerçeve', attrs: { uv: 'UV400', garanti: '1 yıl' } },
          { name: 'Pilot Güneş Gözlüğü', type: 'sunglasses', price: 1699, colors: ['hardal', 'antrasit'], material: 'Metal Çerçeve', attrs: { uv: 'UV400', garanti: '1 yıl' } },
        ],
      },
      {
        slug: 'sapka-sal',
        name: 'Şapka, Bere & Şal',
        brand: 'Ardisa',
        sizeScale: 'one',
        gender: 'Unisex',
        copy: { lead: 'Her mevsime bir parça; dokusu ve rengiyle öne çıkan bir aksesuar.', care: 'Elde yıkayın.' },
        models: [
          { name: 'Pamuklu Beyzbol Şapkası', type: 'cap', price: 449, colors: ['lacivert', 'bej', 'siyah', 'yesil'], material: '%100 Pamuk' },
          { name: 'Ponponlu Örgü Bere', type: 'beanie', price: 399, colors: ['krem', 'bordo', 'gri'], material: '%100 Akrilik' },
          { name: 'Ekose Yün Atkı', type: 'scarf', price: 899, colors: ['camel', 'kirmizi', 'gri'], material: '%70 Yün %30 Polyester', pattern: 'check' },
        ],
      },
    ],
  },
  {
    slug: 'kozmetik',
    name: 'Kozmetik & Bakım',
    description: 'Makyaj, cilt bakımı ve parfümde Ardisa Beauty seçkisi.',
    children: [
      {
        slug: 'makyaj',
        name: 'Makyaj',
        brand: 'Ardisa Beauty',
        sizeScale: 'volume',
        gender: 'Kadın',
        copy: { lead: 'Yoğun pigmentli, gün boyu kalıcı formül.', care: 'Serin ve kuru yerde saklayın.' },
        models: [
          { name: 'Mat Ruj', type: 'lipstick', price: 449, colors: ['kirmizi', 'nude', 'gul', 'bordo', 'mercan'], material: 'Vegan Formül', spec: '3,5 g', attrs: { bitis: 'Mat', kalicilik: '12 saat' } },
          { name: 'Parlak Ruj', type: 'lipstick', price: 399, colors: ['pembe', 'mercan', 'nude'], material: 'Vegan Formül', spec: '3,5 g', attrs: { bitis: 'Parlak', kalicilik: '6 saat' } },
          { name: 'Hafif Fondöten', type: 'foundation', price: 649, colors: ['krem', 'bej', 'nude', 'camel'], material: 'Yağsız Formül', spec: '30 ml', attrs: { spf: 'SPF 15', kapaticilik: 'Orta' } },
          { name: 'Hacim Veren Maskara', type: 'mascara', price: 499, colors: ['siyah', 'kahve'], material: 'Suya Dayanıklı Formül', spec: '9 ml' },
          { name: 'Göz Farı Paleti', type: 'palette9', price: 899, colors: ['nude', 'gul', 'kahve'], material: '9 Renk', spec: '9 x 1,2 g' },
        ],
      },
      {
        slug: 'cilt-bakimi',
        name: 'Cilt Bakımı',
        brand: 'Ardisa Beauty',
        sizeScale: 'volume',
        gender: 'Unisex',
        copy: { lead: 'Cildi nemlendiren ve dengeleyen, sade içerikli bir bakım ürünü.', care: 'Açıldıktan sonra 12 ay içinde kullanın.' },
        models: [
          { name: 'Nemlendirici Yüz Kremi', type: 'creamJar', price: 549, colors: ['mint', 'pudra', 'krem'], material: 'Hyaluronik Asit', spec: '50 ml', attrs: { cilt_tipi: 'Tüm cilt tipleri' } },
          { name: 'C Vitamini Serum', type: 'serum', price: 749, colors: ['turuncu', 'hardal'], material: '%15 C Vitamini', spec: '30 ml', attrs: { cilt_tipi: 'Normal ve karma' } },
          { name: 'Niasinamid Serum', type: 'serum', price: 649, colors: ['acikmavi', 'mint'], material: '%10 Niasinamid', spec: '30 ml', attrs: { cilt_tipi: 'Yağlı ve karma' } },
          { name: 'Gece Bakım Kremi', type: 'creamJar', price: 699, colors: ['lila', 'lacivert'], material: 'Retinol', spec: '50 ml', attrs: { cilt_tipi: 'Normal ve kuru' } },
        ],
      },
      {
        slug: 'parfum',
        name: 'Parfüm',
        brand: 'Ardisa Beauty',
        sizeScale: 'volume',
        gender: 'Unisex',
        copy: { lead: 'Katmanlı notalarıyla tenle birlikte gelişen bir koku.', care: 'Doğrudan güneş ışığından koruyun.' },
        models: [
          { name: 'Ambre Noir Eau de Parfum', type: 'perfume', price: 1899, colors: ['kahve', 'siyah'], material: 'Amber, Vanilya, Sandal Ağacı', spec: '50 ml', attrs: { nota: 'Oryantal' } },
          { name: 'Fleur Blanche Eau de Parfum', type: 'perfume', price: 1799, colors: ['pudra', 'krem'], material: 'Yasemin, Beyaz Çiçekler, Misk', spec: '50 ml', attrs: { nota: 'Çiçeksi' } },
          { name: 'Citrus Bloom Eau de Toilette', type: 'perfume', price: 1299, colors: ['sari', 'mint'], material: 'Bergamot, Limon, Neroli', spec: '100 ml', attrs: { nota: 'Narenciye' } },
        ],
      },
      {
        slug: 'sac-bakimi',
        name: 'Saç & Vücut Bakımı',
        brand: 'Ardisa Beauty',
        sizeScale: 'volume',
        gender: 'Unisex',
        copy: { lead: 'Saçı ve cildi besleyen, sülfatsız bir bakım formülü.', care: 'Göz ile temasından kaçının.' },
        models: [
          { name: 'Onarıcı Şampuan', type: 'shampoo', price: 349, colors: ['kahve', 'mint', 'lila'], material: 'Argan Yağı', spec: '400 ml' },
          { name: 'Besleyici Saç Kremi', type: 'shampoo', price: 379, colors: ['krem', 'pudra'], material: 'Shea Yağı', spec: '400 ml' },
          { name: 'Vücut Losyonu', type: 'creamJar', price: 299, colors: ['sage', 'pembe'], material: 'Aloe Vera', spec: '250 ml' },
        ],
      },
    ],
  },
  {
    slug: 'ev-yasam',
    name: 'Ev & Yaşam',
    description: 'Evinize sıcaklık katan dekorasyon, tekstil ve mutfak ürünleri.',
    children: [
      {
        slug: 'ev-kokusu',
        name: 'Mum & Ev Kokusu',
        brand: 'Ardisa Home',
        sizeScale: 'one',
        copy: { lead: 'Soya mumundan elde dökülen, yumuşak kokulu bir ev mumu.', care: 'İlk yakışta yüzey tamamen eriyene kadar yakın.' },
        models: [
          { name: 'İncir Kokulu Mum', type: 'candle', price: 549, colors: ['sage', 'krem'], material: 'Soya Mumu', spec: '220 g · 45 saat', attrs: { yanma_suresi: '45 saat' } },
          { name: 'Lavanta Kokulu Mum', type: 'candle', price: 549, colors: ['lila', 'beyaz'], material: 'Soya Mumu', spec: '220 g · 45 saat', attrs: { yanma_suresi: '45 saat' } },
          { name: 'Odunsu Amber Mum', type: 'candle', price: 649, colors: ['kahve', 'kiremit'], material: 'Soya Mumu', spec: '300 g · 60 saat', attrs: { yanma_suresi: '60 saat' } },
        ],
      },
      {
        slug: 'mutfak',
        name: 'Mutfak & Sofra',
        brand: 'Ardisa Home',
        sizeScale: 'one',
        copy: { lead: 'Sofranıza el yapımı bir dokunuş katan seramik bir parça.', care: 'Bulaşık makinesinde yıkanabilir.' },
        models: [
          { name: 'El Yapımı Seramik Kupa', type: 'mug', price: 299, colors: ['krem', 'sage', 'kiremit', 'lacivert'], material: 'Seramik', spec: '350 ml' },
          { name: 'Stoneware Yemek Takımı', type: 'plates', price: 1899, colors: ['ekru', 'gri'], material: 'Stoneware', spec: '16 parça', attrs: { kisi: '4 kişilik' } },
          { name: 'Desenli Servis Tabağı', type: 'plates', price: 499, colors: ['mavi', 'yesil'], material: 'Porselen', spec: '32 cm' },
        ],
      },
      {
        slug: 'ev-tekstili',
        name: 'Ev Tekstili',
        brand: 'Ardisa Home',
        sizeScale: 'one',
        copy: { lead: 'Yumuşak dokusuyla evinize sıcaklık katan bir tekstil ürünü.', care: '30°C\'de yıkayın.' },
        models: [
          { name: 'Keten Kırlent Kılıfı', type: 'cushion', price: 349, colors: ['ekru', 'sage', 'kiremit', 'antrasit'], material: '%100 Keten', spec: '45 x 45 cm' },
          { name: 'Çizgili Kırlent', type: 'cushion', price: 399, colors: ['lacivert', 'hardal'], material: '%100 Pamuk', spec: '50 x 50 cm', pattern: 'stripe' },
          { name: 'Örgü Battaniye', type: 'blanket', price: 1299, colors: ['krem', 'gri', 'camel'], material: '%100 Pamuk', spec: '130 x 170 cm' },
          { name: 'Pamuklu Havlu Seti', type: 'towel', price: 799, colors: ['beyaz', 'sage', 'pudra'], material: '%100 Türk Pamuğu', spec: '3 parça' },
        ],
      },
      {
        slug: 'dekorasyon',
        name: 'Dekorasyon & Aydınlatma',
        brand: 'Ardisa Home',
        sizeScale: 'one',
        copy: { lead: 'Mekâna karakter katan, sade çizgili bir dekorasyon objesi.', care: 'Kuru bezle silin.' },
        models: [
          { name: 'Keten Abajurlu Masa Lambası', type: 'lamp', price: 1799, colors: ['ekru', 'sage'], material: 'Keten ve Pirinç', spec: '45 cm', attrs: { duy: 'E27' } },
          { name: 'Seramik Saksı', type: 'plant', price: 449, colors: ['kiremit', 'beyaz', 'antrasit'], material: 'Seramik', spec: 'Ø 18 cm' },
          { name: 'Cam Vazo', type: 'vase', price: 599, colors: ['acikmavi', 'sage', 'pudra'], material: 'El Üflemesi Cam', spec: '28 cm' },
        ],
      },
    ],
  },
  {
    slug: 'spor',
    name: 'Spor',
    description: 'Antrenman ve yoga için teknik giyim ve ekipman.',
    children: [
      {
        slug: 'spor-giyim',
        name: 'Spor Giyim',
        brand: 'Ardisa Active',
        sizeScale: 'apparel',
        gender: 'Kadın',
        copy: { lead: 'Teri hızla uzaklaştıran, esnek ve destekleyici bir teknik kumaş.', care: '30°C\'de yıkayın, yumuşatıcı kullanmayın.' },
        models: [
          { name: 'Yüksek Bel Tayt', type: 'leggings', price: 899, colors: ['siyah', 'lacivert', 'gul', 'zeytin'], material: '%75 Polyamid %25 Elastan' },
          { name: 'Destekli Spor Sütyeni', type: 'sportsBra', price: 649, colors: ['siyah', 'lila', 'mint'], material: '%80 Polyamid %20 Elastan' },
          { name: 'Hızlı Kuruyan Antrenman Tişörtü', type: 'tshirt', price: 549, colors: ['antrasit', 'mercan', 'beyaz'], material: '%100 Geri Dönüştürülmüş Polyester' },
        ],
      },
      {
        slug: 'spor-ekipman',
        name: 'Ekipman',
        brand: 'Ardisa Active',
        sizeScale: 'one',
        copy: { lead: 'Evde ya da stüdyoda antrenmanınıza eşlik eden dayanıklı bir ekipman.', care: 'Nemli bezle silin.' },
        models: [
          { name: 'Kaymaz Yoga Matı', type: 'yogaMat', price: 999, colors: ['sage', 'lila', 'antrasit'], material: 'Doğal Kauçuk', spec: '183 x 61 cm · 5 mm' },
          { name: 'Paslanmaz Çelik Matara', type: 'bottle', price: 449, colors: ['siyah', 'sage', 'mercan', 'beyaz'], material: 'Paslanmaz Çelik', spec: '750 ml', attrs: { yalitim: '24 saat soğuk' } },
          { name: 'Vinil Kaplı Dambıl Seti', type: 'dumbbell', price: 799, colors: ['lila', 'mint', 'siyah'], material: 'Döküm Demir', spec: '2 x 2 kg' },
        ],
      },
    ],
  },
];
