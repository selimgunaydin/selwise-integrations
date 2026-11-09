/**
 * Legal texts of the demo store. They read like a Turkish shop's, but every
 * one of them says what it is: Ardisa is fictional, nothing is sold, no
 * payment is taken. Do not reuse them for a real business.
 */
import type { LegalSlug } from '../legal';
import { COMPANY } from './contact';

export type LegalBlock = string | { list: string[] };

export interface LegalSection {
  heading: string;
  body: LegalBlock[];
}

export interface LegalDoc {
  title: string;
  updated: string;
  summary: string;
  sections: LegalSection[];
}

const DEMO_NOTE: LegalSection = {
  heading: 'Demo mağaza hakkında önemli not',
  body: [
    `Bu metin, Selwise kişiselleştirme platformunun tanıtımı için hazırlanmış Ardisa demo mağazasına aittir. Ardisa kurgusal bir markadır; ${COMPANY.legalName} gerçek bir şirket değildir. Sitede gerçek satış yapılmaz, ödeme alınmaz ve ürün gönderilmez.`,
    'Metin yalnızca bir e-ticaret sitesinin yasal sayfalarının nasıl göründüğünü göstermek amacıyla yazılmıştır ve hukuki tavsiye niteliği taşımaz.',
  ],
};

const SELLER: LegalBlock = {
  list: [
    `Unvan: ${COMPANY.legalName} (kurgusal)`,
    `Adres: ${COMPANY.address}`,
    `Telefon: ${COMPANY.phone}`,
    `E-posta: ${COMPANY.email}`,
    `MERSİS No: ${COMPANY.mersis}`,
  ],
};

