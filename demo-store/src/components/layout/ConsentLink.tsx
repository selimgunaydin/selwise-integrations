'use client';

import { openConsentPreferences } from '@/lib/selwise/client';

/** `data-selwise-consent` makes the widget re-open its banner on click, even before our handler runs. */
export function ConsentLink() {
  return (
    <button type="button" data-selwise-consent="" onClick={() => openConsentPreferences()} className="hover:text-ink">
      Çerez Tercihleri
    </button>
  );
}
