import { Star } from 'lucide-react';

export function Rating({ value, count, size = 12 }: { value: number; count: number; size?: number }) {
  if (count === 0) return null;
  return (
    <div className="flex items-center gap-1 text-ink-muted" aria-label={`5 üzerinden ${value} puan, ${count} değerlendirme`}>
      <div className="flex">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star key={i} size={size} className={i <= Math.round(value) ? 'fill-ink text-ink' : 'fill-line-strong text-line-strong'} strokeWidth={0} />
        ))}
      </div>
      <span className="text-2xs">({count})</span>
    </div>
  );
}
