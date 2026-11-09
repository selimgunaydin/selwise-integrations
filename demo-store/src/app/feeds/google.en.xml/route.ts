/**
 * The English LANGUAGE feed — words only.
 *
 * Same shape as the main feed (app/feeds/google.xml), so Selwise reads it with
 * the main feed's field paths and matches rows by product code (`g:id`). It
 * deliberately carries no price, stock, image or variant: a language feed
 * writes `product_translations` and never a product — a row whose code is not
 * in the main feed is counted as unmatched and skipped.
 *
 * Panel: Catalog → Product Feed → Configuration → Languages → English → Add a
 * language feed → this URL, "Match rows by: Product code", URL rule "Use the
 * main-feed URL" (Ardisa has no English pages; Selwise draws English words,
 * the product page stays Turkish).
 *
 * Shown only to accounts with more than one content language (set by a
 * Selwise super admin).
 */
import { liveProducts } from '@/lib/store/products';
import { selwiseConfig } from '@/lib/selwise/config';
import { englishProduct } from '@/lib/catalog/en';

export const dynamic = 'force-dynamic';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function GET() {
  const base = selwiseConfig().publicUrl;
  const items = liveProducts().map((p) => {
    const t = englishProduct(p);
    return `<item>
<g:id>${esc(p.code)}</g:id>
<g:title>${esc(t.title)}</g:title>
<g:description>${esc(t.description)}</g:description>
<g:link>${base}/p/${p.slug}</g:link>
<g:product_type>${esc(t.categoryPath.join(' > '))}</g:product_type>
<category_hierarchy>${esc(t.categoryPath.join(' > '))}</category_hierarchy>
</item>`;
  });
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
<title>Ardisa (English)</title>
<link>${base}</link>
<description>Ardisa product feed — English words only</description>
${items.join('\n')}
</channel>
</rss>`;
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=300' } });
}
