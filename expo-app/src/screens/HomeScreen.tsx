import { useEffect } from 'react';
import { ScrollView, Text } from 'react-native';
import { SelwiseSlot } from '@selwise/react-native/ui';
import { selwise } from '../selwise';
import { useNavigation } from '../navigation';
import { Section, styles } from '../ui';

/**
 * `app://home` — one stable synthetic name per screen; page targeting in the
 * panel uses it.
 *
 * A `SelwiseSlot` is a named point on the screen. The app mounts the points it
 * wants once; WHICH strip or campaign appears there is decided in the panel
 * (the strip's container, `[data-selwise-slot="home-top"]`), never in code. The
 * names a screen offers are the ones the panel's picker lists.
 */
export function HomeScreen() {
  const { openProduct } = useNavigation();
  useEffect(() => {
    selwise.trackScreenView('app://home');
  }, []);
  return (
    <ScrollView>
      <SelwiseSlot screen="app://home" slot="home-top" onProductPress={openProduct} />
      <Section>
        <Text style={{ fontSize: 28, fontWeight: '600' }}>Az ama iyi.</Text>
        <Text style={styles.muted}>Ardisa’nın uygulaması — Selwise ile kişiselleştirilmiş.</Text>
      </Section>
      <SelwiseSlot screen="app://home" slot="home-bottom" onProductPress={openProduct} />
    </ScrollView>
  );
}
