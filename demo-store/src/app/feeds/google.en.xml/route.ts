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
 * Words, codes and slugs are static catalogue data (the test panel changes
 * only prices and stock), so the document is built once per public address.
 */
import { PRODUCTS } from '@/lib/catalog';
import { selwiseConfig } from '@/lib/selwise/config';
import { englishProduct } from '@/lib/catalog/en';
import { escapeXml as esc } from '@/lib/xml';

export const dynamic = 'force-dynamic';

const built = new Map<string, string>();

function feed(base: string) {
  const items = PRODUCTS.map((p) => {
    const t = englishProduct(p);
    const path = esc(t.categoryPath.join(' > '));
    return `<item>
<g:id>${esc(p.code)}</g:id>
<g:title>${esc(t.title)}</g:title>
<g:description>${esc(t.description)}</g:description>
<g:link>${base}/p/${p.slug}</g:link>
<g:product_type>${path}</g:product_type>
<category_hierarchy>${path}</category_hierarchy>
</item>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
<title>Ardisa (English)</title>
<link>${base}</link>
<description>Ardisa product feed — English words only</description>
${items.join('\n')}
</channel>
</rss>`;
}

export function GET() {
  const base = selwiseConfig().publicUrl;
  let xml = built.get(base);
  if (!xml) {
    xml = feed(base);
    built.set(base, xml);
  }
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=300' } });
}
