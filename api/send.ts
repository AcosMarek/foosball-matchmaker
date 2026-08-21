import type { VercelRequest, VercelResponse } from "@vercel/node";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getMessaging, type Messaging } from "firebase-admin/messaging";
// The .js extension is required: package.json sets "type": "module", so the compiled
// function runs as ESM and Node will not resolve an extensionless relative import.
import { buildSlackPayload, parseRoster, type Roster } from "./_lib/slackMessage.js";

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
const TABLE_CODE_RE = /^[A-Z0-9]{6}$/;
const SLACK_WEBHOOK_PREFIX = "https://hooks.slack.com/services/";

// The allowed origin doubles as the app's public URL, so Slack posts can deep-link
// straight back into the table that raised them.
const appUrl = allowedOrigin.startsWith("https://") ? allowedOrigin.replace(/\/+$/, "") : "";

// Per-table webhooks are configured by admins and kept out of client reach in
// tableIntegrations/{tableCode}; the Admin SDK bypasses the rules that hide them.
const postToSlack = async (
  db: Firestore,
  tableCode: string,
  event: string,
  text: string,
  roster: Roster[],
): Promise<boolean> => {
  const snapshot = await db.collection("tableIntegrations").doc(tableCode).get();
  const url: unknown = snapshot.get("slackWebhookUrl");

  // Pinning the host keeps a mis-set webhook from turning this endpoint into an SSRF proxy.
  if (typeof url !== "string" || !url.startsWith(SLACK_WEBHOOK_PREFIX)) {
    console.log(`send: no slack webhook configured for ${tableCode}`);
    return false;
  }

  const payload = buildSlackPayload(appUrl, tableCode, event, text, roster);
  const post = (): Promise<Response> =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

  // Webhooks allow only ~1 message/second, so a burst of joins gets a 429 and would
  // otherwise be silently dropped. Jitter stops two rate-limited invocations from
  // retrying in lockstep and colliding a second time.
  let response = await post();
  if (response.status === 429) {
    const retryAfter = Math.min(Number(response.headers.get("retry-after")) || 1, 5);
    const waitMs = retryAfter * 1000 + Math.random() * 500;
    console.warn(`send: slack rate limited, retrying in ${Math.round(waitMs)}ms`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    response = await post();
  }

  // Slack answers a bad payload with 400 and a reason like "invalid_blocks"; without
  // this the post just vanishes.
  if (!response.ok) {
    console.error(`send: slack rejected ${response.status} ${await response.text()}`);
  }

  return response.ok;
};

const pushToUsers = async (
  db: Firestore,
  messaging: Messaging,
  uids: string[],
  body: string,
): Promise<number> => {
  if (uids.length === 0) {
    return 0;
  }

  const snapshot = await db.collection("pushTokens").where("uid", "in", uids).get();
  const tokens = snapshot.docs
    .map((document): unknown => document.get("token"))
    .filter((token): token is string => typeof token === "string");

  console.log(`send: ${uids.length} recipient(s), ${tokens.length} token(s)`);
  if (tokens.length === 0) {
    return 0;
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

  return response.successCount;
};

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

  const { idToken, recipients, message, tableCode, event, teams } = (req.body ?? {}) as {
    idToken?: unknown;
    recipients?: unknown;
    message?: unknown;
    tableCode?: unknown;
    event?: unknown;
    teams?: unknown;
  };

  if (typeof idToken !== "string" || !Array.isArray(recipients) || typeof message !== "string") {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }

  const table = typeof tableCode === "string" && TABLE_CODE_RE.test(tableCode) ? tableCode : "";
  const kind = typeof event === "string" ? event : "";
  const roster = parseRoster(teams);

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

  // The two channels are independent: neither failing may suppress the other.
  const [sent, slack] = await Promise.all([
    pushToUsers(db, messaging, uids, body).catch((err) => {
      console.error("send: push failed", err);
      return 0;
    }),
    table
      ? postToSlack(db, table, kind, body, roster).catch((err) => {
          console.error("send: slack failed", err);
          return false;
        })
      : Promise.resolve(false),
  ]);

  res.status(200).json({ sent, slack });
}
