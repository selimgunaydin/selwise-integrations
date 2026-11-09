import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { CURRENCY, formatPrice, selwise } from '../selwise';
import { useStore } from '../store';
import { Strips } from '../components/Strip';
import { Surfaces } from '../components/Surfaces';
import { Button, colors, Section, styles } from '../ui';

/**
 * The basket screen: campaigns that speak about the cart (a goal bar), a
 * "complete your basket" strip, and the order. `trackOrder` is AWAITED — a
 * lost order is lost attribution — and idempotent on `orderId`.
 */
export function CartScreen() {
  const { lines, total, itemCount, remove, clear, customer } = useStore();
  const [placed, setPlaced] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    selwise.trackScreenView('app://basket');
  }, []);

  const checkout = async () => {
    setBusy(true);
    const orderId = `APP-${Date.now()}`;
    const result = await selwise.trackOrder({
      orderId,
      total,
      currency: CURRENCY,
      items: lines.map((l) => ({ productItemCode: l.product.itemCode, name: l.product.title, quantity: l.qty, unitPrice: l.product.price })),
      ...(customer ? { siteUserId: customer.selwiseId } : {}),
    });
    setBusy(false);
    setPlaced(result.success ? orderId : `${orderId} (Selwise kaydı başarısız — tekrar denenebilir, aynı numara iki kez sayılmaz)`);
    clear();
  };

  return (
    <ScrollView>
      <Surfaces screen="app://basket" />
      <Section title={`Sepet (${itemCount})`}>
        {placed ? <Text style={{ color: colors.accent, marginBottom: 8 }}>Sipariş alındı: {placed}</Text> : null}
        {lines.length === 0 ? <Text style={styles.muted}>Sepetiniz boş.</Text> : null}
        {lines.map((l) => (
          <View key={l.product.itemCode} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderColor: colors.line }}>
            <Text style={{ flex: 1 }} numberOfLines={1}>
              {l.qty} × {l.product.title}
            </Text>
            <Text style={{ marginHorizontal: 8 }}>{formatPrice(l.product.price * l.qty)}</Text>
            <Text onPress={() => remove(l.product.itemCode)} style={{ color: colors.sale }} accessibilityRole="button">
              Çıkar
            </Text>
          </View>
        ))}
        {lines.length > 0 ? (
          <View style={{ marginTop: 12, gap: 8 }}>
            <Text style={{ fontSize: 16, fontWeight: '600' }}>Toplam {formatPrice(total)}</Text>
            <Button label={busy ? 'Gönderiliyor…' : 'Siparişi tamamla (demo)'} onPress={checkout} disabled={busy} />
          </View>
        ) : null}
      </Section>
      <Strips screen="app://basket" />
    </ScrollView>
  );
}
