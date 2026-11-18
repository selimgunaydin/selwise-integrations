import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { SelwiseSurfaces } from '@selwise/react-native/ui';
import { initSelwise } from './src/selwise';
import { ArdisaSelwiseProvider } from './src/host';
import { NavigationProvider, useNavigation, type Tab } from './src/navigation';
import { listenToPush, syncPush } from './src/push';
import { StoreProvider, useStore } from './src/store';
import { ConsentSheet, restoreConsent } from './src/components/ConsentSheet';
import { HomeScreen } from './src/screens/HomeScreen';
import { SearchScreen } from './src/screens/SearchScreen';
import { ProductScreen } from './src/screens/ProductScreen';
import { CartScreen } from './src/screens/CartScreen';
import { AccountScreen } from './src/screens/AccountScreen';
import { colors } from './src/ui';

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
        // A person who already agreed: register the phone for notifications again, silently.
        if (known) void syncPush();
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
          <NavigationProvider>
            <StoreProvider>
              {/* One provider connects every Selwise component to this app: its basket, its navigation, its WebView. */}
              <ArdisaSelwiseProvider>
                <Shell />
              </ArdisaSelwiseProvider>
            </StoreProvider>
          </NavigationProvider>
        )}
        {ready && askConsent ? <ConsentSheet onDone={() => setAskConsent(false)} /> : null}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function Shell() {
  const { tab, product, goTo, openLink } = useNavigation();
  const { itemCount } = useStore();

  // A tap on a Selwise notification opens the screen it points at.
  useEffect(() => listenToPush(openLink), [openLink]);

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        {product ? (
          <ProductScreen product={product} />
        ) : tab === 'home' ? (
          <HomeScreen />
        ) : tab === 'search' ? (
          <SearchScreen />
        ) : tab === 'cart' ? (
          <CartScreen />
        ) : (
          <AccountScreen />
        )}
        {/*
          Campaigns — an announcement bar, a pop-up, a goal bar, a floating button —
          are drawn by ONE overlay over the screen. It follows the screen the app
          names (`trackScreenView`), so launching a campaign never needs a release.
          It sits above the tab bar, which is not part of it.
        */}
        <SelwiseSurfaces />
      </View>
      <View style={{ flexDirection: 'row', borderTopWidth: 1, borderColor: colors.line, backgroundColor: '#fff' }}>
        {TABS.map(([key, label]) => (
          <Pressable key={key} onPress={() => goTo(key)} style={{ flex: 1, paddingVertical: 12, alignItems: 'center' }} accessibilityRole="tab">
            <Text style={{ color: tab === key && !product ? colors.ink : colors.muted, fontWeight: tab === key ? '600' : '400' }}>
              {label}
              {key === 'cart' && itemCount ? ` (${itemCount})` : ''}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
