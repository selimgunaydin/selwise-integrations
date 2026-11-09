import type { ReactNode } from 'react';
import { currentUser } from '@/lib/store/auth';
import { AccountNav } from '@/components/account/AccountNav';

/**
 * The account shell. It does NOT redirect a signed-out visitor itself: a layout
 * does not know the URL, and each page redirects to /login with its own path
 * as `next` (`requireUser`), so a deep link survives the login.
 */
export default function AccountLayout({ children }: { children: ReactNode }) {
  const user = currentUser();
  if (!user) return <>{children}</>;
  return (
    <div className="container py-8 md:py-12" id="account">
      <div className="grid gap-6 lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-12">
        <AccountNav name={`${user.first_name} ${user.last_name}`} email={user.email} />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
