/**
 * Where the store finds Selwise. Read at REQUEST time (never inlined at build),
 * so one image serves any channel: the site key is only known once the channel
 * exists, and re-provisioning the demo account must not need a rebuild.
 */
export function selwiseConfig() {
  return {
    siteKey: process.env.SELWISE_SITE_KEY || '',
    widgetUrl: process.env.SELWISE_WIDGET_URL || 'https://widget.selwise.com/client.js',
    apiUrl: (process.env.SELWISE_API_URL || 'https://api.selwise.com/api/v1').replace(/\/+$/, ''),
    ssrKey: process.env.SELWISE_SSR_API_KEY || '',
    dashboardUrl: process.env.SELWISE_DASHBOARD_URL || 'https://selwise.com/dashboard',
    publicUrl: (process.env.DEMO_STORE_PUBLIC_URL || 'https://demo.selwise.com').replace(/\/+$/, ''),
  };
}

export type SelwiseConfig = ReturnType<typeof selwiseConfig>;

/** The ten methods the install snippet's queue stub buffers until client.js arrives. */
export const QUEUED_METHODS = [
  'track',
  'trackOrder',
  'identify',
  'setTraits',
  'pushDataLayer',
  'grantConsent',
  'revokeConsent',
  'showConsentPreferences',
  'withdrawConsent',
  'endJourney',
];
