import type { Metadata } from 'next';
import { requireUser } from '@/lib/account/server';
import { AccountHeading } from '@/components/account/AccountHeading';
import { PasswordForm } from '@/components/account/PasswordForm';

export const metadata: Metadata = { title: 'Şifre Değiştir' };

export default function PasswordPage() {
  requireUser('/account/sifre');
  return (
    <div>
      <AccountHeading
        eyebrow="Hesabım"
        title="Şifre Değiştir"
        description="Şifreniz değiştiğinde diğer cihazlardaki oturumlarınız kapatılır; bu cihazda oturumunuz açık kalır."
      />
      <PasswordForm />
    </div>
  );
}
