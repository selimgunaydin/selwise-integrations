import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { CURRENCY, formatPrice, selwise } from '../selwise';
import { useStore } from '../store';
import { SelwiseEnrichment, SelwiseSlot } from '@selwise/react-native/ui';
import { useNavigation } from '../navigation';
import { Button, colors, Section, styles } from '../ui';

/**
 * The basket screen: campaigns that speak about the cart (a goal bar, drawn by
 * the overlay in App.tsx), the points a "complete your basket" strip can go to,
 * and the order. `trackOrder` is AWAITED — a
 * lost order is lost attribution — and idempotent on `orderId`.
 */
export function CartScreen() {
  const { lines, total, itemCount, remove, clear, customer } = useStore();
  const { openProduct } = useNavigation();
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
        <SelwiseSlot screen="app://basket" slot="basket-under-items" onProductPress={openProduct} />
        {lines.length > 0 ? (
          <View style={{ marginTop: 12, gap: 8 }}>
            <Text style={{ fontSize: 16, fontWeight: '600' }}>Toplam {formatPrice(total)}</Text>
            <Button label={busy ? 'Gönderiliyor…' : 'Siparişi tamamla (demo)'} onPress={checkout} disabled={busy} />
          </View>
        ) : null}
      </Section>
      {/* A merchant's shipping note, placed by name in the panel; it needs a product to read, so the first line's. */}
      {lines[0] ? <SelwiseEnrichment code={lines[0].product.itemCode} slot="basket-shipping" style={{ marginHorizontal: 16 }} /> : null}
      <SelwiseSlot screen="app://basket" slot="basket-bottom" onProductPress={openProduct} />
    </ScrollView>
  );
}
