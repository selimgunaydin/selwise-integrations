'use client';

import { usePathname } from 'next/navigation';

/** Routes that are the store's own back office, not part of the storefront. */
const BACK_OFFICE = ['/demo-panel'];

/**
 * The storefront's frame (ribbon, header, footer) around a page — except on
 * the back-office routes, which draw their own. The frame is rendered by the
 * server and handed in as props, so hiding it costs nothing and the shopper
 * routes keep their server-rendered header.
 */
export function StoreChrome({ top, bottom, children }: { top: React.ReactNode; bottom: React.ReactNode; children: React.ReactNode }) {
  const pathname = usePathname() || '';
  const backOffice = BACK_OFFICE.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  return (
    <>
      {!backOffice && top}
      <main id="main">{children}</main>
      {!backOffice && bottom}
    </>
  );
}
