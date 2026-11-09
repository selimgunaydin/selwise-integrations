'use client';

import { useState } from 'react';
import { Star, BadgeCheck } from 'lucide-react';
import { useStore } from '../Providers';
import { formatDate } from '@/lib/format';
import { Modal } from '../ui/Modal';

interface ReviewItem {
  author: string;
  rating: number;
  title: string;
  body: string;
  date: string;
  verified: boolean;
}

export function Reviews({
  groupCode,
  rating,
  count,
  histogram,
  reviews,
  productTitle,
}: {
  groupCode: string;
  rating: number;
  count: number;
  histogram: number[];
  reviews: ReviewItem[];
  productTitle: string;
}) {
  const { user, toast } = useStore();
  const [writing, setWriting] = useState(false);
  const [list, setList] = useState(reviews);
  const max = Math.max(1, ...histogram);
  return (
    <section id="reviews" className="mt-20 border-t border-line pt-12">
      <div className="grid gap-10 md:grid-cols-[280px_1fr]">
        <div>
          <h2 className="font-display text-3xl">Değerlendirmeler</h2>
          {count > 0 ? (
            <>
              <p className="mt-4 font-display text-5xl">{rating.toLocaleString('tr-TR')}</p>
              <div className="mt-2 flex">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star key={i} size={16} strokeWidth={0} className={i <= Math.round(rating) ? 'fill-ink' : 'fill-line-strong'} />
                ))}
              </div>
              <p className="mt-1 text-xs text-ink-muted">{count} değerlendirme</p>
              <div className="mt-6 space-y-1.5">
                {histogram.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="w-3">{5 - i}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sand">
                      <div className="h-full bg-ink" style={{ width: `${(c / max) * 100}%` }} />
                    </div>
                    <span className="w-8 text-right text-ink-muted">{c}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="mt-4 text-sm text-ink-muted">Bu ürün için henüz değerlendirme yok.</p>
          )}
          <button
            className="btn-outline mt-6 w-full"
            onClick={() => (user ? setWriting(true) : (window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + '#reviews')}`))}
          >
            Değerlendirme Yaz
          </button>
        </div>
        <ul className="divide-y divide-line">
          {list.map((r, i) => (
            <li key={i} className="py-6 first:pt-0">
              <div className="flex items-center gap-3">
                <div className="flex">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star key={s} size={13} strokeWidth={0} className={s <= r.rating ? 'fill-ink' : 'fill-line-strong'} />
                  ))}
                </div>
                <p className="text-sm font-medium">{r.title}</p>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{r.body}</p>
              <p className="mt-2 flex items-center gap-2 text-2xs text-ink-muted">
                {r.author} · {formatDate(r.date)}
                {r.verified && (
                  <span className="flex items-center gap-1 text-ok">
                    <BadgeCheck size={12} /> Onaylı alıcı
                  </span>
                )}
              </p>
            </li>
          ))}
        </ul>
      </div>
      {writing && (
        <WriteReview
          title={productTitle}
          onClose={() => setWriting(false)}
          onSubmit={async (data) => {
            const res = await fetch('/api/reviews', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ groupCode, ...data }),
            });
            if (!res.ok) {
              toast('Değerlendirme gönderilemedi.', 'error');
              return;
            }
            const saved = await res.json();
            setList((l) => [{ ...saved, verified: true }, ...l]);
            setWriting(false);
            toast('Değerlendirmeniz için teşekkürler!');
          }}
        />
      )}
    </section>
  );
}

function WriteReview({ title, onClose, onSubmit }: { title: string; onClose: () => void; onSubmit: (d: { rating: number; title: string; body: string }) => void }) {
  const [rating, setRating] = useState(5);
  const [t, setT] = useState('');
  const [body, setBody] = useState('');
  return (
    <Modal title="Değerlendirme Yaz" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ rating, title: t, body });
        }}
      >
        <p className="text-sm text-ink-soft">{title}</p>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <button type="button" key={i} onClick={() => setRating(i)} aria-label={`${i} yıldız`}>
              <Star size={26} strokeWidth={0} className={i <= rating ? 'fill-ink' : 'fill-line-strong'} />
            </button>
          ))}
        </div>
        <input required maxLength={80} value={t} onChange={(e) => setT(e.target.value)} placeholder="Başlık" className="input" />
        <textarea required maxLength={800} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Ürün hakkındaki düşünceleriniz" className="input h-32 py-3" />
        <button className="btn-primary w-full">Gönder</button>
      </form>
    </Modal>
  );
}
