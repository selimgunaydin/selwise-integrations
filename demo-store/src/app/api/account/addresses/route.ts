import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/store/auth';
import { AddressSchema, addressError, createAddress, listAddresses } from '@/lib/account/server';

export const dynamic = 'force-dynamic';

const MAX_ADDRESSES = 20;

export function GET() {
  const user = currentUser();
  if (!user) return NextResponse.json({ error: 'Giriş yapmalısınız.' }, { status: 401 });
  return NextResponse.json({ addresses: listAddresses(user.id) });
}

export async function POST(req: Request) {
  const user = currentUser();
  if (!user) return NextResponse.json({ error: 'Giriş yapmalısınız.' }, { status: 401 });
  const parsed = AddressSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json(addressError(parsed.error.issues), { status: 400 });
  if (listAddresses(user.id).length >= MAX_ADDRESSES) {
    return NextResponse.json({ error: `En fazla ${MAX_ADDRESSES} adres kaydedebilirsiniz.` }, { status: 400 });
  }
  const address = createAddress(user.id, parsed.data);
  return NextResponse.json({ address, addresses: listAddresses(user.id) });
}
