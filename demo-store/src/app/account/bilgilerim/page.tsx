import type { Metadata } from 'next';
import { requireUser } from '@/lib/account/server';
import { AccountHeading } from '@/components/account/AccountHeading';
import { ProfileForm } from '@/components/account/ProfileForm';

export const metadata: Metadata = { title: 'Kullanıcı Bilgilerim' };

export default function ProfilePage() {
  const user = requireUser('/account/bilgilerim');
  return (
    <div>
      <AccountHeading eyebrow="Hesabım" title="Kullanıcı Bilgilerim" description="Doğum gününüzü eklerseniz size özel bir sürprizimiz olabilir." />
      <ProfileForm
        initial={{
          firstName: user.first_name,
          lastName: user.last_name,
          email: user.email,
          phone: user.phone || '',
          birthday: user.birthday || '',
          gender: user.gender || '',
        }}
      />
    </div>
  );
}
