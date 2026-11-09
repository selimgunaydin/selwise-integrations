'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export function SortSelect({ value, options }: { value: string; options: Record<string, string> }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="hidden text-ink-muted sm:inline">Sırala:</span>
      <select
        id="listing-sort"
        value={value}
        onChange={(e) => {
          const sp = new URLSearchParams(search?.toString());
          if (e.target.value === 'onerilen') sp.delete('sirala');
          else sp.set('sirala', e.target.value);
          sp.delete('sayfa');
          const s = sp.toString();
          router.push(`${pathname}${s ? `?${s}` : ''}`, { scroll: false });
        }}
        className="h-10 rounded-full border border-line-strong bg-white px-4 text-sm focus:border-ink focus:outline-none"
      >
        {Object.entries(options).map(([k, label]) => (
          <option key={k} value={k}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}
