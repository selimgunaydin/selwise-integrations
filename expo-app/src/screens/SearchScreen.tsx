import { useEffect } from 'react';
import { FlatList, Text, TextInput, View } from 'react-native';
import { useSelwiseSearch } from '@selwise/react-native/react';
import { selwise } from '../selwise';
import { useStore } from '../store';
import { ProductCard, styles } from '../ui';

/**
 * Instant search over the Selwise product feed. `minChars` and the debounce
 * follow the channel's own setting (Search → Configuration → Behaviour), so
 * the app and the storefront search on the same keystrokes. `trackClick` is
 * what puts the query into click-through reporting.
 */
export function SearchScreen() {
  const { setOpen } = useStore();
  const { query, setQuery, hits, loading, isZeroResults, trackClick } = useSelwiseSearch({ limit: 20 });

  useEffect(() => {
    selwise.trackScreenView('app://search');
  }, []);

  return (
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Ürün ara: keten, sneaker, mum…"
        style={styles.input}
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel="Ürün ara"
      />
      {loading ? <Text style={styles.muted}>Aranıyor…</Text> : null}
      {isZeroResults ? <Text style={styles.muted}>“{query}” için sonuç yok.</Text> : null}
      <FlatList
        data={hits}
        numColumns={2}
        keyExtractor={(p) => p.itemCode}
        columnWrapperStyle={{ gap: 12 }}
        contentContainerStyle={{ gap: 16, paddingBottom: 24 }}
        renderItem={({ item, index }) => (
          <ProductCard
            product={item}
            width={160}
            onPress={() => {
              trackClick(item.itemCode, index);
              setOpen(item);
            }}
          />
        )}
      />
    </View>
  );
}
