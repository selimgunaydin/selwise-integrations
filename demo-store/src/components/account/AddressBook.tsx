'use client';

import { useState } from 'react';
import { MapPin, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { useStore } from '../Providers';
import { Modal } from '../ui/Modal';
import { AccountHeading, EmptyState } from './AccountHeading';
import { TR_CITIES, formatPhone as displayPhone } from '@/lib/account/shared';
import { DEMO_ADDRESS } from '@/lib/checkout/demo-data';

export interface AddressView {
  id: number;
  title: string;
  firstName: string;
  lastName: string;
  phone: string;
  city: string;
  district: string;
  line: string;
  postcode: string | null;
  isDefault: boolean;
}

interface FormState {
  title: string;
  firstName: string;
  lastName: string;
  phone: string;
  city: string;
  district: string;
  line: string;
  postcode: string;
  isDefault: boolean;
}

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }).catch(() => null);
  const data = res ? await res.json().catch(() => ({})) : {};
  if (!res || !res.ok) throw Object.assign(new Error(data?.error || 'İşlem tamamlanamadı, lütfen tekrar deneyin.'), { field: data?.field as string | undefined });
  return data as { addresses: AddressView[] };
}

export function AddressBook({ initial, defaults }: { initial: AddressView[]; defaults: { firstName: string; lastName: string; phone: string } }) {
  const { toast } = useStore();
  const [list, setList] = useState(initial);
  const [editing, setEditing] = useState<AddressView | 'new' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AddressView | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const remove = async (a: AddressView) => {
    setBusyId(a.id);
    try {
      const data = await call(`/api/account/addresses/${a.id}`, 'DELETE');
      setList(data.addresses);
      toast('Adres silindi.');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusyId(null);
      setConfirmDelete(null);
    }
  };

  const makeDefault = async (a: AddressView) => {
    setBusyId(a.id);
    try {
      const data = await call(`/api/account/addresses/${a.id}`, 'PATCH', { default: true });
      setList(data.addresses);
      toast(`"${a.title}" varsayılan adresiniz oldu.`);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <AccountHeading
        eyebrow="Hesabım"
        title="Adreslerim"
        description="Kayıtlı adresleriniz ödeme adımında otomatik olarak listelenir."
        action={
          list.length > 0 && (
            <button type="button" className="btn-primary btn-sm" onClick={() => setEditing('new')}>
              <Plus size={14} /> Yeni Adres Ekle
            </button>
          )
        }
      />

      {list.length === 0 ? (
        <EmptyState
          icon={<MapPin size={24} strokeWidth={1.6} />}
          title="Kayıtlı adresiniz yok"
          text="Adres ekleyerek sonraki siparişlerinizi daha hızlı tamamlayabilirsiniz."
          action={
            <button type="button" className="btn-primary" onClick={() => setEditing('new')}>
              <Plus size={16} /> Adres Ekle
            </button>
          }
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {list.map((a) => (
            <li key={a.id} className={`card flex flex-col p-5 ${a.isDefault ? 'border-ink/60' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium">{a.title}</p>
                {a.isDefault && <span className="rounded-full bg-ink px-2.5 py-1 text-2xs font-semibold text-paper">Varsayılan</span>}
              </div>
              <div className="mt-3 flex-1 space-y-0.5 text-sm text-ink-soft">
                <p className="text-ink">
                  {a.firstName} {a.lastName}
                </p>
                <p>{a.line}</p>
                <p>
                  {a.district} / {a.city} {a.postcode || ''}
                </p>
                <p>{displayPhone(a.phone)}</p>
              </div>
              <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
                <button type="button" className="btn-ghost btn-sm px-3" onClick={() => setEditing(a)} disabled={busyId === a.id}>
                  <Pencil size={13} /> Düzenle
                </button>
                <button type="button" className="btn-ghost btn-sm px-3" onClick={() => setConfirmDelete(a)} disabled={busyId === a.id}>
                  <Trash2 size={13} /> Sil
                </button>
                {!a.isDefault && (
                  <button type="button" className="btn-ghost btn-sm ml-auto px-3" onClick={() => makeDefault(a)} disabled={busyId === a.id}>
                    <Star size={13} /> Varsayılan yap
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <AddressModal
          address={editing === 'new' ? null : editing}
          defaults={defaults}
          firstAddress={list.length === 0}
          onClose={() => setEditing(null)}
          onSaved={(next, created) => {
            setList(next);
            setEditing(null);
            toast(created ? 'Adres eklendi.' : 'Adres güncellendi.');
          }}
        />
      )}

      {confirmDelete && (
        <Modal title="Adresi sil" onClose={() => setConfirmDelete(null)}>
          <p className="text-sm text-ink-soft">
            <strong className="text-ink">{confirmDelete.title}</strong> adresini silmek istediğinize emin misiniz? Bu işlem geri alınamaz.
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <button type="button" className="btn-ghost btn-sm" onClick={() => setConfirmDelete(null)}>
              Vazgeç
            </button>
            <button type="button" className="btn-accent btn-sm" onClick={() => remove(confirmDelete)} disabled={busyId === confirmDelete.id}>
              {busyId === confirmDelete.id ? 'Siliniyor…' : 'Sil'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function AddressModal({
  address,
  defaults,
  firstAddress,
  onClose,
  onSaved,
}: {
  address: AddressView | null;
  defaults: { firstName: string; lastName: string; phone: string };
  firstAddress: boolean;
  onClose: () => void;
  onSaved: (list: AddressView[], created: boolean) => void;
}) {
  const [f, setF] = useState<FormState>(() =>
    address
      ? {
          title: address.title,
          firstName: address.firstName,
          lastName: address.lastName,
          phone: displayPhone(address.phone),
          city: address.city,
          district: address.district,
          line: address.line,
          postcode: address.postcode || '',
          isDefault: address.isDefault,
        }
      : {
          title: firstAddress ? 'Ev' : '',
          firstName: defaults.firstName,
          lastName: defaults.lastName,
          phone: defaults.phone ? displayPhone(defaults.phone) : '',
          city: '',
          district: '',
          line: '',
          postcode: '',
          isDefault: firstAddress,
        },
  );
  const [error, setError] = useState<{ text: string; field?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((s) => ({ ...s, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }));
  const invalid = (k: keyof FormState) => (error?.field === k ? 'border-sale' : '');

  return (
    <Modal title={address ? 'Adresi düzenle' : 'Yeni adres'} onClose={onClose}>
      <form
        id="address-form"
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            const data = address
              ? await call(`/api/account/addresses/${address.id}`, 'PUT', f)
              : await call('/api/account/addresses', 'POST', f);
            onSaved(data.addresses, !address);
          } catch (err) {
            setError({ text: (err as Error).message, field: (err as { field?: string }).field });
            setBusy(false);
          }
        }}
      >
        {!address && (
          <div className="flex justify-end">
            <button
              type="button"
              className="btn-ghost btn-sm"
              id="use-demo-address"
              onClick={() =>
                setF((s) => ({
                  ...s,
                  title: s.title || DEMO_ADDRESS.title,
                  firstName: s.firstName || DEMO_ADDRESS.firstName,
                  lastName: s.lastName || DEMO_ADDRESS.lastName,
                  phone: s.phone || displayPhone(DEMO_ADDRESS.phone),
                  city: DEMO_ADDRESS.city,
                  district: DEMO_ADDRESS.district,
                  line: DEMO_ADDRESS.line,
                  postcode: DEMO_ADDRESS.postcode,
                }))
              }
            >
              Demo adresi kullan
            </button>
          </div>
        )}
        <div>
          <label className="label" htmlFor="addr-title">Adres başlığı</label>
          <input id="addr-title" required maxLength={40} value={f.title} onChange={set('title')} placeholder="Ev, İş…" className={`input ${invalid('title')}`} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="addr-first">Ad</label>
            <input id="addr-first" required value={f.firstName} onChange={set('firstName')} className={`input ${invalid('firstName')}`} autoComplete="given-name" />
          </div>
          <div>
            <label className="label" htmlFor="addr-last">Soyad</label>
            <input id="addr-last" required value={f.lastName} onChange={set('lastName')} className={`input ${invalid('lastName')}`} autoComplete="family-name" />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="addr-phone">Cep telefonu</label>
          <input id="addr-phone" type="tel" required value={f.phone} onChange={set('phone')} placeholder="05xx xxx xx xx" className={`input ${invalid('phone')}`} autoComplete="tel" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="addr-city">İl</label>
            <select id="addr-city" required value={f.city} onChange={set('city')} className={`input ${invalid('city')}`}>
              <option value="" disabled>
                Seçiniz
              </option>
              {TR_CITIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="addr-district">İlçe</label>
            <input id="addr-district" required value={f.district} onChange={set('district')} className={`input ${invalid('district')}`} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="addr-line">Açık adres</label>
          <textarea
            id="addr-line"
            required
            rows={3}
            maxLength={250}
            value={f.line}
            onChange={set('line')}
            placeholder="Mahalle, cadde/sokak, bina ve daire no"
            className={`input h-auto py-3 ${invalid('line')}`}
            autoComplete="street-address"
          />
        </div>
        <div className="grid grid-cols-2 items-end gap-3">
          <div>
            <label className="label" htmlFor="addr-postcode">
              Posta kodu <span className="text-ink-faint">(isteğe bağlı)</span>
            </label>
            <input
              id="addr-postcode"
              inputMode="numeric"
              maxLength={5}
              value={f.postcode}
              onChange={set('postcode')}
              className={`input ${invalid('postcode')}`}
              autoComplete="postal-code"
            />
          </div>
          <label className="flex h-12 items-center gap-2 text-sm text-ink-soft">
            <input type="checkbox" checked={f.isDefault} onChange={set('isDefault')} disabled={firstAddress || address?.isDefault} className="accent-ink" />
            Varsayılan adres
          </label>
        </div>
        {error && (
          <p className="rounded-lg bg-sale/10 px-4 py-3 text-sm text-sale" role="alert">
            {error.text}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn-primary" disabled={busy}>
            {busy ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
