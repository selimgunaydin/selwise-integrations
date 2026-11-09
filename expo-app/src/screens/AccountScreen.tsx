import { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { selwise } from '../selwise';
import { useStore } from '../store';
import { Button, colors, Section, styles } from '../ui';

/**
 * Sign-in with SIGNED identity. The app's backend (the Ardisa store) signs
 * the customer id with the channel's identity secret and returns only the
 * signature; `selwise.identify(id, traits, { userHash, userHashTs })` hands it
 * over. Once the channel shows every identify as signed, it can be switched
 * to Enforce in the panel.
 */
export function AccountScreen() {
  const { customer, signIn, signOut } = useStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    selwise.trackScreenView('app://account');
  }, []);

  if (customer) {
    return (
      <Section title={`Merhaba ${customer.firstName}`}>
        <Text style={styles.muted}>Müşteri numarası: {customer.selwiseId}</Text>
        <Text style={[styles.muted, { marginTop: 4 }]}>
          Kimlik: {customer.selwiseIdHash ? `imzalı (${customer.selwiseIdHash.slice(0, 12)}…)` : 'imzasız — mağazada SELWISE_IDENTITY_SECRET yok'}
        </Text>
        <View style={{ marginTop: 16 }}>
          <Button kind="outline" label="Çıkış yap" onPress={() => void signOut()} />
        </View>
      </Section>
    );
  }

  return (
    <Section title="Giriş yap">
      <View style={{ gap: 10 }}>
        <TextInput value={email} onChangeText={setEmail} placeholder="E-posta" autoCapitalize="none" keyboardType="email-address" style={styles.input} />
        <TextInput value={password} onChangeText={setPassword} placeholder="Şifre" secureTextEntry style={styles.input} />
        {error ? <Text style={{ color: colors.sale }}>{error}</Text> : null}
        <Button
          label={busy ? 'Giriş yapılıyor…' : 'Giriş yap'}
          disabled={busy || !email || !password}
          onPress={async () => {
            setBusy(true);
            setError(await signIn(email, password));
            setBusy(false);
          }}
        />
        <Text style={styles.muted}>Hesabı Ardisa demo mağazasında açın; uygulama aynı mağazaya giriş yapar.</Text>
      </View>
    </Section>
  );
}
