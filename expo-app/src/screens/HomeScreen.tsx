import { useEffect } from 'react';
import { ScrollView, Text } from 'react-native';
import { selwise } from '../selwise';
import { Strips } from '../components/Strip';
import { Surfaces } from '../components/Surfaces';
import { Section, styles } from '../ui';

/** `app://home` — one stable synthetic name per screen; page targeting in the panel uses it. */
export function HomeScreen() {
  useEffect(() => {
    selwise.trackScreenView('app://home');
  }, []);
  return (
    <ScrollView>
      <Surfaces screen="app://home" />
      <Section>
        <Text style={{ fontSize: 28, fontWeight: '600' }}>Az ama iyi.</Text>
        <Text style={styles.muted}>Ardisa’nın uygulaması — Selwise ile kişiselleştirilmiş.</Text>
      </Section>
      <Strips screen="app://home" />
    </ScrollView>
  );
}
