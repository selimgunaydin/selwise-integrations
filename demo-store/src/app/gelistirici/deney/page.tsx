import { Code, DocLink, Panel, SourceLink } from '@/components/developer/DevBits';
import { ExperimentLab } from '@/components/selwise/ExperimentLab';

export const metadata = { title: 'Kodla A/B' };

const SNIPPET = `withSelwise(function (selwise) {
  // Bu sayfada girilmiş A/B testleri
  var active = selwise.getActiveExperiments();

  // Tek bir deneyin kolu (deney kimliği sonuç sayfasının adresinde)
  var variant = selwise.getExperimentVariant('EXPERIMENT_ID');
  if (variant === 'VARIANT_ID') {
    // B kolunun arayüzünü göster
  }
});`;

export default function ExperimentPage() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title="Bu ziyaretçinin kolları" aside={<SourceLink path="src/components/selwise/ExperimentLab.tsx" />}>
        <ExperimentLab />
      </Panel>
      <Panel title="Nasıl">
        <p>
          Widget panelde kurulan A/B testlerini kendisi uygular (öneri şeridi, kampanya, arama). Mağazanın <strong>kendi</strong> arayüzünü kola göre
          değiştirmek için kolu kodda okuyun:
        </p>
        <Code>{SNIPPET}</Code>
        <ul className="list-disc space-y-1 pl-5">
          <li>Değer döndüren yöntemler widget yüklenip yapılandırmayı aldıktan sonra hazırdır; erken çağrı boş dizi ya da null döner.</li>
          <li>Sayfa ve split URL deneyleri tarayıcıda atanır ve bu listede görünmez.</li>
          <li>Pazarlama izni olmayan ziyaretçi hiçbir teste girmez ve kontrolü görür.</li>
          <li>Siparişin kola yazılması için siparişte ziyaretçi kimliği olmalıdır; <code>trackOrder</code> bunu kendisi ekler.</li>
        </ul>
        <DocLink path="experiments/developer">Geliştirici için deneyler</DocLink>
      </Panel>
    </div>
  );
}
