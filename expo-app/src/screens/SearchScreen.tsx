import { useEffect } from 'react';
import { View } from 'react-native';
import { SelwiseSearchPanel, SelwiseSlot } from '@selwise/react-native/ui';
import { selwise } from '../selwise';
import { useNavigation } from '../navigation';

/**
 * Search is the panel's own screen: the box, suggestions, recent searches,
 * results, filters and "did you mean" are what the merchant configured in the
 * dashboard (Search), drawn natively. Searches, clicks and adds are reported by
 * the panel; the app only says what a tap on a result does.
 */
export function SearchScreen() {
  const { openProduct } = useNavigation();

  useEffect(() => {
    selwise.trackScreenView('app://search');
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <SelwiseSearchPanel autoFocus={false} onProductPress={openProduct} style={{ flex: 1 }} />
      <SelwiseSlot screen="app://search" slot="search-bottom" onProductPress={openProduct} />
    </View>
  );
}
