import type { Metadata } from 'next';
import Link from 'next/link';
import { Building2, Clock, Mail, MapPin, Phone } from 'lucide-react';
import { COMPANY } from '@/lib/content/contact';
import { ContactForm } from '@/components/content/ContactForm';

export const metadata: Metadata = {
  title: 'İletişim',
  description: 'Ardisa müşteri hizmetlerine ulaşın: sipariş, kargo, iade ve ürünlerle ilgili sorularınız için.',
};

export default function ContactPage() {
  const items = [
    { icon: Building2, label: 'Şirket', value: COMPANY.legalName },
    { icon: MapPin, label: 'Adres', value: COMPANY.address },
    { icon: Phone, label: 'Müşteri hizmetleri', value: COMPANY.phone },
    { icon: Mail, label: 'E-posta', value: COMPANY.email },
    { icon: Clock, label: 'Çalışma saatleri', value: COMPANY.hours },
  ];
  return (
    <div className="container py-10 md:py-16" id="contact">
      <div className="max-w-2xl">
        <p className="eyebrow">İletişim</p>
        <h1 className="mt-2 font-display text-4xl md:text-5xl">Size nasıl yardımcı olabiliriz?</h1>
        <p className="mt-4 text-sm leading-relaxed text-ink-soft">
          Sorularınızın çoğunun cevabı <Link href="/yardim" className="link">Yardım</Link> sayfamızda. Siparişinizin durumunu{' '}
          <Link href="/siparis-takip" className="link">Sipariş Takibi</Link> sayfasından anında öğrenebilirsiniz. Bulamadığınız her şey için bize
          yazın; iş günlerinde 24 saat içinde dönüyoruz.
        </p>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:gap-12">
        <aside className="space-y-4">
          <div className="card divide-y divide-line">
            {items.map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-start gap-4 p-5">
                <Icon size={18} strokeWidth={1.6} className="mt-0.5 shrink-0 text-accent" />
                <div>
                  <p className="text-2xs uppercase tracking-label text-ink-muted">{label}</p>
                  <p className="mt-1 text-sm text-ink">{value}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="rounded-xl bg-sand p-4 text-xs leading-relaxed text-ink-soft">
            Bu bilgiler kurgusaldır: Ardisa, Selwise’ın demo mağazasıdır. Telefon numarası ve adresler gerçek değildir; formdan gönderdiğiniz
            mesajlar yalnızca bu demo mağazanın veritabanına kaydedilir.
          </p>
          <div className="card p-5">
            <p className="text-sm font-medium">Mağazalarımız</p>
            <p className="mt-1 text-xs text-ink-soft">İade, değişim ve mağazadan teslim için size en yakın Ardisa mağazasını bulun.</p>
            <Link href="/magazalar" className="btn-outline btn-sm mt-4">
              Mağaza Bul
            </Link>
          </div>
        </aside>

        <section className="card p-6 md:p-8" aria-labelledby="contact-form-title">
          <h2 id="contact-form-title" className="font-display text-2xl">Bize yazın</h2>
          <p className="mt-1 text-sm text-ink-soft">Sipariş numarası dışındaki tüm alanlar zorunludur. Siparişle ilgili bir konuysa numarayı eklemeniz yanıtı hızlandırır.</p>
          <div className="mt-6">
            <ContactForm />
          </div>
        </section>
      </div>
    </div>
  );
}
