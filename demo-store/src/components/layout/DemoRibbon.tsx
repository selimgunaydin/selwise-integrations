import Link from 'next/link';

export function DemoRibbon() {
  return (
    <div className="bg-ink text-paper">
      <div className="container flex h-8 items-center justify-center gap-3 text-[11px] md:justify-between">
        <p className="truncate">
          <span className="mr-2 rounded bg-accent px-1.5 py-0.5 font-semibold">DEMO</span>
          Bu bir Selwise test mağazasıdır · Gerçek ödeme alınmaz
        </p>
        <span className="hidden shrink-0 items-center gap-4 md:flex">
          <Link href="/gelistirici" className="underline-offset-4 hover:underline">
            Geliştirici →
          </Link>
          <Link href="/demo-panel" className="underline-offset-4 hover:underline">
            Test Paneli →
          </Link>
        </span>
      </div>
    </div>
  );
}
