'use client';

import { useEffect, useState } from 'react';
import { Bell, CreditCard, GitCompare, MapPin, Minus, Plus, Ruler, Share2, ShoppingBag } from 'lucide-react';
import { useStore } from '../Providers';
import { FavoriteButton } from '../product/FavoriteButton';
import { Modal } from '../ui/Modal';
import { formatPrice } from '@/lib/format';
import { customEvent } from '@/lib/selwise/client';
import { toggleCompare, readCompare } from '@/lib/compare';

export interface BuyBoxProduct {
  code: string;
  cartCode: string;
  title: string;
  price: number;
  listPrice: number;
  sizes: Array<{ label: string; stock: number }>;
  sizeScale: string;
  categorySlug: string;
  image: string;
}

const HAS_SIZES = new Set(['apparel', 'denim', 'shoeW', 'shoeM']);

export function BuyBox({ product }: { product: BuyBoxProduct }) {
  const { addToCart, busy, user, toast } = useStore();
  const needsSize = HAS_SIZES.has(product.sizeScale);
  const [size, setSize] = useState<string | null>(needsSize ? null : product.sizes[0]?.label ?? null);
  const [qty, setQty] = useState(1);
  const [sizeError, setSizeError] = useState(false);
  const [modal, setModal] = useState<null | 'size' | 'installments' | 'stores' | 'alert'>(null);
  const [inCompare, setInCompare] = useState(false);
  useEffect(() => setInCompare(readCompare().includes(product.code)), [product.code]);

  const selected = product.sizes.find((s) => s.label === size);
  const allOut = product.sizes.every((s) => s.stock <= 0);
  const selectedOut = selected ? selected.stock <= 0 : false;

  const add = async () => {
    if (!size) {
      setSizeError(true);
      // The mobile sticky bar is far from the size grid: bring the grid into view.
      document.getElementById('pdp-buybox')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const ok = await addToCart(product.code, size, qty);
    if (ok) setQty(1);
  };

  return (
    <div className="mt-6" id="pdp-buybox">
      {needsSize && (
        <div>
          <div className="flex items-center justify-between">
            <p className="text-sm">
              Beden: <span className="font-medium">{size || 'Seçiniz'}</span>
            </p>
            <button onClick={() => setModal('size')} className="flex items-center gap-1.5 text-xs text-ink-soft underline underline-offset-4">
              <Ruler size={14} /> Beden Rehberi
            </button>
          </div>
          <div className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-6" role="radiogroup" aria-label="Beden">
            {product.sizes.map((s) => (
              <button
                key={s.label}
                role="radio"
                aria-checked={size === s.label}
                onClick={() => {
                  setSize(s.label);
                  setSizeError(false);
                }}
                className={`relative h-11 rounded-lg border text-sm transition-colors ${
                  size === s.label ? 'border-ink bg-ink text-paper' : s.stock <= 0 ? 'border-line text-ink-faint line-through' : 'border-line-strong hover:border-ink'
                }`}
              >
                {s.label}
                {s.stock > 0 && s.stock <= 2 && size !== s.label && <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-warn" />}
              </button>
            ))}
          </div>
          {sizeError && <p className="mt-2 text-xs text-sale">Lütfen bir beden seçin.</p>}
        </div>
      )}

      <div className="mt-4 min-h-5 text-xs" id="pdp-stock">
        {allOut ? (
          <span className="font-medium text-sale">Bu ürün tükendi.</span>
        ) : selected && selected.stock > 0 && selected.stock <= 3 ? (
          <span className="font-medium text-warn">Acele edin, bu bedenden son {selected.stock} ürün!</span>
        ) : selected && selected.stock > 0 ? (
          <span className="text-ok">Stokta · Hemen kargoda</span>
        ) : selectedOut ? (
          <span className="text-sale">Bu beden tükendi.</span>
        ) : null}
      </div>

      <div className="mt-3 flex gap-3">
        {!allOut && !selectedOut && (
          <div className="flex h-12 items-center rounded-full border border-line-strong">
            <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="px-3" aria-label="Azalt">
              <Minus size={15} />
            </button>
            <span className="w-6 text-center text-sm">{qty}</span>
            <button onClick={() => setQty((q) => Math.min(selected?.stock || 10, q + 1))} className="px-3" aria-label="Artır">
              <Plus size={15} />
            </button>
          </div>
        )}
        {allOut || selectedOut ? (
          <button className="btn-outline flex-1" onClick={() => setModal('alert')} id="pdp-stock-alert">
            <Bell size={16} /> Gelince Haber Ver
          </button>
        ) : (
          <button className="btn-primary flex-1" onClick={add} disabled={busy} id="pdp-add-to-cart">
            <ShoppingBag size={16} /> Sepete Ekle
          </button>
        )}
        <FavoriteButton code={product.code} price={product.price} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-line-strong hover:border-ink" />
      </div>

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-ink-soft">
        <button className="flex items-center gap-1.5 hover:text-ink" onClick={() => setModal('installments')}>
          <CreditCard size={14} /> Taksit Seçenekleri
        </button>
        <button className="flex items-center gap-1.5 hover:text-ink" onClick={() => setModal('stores')}>
          <MapPin size={14} /> Mağaza Stoğu
        </button>
        <button
          className="flex items-center gap-1.5 hover:text-ink"
          onClick={() => {
            const next = toggleCompare(product.code);
            setInCompare(next.includes(product.code));
            toast(next.includes(product.code) ? 'Karşılaştırma listesine eklendi.' : 'Karşılaştırma listesinden çıkarıldı.');
          }}
        >
          <GitCompare size={14} /> {inCompare ? 'Karşılaştırmada' : 'Karşılaştır'}
        </button>
        <button
          className="flex items-center gap-1.5 hover:text-ink"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(window.location.href);
              toast('Bağlantı kopyalandı.');
            } catch {
              toast('Bağlantı kopyalanamadı.', 'error');
            }
          }}
        >
          <Share2 size={14} /> Paylaş
        </button>
      </div>

      {/* Mobile sticky bar */}
      {!allOut && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-line bg-white p-3 lg:hidden" id="pdp-sticky-bar">
          <div className="flex-1">
            <p className="truncate text-xs text-ink-muted">{product.title}</p>
            <p className="text-sm font-semibold">{formatPrice(product.price)}</p>
          </div>
          <button className="btn-primary h-11" onClick={add} disabled={busy}>
            Sepete Ekle
          </button>
        </div>
      )}

      {modal === 'size' && <SizeGuide scale={product.sizeScale} onClose={() => setModal(null)} />}
      {modal === 'installments' && <Installments price={product.price} onClose={() => setModal(null)} />}
      {modal === 'stores' && <StoreStock code={product.code} sizes={product.sizes} onClose={() => setModal(null)} />}
      {modal === 'alert' && <StockAlert product={product} size={size} email={user?.email || ''} onClose={() => setModal(null)} />}
    </div>
  );
}

