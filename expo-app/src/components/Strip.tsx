import { useEffect, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { useRecommendationWidget } from '@selwise/react-native/react';
import type { RecommendationWidgetSummary } from '@selwise/react-native';
import { selwise } from '../selwise';
import { useStore } from '../store';
import { ProductCard, Section, styles } from '../ui';

/**
 * Every strip the panel targets at a screen (`app://home`, `app://product`…),
 * each drawn with the app's own card. Page targeting in the panel is written
 * against these screen names.
 */
export function Strips({ screen, currentProductId }: { screen: string; currentProductId?: string }) {
  const [widgets, setWidgets] = useState<RecommendationWidgetSummary[]>([]);
  useEffect(() => {
    let live = true;
    selwise
      .getRecommendationWidgets(screen)
      .then((w) => live && setWidgets(w))
      .catch(() => live && setWidgets([]));
    return () => {
      live = false;
    };
  }, [screen]);
  return (
    <>
      {widgets.map((w) => (
        <Strip key={w.id} widgetId={w.id} fallbackTitle={w.title || w.name || 'Öneriler'} currentProductId={currentProductId} />
      ))}
    </>
  );
}

function Strip({ widgetId, fallbackTitle, currentProductId }: { widgetId: string; fallbackTitle: string; currentProductId?: string }) {
  const { setOpen } = useStore();
  const { products, loading, widget, trackImpression, trackClick } = useRecommendationWidget(widgetId, { currentProductId });

  // Impression when the strip is drawn — once per mount; it also records an A/B arm's exposure.
  useEffect(() => {
    if (products.length > 0) trackImpression();
  }, [products, trackImpression]);

  if (loading || products.length === 0) return null;
  return (
    <Section title={widget?.title ?? fallbackTitle}>
      <FlatList
        horizontal
        data={products}
        keyExtractor={(p) => p.itemCode}
        ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
        showsHorizontalScrollIndicator={false}
        renderItem={({ item, index }) => (
          <ProductCard
            product={item}
            onPress={() => {
              // Required for attribution: without the click the strip earns no revenue.
              trackClick(item.itemCode, index);
              setOpen(item);
            }}
          />
        )}
      />
      {widget?.subtitle ? <Text style={[styles.muted, { marginTop: 6 }]}>{widget.subtitle}</Text> : null}
    </Section>
  );
}
