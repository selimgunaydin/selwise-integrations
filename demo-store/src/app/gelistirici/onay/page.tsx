import { Code, DocLink, Panel, SourceLink } from '@/components/developer/DevBits';
import { ConsentLab } from '@/components/developer/ConsentLab';

export const metadata = { title: 'Çerez onayı' };

const OWN_BANNER = `// Kendi bandınız: karar verildiğinde Selwise'a iletin.
acceptButton.onclick = () => Selwise.grantConsent();               // hepsi
saveButton.onclick = () => Selwise.grantConsent({                 // seçilenler
  analytics: true, marketing: false, preferences: true,           // her kategoriyi adlandırın:
});                                                               // verilmeyen true sayılır
rejectButton.onclick = () => Selwise.revokeConsent();             // isteğe bağlı hepsi`;

export default function ConsentPage() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title="Onay API’si, canlı">
        <ConsentLab />
      </Panel>
      <div className="space-y-6">
        <Panel title="Kendi bandınızla">
          <p>Mağazanın zaten bir onay çözümü varsa Selwise’ın bandı gösterilmez; karar Selwise’a iletilir. Panelde (Kitle → Çerez Onayı):</p>
          <ul className="list-disc space-y-1 pl-5">
            <li><em>Show the Selwise consent banner</em>: kapalı</li>
            <li><em>Require consent before tracking</em> ve <em>Hold events until the answer</em>: açık</li>
          </ul>
          <Code>{OWN_BANNER}</Code>
          <p>
            Bu mağazada <code>SELWISE_CONSENT_UI=store</code> ile mağazanın kendi bandı çizilir. Kayıtlı karar mağazanındır; Selwise kendi kopyasını
            kaybetmişse (depolama temizlendi) aynı karar bir kez daha iletilir, her sayfada değil.
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <SourceLink path="src/components/selwise/StoreConsentBanner.tsx" />
            <SourceLink path="src/lib/selwise/client.ts" />
          </div>
        </Panel>
        <Panel title="Kendiliğinden okunan iki standart">
          <p>
            IAB TCF v2 (<code>__tcfapi</code>) ya da Google Consent Mode v2 (<code>gtag(&apos;consent&apos;, …)</code>) kullanan bir CMP için kod gerekmez:
            onay denetimi açıkken Selwise kararı kendisi okur. İkisi birden varsa TCF kazanır.
          </p>
          <DocLink path="integration/consent">Onay yönetimi dokümanı</DocLink>
        </Panel>
      </div>
    </div>
  );
}