function SizeGuide({ scale, onClose }: { scale: string; onClose: () => void }) {
  const apparel = [
    ['XS', '32-34', '80-84', '60-64', '86-90'],
    ['S', '36', '84-88', '64-68', '90-94'],
    ['M', '38', '88-92', '68-72', '94-98'],
    ['L', '40', '92-98', '72-78', '98-104'],
    ['XL', '42', '98-104', '78-84', '104-110'],
  ];
  const shoes = [
    ['36', '23,0'], ['37', '23,7'], ['38', '24,3'], ['39', '25,0'], ['40', '25,7'], ['41', '26,3'], ['42', '27,0'], ['43', '27,7'], ['44', '28,3'], ['45', '29,0'],
  ];
  return (
    <Modal title="Beden Rehberi" onClose={onClose} wide>
      {scale.startsWith('shoe') ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-ink-muted"><th className="py-2">Numara</th><th>Ayak uzunluğu (cm)</th></tr>
          </thead>
          <tbody>
            {shoes.map((r) => (
              <tr key={r[0]} className="border-b border-line"><td className="py-2">{r[0]}</td><td>{r[1]}</td></tr>
            ))}
          </tbody>
        </table>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-ink-muted">
              <th className="py-2">Beden</th><th>TR</th><th>Göğüs (cm)</th><th>Bel (cm)</th><th>Basen (cm)</th>
            </tr>
          </thead>
          <tbody>
            {apparel.map((r) => (
              <tr key={r[0]} className="border-b border-line">{r.map((c, i) => <td key={i} className="py-2">{c}</td>)}</tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-4 text-xs text-ink-muted">Ölçüler vücut ölçüsüdür. İki beden arasında kalıyorsanız büyük bedeni tercih edin.</p>
    </Modal>
  );
}

const BANKS = ['Bonus', 'World', 'Maximum', 'Axess', 'CardFinans', 'Paraf'];
const RATES: Array<[number, number]> = [[1, 0], [2, 0], [3, 0], [6, 0.0699], [9, 0.1049], [12, 0.1399]];

function Installments({ price, onClose }: { price: number; onClose: () => void }) {
  return (
    <Modal title="Taksit Seçenekleri" onClose={onClose} wide>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-xs">
          <thead>
            <tr className="border-b border-line text-left text-ink-muted">
              <th className="py-2">Taksit</th>
              {BANKS.map((b) => <th key={b}>{b}</th>)}
            </tr>
          </thead>
          <tbody>
            {RATES.map(([n, r]) => (
              <tr key={n} className="border-b border-line">
                <td className="py-2 font-medium">{n === 1 ? 'Tek çekim' : `${n} taksit`}</td>
                {BANKS.map((b) => (
                  <td key={b}>
                    {formatPrice(Math.round(((price * (1 + r)) / n) * 100) / 100)}
                    <span className="block text-[10px] text-ink-faint">{formatPrice(Math.round(price * (1 + r) * 100) / 100)}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-xs text-ink-muted">İlk 3 taksit peşin fiyatına. Taksit seçenekleri ödeme adımında kart numaranıza göre gösterilir.</p>
    </Modal>
  );
}

const STORES = ['İstanbul Nişantaşı', 'İstanbul Kadıköy', 'İstanbul Zorlu Center', 'Ankara Kızılay', 'İzmir Alsancak', 'Bursa Nilüfer'];

function StoreStock({ code, sizes, onClose }: { code: string; sizes: Array<{ label: string; stock: number }>; onClose: () => void }) {
  let h = 0;
  for (const c of code) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (
    <Modal title="Mağaza Stoğu" onClose={onClose}>
      <ul className="divide-y divide-line">
        {STORES.map((s, i) => {
          const n = (h >> i) % 4;
          const has = n > 0 && sizes.some((x) => x.stock > 0);
          return (
            <li key={s} className="flex items-center justify-between py-3 text-sm">
              <span className="flex items-center gap-2"><MapPin size={14} className="text-ink-muted" /> {s}</span>
              <span className={has ? 'text-ok' : 'text-ink-faint'}>{has ? (n === 1 ? 'Son ürünler' : 'Stokta var') : 'Stokta yok'}</span>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

function StockAlert({ product, size, email: initial, onClose }: { product: BuyBoxProduct; size: string | null; email: string; onClose: () => void }) {
  const [email, setEmail] = useState(initial);
  const [done, setDone] = useState(false);
  const { toast } = useStore();
  return (
    <Modal title="Gelince Haber Ver" onClose={onClose}>
      {done ? (
        <p className="text-sm">
          Teşekkürler! <strong>{product.title}</strong>{size ? ` (${size})` : ''} stoğa girdiğinde <strong>{email}</strong> adresine haber vereceğiz.
        </p>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const res = await fetch('/api/stock-alert', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ email, code: product.code, size }),
            });
            if (!res.ok) {
              toast('Kaydedilemedi, tekrar deneyin.', 'error');
              return;
            }
            customEvent('stock_alert_subscribe', { productItemCode: product.code, size: size || undefined });
            setDone(true);
          }}
        >
          <p className="text-sm text-ink-soft">Ürün tekrar stoğa girdiğinde size e-posta ile haber verelim.</p>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-posta adresiniz" className="input" />
          <button className="btn-primary w-full">Haber Ver</button>
        </form>
      )}
    </Modal>
  );
}
