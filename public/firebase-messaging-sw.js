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
messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {};
  self.registration.showNotification(data.title || "Foosball Matchmaker", {
    body: data.body || "A foosball match is ready.",
    tag: "foosball-match",
  });
});

// Focus an existing tab when the notification is clicked, or open the app.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow ? self.clients.openWindow("/") : undefined;
    }),
  );
});
