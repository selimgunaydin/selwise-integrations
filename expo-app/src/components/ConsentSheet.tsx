import { useState } from 'react';
import { Modal, Switch, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { selwise } from '../selwise';
import { Button, colors, styles } from '../ui';

/**
 * The app's own consent sheet. The SDK starts with `consent: { granted: false }`
 * (src/selwise.ts) and holds every measuring event until this answers.
 * `analytics` covers what the shopper did (views, cart, search, orders,
 * identity); `marketing` what a Selwise surface did to them (impressions,
 * clicks, experiments, personal picks).
 */
const CONSENT_RECORD = 'ardisa_consent_v1';

export async function restoreConsent(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(CONSENT_RECORD);
  if (!raw) return false;
  const c = JSON.parse(raw) as { analytics: boolean; marketing: boolean };
  await selwise.setConsent({ granted: c.analytics || c.marketing, categories: { analytics: c.analytics, marketing: c.marketing } });
  return true;
}

export function ConsentSheet({ onDone }: { onDone: () => void }) {
  const [analytics, setAnalytics] = useState(true);
  const [marketing, setMarketing] = useState(false);

  const save = async (a: boolean, m: boolean) => {
    await AsyncStorage.setItem(CONSENT_RECORD, JSON.stringify({ analytics: a, marketing: m, at: Date.now() }));
    await selwise.setConsent({ granted: a || m, categories: { analytics: a, marketing: m } });
    onDone();
  };

  return (
    <Modal animationType="slide" transparent>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(31,29,26,0.4)' }}>
        <View style={{ backgroundColor: '#fff', padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20, gap: 12 }}>
          <Text style={{ fontSize: 20, fontWeight: '600', color: colors.ink }}>Gizlilik tercihleri</Text>
          <Text style={styles.muted}>Ardisa, uygulamayı iyileştirmek ve size özel öneriler göstermek için Selwise kullanır.</Text>
          <Row label="Analiz" hint="Baktığınız ürünler, sepet ve siparişler" value={analytics} onChange={setAnalytics} />
          <Row label="Pazarlama" hint="Size özel öneriler, kampanyalar ve A/B testleri" value={marketing} onChange={setMarketing} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Button kind="outline" label="Reddet" onPress={() => save(false, false)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Kaydet" onPress={() => save(analytics, marketing)} />
            </View>
          </View>
          <Button kind="outline" label="Tümünü kabul et" onPress={() => save(true, true)} />
        </View>
      </View>
    </Modal>
  );
}

function Row({ label, hint, value, onChange }: { label: string; hint: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, color: colors.ink }}>{label}</Text>
        <Text style={styles.muted}>{hint}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}
