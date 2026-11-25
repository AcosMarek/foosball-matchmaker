import { cert, getApps, initializeApp, type App } from "firebase-admin/app";

// Admin SDK set-up and caller verification for the serverless functions. api/send.ts and
// api/recap.ts predate this file and keep their own copies of the same few lines.
//
// Env vars:
//   FIREBASE_SERVICE_ACCOUNT  — the service account JSON (required, secret)
//   FIREBASE_API_KEY          — public web API key (optional; falls back to the value below)

// Public Firebase web API key — safe to expose (it already ships in the client bundle).
// Used only to verify caller ID tokens via the Identity Toolkit REST API, which keeps the
// functions off firebase-admin/auth (whose jwks-rsa -> jose chain is ESM-only and crashes
// the serverless bundler).
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY ?? "AIzaSyBzLwuCHUzvcnQm8rapD-0lEGOb0qtFsSs";

// Initialized lazily, inside the request, so a misconfigured credential surfaces as a
// clean 500 instead of crashing the module load.
export const ensureApp = (): App =>
  getApps()[0] ??
  initializeApp({
    credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT ?? "{}")),
  });

// Verifies a Firebase ID token: Google validates it (signature and expiry) and returns
// the account only when it is genuine. Resolves to the caller's uid, or null.
export const verifyIdToken = async (idToken: string): Promise<string | null> => {
  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      },
    );
    if (!response.ok) {
      return null;
    }

    const body = (await response.json()) as { users?: { localId?: unknown }[] };
    const uid = body.users?.[0]?.localId;

    return typeof uid === "string" && uid ? uid : null;
  } catch {
    return null;
  }
};
