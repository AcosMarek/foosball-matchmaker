import type { VercelRequest, VercelResponse } from "@vercel/node";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import {
  FieldValue,
  Timestamp,
  getFirestore,
  type DocumentReference,
  type Firestore,
} from "firebase-admin/firestore";
import { getMessaging, type Messaging } from "firebase-admin/messaging";
// The .js extension is required: package.json sets "type": "module", so the compiled
// function runs as ESM and Node will not resolve an extensionless relative import.
import { buildSlackPayload, parseRoster, type Roster } from "./_lib/slackMessage.js";
import { chunk, summarizeDelivery, type TokenTarget } from "./_lib/pushFanout.js";

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
// (signature + expiry) and returns the account only when it is genuine. Resolves to the
// caller's uid, or null when the token is rejected.
const verifyIdToken = async (idToken: string): Promise<string | null> => {
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

// Cap on a caller-supplied recipient list (the players of one match).
const MAX_RECIPIENTS = 8;
// Cap on a table-wide fan-out, resolved server-side from tableMembers.
const MAX_TABLE_RECIPIENTS = 500;
// Firestore caps an `in` filter at 30 values, FCM a multicast at 500 tokens.
const TOKEN_QUERY_CHUNK = 30;
const MULTICAST_CHUNK = 500;
// A match fills or resets within five minutes, so an alert that can't be delivered in
// that window is dropped rather than arriving stale.
const PUSH_TTL_SECONDS = 300;
// How long after a session is created its starter may trigger the table-wide push.
const START_PUSH_WINDOW_MS = 2 * 60 * 1000;
const MAX_MESSAGE_LENGTH = 200;
const TABLE_CODE_RE = /^[A-Z0-9]{6}$/;
const SESSION_ID_RE = /^[A-Za-z0-9]{8,40}$/;
// A match's players are nudged to log the score once it has been full this long with no
// result, and never after the hour in which a score can still be logged. Mirrors
// REMIND_AFTER_MINUTES and RESULT_WINDOW_MINUTES in src/matchmaking.ts; the slack is for
// the clock of the client that asks, which decides when to ask but not whether it is due.
const REMIND_AFTER_MS = 15 * 60 * 1000;
const REMIND_CLOCK_SLACK_MS = 60 * 1000;
const RESULT_WINDOW_MS = 60 * 60 * 1000;
// Written here, never taken from the caller: any signed-in user can ask for a reminder.
const REMINDER_TEXT =
  "How did it go? Log the score for your match, or cancel it if it didn't finish.";
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

// A table-wide push is only sent for a session the caller really just started, and only
// once per session: that keeps any signed-in user from using this endpoint to spam a
// table, and makes a retried request harmless.
const claimStartPush = async (db: Firestore, tableCode: string, uid: string): Promise<boolean> => {
  const latest = await db
    .collection("sessions")
    .where("tableCode", "==", tableCode)
    .orderBy("startedAt", "desc")
    .limit(1)
    .get();
  const session = latest.docs[0];
  if (!session) {
    return false;
  }

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(session.ref);
    const startedAt: unknown = snap.get("startedAt");
    const fresh =
      startedAt instanceof Timestamp && Date.now() - startedAt.toMillis() < START_PUSH_WINDOW_MS;

    if (snap.get("startedBy") !== uid || !fresh || snap.get("startNotifiedAt")) {
      return false;
    }

    tx.update(session.ref, { startNotifiedAt: FieldValue.serverTimestamp() });
    return true;
  });
};

// The uids in the teams stored on a session, or none when it has no (valid) teams.
const storedTeamUids = (teams: unknown): string[] => {
  if (!Array.isArray(teams)) {
    return [];
  }

  return teams.flatMap((team: unknown) => {
    const players: unknown = (team as { players?: unknown } | null)?.players;

    return Array.isArray(players)
      ? players
          .map((player: unknown): unknown => (player as { uid?: unknown } | null)?.uid)
          .filter((uid): uid is string => typeof uid === "string" && uid !== "")
      : [];
  });
};

