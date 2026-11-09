'use client';

import { useEffect, useState } from 'react';
import { withSelwise } from '@/lib/selwise/client';

/**
 * Code-level A/B: read the visitor's arm and change the STORE's own UI by it.
 *
 * `getActiveExperiments()` lists the A/B tests (entity experiments) this
 * visitor entered on this page — each with `experimentId`, `variantId` and
 * `variantName`; `getExperimentVariant(id)` answers the arm id alone. Both
 * exist only on the real instance, after the widget loaded its config, hence
 * `withSelwise`; called too early they answer `[]` / `null`.
 *
 * Page and split-URL experiments are assigned in the browser from the config
 * and do NOT appear here (docs: experiments/developer → "İki ayrı atama yolu").
 * Without marketing consent the visitor is in no test and sees the control.
 */
type Assignment = { experimentId?: string; variantId?: string; variantName?: string; targetType?: string };

export function ExperimentLab() {
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);

  useEffect(() => {
    let timer: number | undefined;
    const stop = withSelwise(
      (s) => {
        // The assignment lands shortly after the config request: look a few times, then settle.
        let n = 0;
        const look = () => {
          const list = (s.getActiveExperiments?.() ?? []) as Assignment[];
          if (list.length || n++ >= 20) setAssignments(list);
          else timer = window.setTimeout(look, 150);
        };
        look();
      },
      () => setAssignments([]),
    );
    return () => {
      stop();
      window.clearTimeout(timer);
    };
  }, []);

  if (assignments === null) return <p className="text-sm text-ink-muted">Atamalar bekleniyor…</p>;

  return (
    <div className="space-y-4">
      {assignments.length === 0 ? (
        <p className="text-sm text-ink-muted">
          Bu sayfada girilmiş bir A/B testi yok. Sebep olabilir: pazarlama izni verilmedi, deneyin kitlesi bu sayfayı kabul etmiyor ya da ziyaretçi
          trafik payının dışında kaldı.
        </p>
      ) : (
        <ul className="space-y-3">
          {assignments.map((a) => (
            <li key={a.experimentId} className="rounded-xl border border-line p-4">
              <p className="font-mono text-xs text-ink-muted">
                {a.targetType ?? 'A/B testi'} · deney {a.experimentId}
              </p>
              <p className="mt-2 text-sm">
                Kol: <strong>{a.variantName || a.variantId}</strong> <span className="font-mono text-xs text-ink-muted">({a.variantId})</span>
              </p>
              {/* The store's own UI, chosen by the arm id — the point of reading it in code. */}
              <div className="mt-3 rounded-lg bg-sand px-4 py-3 text-sm text-ink">
                Mağaza bu kutuyu <code>getExperimentVariant(&apos;{a.experimentId}&apos;)</code> yanıtına göre çizer: kol kimliği sonuç sayfasındaki kollardan
                biriyle karşılaştırılır.
              </div>
              <p className="mt-2 text-xs text-ink-muted">
                QA: bir kolu zorlamak için adrese <code>?selwise_variant={a.experimentId}:KOL_ID</code> ekleyin — gösterilir, hiçbir şey sayılmaz.
              </p>
            </li>
          ))}
        </ul>
      )}
      <details className="text-xs">
        <summary className="cursor-pointer text-ink-muted">getActiveExperiments() ham yanıtı</summary>
        <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-sand p-3 text-ink">{JSON.stringify(assignments, null, 2)}</pre>
      </details>
    </div>
  );
}
