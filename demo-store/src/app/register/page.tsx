import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/store/auth';
import { AuthShell } from '@/components/auth/AuthShell';
import { selwiseConfig } from '@/lib/selwise/config';
import { RegisterForm } from './RegisterForm';

export const metadata: Metadata = { title: 'Üye Ol' };

export default function RegisterPage({ searchParams }: { searchParams: { next?: string } }) {
  const next = searchParams.next && searchParams.next.startsWith('/') ? searchParams.next : '/account';
  if (currentUser()) redirect(next);
  const cfg = selwiseConfig();
  return (
    <AuthShell title="Üye Ol" subtitle="Bir dakikada üye olun, ilk siparişinizde %10 indirim kazanın.">
      <RegisterForm next={next} siteKey={cfg.siteKey} apiUrl={cfg.apiUrl} />
    </AuthShell>
  );
}
