'use client';

import Link from 'next/link';
import { useEffect } from 'react';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="container py-14 md:py-20" id="error-page">
      <div className="mx-auto max-w-xl text-center">
        <p className="eyebrow">Bir sorun oluştu</p>
        <h1 className="mt-3 font-display text-4xl md:text-5xl">Bu sayfa şu anda açılamadı</h1>
        <p className="mt-4 text-sm leading-relaxed text-ink-soft">
          Beklenmeyen bir hata oluştu. Sepetiniz ve hesabınız güvende; birkaç saniye sonra tekrar deneyebilirsiniz. Sorun devam ederse bize
          yazın.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={() => reset()} className="btn-primary">
            Tekrar Dene
          </button>
          <Link href="/" className="btn-outline">
            Ana Sayfaya Dön
          </Link>
        </div>
        <p className="mt-8 text-xs text-ink-muted">
          <Link href="/iletisim" className="link">Müşteri hizmetleri</Link>
          {error.digest && <span className="ml-2 font-mono text-ink-faint">Hata kodu: {error.digest}</span>}
        </p>
      </div>
    </div>
  );
}
