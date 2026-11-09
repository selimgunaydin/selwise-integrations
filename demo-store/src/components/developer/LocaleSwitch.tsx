'use client';

import { useState } from 'react';
import { STORE_LOCALES, type StoreLocale } from '@/lib/selwise/locales';

/**
 * Switch the language Selwise speaks on this store: a cookie that makes the
 * server write `<html lang>`, then a full load — `<html lang>` and the
 * widget's bootstrap are read once per document, so the widget asks for the
 * channel's texts in the new language from the first request.
 *
 * (`Selwise.setLocale` is the in-page alternative for a page whose
 * `<html lang>` cannot say the language; a reload makes it unnecessary here.)
 */
export function LocaleSwitch({ current }: { current: StoreLocale }) {
  const [busy, setBusy] = useState(false);

  const choose = async (locale: StoreLocale) => {
    if (locale === current || busy) return;
    setBusy(true);
    await fetch('/api/locale', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ locale }) });
    window.location.reload();
  };

  return (
    <div className="inline-flex rounded-full border border-line p-1" role="group" aria-label="Selwise dili">
      {STORE_LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          disabled={busy}
          aria-pressed={l === current}
          onClick={() => choose(l)}
          className={`rounded-full px-4 py-1.5 text-sm ${l === current ? 'bg-ink text-paper' : 'text-ink-soft hover:text-ink'}`}
        >
          {l === 'tr' ? 'Türkçe' : 'English'}
        </button>
      ))}
    </div>
  );
}
