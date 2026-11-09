import fs from 'node:fs';
import path from 'node:path';
import { Code, DocLink, Panel, SourceLink } from '@/components/developer/DevBits';

export const metadata = { title: 'Geçmiş veri' };

const RUN = `# Mağazanın veritabanından iki dosya üretir (e-posta ve telefon içerir:
# HTTP üzerinden sunulmaz, yalnızca komut satırında)
npx tsx scripts/export-selwise-history.ts ./export

# → export/users.ndjson   bir satır = bir kişi
# → export/orders.ndjson  bir satır = bir sipariş`;

/** The first records of a sample file, pretty-printed — read once, when the module loads. */
function sample(file: string, lines = 2) {
  try {
    const text = fs.readFileSync(path.join(process.cwd(), 'examples', 'data-import', file), 'utf8');
    return text
      .split('\n')
      .filter(Boolean)
      .slice(0, lines)
      .map((l) => JSON.stringify(JSON.parse(l), null, 2))
      .join('\n\n');
  } catch {
    return '(örnek dosya bu kurulumda yok)';
  }
}

const USERS_SAMPLE = sample('users.sample.ndjson');
const ORDERS_SAMPLE = sample('orders.sample.ndjson');

export default function HistoryPage() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title="Geçmişi Selwise’a taşımak">
        <p>
          Selwise kurulduğu günden önceki müşteri ve siparişleri bilmez. Geçmiş, panelde <em>Settings → Data Import</em> ekranından iki NDJSON dosyasıyla
          yüklenir: önce kullanıcılar, sonra siparişler; ardından doğrulama ve uygulama. Canlı sipariş akışı kullanılmaz: içe aktarılan sipariş bir izleme
          olayı üretmez ve hiçbir kampanyaya atfedilmez.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <code>customerId</code>, mağazanın <code>identify</code> ile verdiği numaranın <strong>aynısı</strong> olmalı (burada <code>ardisa-&lt;id&gt;</code>
            ); yoksa geçmiş ve canlı ziyaretçi iki ayrı kişi olur.
          </li>
          <li>
            <code>placedAt</code> siparişin kendi zamanıdır; sipariş bu tarihe yazılır.
          </li>
          <li>
            İptal ve iade <code>status</code> ile İngilizce söylenir (<code>cancelled</code>, <code>returned</code>), yoksa ciroya girer.
          </li>
          <li>İzin (e-posta, SMS) kanıtıyla gelir: ne zaman ve nerede verildiği.</li>
        </ul>
        <Code>{RUN}</Code>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <SourceLink path="scripts/export-selwise-history.ts" />
          <SourceLink path="src/lib/selwise/history-export.ts" />
        </div>
        <DocLink path="data-import/preparing-data">Veriyi hazırlama</DocLink>
      </Panel>
      <div className="space-y-6">
        <Panel title="users.sample.ndjson" aside={<SourceLink path="examples/data-import/users.sample.ndjson" />}>
          <Code>{USERS_SAMPLE}</Code>
        </Panel>
        <Panel title="orders.sample.ndjson" aside={<SourceLink path="examples/data-import/orders.sample.ndjson" />}>
          <Code>{ORDERS_SAMPLE}</Code>
        </Panel>
      </div>
    </div>
  );
}
