import type { Metadata, Viewport } from 'next';
import './globals.css';
import { SelwiseHead } from '@/components/selwise/SelwiseHead';
import { SelwiseLayoutRoom } from '@/components/selwise/SelwiseLayoutRoom';
import { StoreProvider } from '@/components/Providers';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { DemoRibbon } from '@/components/layout/DemoRibbon';
import { StoreChrome } from '@/components/layout/StoreChrome';
import { buildMenu } from '@/components/layout/menu';
import { Identify } from '@/components/selwise/Identify';
import { sessionSnapshot } from '@/lib/store/session';
import { StoreConsentBanner } from '@/components/selwise/StoreConsentBanner';
import { consentUiMode, storeLocale } from '@/lib/selwise/locale';

export const metadata: Metadata = {
  title: { default: 'Ardisa — Giyim, Ev ve Bakım', template: '%s | Ardisa' },
  description: 'Ardisa, Selwise\'ın demo mağazasıdır: giyim, ayakkabı, aksesuar, kozmetik ve ev ürünleri.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#FAF8F4' };

// Every page reads the shopper's cookies (basket, session), so nothing is prerendered.
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const snap = sessionSnapshot();
  const consentUi = consentUiMode();
  return (
    <html lang={storeLocale()} data-consent-ui={consentUi} suppressHydrationWarning>
      <head>
        <SelwiseHead />
      </head>
      <body className="min-h-screen font-sans">
        <StoreProvider initialUser={snap.user} initialCart={snap.cart} initialFavorites={snap.favorites}>
          <StoreChrome
            top={
              <>
                <DemoRibbon />
                <Header menu={buildMenu()} />
              </>
            }
            bottom={<Footer />}
          >
            {children}
          </StoreChrome>
          <Identify />
          <SelwiseLayoutRoom />
          {consentUi === 'store' && <StoreConsentBanner />}
        </StoreProvider>
      </body>
    </html>
  );
}
