import { getByCode } from '@/lib/catalog';
import { renderProductSvg, type ArtVariant } from '@/lib/art/render';
import { svgToPng } from '@/lib/art/png';

/**
 * Product pictures, drawn on request. `/img/p/<code>/<1|2|3>.svg`.
 * Deterministic, so they are cached hard by the browser and the CDN.
 */
export function GET(_req: Request, { params }: { params: { code: string; file: string } }) {
  const p = getByCode(params.code);
  const m = /^([123])\.(svg|png)$/.exec(params.file);
  if (!p || !m) return new Response('Not found', { status: 404 });
  const svg = renderProductSvg(p, Number(m[1]) as ArtVariant);
  if (m[2] === 'png') {
    return new Response(new Uint8Array(svgToPng(`${p.code}-${m[1]}`, svg)), {
      headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=604800, immutable' },
    });
  }
  return new Response(svg, {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'public, max-age=604800, immutable',
    },
  });
}