// Who to nudge about an unlogged score, or nobody when the match isn't due one. The
// conditions are checked here and the reminder is claimed in the same transaction, so it
// goes out once per match no matter how many clients ask, and asking can't be used to
// ping people about anything else. Resolves to the players in the match itself: the
// stored teams, or the first joiners of a match from before teams were stored.
const claimScoreReminder = async (
  db: Firestore,
  tableCode: string,
  sessionId: string,
): Promise<string[]> => {
  const ref = db.collection("sessions").doc(sessionId);
  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const startedAt: unknown = snap.get("startedAt");
    const readyAt: unknown = snap.get("readyNotifiedAt");
    if (!snap.exists || snap.get("tableCode") !== tableCode || !(startedAt instanceof Timestamp)) {
      return null;
    }

    const size = snap.get("targetPlayers") === 2 ? 2 : 4;
    const filledAt = readyAt instanceof Timestamp ? readyAt : startedAt;
    const now = Date.now();
    const open = !snap.get("result") && !snap.get("cancelled") && !snap.get("remindNotifiedAt");
    const full = Number(snap.get("playerCount") ?? 0) >= size;
    const due =
      now - filledAt.toMillis() >= REMIND_AFTER_MS - REMIND_CLOCK_SLACK_MS &&
      now - startedAt.toMillis() < RESULT_WINDOW_MS;
    if (!open || !full || !due) {
      return null;
    }

    tx.update(ref, { remindNotifiedAt: FieldValue.serverTimestamp() });
    return { size, teams: snap.get("teams") as unknown };
  });
  if (!claimed) {
    return [];
  }

  const fromTeams = storedTeamUids(claimed.teams);
  if (fromTeams.length > 0) {
    return [...new Set(fromTeams)].slice(0, MAX_RECIPIENTS);
  }

  const joins = await db.collection("sessionJoins").where("sessionId", "==", sessionId).get();

  return joins.docs
    .map((join) => {
      const uid: unknown = join.get("uid");
      const joinedAt: unknown = join.get("joinedAt");

      return {
        uid: typeof uid === "string" ? uid : "",
        at: joinedAt instanceof Timestamp ? joinedAt.toMillis() : Number.MAX_SAFE_INTEGER,
      };
    })
    .filter((join) => join.uid !== "")
    .sort((a, b) => a.at - b.at)
    .slice(0, claimed.size)
    .map((join) => join.uid);
};

// Everyone registered on the table except the caller, who already knows.
const tableMemberUids = async (db: Firestore, tableCode: string, uid: string): Promise<string[]> => {
  const snapshot = await db
    .collection("tableMembers")
    .where("tableCode", "==", tableCode)
    .limit(MAX_TABLE_RECIPIENTS)
    .get();
  // Someone who left the table, or was taken off it, keeps a flagged record there (so
  // the app doesn't sign them straight back up) but is no longer pinged.
  const uids = snapshot.docs
    .filter((member) => member.get("removed") !== true)
    .map((member): unknown => member.get("uid"))
    .filter((member): member is string => typeof member === "string" && member !== uid);

  return [...new Set(uids)];
};

