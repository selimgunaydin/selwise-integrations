/**
 * Selwise service worker — browser notifications.
 *
 * The merchant copies this file to the ROOT of their own domain. The scope of
 * a service worker cannot be wider than the directory it is served from, and a
 * notification has to be deliverable on any page of the site, so
 * `/selwise-sw.js` is the only location that works. Serving it from our CDN
 * would register it against OUR origin, where the merchant's site does not
 * live.
 *
 * It is deliberately tiny and does exactly two things: draw the notification a
 * push carries, and open the link when it is clicked. In particular it does
 * NOT intercept `fetch`. A service worker that touches fetch takes
 * responsibility for the merchant's whole site — their caching, their offline
 * behaviour, their release process — and the first thing a subtly wrong cache
 * does is serve yesterday's prices.
 */

/** Fallback text, so a malformed push still shows something a shopper can dismiss. */
var FALLBACK_TITLE = 'Yeni bir mesajınız var';

self.addEventListener('push', function (event) {
  var payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (error) {
    // A push whose body is not our JSON is not ours, or is corrupt. Showing
    // SOMETHING is required: a push event that resolves without a notification
    // makes the browser show its own "This site has been updated in the
    // background" message, which is worse than a generic line of our own.
    payload = {};
  }

  var title = payload.title || FALLBACK_TITLE;
  var options = {
    body: payload.body || '',
    icon: payload.icon || undefined,
    badge: payload.badge || undefined,
    requireInteraction: payload.requireInteraction === true,
    // The URL travels in `data` rather than in the notification body, so the
    // click handler can read it without parsing anything the shopper sees.
    data: { url: payload.url || null },
    // One tag per push means a browser that was offline shows the pile;
    // Selwise sets `topic` on the send instead, which the push SERVICE
    // collapses before it ever reaches here.
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  var url = event.notification.data && event.notification.data.url;
  if (!url) return;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clients) {
      // Focus a tab that is already on the target rather than opening a second
      // one. A shopper who clicks a cart reminder and lands on a duplicate tab
      // of the cart they already had open loses whatever they typed in the
      // first.
      for (var i = 0; i < clients.length; i += 1) {
        if (clients[i].url === url && 'focus' in clients[i]) return clients[i].focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
      return undefined;
    }),
  );
});

/**
 * Take over immediately on install.
 *
 * Without these two a new version of this file waits for every tab of the site
 * to close, which on a storefront somebody keeps open is effectively never —
 * and a merchant who updates the file would have no way to tell whether it
 * took.
 */
self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});
