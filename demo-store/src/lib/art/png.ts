/**
 * PNG copies of the product pictures, for the places SVG does not reach:
 * e-mail clients (Gmail drops SVG images), push notification icons and link
 * previews. Rendered once per picture and kept on disk beside the database.
 */
import fs from 'fs';
import path from 'path';
import { Resvg } from '@resvg/resvg-js';

const memo = new Map<string, Buffer>();

function cacheDir() {
  const dir = path.join(process.env.DEMO_STORE_DATA_DIR || path.join(process.cwd(), 'data'), 'png-cache');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function svgToPng(key: string, svg: string, width = 600): Buffer {
  const hit = memo.get(key);
  if (hit) return hit;
  const file = path.join(cacheDir(), `${key.replace(/[^a-zA-Z0-9_-]/g, '_')}.png`);
  if (fs.existsSync(file)) {
    const buf = fs.readFileSync(file);
    memo.set(key, buf);
    return buf;
  }
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: { loadSystemFonts: true, defaultFontFamily: 'DejaVu Serif' } }).render().asPng();
  fs.writeFileSync(file, png);
  if (memo.size > 200) memo.clear();
  memo.set(key, png);
  return png;
}
