import { NextResponse } from 'next/server';
import { z } from 'zod';
import { currentUser } from '@/lib/store/auth';
import { AddressSchema, addressError, deleteAddress, listAddresses, setDefaultAddress, updateAddress } from '@/lib/account/server';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

function auth(params: Ctx['params']) {
  const user = currentUser();
  if (!user) return { error: NextResponse.json({ error: 'Giriş yapmalısınız.' }, { status: 401 }) };
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return { error: NextResponse.json({ error: 'Geçersiz adres.' }, { status: 400 }) };
  return { user, id };
}

const notFound = () => NextResponse.json({ error: 'Adres bulunamadı.' }, { status: 404 });

export async function PUT(req: Request, { params }: Ctx) {
  const a = auth(params);
  if (a.error) return a.error;
  const parsed = AddressSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json(addressError(parsed.error.issues), { status: 400 });
  const address = updateAddress(a.user.id, a.id, parsed.data);
  if (!address) return notFound();
  return NextResponse.json({ address, addresses: listAddresses(a.user.id) });
}

export function DELETE(_req: Request, { params }: Ctx) {
  const a = auth(params);
  if (a.error) return a.error;
  if (!deleteAddress(a.user.id, a.id)) return notFound();
  return NextResponse.json({ ok: true, addresses: listAddresses(a.user.id) });
}

const PatchBody = z.object({ default: z.literal(true) });

export async function PATCH(req: Request, { params }: Ctx) {
  const a = auth(params);
  if (a.error) return a.error;
  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Geçersiz istek.' }, { status: 400 });
  if (!setDefaultAddress(a.user.id, a.id)) return notFound();
  return NextResponse.json({ ok: true, addresses: listAddresses(a.user.id) });
}
