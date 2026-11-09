'use client';

import { useState } from 'react';
import { Modal } from '../ui/Modal';

export function Gallery({ code, title }: { code: string; title: string }) {
  const images = [1, 2, 3].map((n) => `/img/p/${code}/${n}.svg`);
  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState(false);
  return (
    <div className="grid items-start gap-3 self-start md:grid-cols-[72px_1fr]" id="pdp-gallery">
      <div className="order-2 flex gap-3 md:order-1 md:flex-col">
        {images.map((src, i) => (
          <button
            key={src}
            onClick={() => setActive(i)}
            className={`overflow-hidden rounded-lg border ${active === i ? 'border-ink' : 'border-transparent opacity-70 hover:opacity-100'}`}
            aria-label={`Görsel ${i + 1}`}
          >
            <img src={src} alt="" className="aspect-[4/5] w-16 object-cover md:w-full" />
          </button>
        ))}
      </div>
      <button className="order-1 block self-start overflow-hidden rounded-2xl bg-sand md:order-2" onClick={() => setZoom(true)} aria-label="Görseli büyüt">
        <img key={images[active]} src={images[active]} alt={title} className="aspect-[4/5] w-full object-cover animate-fade-in" />
      </button>
      {zoom && (
        <Modal title={title} onClose={() => setZoom(false)} wide>
          <div className="grid gap-3 md:grid-cols-3">
            {images.map((src) => (
              <img key={src} src={src} alt="" className="w-full rounded-xl" />
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