// Resolves to the number of users reached on at least one device.
const pushToUsers = async (
  db: Firestore,
  messaging: Messaging,
  uids: string[],
  data: Record<string, string>,
): Promise<number> => {
  if (uids.length === 0) {
    return 0;
  }

  const snapshots = await Promise.all(
    chunk(uids, TOKEN_QUERY_CHUNK).map((group) =>
      db.collection("pushTokens").where("uid", "in", group).get(),
    ),
  );

  const refs = new Map<string, DocumentReference>();
  const targets: TokenTarget[] = [];
  for (const document of snapshots.flatMap((snapshot) => snapshot.docs)) {
    const token: unknown = document.get("token");
    const owner: unknown = document.get("uid");
    if (typeof token === "string" && typeof owner === "string" && !refs.has(token)) {
      refs.set(token, document.ref);
      targets.push({ uid: owner, token });
    }
  }

  console.log(`send: ${uids.length} recipient(s), ${targets.length} token(s)`);
  if (targets.length === 0) {
    return 0;
  }

  const responses = await Promise.all(
    chunk(targets, MULTICAST_CHUNK).map((group) =>
      messaging.sendEachForMulticast({
        tokens: group.map((target) => target.token),
        data,
        // Data-only messages default to normal urgency, which a dozing phone may hold
        // back for minutes; a match alert is only useful right now.
        webpush: { headers: { Urgency: "high", TTL: String(PUSH_TTL_SECONDS) } },
      }),
    ),
  );

  const summary = summarizeDelivery(
    targets,
    responses.flatMap((response) => response.responses),
  );

  console.log(
    `send: delivered ${summary.delivered}/${targets.length} to ${summary.notifiedUids.length} user(s)`,
  );
  if (summary.failures.length > 0) {
    console.error("send: failures", summary.failures);
  }

  // Best-effort cleanup so dead devices stop inflating every later fan-out.
  if (summary.deadTokens.length > 0) {
    await Promise.all(summary.deadTokens.map((token) => refs.get(token)?.delete())).catch((err) =>
      console.error("send: token cleanup failed", err),
    );
    console.log(`send: pruned ${summary.deadTokens.length} dead token(s)`);
  }

  return summary.notifiedUids.length;
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

  const { idToken, recipients, message, tableCode, event, teams, sessionId } = (req.body ??
    {}) as {
    idToken?: unknown;
    recipients?: unknown;
    message?: unknown;
    tableCode?: unknown;
    event?: unknown;
    teams?: unknown;
    sessionId?: unknown;
  };

  if (typeof idToken !== "string" || !Array.isArray(recipients) || typeof message !== "string") {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }

  const table = typeof tableCode === "string" && TABLE_CODE_RE.test(tableCode) ? tableCode : "";
  const kind = typeof event === "string" ? event : "";
  const session = typeof sessionId === "string" && SESSION_ID_RE.test(sessionId) ? sessionId : "";
  const reminder = kind === "remind";
  // A match that timed out is no longer announced: the post only embarrassed whoever had
  // tried to start a game. The app stopped sending this event; an older copy of it still
  // open in someone's browser may not have, so it is dropped here as well.
  const timedOut = kind === "expired";
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
  const callerUid = await verifyIdToken(idToken);
  if (!callerUid) {
    console.warn("send: unauthorized (invalid id token)");
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const body = reminder ? REMINDER_TEXT : message.slice(0, MAX_MESSAGE_LENGTH);
  const data = { title: "Foosball Matchmaker", body, tableCode: table, event: kind };

  // A match start goes to the whole table and a score reminder to the players of that
  // match, both resolved here rather than trusted from the client; every other event goes
  // to the players the caller listed.
  const resolveUids = async (): Promise<string[]> => {
    if (reminder) {
      return table && session ? claimScoreReminder(db, table, session) : [];
    }

    if (kind === "start" && table) {
      if (!(await claimStartPush(db, table, callerUid))) {
        console.warn(`send: start push for ${table} not claimed`);
        return [];
      }

      return tableMemberUids(db, table, callerUid);
    }

    return recipients
      .filter((uid): uid is string => typeof uid === "string")
      .slice(0, MAX_RECIPIENTS);
  };

  // `sent` is the number of users reached on at least one device. The two channels are
  // independent: neither failing may suppress the other.
  const [sent, slack] = await Promise.all([
    resolveUids()
      .then((uids) => pushToUsers(db, messaging, uids, data))
      .catch((err) => {
        console.error("send: push failed", err);
        return 0;
      }),
    // A reminder is for the four people in the match, not the channel.
    table && !reminder && !timedOut
      ? postToSlack(db, table, kind, body, roster).catch((err) => {
          console.error("send: slack failed", err);
          return false;
        })
      : Promise.resolve(false),
  ]);

  res.status(200).json({ sent, slack });
}
