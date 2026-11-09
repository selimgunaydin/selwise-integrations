'use client';

import { useMemo, useState } from 'react';
import { Clock, MapPin, Package, Phone } from 'lucide-react';
import { CITY_COORDS, type StoreLocation } from '@/lib/content/stores';

// ------------------------------------------------------------------ the map
// A decorative dot map: a rough outline of Türkiye filled with a dot grid,
// stores drawn on top. No tiles, no map library — it only has to look right.

const OUTLINE: Array<[number, number]> = [
  [26.0, 40.6], [26.6, 41.7], [28.0, 42.0], [29.1, 41.25], [31.0, 41.1], [33.0, 42.0], [35.0, 42.05], [36.5, 41.3],
  [38.5, 40.95], [40.0, 41.0], [41.5, 41.5], [43.0, 41.2], [43.5, 40.7], [44.8, 39.7], [44.4, 38.4], [44.8, 37.2],
  [42.4, 37.1], [40.0, 36.9], [38.0, 36.8], [36.6, 36.2], [35.9, 36.0], [36.2, 36.9], [35.0, 36.6], [34.0, 36.3],
  [32.5, 36.05], [31.0, 36.8], [30.4, 36.25], [29.3, 36.25], [28.0, 36.7], [27.3, 37.0], [26.4, 38.2], [26.7, 39.2],
  [26.1, 39.5], [26.6, 40.2],
];

/** Cities whose label would sit on a neighbour's marker. */
const LABEL_RIGHT = new Set(['Kocaeli']);
const LABEL_BELOW = new Set(['Bursa']);

const W = 1000;
const H = 470;
const project = (lon: number, lat: number): [number, number] => [(lon - 25.5) * 50, (42.4 - lat) * 50 * 1.29];

function inside(x: number, y: number, poly: Array<[number, number]>) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

const POLY = OUTLINE.map(([lon, lat]) => project(lon, lat));
const STEP = 16;
const DOTS: Array<[number, number]> = [];
for (let y = STEP / 2; y < H; y += STEP) {
  for (let x = STEP / 2; x < W; x += STEP) if (inside(x, y, POLY)) DOTS.push([x, y]);
}

function DotMap({ counts, selected, onPick }: { counts: Map<string, number>; selected: string | null; onPick: (city: string) => void }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Ardisa mağazalarının şehirlere göre dağılımı">
      <g className="fill-line-strong">
        {DOTS.map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={3} />
        ))}
      </g>
      {Array.from(counts.entries()).map(([city, n]) => {
        const c = CITY_COORDS[city];
        if (!c) return null;
        const [x, y] = project(c[0], c[1]);
        const on = selected === city;
        const r = 12 + Math.min(n, 7) * 2;
        const right = LABEL_RIGHT.has(city);
        const below = LABEL_BELOW.has(city);
        return (
          <g key={city} className="cursor-pointer" onClick={() => onPick(city)}>
            <title>{`${city}: ${n} mağaza`}</title>
            <circle cx={x} cy={y} r={r + 9} className={on ? 'fill-accent/20' : 'fill-transparent'} />
            <circle cx={x} cy={y} r={r} className={`stroke-paper ${on ? 'fill-accent' : 'fill-ink'}`} strokeWidth={3} />
            <text x={x} y={y + 6} textAnchor="middle" className="fill-paper text-[17px] font-semibold">
              {n}
            </text>
            <text
              x={right ? x + r + 7 : x}
              y={right ? y + 7 : below ? y + r + 24 : y - r - 10}
              textAnchor={right ? 'start' : 'middle'}
              className={`text-[22px] ${on ? 'fill-accent font-semibold' : 'fill-ink-soft'}`}
            >
              {city}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ------------------------------------------------------------------ the list

export function StoreLocator({ stores }: { stores: StoreLocation[] }) {
  const [city, setCity] = useState<string | null>(null);
  const [pickupOnly, setPickupOnly] = useState(false);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of stores) m.set(s.city, (m.get(s.city) || 0) + 1);
    return m;
  }, [stores]);
  const cities = useMemo(() => Array.from(counts.keys()).sort((a, b) => a.localeCompare(b, 'tr')), [counts]);
  const visible = stores.filter((s) => (!city || s.city === city) && (!pickupOnly || s.pickup));

  return (
    <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-10">
      <div className="lg:order-2">
        <div className="card p-4 md:p-6 lg:sticky lg:top-32">
          <DotMap counts={counts} selected={city} onPick={(c) => setCity((cur) => (cur === c ? null : c))} />
          <p className="mt-3 text-center text-2xs text-ink-muted">Bir şehre dokunarak mağazalarını listeleyin.</p>
        </div>
      </div>

      <div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="sm:w-60">
            <label className="label" htmlFor="store-city">Şehir</label>
            <select id="store-city" value={city ?? ''} onChange={(e) => setCity(e.target.value || null)} className="input">
              <option value="">Tüm şehirler ({stores.length})</option>
              {cities.map((c) => (
                <option key={c} value={c}>
                  {c} ({counts.get(c)})
                </option>
              ))}
            </select>
          </div>
          <label className="flex h-12 items-center gap-2 text-sm text-ink-soft">
            <input type="checkbox" checked={pickupOnly} onChange={(e) => setPickupOnly(e.target.checked)} className="accent-ink" />
            Yalnızca mağazadan teslim noktaları
          </label>
        </div>

        <p className="mt-6 text-xs text-ink-muted" aria-live="polite">
          {visible.length} mağaza listeleniyor{city ? ` · ${city}` : ''}
        </p>
        <ul className="mt-3 space-y-3">
          {visible.map((s) => (
            <li key={s.id} className="card p-5" id={`store-${s.id}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-display text-xl">{s.name}</p>
                  <p className="mt-0.5 text-2xs uppercase tracking-label text-ink-muted">
                    {s.district} / {s.city}
                  </p>
                </div>
                {s.pickup && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-2xs font-semibold text-accent-deep">
                    <Package size={12} /> Mağazadan teslim
                  </span>
                )}
              </div>
              <dl className="mt-4 grid gap-2 text-sm text-ink-soft sm:grid-cols-2">
                <div className="flex items-start gap-2 sm:col-span-2">
                  <dt className="sr-only">Adres</dt>
                  <MapPin size={15} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden />
                  <dd>{s.address}, {s.district} / {s.city}</dd>
                </div>
                <div className="flex items-start gap-2">
                  <dt className="sr-only">Çalışma saatleri</dt>
                  <Clock size={15} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden />
                  <dd>{s.hours}</dd>
                </div>
                <div className="flex items-start gap-2">
                  <dt className="sr-only">Telefon</dt>
                  <Phone size={15} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden />
                  <dd>{s.phone}</dd>
                </div>
              </dl>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {s.services.map((sv) => (
                  <span key={sv} className="rounded-full bg-sand px-2.5 py-1 text-2xs text-ink-soft">
                    {sv}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
