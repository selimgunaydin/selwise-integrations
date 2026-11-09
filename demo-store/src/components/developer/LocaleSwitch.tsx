'use client';

import { useState } from 'react';
import { selwiseInstance } from '@/lib/selwise/client';

/**
 * Switch the language Selwise speaks on this store.
 *
 * Two things, in this order: the cookie that makes the server write
 * `<html lang>` (every later page load asks Selwise in that language), and
 * `Selwise.setLocale` for THIS page — the widget's own words (consent
 * buttons, "no results") change at once; the merchant's texts follow on the
 * next page load. setLocale is not queued: it is called only on the real instance.
 */
export function LocaleSwitch({ current }: { current: 'tr' | 'en' }) {
  const [busy, setBusy] = useState(false);

  const choose = async (locale: 'tr' | 'en') => {
    if (locale === current || busy) return;
    setBusy(true);
    await fetch('/api/locale', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ locale }) });
    selwiseInstance()?.setLocale?.(locale);
    // A full load, not router.refresh(): <html lang> and the widget's bootstrap
    // are read once per document.
    window.location.reload();
  };

  return (
    <div className="inline-flex rounded-full border border-line p-1" role="group" aria-label="Selwise dili">
      {(['tr', 'en'] as const).map((l) => (
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
