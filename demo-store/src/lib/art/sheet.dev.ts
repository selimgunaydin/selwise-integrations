// Dev-only: writes a contact sheet of every template (not imported by the app).
import { writeFileSync } from 'fs';
import { PRODUCTS, CATEGORY_TREE } from '../catalog';
import { renderProductSvg } from './render';
const out = process.argv[2];
const seen = new Set<string>();
const picks = PRODUCTS.filter((p) => { const k = p.type + (p.pattern||''); if (seen.has(k)) return false; seen.add(k); return true; });
const cells = picks.map((p) => `<figure><img src="data:image/svg+xml;utf8,${encodeURIComponent(renderProductSvg(p as any, 1))}"><img src="data:image/svg+xml;utf8,${encodeURIComponent(renderProductSvg(p as any, 2))}"><img src="data:image/svg+xml;utf8,${encodeURIComponent(renderProductSvg(p as any, 3))}"><figcaption>${p.type} · ${p.title}</figcaption></figure>`).join('');
writeFileSync(out, `<!doctype html><meta charset=utf-8><style>body{font:12px sans-serif;display:flex;flex-wrap:wrap;gap:8px;background:#fff}figure{margin:0;width:124px}img{width:120px;height:150px;display:block}img+img{display:none}figcaption{font-size:9px;height:24px;overflow:hidden}</style>${cells}`);
console.log('products', PRODUCTS.length, 'groups', new Set(PRODUCTS.map(p=>p.groupCode)).size, 'types', picks.length, 'cats', CATEGORY_TREE.length);
