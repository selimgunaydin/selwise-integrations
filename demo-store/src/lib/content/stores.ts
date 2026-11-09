/**
 * Ardisa's 24 (fictional) stores. The six pickup points the checkout offers
 * come from `lib/pickup-stores.ts` so the two lists can never disagree.
 * Client-safe: plain data only.
 */
import { PICKUP_STORES } from '../pickup-stores';

export interface StoreLocation {
  id: string;
  name: string;
  city: string;
  district: string;
  address: string;
  hours: string;
  phone: string;
  services: string[];
  pickup: boolean;
}

const MALL_HOURS = '10:00 – 22:00 (her gün)';
const STREET_HOURS = 'Pzt–Cmt 10:00 – 21:00, Paz 11:00 – 20:00';

const PICKUP_EXTRA: Record<string, Pick<StoreLocation, 'hours' | 'phone' | 'services'>> = {
  'ist-nisantasi': { hours: STREET_HOURS, phone: '0212 000 00 01', services: ['Mağazadan teslim', 'İade & değişim', 'Terzi', 'Kişisel stil danışmanlığı'] },
  'ist-kadikoy': { hours: STREET_HOURS, phone: '0216 000 00 02', services: ['Mağazadan teslim', 'İade & değişim', 'Ardisa Home köşesi'] },
  'ist-zorlu': { hours: MALL_HOURS, phone: '0212 000 00 03', services: ['Mağazadan teslim', 'İade & değişim', 'Ardisa Beauty köşesi', 'Terzi'] },
  'ank-kizilay': { hours: STREET_HOURS, phone: '0312 000 00 04', services: ['Mağazadan teslim', 'İade & değişim'] },
  'izm-alsancak': { hours: STREET_HOURS, phone: '0232 000 00 05', services: ['Mağazadan teslim', 'İade & değişim', 'Ardisa Home köşesi'] },
  'brs-nilufer': { hours: MALL_HOURS, phone: '0224 000 00 06', services: ['Mağazadan teslim', 'İade & değişim', 'Ardisa Active köşesi'] },
};

