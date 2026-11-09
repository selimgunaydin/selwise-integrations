import type { ReactNode } from 'react';

export function AuthShell({ title, subtitle, children, aside }: { title: string; subtitle?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="container grid gap-12 py-12 md:grid-cols-2 md:py-16">
      <div className="mx-auto w-full max-w-md">
        <h1 className="font-display text-4xl">{title}</h1>
        {subtitle && <p className="mt-2 text-sm text-ink-soft">{subtitle}</p>}
        <div className="mt-8">{children}</div>
      </div>
      <div className="hidden md:block">
        {aside || (
          <div className="relative h-full min-h-[480px] overflow-hidden rounded-2xl bg-sand">
            <img src="/img/c/kadin-dis-giyim.svg" alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-x-6 bottom-6 rounded-xl bg-white/95 p-6 backdrop-blur">
              <p className="eyebrow">Ardisa üyeliği</p>
              <ul className="mt-3 space-y-2 text-sm text-ink-soft">
                <li>· İlk siparişe özel %10 indirim (HOSGELDIN10)</li>
                <li>· Her alışverişte Ardisa Puan</li>
                <li>· Favoriler, stok alarmı ve sipariş takibi</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
