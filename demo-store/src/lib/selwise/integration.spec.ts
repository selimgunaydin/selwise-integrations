/**
 * The parts of the integration this store adds on top of the widget: the
 * signed identity, the import files and the English language feed's words.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { signSelwiseIdentity } from './identity';
import { customerIdOf, importStatus, normalizePhone, toImportOrder, toImportUser } from './history-export';
import { PRODUCTS } from '../catalog';
import { englishProduct, missingEnglishNames } from '../catalog/en';

test('the identity signature is HMAC-SHA256 of "<id>:<unix seconds>" and needs the secret', () => {
  const prev = process.env.SELWISE_IDENTITY_SECRET;
  try {
    delete process.env.SELWISE_IDENTITY_SECRET;
    assert.equal(signSelwiseIdentity('ardisa-7'), null);

    process.env.SELWISE_IDENTITY_SECRET = 'test-secret';
    const sig = signSelwiseIdentity('ardisa-7', 1_792_700_000_123);
    assert.ok(sig);
    assert.equal(sig.userHashTs, 1_792_700_000, 'seconds, not milliseconds — a millisecond stamp is rejected');
    const expected = crypto.createHmac('sha256', 'test-secret').update('ardisa-7:1792700000').digest('hex');
    assert.equal(sig.userHash, expected);
    assert.match(sig.userHash, /^[0-9a-f]{64}$/, 'the widget drops a hash that is not 64 hex characters');
  } finally {
    if (prev === undefined) delete process.env.SELWISE_IDENTITY_SECRET;
    else process.env.SELWISE_IDENTITY_SECRET = prev;
  }
});

test('an imported customer carries the id the storefront identifies with', () => {
  const user = toImportUser({
    id: 42,
    email: 'deniz@example.com',
    first_name: 'Deniz',
    last_name: 'Kaya',
    phone: '0532 111 22 33',
    birthday: '1991-04-02',
    gender: 'female',
    email_opt_in: 1,
    sms_opt_in: 0,
    loyalty_points: 820,
    created_at: '2025-03-01T10:00:00.000Z',
  });
  assert.equal(user.customerId, customerIdOf(42));
  assert.equal(user.customerId, 'ardisa-42');
  assert.equal(user.phone, '+905321112233');
  assert.equal(user.traits.loyalty_tier, 'silver');
  assert.deepEqual(user.consent.email, { optIn: true, at: '2025-03-01T10:00:00.000Z', source: 'üyelik', evidence: 'Ardisa üyelik formu, iletişim izni kutusu' });
  assert.equal(user.consent.sms?.optIn, false);
});

test('a phone that is not a Turkish mobile is left out, not guessed', () => {
  assert.equal(normalizePhone('+90 532 111 22 33'), '+905321112233');
  assert.equal(normalizePhone('5321112233'), '+905321112233');
  assert.equal(normalizePhone('0212 111 22 33'), undefined);
  assert.equal(normalizePhone(null), undefined);
});

test('an imported order keeps its own time, its lines and an English status word', () => {
  const order = toImportOrder({
    number: 'AR-100231',
    user_id: null,
    email: 'misafir@example.com',
    status: 'returned',
    subtotal: 1500,
    discount_total: 150,
    shipping_total: 0,
    total: 1350,
    coupon_code: 'HOSGELDIN10',
    shipping_method: 'standard',
    payment_method: 'card',
    items: JSON.stringify([{ code: 'AR1001-SIYAH', title: 'Keten Midi Elbise Siyah', qty: 2, price: 750, lineTotal: 1500 }]),
    created_at: '2025-11-03T11:22:09.000Z',
  });
  assert.equal(order.placedAt, '2025-11-03T11:22:09.000Z');
  assert.equal(order.status, 'returned', 'a returned order must not be counted as revenue');
  assert.equal('customerId' in order, false);
  assert.equal('email' in order && order.email, 'misafir@example.com', 'a guest order is matched by e-mail');
  assert.deepEqual(order.items[0], { productItemCode: 'AR1001-SIYAH', name: 'Keten Midi Elbise Siyah', quantity: 2, unitPrice: 750, totalPrice: 1500 });
  assert.equal(importStatus('return_requested'), 'delivered', 'a return request is still a sale');
  assert.equal(importStatus('cancelled'), 'cancelled');
});

test('every catalogue name has an English word, so the language feed never mixes languages', () => {
  assert.deepEqual(missingEnglishNames(PRODUCTS), []);
  const en = englishProduct(PRODUCTS[0]);
  assert.notEqual(en.title, PRODUCTS[0].title);
});
