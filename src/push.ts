import type { User } from "firebase/auth";
import { getToken, onMessage } from "firebase/messaging";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db, getMessagingIfSupported } from "./firebase";

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;

let foregroundHandlerSet = false;

// The background service worker can't read Vite env vars, so we hand it the (public)
// Firebase config through the registration URL's query string.
const swConfigQuery = (): string =>
  new URLSearchParams({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? "",
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "",
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? "",
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "",
    appId: import.meta.env.VITE_FIREBASE_APP_ID ?? "",
  }).toString();

// Deterministic doc id per token keeps multiple devices per user without duplicates.
const hashToken = async (token: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

// Register this device for background push and store its FCM token. Safe to call
// repeatedly: getToken and the token document are idempotent, and the foreground
// message handler is wired up only once.
export const registerForPush = async (user: User): Promise<void> => {
  if (!VAPID_KEY || typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  const messaging = await getMessagingIfSupported();
  if (!messaging) {
    return;
  }

  const registration = await navigator.serviceWorker.register(
    `/firebase-messaging-sw.js?${swConfigQuery()}`,
  );

  const token = await getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: registration,
  });
  if (!token) {
    return;
  }

  await setDoc(doc(db, "pushTokens", await hashToken(token)), {
    uid: user.uid,
    token,
    updatedAt: serverTimestamp(),
  });

  if (!foregroundHandlerSet) {
    foregroundHandlerSet = true;
    onMessage(messaging, (payload) => {
      const title = payload.data?.title ?? "Foosball Matchmaker";
      const body = payload.data?.body ?? "A foosball match is ready.";
      void registration.showNotification(title, { body, tag: "foosball-match" });
    });
  }
};
