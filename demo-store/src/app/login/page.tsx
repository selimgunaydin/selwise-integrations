import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/store/auth';
import { AuthShell } from '@/components/auth/AuthShell';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'Giriş Yap' };

export default function LoginPage({ searchParams }: { searchParams: { next?: string; reason?: string } }) {
  const next = searchParams.next && searchParams.next.startsWith('/') ? searchParams.next : '/account';
  if (currentUser()) redirect(next);
  return (
    <AuthShell
      title="Giriş Yap"
      subtitle={searchParams.reason === 'favorite' ? 'Favorilerinize ürün eklemek için giriş yapın.' : 'Ardisa hesabınızla giriş yapın.'}
    >
      <LoginForm next={next} />
    </AuthShell>
  );
}
