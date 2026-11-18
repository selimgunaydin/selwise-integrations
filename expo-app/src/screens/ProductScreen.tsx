import { useEffect } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { SelwiseEnrichment, SelwiseSlot } from '@selwise/react-native/ui';
import type { SelwiseProduct } from '@selwise/react-native';
import { formatPrice, selwise } from '../selwise';
import { useIsFavourite, favourites } from '../favourites';
import { useNavigation } from '../navigation';
import { useStore } from '../store';
import { Button, colors, Section, styles } from '../ui';

/** The enrichment rule the panel places under this name (Product enrichment → placement). */
const ENRICHMENT_SLOT = 'pdp-specs';

export function ProductScreen({ product }: { product: SelwiseProduct }) {
  const { add } = useStore();
  const { back, openProduct } = useNavigation();
  const favourite = useIsFavourite(product.itemCode);

  useEffect(() => {
    selwise.setScreen('app://product');
    selwise.trackProductView(product.itemCode, { productPrice: product.price, currency: product.currency });
  }, [product]);

  // What a product screen tells the strips on it: the product being looked at.
  const context = { currentProductId: product.itemCode };
  const points = { screen: 'app://product', sku: product.itemCode, context, onProductPress: openProduct } as const;

  return (
    <ScrollView style={{ backgroundColor: colors.paper }}>
      <View style={{ aspectRatio: 4 / 5, backgroundColor: colors.sand }}>
        {product.imageUrl ? <Image source={{ uri: product.imageUrl }} style={{ width: '100%', height: '100%' }} /> : null}
      </View>
      <Section>
        <Pressable onPress={back} accessibilityRole="button">
          <Text style={[styles.muted, { marginBottom: 8 }]}>← Geri</Text>
        </Pressable>
        {product.brand ? <Text style={styles.brand}>{product.brand.toUpperCase()}</Text> : null}
        <Text style={{ fontSize: 22, fontWeight: '600', color: colors.ink }}>{product.title}</Text>
        <Text style={{ fontSize: 18, marginVertical: 8 }}>{formatPrice(product.price, product.currency)}</Text>
        <View style={{ gap: 8 }}>
          <Button label="Sepete ekle" onPress={() => add(product)} />
          <Button
            kind="outline"
            label={favourite ? '♥ Favorilerde' : '♡ Favorilere ekle'}
            onPress={() => {
              favourites.set(product.itemCode, !favourite);
              // The app's own heart reports the same `wishlist` event a card's heart does — an add only.
              if (!favourite) selwise.track('wishlist', { entityType: 'product', entityId: product.itemCode, productItemCode: product.itemCode });
            }}
          />
        </View>
      </Section>
      <SelwiseSlot {...points} slot="pdp-under-cart" />
      <Section>
        {product.description ? <Text style={styles.muted}>{product.description}</Text> : null}
      </Section>
      <SelwiseSlot {...points} slot="pdp-under-info" />
      {/* The merchant's own block for this product (a spec table, a size guide): HTML the SDK draws in a WebView. */}
      <SelwiseEnrichment code={product.itemCode} slot={ENRICHMENT_SLOT} style={{ marginHorizontal: 16 }} />
      <SelwiseSlot {...points} slot="pdp-bottom" />
    </ScrollView>
  );
}
