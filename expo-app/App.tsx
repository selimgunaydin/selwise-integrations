import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { SelwiseProvider } from '@selwise/react-native/react';
import { initSelwise, selwise } from './src/selwise';
import { StoreProvider, useStore } from './src/store';
import { ConsentSheet, restoreConsent } from './src/components/ConsentSheet';
import { HomeScreen } from './src/screens/HomeScreen';
import { SearchScreen } from './src/screens/SearchScreen';
import { ProductScreen } from './src/screens/ProductScreen';
import { CartScreen } from './src/screens/CartScreen';
import { AccountScreen } from './src/screens/AccountScreen';
import { colors } from './src/ui';

type Tab = 'home' | 'search' | 'cart' | 'account';
const TABS: Array<[Tab, string]> = [
  ['home', 'Ana sayfa'],
  ['search', 'Ara'],
  ['cart', 'Sepet'],
  ['account', 'Hesabım'],
];

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [askConsent, setAskConsent] = useState(false);

  useEffect(() => {
    initSelwise()
      .then(restoreConsent)
      .then((known) => {
        setAskConsent(!known);
        setReady(true);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }}>
        <StatusBar style="dark" />
        {error ? (
          <Text style={{ padding: 20, color: colors.sale }}>{error}</Text>
        ) : !ready ? (
          <ActivityIndicator style={{ marginTop: 80 }} />
        ) : (
          <SelwiseProvider client={selwise}>
            <StoreProvider>
              <Shell />
            </StoreProvider>
          </SelwiseProvider>
        )}
        {ready && askConsent ? <ConsentSheet onDone={() => setAskConsent(false)} /> : null}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function Shell() {
  const [tab, setTab] = useState<Tab>('home');
  const { open, itemCount } = useStore();
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        {open ? (
          <ProductScreen product={open} />
        ) : tab === 'home' ? (
          <HomeScreen />
        ) : tab === 'search' ? (
          <SearchScreen />
        ) : tab === 'cart' ? (
          <CartScreen />
        ) : (
          <AccountScreen />
        )}
      </View>
      <View style={{ flexDirection: 'row', borderTopWidth: 1, borderColor: colors.line, backgroundColor: '#fff' }}>
        {TABS.map(([key, label]) => (
          <Pressable key={key} onPress={() => setTab(key)} style={{ flex: 1, paddingVertical: 12, alignItems: 'center' }} accessibilityRole="tab">
            <Text style={{ color: tab === key && !open ? colors.ink : colors.muted, fontWeight: tab === key ? '600' : '400' }}>
              {label}
              {key === 'cart' && itemCount ? ` (${itemCount})` : ''}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
