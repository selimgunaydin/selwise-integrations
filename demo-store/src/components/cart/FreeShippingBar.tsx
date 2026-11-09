import { Truck } from 'lucide-react';
import { formatPrice } from '@/lib/format';
import { FREE_SHIPPING_THRESHOLD } from '@/lib/store/constants';

export function FreeShippingBar({ remaining, free }: { remaining: number; free: boolean }) {
  const pct = free ? 100 : Math.min(100, Math.round(((FREE_SHIPPING_THRESHOLD - remaining) / FREE_SHIPPING_THRESHOLD) * 100));
  return (
    <div>
      <p className="flex items-center gap-2 text-xs text-ink-soft">
        <Truck size={14} />
        {free ? (
          <span>
            <strong className="text-ok">Kargo bedava!</strong> Siparişiniz ücretsiz gönderilecek.
          </span>
        ) : (
          <span>
            Ücretsiz kargo için <strong>{formatPrice(remaining)}</strong> daha ekleyin.
          </span>
        )}
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sand">
        <div className={`h-full rounded-full transition-all ${free ? 'bg-ok' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
