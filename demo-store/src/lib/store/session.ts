import { currentUser, publicUser } from './auth';
import { loadCart, readCartId } from './cart';
import { db } from './db';

export function sessionSnapshot() {
  const user = currentUser();
  const cart = loadCart(readCartId());
  const favorites = user
    ? (db().prepare('SELECT code FROM favorites WHERE user_id = ? ORDER BY created_at DESC').all(user.id) as Array<{ code: string }>).map((r) => r.code)
    : [];
  return { user: publicUser(user), cart, favorites };
}
