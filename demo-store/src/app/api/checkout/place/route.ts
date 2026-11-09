import { NextResponse } from 'next/server';
import { z } from 'zod';
import { currentUser } from '@/lib/store/auth';
import { readCartId } from '@/lib/store/cart';
import { placeOrder } from '@/lib/store/orders';
import { db, nowIso } from '@/lib/store/db';
import { PICKUP_STORES } from '@/lib/pickup-stores';

const Address = z.object({
  title: z.string().max(40).optional(),
  firstName: z.string().min(1).max(40),
  lastName: z.string().min(1).max(40),
  phone: z.string().min(10).max(16),
  city: z.string().min(1),
  district: z.string().min(1),
  line: z.string().min(5).max(200),
  postcode: z.string().max(10).optional(),
});

const Body = z.object({
  email: z.string().email(),
  delivery: z.enum(['address', 'store']),
  storeId: z.string().optional(),
  shippingAddress: Address,
  billingAddress: Address,
  corporate: z.object({ company: z.string().min(2), taxNo: z.string().min(10).max(11), taxOffice: z.string().min(2) }).nullable().optional(),
  shippingMethod: z.enum(['standard', 'express', 'store']),
  paymentMethod: z.enum(['card', 'transfer', 'cod']),
  installments: z.number().int().min(1).max(12),
  card: z.object({ last4: z.string().length(4), brand: z.string() }).optional(),
  threeDsCode: z.string().optional(),
  marketingEmail: z.boolean(),
  marketingSms: z.boolean(),
  visitorId: z.string().max(80).optional(),
  agreements: z.literal(true),
  saveAddress: z.boolean().optional(),
});

/** The demo bank's one-time code. Shown on the 3-D Secure page. */
const DEMO_OTP = '123456';

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Lütfen ödeme ve teslimat bilgilerinizi kontrol edin.', issues: parsed.error.issues.slice(0, 3) }, { status: 400 });
  }
  const d = parsed.data;
  if (d.paymentMethod === 'card' && d.threeDsCode !== DEMO_OTP) {
    return NextResponse.json({ error: 'Doğrulama kodu hatalı. Ödeme tamamlanamadı.' }, { status: 402 });
  }
  const cartId = readCartId();
  if (!cartId) return NextResponse.json({ error: 'Sepetiniz boş.' }, { status: 400 });
  const user = currentUser();
  const store = d.delivery === 'store' ? PICKUP_STORES.find((s) => s.id === d.storeId) : undefined;
  try {
    const order = placeOrder({
      cartId,
      user,
      email: d.email,
      shippingAddress: store ? { ...d.shippingAddress, city: store.city, district: store.district, line: `${store.name} — ${store.line}`, store: store.name } : d.shippingAddress,
      billingAddress: { ...d.billingAddress, ...(d.corporate ? { corporate: d.corporate } : {}) },
      shippingMethod: d.delivery === 'store' ? 'store' : d.shippingMethod,
      paymentMethod: d.paymentMethod,
      installments: d.paymentMethod === 'card' ? d.installments : 1,
      marketingEmail: d.marketingEmail,
      marketingSms: d.marketingSms,
      visitorId: d.visitorId,
    });
    if (user && d.saveAddress && d.delivery === 'address') {
      const a = d.shippingAddress;
      const has = db().prepare('SELECT COUNT(*) as n FROM addresses WHERE user_id = ?').get(user.id) as { n: number };
      db()
        .prepare(
          'INSERT INTO addresses (user_id, title, first_name, last_name, phone, city, district, line, postcode, is_default, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(user.id, a.title || 'Ev', a.firstName, a.lastName, a.phone, a.city, a.district, a.line, a.postcode || null, has.n === 0 ? 1 : 0, nowIso());
    }
    if (user && (d.marketingEmail || d.marketingSms)) {
      db()
        .prepare('UPDATE users SET email_opt_in = MAX(email_opt_in, ?), sms_opt_in = MAX(sms_opt_in, ?) WHERE id = ?')
        .run(d.marketingEmail ? 1 : 0, d.marketingSms ? 1 : 0, user.id);
    }
    return NextResponse.json({ token: order.token, number: order.number });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }
}
