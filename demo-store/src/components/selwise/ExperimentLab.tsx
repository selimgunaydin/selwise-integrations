'use client';

import { useEffect, useState } from 'react';
import { withSelwise } from '@/lib/selwise/client';

/**
 * Code-level A/B: read the visitor's arm and change the STORE's own UI by it.
 *
 * `getActiveExperiments()` lists the A/B tests (entity experiments) this
 * visitor entered on this page; `getExperimentVariant(id)` answers the arm id.
 * Both exist only on the real instance, after the widget loaded its config —
 * hence `withSelwise`. Called too early they answer `[]` / `null`.
 *
 * Page and split-URL experiments are assigned in the browser from the config
 * and do NOT appear here (docs: experiments/developer → "İki ayrı atama yolu").
 * Without marketing consent the visitor is in no test and sees the control.
 */
interface Arm {
  experimentId: string;
  experimentName: string;
  variantId: string;
  variantName: string;
  isControl: boolean;
  entityType: string;
}

/**
 * An assignment carries `experimentId`, `variantId`, `variantName` and the
 * tested entity (`targetType`); see ExperimentAssignment in the widget's types.
 * It does not say which arm is the control — this demo calls an arm named
 * "control"/"kontrol" the control; a real store compares `variantId` with the
 * arm ids it reads off the experiment's results page.
 */
function toArm(raw: Record<string, unknown>): Arm {
  const s = (k: string) => (typeof raw[k] === 'string' ? (raw[k] as string) : '');
  const variantName = s('variantName');
  return {
    experimentId: s('experimentId'),
    experimentName: s('experimentName'),
    variantId: s('variantId'),
    variantName,
    isControl: /^(control|kontrol)/i.test(variantName || s('variantId')),
    entityType: s('targetType') || s('experimentMode'),
  };
}

export function ExperimentLab() {
  const [arms, setArms] = useState<Arm[] | null>(null);
  const [raw, setRaw] = useState<unknown[]>([]);

  useEffect(
    () =>
      withSelwise((s) => {
        // The assignment lands after the config request; poll briefly instead of guessing a delay.
        let n = 0;
        const t = window.setInterval(() => {
          n += 1;
          const list = s.getActiveExperiments?.() ?? [];
          if (list.length || n > 20) {
            window.clearInterval(t);
            setRaw(list);
            setArms(list.map(toArm));
          }
        }, 150);
      }),
    [],
  );

  if (arms === null) return <p className="text-sm text-ink-muted">Atamalar bekleniyor…</p>;

  return (
    <div className="space-y-4">
      {arms.length === 0 ? (
        <p className="text-sm text-ink-muted">
          Bu sayfada girilmiş bir A/B testi yok. Sebep olabilir: pazarlama izni verilmedi, deneyin kitlesi bu sayfayı kabul etmiyor ya da ziyaretçi
          trafik payının dışında kaldı.
        </p>
      ) : (
        <ul className="space-y-3">
          {arms.map((a) => (
            <li key={a.experimentId} className="rounded-xl border border-line p-4">
              <p className="font-medium">{a.experimentName || 'A/B testi'}</p>
              <p className="mt-1 font-mono text-xs text-ink-muted">
                {a.entityType} · deney {a.experimentId}
              </p>
              <p className="mt-2 text-sm">
                Kol: <strong>{a.variantName || a.variantId}</strong> {a.isControl ? '(kontrol)' : ''}
              </p>
              {/* The store's own UI, changed by the arm — the point of reading it in code. */}
              <div className={`mt-3 rounded-lg px-4 py-3 text-sm ${a.isControl ? 'bg-sand text-ink' : 'bg-accent text-paper'}`}>
                {a.isControl ? 'Kontrol kolu: mağaza varsayılan bandını gösteriyor.' : `“${a.variantName || a.variantId}” kolu: mağaza bu bandı kola göre değiştirdi.`}
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
        <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-sand p-3 text-ink">{JSON.stringify(raw, null, 2)}</pre>
      </details>
    </div>
  );
}