const OTHERS: StoreLocation[] = [
  { id: 'ist-bagdat', name: 'Ardisa Bağdat Caddesi', city: 'İstanbul', district: 'Kadıköy', address: 'Bağdat Cad. No: 000, Suadiye', hours: STREET_HOURS, phone: '0216 000 00 07', services: ['İade & değişim', 'Ardisa Beauty köşesi', 'Terzi'], pickup: false },
  { id: 'ist-levent', name: 'Ardisa Levent', city: 'İstanbul', district: 'Beşiktaş', address: 'Örnek AVM, Kat 2, Levent', hours: MALL_HOURS, phone: '0212 000 00 08', services: ['İade & değişim', 'Ardisa Active köşesi'], pickup: false },
  { id: 'ist-atasehir', name: 'Ardisa Ataşehir', city: 'İstanbul', district: 'Ataşehir', address: 'Örnek AVM, Kat 1', hours: MALL_HOURS, phone: '0216 000 00 09', services: ['İade & değişim', 'Ardisa Home köşesi'], pickup: false },
  { id: 'ist-bakirkoy', name: 'Ardisa Bakırköy', city: 'İstanbul', district: 'Bakırköy', address: 'İstanbul Cad. No: 000', hours: STREET_HOURS, phone: '0212 000 00 10', services: ['İade & değişim', 'Terzi'], pickup: false },
  { id: 'ist-beylikduzu', name: 'Ardisa Beylikdüzü', city: 'İstanbul', district: 'Beylikdüzü', address: 'Örnek Yaşam Merkezi, Kat 0', hours: MALL_HOURS, phone: '0212 000 00 11', services: ['İade & değişim', 'Ardisa Outlet köşesi'], pickup: false },
  { id: 'ank-tunali', name: 'Ardisa Tunalı', city: 'Ankara', district: 'Çankaya', address: 'Tunalı Hilmi Cad. No: 000', hours: STREET_HOURS, phone: '0312 000 00 12', services: ['İade & değişim', 'Ardisa Beauty köşesi'], pickup: false },
  { id: 'ank-umitkoy', name: 'Ardisa Ümitköy', city: 'Ankara', district: 'Çankaya', address: 'Örnek AVM, Kat 1, Ümitköy', hours: MALL_HOURS, phone: '0312 000 00 13', services: ['İade & değişim', 'Ardisa Home köşesi', 'Ardisa Active köşesi'], pickup: false },
  { id: 'izm-karsiyaka', name: 'Ardisa Karşıyaka', city: 'İzmir', district: 'Karşıyaka', address: 'Kemalpaşa Cad. No: 000', hours: STREET_HOURS, phone: '0232 000 00 14', services: ['İade & değişim'], pickup: false },
  { id: 'izm-bornova', name: 'Ardisa Bornova', city: 'İzmir', district: 'Bornova', address: 'Örnek AVM, Kat 2', hours: MALL_HOURS, phone: '0232 000 00 15', services: ['İade & değişim', 'Ardisa Beauty köşesi'], pickup: false },
  { id: 'brs-osmangazi', name: 'Ardisa Osmangazi', city: 'Bursa', district: 'Osmangazi', address: 'Atatürk Cad. No: 000', hours: STREET_HOURS, phone: '0224 000 00 16', services: ['İade & değişim'], pickup: false },
  { id: 'ant-konyaalti', name: 'Ardisa Konyaaltı', city: 'Antalya', district: 'Konyaaltı', address: 'Örnek AVM, Kat 1', hours: MALL_HOURS, phone: '0242 000 00 17', services: ['İade & değişim', 'Ardisa Active köşesi'], pickup: false },
  { id: 'ant-lara', name: 'Ardisa Lara', city: 'Antalya', district: 'Muratpaşa', address: 'Lara Cad. No: 000', hours: STREET_HOURS, phone: '0242 000 00 18', services: ['İade & değişim', 'Ardisa Home köşesi'], pickup: false },
  { id: 'ada-seyhan', name: 'Ardisa Seyhan', city: 'Adana', district: 'Seyhan', address: 'Örnek AVM, Kat 1', hours: MALL_HOURS, phone: '0322 000 00 19', services: ['İade & değişim'], pickup: false },
  { id: 'kny-selcuklu', name: 'Ardisa Selçuklu', city: 'Konya', district: 'Selçuklu', address: 'Örnek AVM, Kat 0', hours: MALL_HOURS, phone: '0332 000 00 20', services: ['İade & değişim', 'Ardisa Home köşesi'], pickup: false },
  { id: 'gzt-sehitkamil', name: 'Ardisa Şehitkamil', city: 'Gaziantep', district: 'Şehitkamil', address: 'Örnek AVM, Kat 1', hours: MALL_HOURS, phone: '0342 000 00 21', services: ['İade & değişim'], pickup: false },
  { id: 'koc-izmit', name: 'Ardisa İzmit', city: 'Kocaeli', district: 'İzmit', address: 'Örnek AVM, Kat 2', hours: MALL_HOURS, phone: '0262 000 00 22', services: ['İade & değişim', 'Ardisa Active köşesi'], pickup: false },
  { id: 'esk-tepebasi', name: 'Ardisa Tepebaşı', city: 'Eskişehir', district: 'Tepebaşı', address: 'Örnek AVM, Kat 1', hours: MALL_HOURS, phone: '0222 000 00 23', services: ['İade & değişim'], pickup: false },
  { id: 'mug-bodrum', name: 'Ardisa Bodrum', city: 'Muğla', district: 'Bodrum', address: 'Neyzen Tevfik Cad. No: 000', hours: 'Her gün 10:00 – 23:00 (yaz sezonu)', phone: '0252 000 00 24', services: ['İade & değişim', 'Ardisa Beauty köşesi'], pickup: false },
];

export const STORES: StoreLocation[] = [
  ...PICKUP_STORES.map((s) => ({
    id: s.id,
    name: s.name,
    city: s.city,
    district: s.district,
    address: s.line,
    pickup: true,
    ...(PICKUP_EXTRA[s.id] ?? { hours: STREET_HOURS, phone: '0850 000 00 00', services: ['Mağazadan teslim', 'İade & değişim'] }),
  })),
  ...OTHERS,
];

/** Approximate centres, in degrees, for the decorative map. */
export const CITY_COORDS: Record<string, [lon: number, lat: number]> = {
  İstanbul: [28.97, 41.01],
  Ankara: [32.86, 39.93],
  İzmir: [27.14, 38.42],
  Bursa: [29.06, 40.19],
  Antalya: [30.71, 36.9],
  Adana: [35.32, 37.0],
  Konya: [32.49, 37.87],
  Gaziantep: [37.38, 37.07],
  Kocaeli: [29.92, 40.77],
  Mersin: [34.64, 36.81],
  Eskişehir: [30.52, 39.78],
  Kayseri: [35.49, 38.73],
  Samsun: [36.33, 41.29],
  Trabzon: [39.72, 41.0],
  Muğla: [28.36, 37.22],
  Denizli: [29.09, 37.78],
};
