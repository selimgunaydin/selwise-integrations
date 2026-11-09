/**
 * The product feed Selwise syncs: Google Merchant XML, one <item> per colour
 * row (= one product), siblings joined by item_group_id, the colour's sizes
 * nested under it as `<variant>` options (Selwise grouping `nested`).
 *
 * Not one item per size, deliberately: the colour row's code is the store's
 * product identity — the PDP, every tracking event, order line and the
 * account's history carry it — and a size row would be a product of its own
 * that none of them name. `<g:size>` still lists the in-stock sizes for
 * readers that only take the flat field.
 *
 * Read through the live catalogue (control-panel overrides applied), so a price
 * drop or restock made in the test panel reaches Selwise on its next sync —
 * which is what the price-drop / back-in-stock / low-stock scenarios watch.
 *
 * Beyond the Google fields it carries what Selwise maps on top of the preset:
 * `cart_code` (the basket's code, ≠ id), `discount_rate` (the on_sale strategy
 * needs it), `category_hierarchy`, ratings/badges, and free attributes
 * (material, size chart…) that land in `products.attributes_json` for
 * enrichment templates (`${attr.<key>}`).
 */
import { liveProducts } from '@/lib/store/products';
import { selwiseConfig } from '@/lib/selwise/config';
import { sizeCartCode } from '@/lib/catalog';
import { escapeXml as esc } from '@/lib/xml';

export const dynamic = 'force-dynamic';

const money = (n: number) => `${n.toFixed(2)} TRY`;

export function GET() {
  const base = selwiseConfig().publicUrl;
  const items = liveProducts().map((p) => {
    const stock = p.sizes.reduce((s, x) => s + x.stock, 0);
    const sizes = p.sizes.filter((s) => s.stock > 0).map((s) => s.label);
    // Every size nested under its colour row, as Selwise's `nested` grouping
    // reads options: the colour stays ONE product (its item code is what every
    // event, order and history row carries), `item_group_id` still joins the
    // colours, and a card that offers sizes adds the chosen one's own code.
    // Sold-out sizes are listed with quantity 0 so a chooser can show them gone.
    const variants = p.sizes
      .map(
        (s) => `<variant>
<variant_id>${esc(sizeCartCode(p, s.label))}</variant_id>
<sku>${esc(`${p.code}-${s.label}`)}</sku>
<size>${esc(s.label)}</size>
<color>${esc(p.colorName)}</color>
<quantity>${s.stock}</quantity>
<availability>${s.stock > 0 ? 'in_stock' : 'out_of_stock'}</availability>
<price>${money(p.listPrice)}</price>
${p.price < p.listPrice ? `<sale_price>${money(p.price)}</sale_price>` : ''}
</variant>`,
      )
      .join('\n');
    const extra = Object.entries(p.attrs)
      .map(([k, v]) => `<${k}>${esc(v)}</${k}>`)
      .join('');
    return `<item>
<g:id>${esc(p.code)}</g:id>
<g:item_group_id>${esc(p.groupCode)}</g:item_group_id>
<cart_code>${esc(p.cartCode)}</cart_code>
<g:title>${esc(p.title)}</g:title>
<g:description>${esc(p.description)}</g:description>
<g:link>${base}/p/${p.slug}</g:link>
<g:image_link>${base}/img/p/${p.code}/1.png</g:image_link>
<g:additional_image_link>${base}/img/p/${p.code}/2.png</g:additional_image_link>
<g:additional_image_link>${base}/img/p/${p.code}/3.png</g:additional_image_link>
<g:availability>${stock > 0 ? 'in_stock' : 'out_of_stock'}</g:availability>
<g:quantity>${stock}</g:quantity>
<g:price>${money(p.listPrice)}</g:price>
${p.price < p.listPrice ? `<g:sale_price>${money(p.price)}</g:sale_price>` : ''}
<discount_rate>${p.discountRate}</discount_rate>
<g:brand>${esc(p.brand)}</g:brand>
<g:product_type>${esc(p.categoryPath.join(' > '))}</g:product_type>
<category_hierarchy>${esc(p.categoryPath.join(' > '))}</category_hierarchy>
<g:color>${esc(p.colorName)}</g:color>
<g:size>${esc(sizes.join(','))}</g:size>
${p.gender ? `<g:gender>${p.gender === 'Kadın' ? 'female' : p.gender === 'Erkek' ? 'male' : 'unisex'}</g:gender>` : ''}
<g:condition>new</g:condition>
<rating>${p.rating}</rating>
<review_count>${p.reviewCount}</review_count>
<is_new>${p.isNew ? 'true' : 'false'}</is_new>
<is_bestseller>${p.isBestseller ? 'true' : 'false'}</is_bestseller>
<created_at>${p.createdAt}</created_at>
${extra}
${variants}
</item>`;
  });
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
<title>Ardisa</title>
<link>${base}</link>
<description>Ardisa demo mağaza ürün beslemesi</description>
${items.join('\n')}
</channel>
</rss>`;
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'no-store' } });
}