export const LEGAL_DOCS: Record<LegalSlug, LegalDoc> = {
  'kvkk-aydinlatma-metni': {
    title: 'KVKK Aydınlatma Metni',
    updated: '2026-10-01',
    summary:
      '6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında, kişisel verilerinizin hangi amaçlarla işlendiğini ve haklarınızı açıklar.',
    sections: [
      {
        heading: '1. Veri sorumlusu',
        body: [
          `Kişisel verileriniz, veri sorumlusu sıfatıyla ${COMPANY.legalName} ("Ardisa") tarafından aşağıda açıklanan kapsamda işlenmektedir.`,
          SELLER,
        ],
      },
      {
        heading: '2. İşlenen kişisel veriler',
        body: [
          {
            list: [
              'Kimlik bilgileri: ad, soyad, doğum tarihi, cinsiyet',
              'İletişim bilgileri: e-posta adresi, telefon numarası, teslimat ve fatura adresleri',
              'Müşteri işlem bilgileri: sipariş, sepet, favori, iade ve talep kayıtları',
              'Pazarlama bilgileri: ilgi duyduğunuz ürün ve kategoriler, kampanya etkileşimleri, iletişim izinleri',
              'İşlem güvenliği bilgileri: IP adresi, tarayıcı ve cihaz bilgileri, oturum kayıtları',
            ],
          },
        ],
      },
      {
        heading: '3. İşleme amaçları',
        body: [
          {
            list: [
              'Üyelik ve siparişlerinizin kurulması, ifası ve teslimatı',
              'İade, iptal ve müşteri hizmetleri taleplerinizin yönetilmesi',
              'Site içi öneriler, arama sonuçları ve kampanyaların size göre kişiselleştirilmesi',
              'İzniniz olması halinde e-posta, SMS ve tarayıcı bildirimiyle kampanya iletişimi',
              'Yasal yükümlülüklerin yerine getirilmesi ve bilgi güvenliğinin sağlanması',
            ],
          },
        ],
      },
      {
        heading: '4. Aktarım',
        body: [
          'Kişisel verileriniz; kargo ve lojistik firmalarına, ödeme kuruluşlarına, bilgi teknolojileri hizmet sağlayıcılarına ve yetkili kamu kurumlarına, yalnızca yukarıdaki amaçlarla sınırlı olarak aktarılabilir.',
          'Site içi kişiselleştirme, öneri ve kampanya altyapısı Selwise tarafından sağlanmaktadır. Gezinme ve alışveriş davranışınıza ilişkin veriler bu hizmetin sunulması amacıyla Selwise ile paylaşılır.',
        ],
      },
      {
        heading: '5. Toplama yöntemi ve hukuki sebep',
        body: [
          'Verileriniz; internet sitesi, mobil uygulama, mağazalarımız ve çağrı merkezi aracılığıyla, elektronik ortamda veya sözlü olarak toplanır. İşleme faaliyetleri KVKK m.5/2 kapsamında sözleşmenin ifası, hukuki yükümlülük ve meşru menfaat sebeplerine; pazarlama iletişimi ise açık rızanıza dayanır.',
        ],
      },
      {
        heading: '6. Haklarınız',
        body: [
          'KVKK’nın 11. maddesi uyarınca; verilerinizin işlenip işlenmediğini öğrenme, bilgi talep etme, düzeltilmesini veya silinmesini isteme, işlemeye itiraz etme ve zararın giderilmesini talep etme haklarına sahipsiniz.',
          `Taleplerinizi ${COMPANY.email} adresine veya ${COMPANY.address} adresine yazılı olarak iletebilirsiniz.`,
        ],
      },
      DEMO_NOTE,
    ],
  },

  'gizlilik-politikasi': {
    title: 'Gizlilik Politikası',
    updated: '2026-10-01',
    summary: 'Sitemizi kullanırken bilgilerinizi nasıl topladığımızı, kullandığımızı ve koruduğumuzu açıklar.',
    sections: [
      {
        heading: '1. Kapsam',
        body: ['Bu politika, Ardisa internet sitesi ve mağazalarımız üzerinden sunulan tüm hizmetler için geçerlidir.'],
      },
      {
        heading: '2. Hangi bilgileri topluyoruz?',
        body: [
          'Üyelik ve sipariş sırasında verdiğiniz bilgiler ile siteyi kullanırken oluşan teknik bilgileri (ziyaret edilen sayfalar, görüntülenen ürünler, sepet hareketleri, cihaz ve tarayıcı bilgisi) topluyoruz.',
        ],
      },
      {
        heading: '3. Bilgileri nasıl kullanıyoruz?',
        body: [
          {
            list: [
              'Siparişlerinizi almak, hazırlamak ve teslim etmek',
              'Size uygun ürün önerileri, arama sonuçları ve kampanyalar göstermek',
              'Hizmet kalitemizi ölçmek ve sitemizi geliştirmek',
              'İzin verdiğiniz kanallardan sizinle iletişim kurmak',
            ],
          },
        ],
      },
      {
        heading: '4. Kişiselleştirme',
        body: [
          'Ana sayfa, ürün ve sepet sayfalarındaki öneri alanları, açılır pencereler ve kampanya mesajları Selwise altyapısıyla, gezinme geçmişiniz ve alışveriş davranışınız dikkate alınarak gösterilir. Çerez tercihlerinizden kişiselleştirmeyi dilediğiniz zaman kapatabilirsiniz.',
        ],
      },
      {
        heading: '5. Güvenlik',
        body: [
          'Bilgileriniz şifreli bağlantı (TLS) üzerinden iletilir. Kart bilgileriniz Ardisa sunucularında saklanmaz; ödeme işlemleri lisanslı ödeme kuruluşları aracılığıyla yürütülür.',
        ],
      },
      {
        heading: '6. Saklama süresi',
        body: [
          'Bilgilerinizi, ilgili mevzuatta öngörülen süreler boyunca veya işleme amacının gerektirdiği süre kadar saklar, sürenin sonunda siler, yok eder ya da anonim hale getiririz.',
        ],
      },
      DEMO_NOTE,
    ],
  },

  'cerez-politikasi': {
    title: 'Çerez Politikası',
    updated: '2026-10-01',
    summary: 'Sitemizde kullanılan çerezleri, amaçlarını ve tercihlerinizi nasıl yönetebileceğinizi açıklar.',
    sections: [
      {
        heading: '1. Çerez nedir?',
        body: [
          'Çerezler, ziyaret ettiğiniz siteler tarafından tarayıcınıza kaydedilen küçük metin dosyalarıdır. Sitenin çalışmasını, tercihlerinizin hatırlanmasını ve deneyiminizin kişiselleştirilmesini sağlar.',
        ],
      },
      {
        heading: '2. Kullandığımız çerez türleri',
        body: [
          {
            list: [
              'Zorunlu çerezler: oturum, sepet ve güvenlik için gereklidir; kapatılamaz.',
              'Analitik çerezler: sitenin nasıl kullanıldığını anlamamıza yardımcı olur.',
              'Kişiselleştirme çerezleri: size uygun ürün önerileri ve içerikler göstermemizi sağlar (Selwise).',
              'Pazarlama çerezleri: kampanya iletişimimizin etkinliğini ölçmemizi sağlar.',
            ],
          },
        ],
      },
      {
        heading: '3. Tercihlerinizi yönetme',
        body: [
          'Sayfanın alt kısmındaki "Çerez Tercihleri" bağlantısından zorunlu olmayan çerezlere verdiğiniz izni dilediğiniz zaman değiştirebilirsiniz. Tarayıcı ayarlarınızdan da çerezleri silebilir veya engelleyebilirsiniz; bu durumda sitenin bazı bölümleri beklendiği gibi çalışmayabilir.',
        ],
      },
      {
        heading: '4. Saklama süreleri',
        body: [
          'Oturum çerezleri tarayıcınızı kapattığınızda silinir. Sepet çerezi 60 gün, oturum açma çerezi 30 gün saklanır. Diğer çerezlerin süreleri tercih panelinde ayrıca belirtilir.',
        ],
      },
      DEMO_NOTE,
    ],
  },

  'mesafeli-satis-sozlesmesi': {
    title: 'Mesafeli Satış Sözleşmesi',
    updated: '2026-09-15',
    summary: '6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli Sözleşmeler Yönetmeliği uyarınca düzenlenmiştir.',
    sections: [
      { heading: '1. Taraflar', body: ['SATICI', SELLER, 'ALICI: Sipariş sırasında bilgileri alınan üye veya misafir kullanıcı.'] },
      {
        heading: '2. Konu',
        body: [
          'İşbu sözleşmenin konusu, ALICI’nın SATICI’ya ait internet sitesi üzerinden elektronik ortamda siparişini verdiği ürünlerin satışı ve teslimine ilişkin tarafların hak ve yükümlülüklerinin belirlenmesidir.',
        ],
      },
      {
        heading: '3. Ürün, fiyat ve ödeme',
        body: [
          'Ürünlerin türü, miktarı, rengi, bedeni ve vergiler dahil satış fiyatı sipariş özetinde ve sipariş onay e-postasında yer alır. Kargo ücreti, kapıda ödeme bedeli ve varsa taksit farkı ödeme adımında ayrıca gösterilir.',
        ],
      },
      {
        heading: '4. Teslimat',
        body: [
          'Ürünler, ALICI’nın belirttiği teslimat adresine veya seçtiği mağazaya, yasal 30 günlük süreyi aşmamak kaydıyla teslim edilir. Teslimat koşulları ayrıca Teslimat Koşulları sayfasında açıklanmıştır.',
        ],
      },
      {
        heading: '5. Cayma hakkı',
        body: [
          'ALICI, ürünü teslim aldığı tarihten itibaren 14 gün içinde herhangi bir gerekçe göstermeksizin cayma hakkını kullanabilir. Ardisa bu süreyi ALICI lehine 30 gün olarak uygular.',
          'Cayma bildirimi, Hesabım > Siparişlerim sayfasındaki iade talebi aracılığıyla veya müşteri hizmetlerine yazılı olarak yapılabilir.',
        ],
      },
      {
        heading: '6. Cayma hakkının istisnaları',
        body: [
          {
            list: [
              'Ambalajı açılmış kozmetik ve kişisel bakım ürünleri',
              'ALICI’nın istekleri doğrultusunda kişiselleştirilmiş ürünler',
              'Tesliminden sonra ambalaj, bant veya mühür gibi koruyucu unsurları açılmış, iadesi sağlık ve hijyen açısından uygun olmayan ürünler',
            ],
          },
        ],
      },
      {
        heading: '7. Uyuşmazlıkların çözümü',
        body: [
          'İşbu sözleşmeden doğan uyuşmazlıklarda, Ticaret Bakanlığınca ilan edilen parasal sınırlar dahilinde ALICI’nın yerleşim yerindeki Tüketici Hakem Heyetleri ile Tüketici Mahkemeleri yetkilidir.',
        ],
      },
      DEMO_NOTE,
    ],
  },

  'on-bilgilendirme-formu': {
    title: 'Ön Bilgilendirme Formu',
    updated: '2026-09-15',
    summary: 'Siparişinizi onaylamadan önce satıcı, ürün ve haklarınız hakkında bilmeniz gerekenleri özetler.',
    sections: [
      { heading: '1. Satıcı bilgileri', body: [SELLER] },
      {
        heading: '2. Ürünün temel nitelikleri ve fiyatı',
        body: [
          'Siparişinizdeki ürünlerin temel nitelikleri, adetleri ve vergiler dahil toplam fiyatı ödeme adımındaki sipariş özetinde yer alır. Kampanya ve kupon indirimleri toplam tutara yansıtılarak gösterilir.',
        ],
      },
      {
        heading: '3. Ödeme ve teslimat',
        body: [
          'Kredi kartı, banka kartı, havale/EFT veya kapıda ödeme yöntemlerinden birini seçebilirsiniz. Havale/EFT ile verilen siparişler ödeme hesabımıza ulaştıktan sonra hazırlanır.',
          'Teslimat ücreti ve tahmini teslimat süresi seçtiğiniz teslimat yöntemine göre ödeme adımında gösterilir.',
        ],
      },
      {
        heading: '4. Cayma hakkı',
        body: [
          'Ürünü teslim aldığınız tarihten itibaren 30 gün içinde cayma hakkınızı kullanabilirsiniz. Cayma hakkının kullanılmasından itibaren 14 gün içinde ödediğiniz tutar, ödeme yönteminize iade edilir.',
        ],
      },
      {
        heading: '5. Şikâyet ve itiraz',
        body: [
          `Şikâyetlerinizi ${COMPANY.phone} numaralı çağrı merkezimize veya ${COMPANY.email} adresine iletebilirsiniz.`,
        ],
      },
      DEMO_NOTE,
    ],
  },

  'uyelik-sozlesmesi': {
    title: 'Üyelik Sözleşmesi',
    updated: '2026-08-20',
    summary: 'Ardisa üyeliğinin kurulmasına, kullanımına ve sona ermesine ilişkin koşulları düzenler.',
    sections: [
      {
        heading: '1. Taraflar ve konu',
        body: [
          `İşbu sözleşme, ${COMPANY.legalName} ile siteye üye olan kullanıcı ("Üye") arasında, üyelik hizmetlerinden yararlanma koşullarını belirlemek amacıyla kurulmuştur.`,
        ],
      },
      {
        heading: '2. Üyelik',
        body: [
          'Üyelik, kayıt formunun eksiksiz doldurulması ve sözleşmenin onaylanmasıyla başlar. Üye, verdiği bilgilerin doğru ve güncel olduğunu kabul eder. Üyelik kişiseldir ve devredilemez.',
        ],
      },
      {
        heading: '3. Üyenin yükümlülükleri',
        body: [
          {
            list: [
              'Hesap şifresini gizli tutmak ve üçüncü kişilerle paylaşmamak',
              'Siteyi hukuka ve genel ahlaka uygun şekilde kullanmak',
              'Ürün değerlendirmelerinde gerçeğe aykırı, hakaret içeren veya reklam niteliğinde içerik paylaşmamak',
            ],
          },
        ],
      },
      {
        heading: '4. Ardisa Puan',
        body: [
          'Üyeler her 10 TL’lik alışverişte 1 Ardisa Puan kazanır. Puanlar 500 puanda Gümüş, 1.500 puanda Altın seviyeye geçişi sağlar. İptal veya iade edilen siparişlerden kazanılan puanlar hesaptan düşülür. Puanlar nakde çevrilemez.',
        ],
      },
      {
        heading: '5. Sözleşmenin sona ermesi',
        body: [
          'Üye, dilediği zaman müşteri hizmetlerine başvurarak üyeliğini sonlandırabilir. Ardisa, sözleşmeye aykırı kullanım halinde üyeliği askıya alma veya sonlandırma hakkını saklı tutar.',
        ],
      },
      DEMO_NOTE,
    ],
  },

  'iade-kosullari': {
    title: 'İade ve Değişim Koşulları',
    updated: '2026-09-01',
    summary: '30 gün içinde ücretsiz iade: online siparişlerinizi kargoyla veya mağazalarımızdan iade edebilirsiniz.',
    sections: [
      {
        heading: '1. İade süresi',
        body: ['Ürünlerinizi teslim aldığınız tarihten itibaren 30 gün içinde ücretsiz iade edebilirsiniz.'],
      },
      {
        heading: '2. İade koşulları',
        body: [
          {
            list: [
              'Ürün kullanılmamış, yıkanmamış ve hasar görmemiş olmalıdır.',
              'Ürün etiketleri sökülmemiş ve orijinal ambalajı korunmuş olmalıdır.',
              'Ambalajı açılmış kozmetik, parfüm ve kişisel bakım ürünleri hijyen nedeniyle iade alınamaz.',
              'İç giyim, mayo ve küpe gibi ürünlerde hijyen bandı açılmamış olmalıdır.',
            ],
          },
        ],
      },
      {
        heading: '3. Kargo ile iade',
        body: [
          'Hesabım > Siparişlerim sayfasında ilgili siparişi açıp "İade Talebi Oluştur" düğmesine tıklayın. İade etmek istediğiniz ürünleri ve iade nedeninizi seçin. Talebiniz onaylandığında anlaşmalı kargo firmasıyla ücretsiz gönderim yapabilirsiniz.',
        ],
      },
      {
        heading: '4. Mağazadan iade ve değişim',
        body: [
          'Online siparişlerinizi, sipariş numaranız veya faturanızla tüm Ardisa mağazalarından iade edebilir ya da stok durumuna göre beden ve renk değişimi yapabilirsiniz.',
        ],
      },
      {
        heading: '5. Ücret iadesi',
        body: [
          'İade edilen ürünler depomuza ulaştıktan sonra en geç 3 iş günü içinde kontrol edilir. Onaylanan iadelerde ödeme, kullandığınız yönteme iade edilir; kartınıza yansıma süresi bankanıza bağlı olarak 3-10 iş günüdür. Kapıda ödeme siparişlerinde iade, bildireceğiniz IBAN’a yapılır.',
        ],
      },
      DEMO_NOTE,
    ],
  },

  'teslimat-kosullari': {
    title: 'Teslimat Koşulları',
    updated: '2026-09-01',
    summary: 'Teslimat seçenekleri, ücretleri ve süreleri hakkında bilgiler.',
    sections: [
      {
        heading: '1. Teslimat seçenekleri',
        body: [
          {
            list: [
              'Standart Teslimat: 2-4 iş günü. 750 TL ve üzeri siparişlerde ücretsiz, altında 59,90 TL.',
              'Hızlı Teslimat: ertesi iş günü, 89,90 TL (saat 14:00’e kadar verilen siparişlerde).',
              'Mağazadan Teslim Al: ücretsiz; siparişiniz hazır olduğunda SMS ile bilgilendirilirsiniz.',
            ],
          },
        ],
      },
      {
        heading: '2. Teslimat bölgesi',
        body: ['Türkiye’nin 81 iline teslimat yapılmaktadır. Yurt dışına gönderim bulunmamaktadır.'],
      },
      {
        heading: '3. Teslim alma',
        body: [
          'Teslimat sırasında paketin hasarlı olduğunu fark ederseniz, kargo görevlisine tutanak tutturarak paketi teslim almayınız. Adreste bulunamamanız halinde kargo firması sizinle iletişime geçer; teslim alınmayan paketler 3 iş günü sonra Ardisa’ya iade edilir.',
        ],
      },
      {
        heading: '4. Gecikmeler',
        body: [
          'Kampanya dönemleri, resmi tatiller ve olağanüstü hava koşullarında teslimat süreleri uzayabilir. Bu durumda size e-posta veya SMS ile bilgi verilir.',
        ],
      },
      DEMO_NOTE,
    ],
  },
};
