import Link from 'next/link';
import { DocLink, Panel, SourceLink } from '@/components/developer/DevBits';
import { SelwiseInspector } from '@/components/developer/SelwiseInspector';
import { INTEGRATION_MAP } from '@/lib/developer';

export const metadata = { title: 'Genel bakış' };

export default function DeveloperHome() {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="space-y-4">
        <h2 className="font-display text-2xl">Entegrasyon haritası</h2>
        <p className="text-sm text-ink-soft">
          Her satır: entegrasyonun bir parçası, onu yapan dosyalar ve anlatan doküman sayfası. Panel tarafında neyin nasıl ayarlandığı deponun
          README’sindedir.
        </p>
        <ol className="space-y-3">
          {INTEGRATION_MAP.map((point, i) => (
            <li key={point.title} className="rounded-2xl border border-line bg-white p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-medium">
                  <span className="mr-2 text-ink-faint">{String(i + 1).padStart(2, '0')}</span>
                  {point.title}
                </h3>
                {point.live && (
                  <Link href={point.live} className="text-xs text-accent hover:underline">
                    Canlı gör →
                  </Link>
                )}
              </div>
              <p className="mt-1.5 text-sm text-ink-soft">{point.what}</p>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                {point.files.map((f) => (
                  <SourceLink key={f} path={f} />
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {point.docs.map(([label, path]) => (
                  <DocLink key={path} path={path}>
                    {label}
                  </DocLink>
                ))}
              </div>
            </li>
          ))}
        </ol>
      </div>
      <div className="space-y-4 xl:sticky xl:top-24 xl:self-start">
        <Panel title="Bu sayfada Selwise ne biliyor">
          <SelwiseInspector />
        </Panel>
      </div>
    </div>
  );
}
