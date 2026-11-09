/** The help centre's questions. Plain strings so the client can search them. */
export interface FaqItem {
  q: string;
  a: string;
}

export interface FaqCategory {
  slug: string;
  title: string;
  items: FaqItem[];
}

export const FAQ: FaqCategory[] = [
  {
    slug: 'siparis',
    title: 'Sipariş',
    items: [
      {
        q: 'Siparişimi nasıl verebilirim?',
        a: 'Beğendiğiniz ürünün beden ve rengini seçip sepete ekleyin, ardından sepetinizden ödeme adımına geçin. Üye olmadan da misafir olarak sipariş verebilirsiniz.',
      },
      {
        q: 'Siparişimi nasıl takip ederim?',
        a: 'Üyeyseniz Hesabım > Siparişlerim sayfasından tüm siparişlerinizin durumunu görebilirsiniz. Misafir siparişlerinizi Sipariş Takibi sayfasında sipariş numaranız ve e-posta adresinizle sorgulayabilirsiniz.',
      },
      {
        q: 'Siparişimi iptal edebilir miyim?',
        a: 'Siparişiniz kargoya verilmeden önce Siparişlerim sayfasındaki "İptal Et" düğmesiyle iptal edebilirsiniz. Kargoya verilmiş siparişler için teslimattan sonra iade talebi oluşturabilirsiniz.',
      },
      {
        q: 'Siparişime ürün ekleyebilir veya adresimi değiştirebilir miyim?',
        a: 'Onaylanan siparişlerde değişiklik yapılamaz. Siparişiniz henüz hazırlanmadıysa iptal edip yeniden verebilir ya da müşteri hizmetlerimize ulaşabilirsiniz.',
      },
    ],
  },
  {
    slug: 'kargo',
    title: 'Kargo & Teslimat',
    items: [
      {
        q: 'Kargo ücreti ne kadar?',
        a: '750 TL ve üzeri siparişlerde standart kargo ücretsizdir. Bu tutarın altındaki siparişlerde kargo ücreti 59,90 TL’dir. Hızlı teslimat seçeneği 89,90 TL’dir.',
      },
      {
        q: 'Siparişim ne zaman elime ulaşır?',
        a: 'Standart teslimatta siparişiniz 2-4 iş günü, hızlı teslimatta ertesi iş günü içinde teslim edilir. Kampanya dönemlerinde süreler uzayabilir.',
      },
      {
        q: 'Mağazadan teslim alabilir miyim?',
        a: 'Evet. Ödeme adımında "Mağazadan Teslim Al" seçeneğini işaretleyip size en yakın mağazamızı seçebilirsiniz. Siparişiniz hazır olduğunda SMS ile bilgilendirilirsiniz.',
      },
      {
        q: 'Kargo takip numaramı nereden bulabilirim?',
        a: 'Siparişiniz kargoya verildiğinde takip numarası sipariş detay sayfanızda görünür ve e-posta ile de gönderilir.',
      },
    ],
  },
  {
    slug: 'iade',
    title: 'İade & Değişim',
    items: [
      {
        q: 'İade süresi kaç gün?',
        a: 'Ürünü teslim aldığınız tarihten itibaren 30 gün içinde ücretsiz iade edebilirsiniz. Ürünün kullanılmamış, etiketli ve orijinal ambalajında olması gerekir.',
      },
      {
        q: 'İade talebini nasıl oluştururum?',
        a: 'Hesabım > Siparişlerim sayfasında ilgili siparişi açın ve "İade Talebi Oluştur" düğmesine tıklayın. İade etmek istediğiniz ürünleri ve nedenini seçmeniz yeterli.',
      },
      {
        q: 'Mağazadan iade veya değişim yapabilir miyim?',
        a: 'Online siparişlerinizi faturanızla birlikte tüm Ardisa mağazalarından iade edebilir ya da beden değişimi yapabilirsiniz. Kozmetik ürünlerde hijyen nedeniyle açılmış ürünler iade alınamaz.',
      },
      {
        q: 'Param ne zaman iade edilir?',
        a: 'İade ettiğiniz ürünler depomuza ulaştıktan sonra 3 iş günü içinde kontrol edilir. Onaylanan iadeler kartınıza bankanıza bağlı olarak 3-10 iş günü içinde yansır.',
      },
    ],
  },
  {
    slug: 'odeme',
    title: 'Ödeme',
    items: [
      {
        q: 'Hangi ödeme yöntemlerini kullanabilirim?',
        a: 'Kredi kartı, banka kartı, havale/EFT ve kapıda ödeme seçeneklerini kullanabilirsiniz. Kapıda ödeme için 29,90 TL hizmet bedeli uygulanır.',
      },
      {
        q: 'Taksit seçenekleri nelerdir?',
        a: 'Anlaşmalı banka kartlarına peşin fiyatına 3 taksit, vade farkıyla 6, 9 ve 12 taksit seçenekleri sunulur. Taksit seçenekleri ödeme adımında kartınıza göre listelenir.',
      },
      {
        q: 'Kart bilgilerim güvende mi?',
        a: 'Ödemeleriniz 3D Secure ile korunur ve kart bilgileriniz Ardisa tarafından saklanmaz. Bu demo mağazada gerçek ödeme alınmaz.',
      },
      {
        q: 'İndirim kuponumu nasıl kullanırım?',
        a: 'Sepet sayfasındaki "Kupon kodu" alanına kodunuzu yazıp uygulayın. Kuponlarınızı Hesabım > Kuponlarım sayfasında görebilirsiniz. Her siparişte tek kupon kullanılabilir.',
      },
    ],
  },
  {
    slug: 'uyelik',
    title: 'Üyelik',
    items: [
      {
        q: 'Üye olmanın avantajları nelerdir?',
        a: 'Üyelerimiz ilk siparişlerinde HOSGELDIN10 koduyla %10 indirim kazanır, her alışverişte Ardisa Puan toplar, favori listesi ve stok alarmı oluşturabilir.',
      },
      {
        q: 'Ardisa Puan nasıl çalışır?',
        a: 'Her 10 TL’lik alışverişiniz için 1 Ardisa Puan kazanırsınız. 500 puanda Gümüş, 1.500 puanda Altın seviyeye geçer, size özel kampanyalardan yararlanırsınız.',
      },
      {
        q: 'Şifremi unuttum, ne yapmalıyım?',
        a: 'Giriş sayfasındaki "Şifremi unuttum" bağlantısına tıklayın ve e-posta adresinizi girin. Şifre sıfırlama bağlantısı e-posta adresinize gönderilir.',
      },
      {
        q: 'E-posta ve SMS bildirimlerini nasıl kapatırım?',
        a: 'Hesabım > İletişim Tercihleri sayfasından e-posta ve SMS izinlerinizi dilediğiniz zaman açıp kapatabilirsiniz.',
      },
    ],
  },
];
