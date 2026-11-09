import type { Metadata } from 'next';
import { requireUser } from '@/lib/account/server';
import { selwiseConfig } from '@/lib/selwise/config';
import { AccountHeading } from '@/components/account/AccountHeading';
import { PreferencesPanel } from '@/components/account/PreferencesPanel';

export const metadata: Metadata = { title: 'İletişim Tercihleri' };

export default function PreferencesPage() {
  const user = requireUser('/account/iletisim-tercihleri');
  // Only the two public values reach the client — never the SSR key.
  const { siteKey, apiUrl } = selwiseConfig();
  return (
    <div>
      <AccountHeading
        eyebrow="Hesabım"
        title="İletişim Tercihleri"
        description="Kampanya ve yeniliklerden hangi kanallarla haberdar olmak istediğinizi seçin. Sipariş ve kargo bilgilendirmeleri bu tercihlerden etkilenmez."
      />
      <PreferencesPanel
        siteKey={siteKey}
        apiUrl={apiUrl}
        email={user.email}
        phone={user.phone}
        fullName={`${user.first_name} ${user.last_name}`}
        initialEmail={!!user.email_opt_in}
        initialSms={!!user.sms_opt_in}
      />
    </div>
  );
}
