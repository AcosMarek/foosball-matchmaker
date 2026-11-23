/* Foosball Matchmaker — background push handler (Firebase Cloud Messaging).
   The Firebase web config is passed as query params at registration time
   (every value is public, so this is safe to ship as a static file). */
importScripts("https://www.gstatic.com/firebasejs/12.14.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.14.0/firebase-messaging-compat.js");

const params = new URLSearchParams(self.location.search);

firebase.initializeApp({
  apiKey: params.get("apiKey"),
  authDomain: params.get("authDomain"),
  projectId: params.get("projectId"),
  storageBucket: params.get("storageBucket"),
  messagingSenderId: params.get("messagingSenderId"),
  appId: params.get("appId"),
});

const messaging = firebase.messaging();

// We send data-only messages, so the browser never auto-displays them — we render
// the notification here, giving us one consistent code path for background delivery.
// `renotify` makes a newer alert buzz again when it replaces one still sitting in the tray
// under the same tag (e.g. "Game on!" landing on top of "match started"). Mirrors the
// foreground handler in src/push.ts.
messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {};
  return self.registration.showNotification(data.title || "Foosball Matchmaker", {
    body: data.body || "A foosball match is ready.",
    tag: "foosball-match",
    renotify: true,
    data: { url: data.tableCode ? `/?table=${encodeURIComponent(data.tableCode)}` : "/" },
  });
});

// Focus an existing tab when the notification is clicked, or open the app on the table
// the alert came from.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow ? self.clients.openWindow(url) : undefined;
    }),
  );
});
