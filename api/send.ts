import type { VercelRequest, VercelResponse } from "@vercel/node";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getMessaging, type Messaging } from "firebase-admin/messaging";

// Deploy target: a free serverless host (e.g. Vercel Hobby). Env vars:
//   FIREBASE_SERVICE_ACCOUNT  — the service account JSON (required, secret)
//   ALLOWED_ORIGIN            — the app origin allowed to call this endpoint
//   FIREBASE_API_KEY          — public web API key (optional; falls back to the value below)
const allowedOrigin = process.env.ALLOWED_ORIGIN ?? "*";

// Public Firebase web API key — safe to expose (it already ships in the client bundle).
// Used only to verify caller ID tokens via the Identity Toolkit REST API, which keeps
// this function off firebase-admin/auth (whose jwks-rsa -> jose chain is ESM-only and
// crashes the serverless bundler).
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY ?? "AIzaSyBzLwuCHUzvcnQm8rapD-0lEGOb0qtFsSs";

// Initialize lazily inside the request so a misconfigured credential surfaces as a
// clean 500 instead of crashing the module load (an opaque FUNCTION_INVOCATION_FAILED).
const ensureApp = () =>
  getApps()[0] ??
  initializeApp({
    credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT ?? "{}")),
  });

// Verify a Firebase ID token without firebase-admin/auth: Google validates the token
// (signature + expiry) and returns 200 only when it is genuine.
const isValidIdToken = async (idToken: string): Promise<boolean> => {
  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      },
    );
    return response.ok;
  } catch {
    return false;
  }
};

const MAX_RECIPIENTS = 8;
const MAX_MESSAGE_LENGTH = 200;

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { idToken, recipients, message } = (req.body ?? {}) as {
    idToken?: unknown;
    recipients?: unknown;
    message?: unknown;
  };

  if (typeof idToken !== "string" || !Array.isArray(recipients) || typeof message !== "string") {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }

  let db: Firestore;
  let messaging: Messaging;
  try {
    const app = ensureApp();
    db = getFirestore(app);
    messaging = getMessaging(app);
  } catch (err) {
    console.error("send: init failed", err);
    res.status(500).json({ error: "Push service not configured" });
    return;
  }

  // Authn: the caller must present a valid Firebase ID token. This stops the endpoint
  // from being an open relay; recipient tokens are then resolved server-side only.
  if (!(await isValidIdToken(idToken))) {
    console.warn("send: unauthorized (invalid id token)");
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const uids = recipients
    .filter((uid): uid is string => typeof uid === "string")
    .slice(0, MAX_RECIPIENTS);
  const body = message.slice(0, MAX_MESSAGE_LENGTH);
  if (uids.length === 0) {
    res.status(200).json({ sent: 0 });
    return;
  }

  try {
    const snapshot = await db.collection("pushTokens").where("uid", "in", uids).get();
    const tokens = snapshot.docs
      .map((document): unknown => document.get("token"))
      .filter((token): token is string => typeof token === "string");

    console.log(`send: ${uids.length} recipient(s), ${tokens.length} token(s)`);
    if (tokens.length === 0) {
      res.status(200).json({ sent: 0 });
      return;
    }

    const response = await messaging.sendEachForMulticast({
      tokens,
      data: { title: "Foosball Matchmaker", body },
    });

    console.log(`send: delivered ${response.successCount}/${tokens.length}`);
    if (response.failureCount > 0) {
      console.error(
        "send: failures",
        response.responses.map((r, i) => (r.success ? null : `${i}:${r.error?.code}`)).filter(Boolean),
      );
    }
    res.status(200).json({ sent: response.successCount });
  } catch (err) {
    console.error("send: failed", err);
    res.status(500).json({ error: "Send failed" });
  }
}
