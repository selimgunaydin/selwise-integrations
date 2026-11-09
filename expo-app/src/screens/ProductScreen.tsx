import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import type { EnrichmentItem, SelwiseProduct } from '@selwise/react-native';
import { formatPrice, selwise } from '../selwise';
import { useStore } from '../store';
import { Strips } from '../components/Strip';
import { Surfaces } from '../components/Surfaces';
import { Button, colors, Section, styles } from '../ui';

const ENRICHMENT_SLOT = 'pdp-under-description';

/** Enrichment arrives as finished, sanitised markup; a native app without a WebView shows its text. */
const textOfHtml = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|div|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

export function ProductScreen({ product }: { product: SelwiseProduct }) {
  const { add, setOpen } = useStore();
  const [blocks, setBlocks] = useState<EnrichmentItem[]>([]);

  useEffect(() => {
    selwise.setScreen('app://product');
    selwise.trackProductView(product.itemCode, { productPrice: product.price, currency: product.currency });
    const controller = new AbortController();
    selwise
      .getEnrichment(product.itemCode, [ENRICHMENT_SLOT], controller.signal)
      .then((result) => {
        const items = selwise.enrichmentForSlot(result, ENRICHMENT_SLOT);
        setBlocks(items);
        items.forEach((item) => selwise.trackEnrichmentView(item)); // one impression per rule, when drawn
      })
      .catch(() => setBlocks([]));
    return () => controller.abort();
  }, [product]);

  return (
    <ScrollView style={{ backgroundColor: colors.paper }}>
      <Surfaces screen="app://product" />
      <View style={{ aspectRatio: 4 / 5, backgroundColor: colors.sand }}>
        {product.imageUrl ? <Image source={{ uri: product.imageUrl }} style={{ width: '100%', height: '100%' }} /> : null}
      </View>
      <Section>
        <Pressable onPress={() => setOpen(null)} accessibilityRole="button">
          <Text style={[styles.muted, { marginBottom: 8 }]}>← Geri</Text>
        </Pressable>
        {product.brand ? <Text style={styles.brand}>{product.brand.toUpperCase()}</Text> : null}
        <Text style={{ fontSize: 22, fontWeight: '600', color: colors.ink }}>{product.title}</Text>
        <Text style={{ fontSize: 18, marginVertical: 8 }}>{formatPrice(product.price, product.currency)}</Text>
        <Button label="Sepete ekle" onPress={() => add(product)} />
        {product.description ? <Text style={[styles.muted, { marginTop: 12 }]}>{product.description}</Text> : null}
        {blocks.map((b) => (
          <Text key={b.assignmentId} style={{ marginTop: 12, padding: 12, backgroundColor: colors.sand, borderRadius: 10, color: colors.soft }}>
            {textOfHtml(b.html)}
          </Text>
        ))}
      </Section>
      <Strips screen="app://product" currentProductId={product.itemCode} />
    </ScrollView>
  );
}
