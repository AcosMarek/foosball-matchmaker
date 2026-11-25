import type { VercelRequest, VercelResponse } from "@vercel/node";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { Timestamp, getFirestore, type Firestore } from "firebase-admin/firestore";
// The .js extensions are required: package.json sets "type": "module", so the compiled
// function runs as ESM and Node will not resolve an extensionless relative import.
import type { MatchPlayer } from "../src/matchmaking.js";
import { computeStats, parseResultTeams, type ScoredMatch } from "../src/ratings.js";
import { chunk } from "./_lib/pushFanout.js";
import {
  buildRecapPayload,
  buildWeeklyRecap,
  lastFullWeek,
  toScoredMatch,
  type Week,
} from "./_lib/recap.js";

// Weekly Slack recap, run by the Vercel cron in vercel.json every Monday morning. For
// each table with a Slack webhook it posts what happened there over the last full week:
// games, most active player, biggest climber, upset of the week and the top of the table.
//
// Env vars (shared with api/send.ts):
//   FIREBASE_SERVICE_ACCOUNT  — the service account JSON (required, secret)
//   ALLOWED_ORIGIN            — the app's public URL, for the "Open table" button
//   CRON_SECRET               — optional; when set, Vercel sends it as a bearer token with
//                               each cron call and anything without it is turned away
//
// The endpoint is safe to leave open without CRON_SECRET: it takes no input, only posts
// on a Monday from about the scheduled hour, and records each table's week as sent before
// posting, so calling it by hand can at most send the recap the cron was about to send
// (or, later that Monday, already has).
const allowedOrigin = process.env.ALLOWED_ORIGIN ?? "";
const appUrl = allowedOrigin.startsWith("https://") ? allowedOrigin.replace(/\/+$/, "") : "";

const SLACK_WEBHOOK_PREFIX = "https://hooks.slack.com/services/";
// The recap goes out on Monday only, from an hour before the 07:00 UTC cron in
// vercel.json (so a slightly early trigger still counts) until the end of the day.
const RECAP_FROM_HOUR_UTC = 6;
const RECAP_UNTIL_HOUR_UTC = 24;
const HOUR_MS = 60 * 60 * 1000;
// Firestore caps an `in` filter at 30 values.
const ROSTER_QUERY_CHUNK = 30;

const ensureApp = () =>
  getApps()[0] ??
  initializeApp({
    credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT ?? "{}")),
  });

// Every scored match, on any table: a rating is one figure across all of them, so the
// climbers and the leaderboard can only be worked out from the whole history.
const loadScoredMatches = async (db: Firestore): Promise<ScoredMatch[]> => {
  // Ordering by the result's timestamp is what limits this to scored sessions.
  const scored = await db.collection("sessions").orderBy("result.recordedAt", "asc").get();

  // Results from before teams were stored with the score fall back to the join order.
  const legacy = scored.docs
    .filter((session) => !parseResultTeams((session.get("result") as { teams?: unknown })?.teams))
    .map((session) => session.id);
  const joins = await Promise.all(
    chunk(legacy, ROSTER_QUERY_CHUNK).map((group) =>
      db.collection("sessionJoins").where("sessionId", "in", group).get(),
    ),
  );

  const rosters = new Map<string, (MatchPlayer & { at: number })[]>();
  for (const join of joins.flatMap((snapshot) => snapshot.docs)) {
    const sessionId: unknown = join.get("sessionId");
    const uid: unknown = join.get("uid");
    const displayName: unknown = join.get("displayName");
    const joinedAt: unknown = join.get("joinedAt");
    if (typeof sessionId !== "string" || typeof uid !== "string" || !uid) {
      continue;
    }

    rosters.set(sessionId, [
      ...(rosters.get(sessionId) ?? []),
      {
        uid,
        displayName: typeof displayName === "string" && displayName ? displayName : "Player",
        at: joinedAt instanceof Timestamp ? joinedAt.toMillis() : Number.MAX_SAFE_INTEGER,
      },
    ]);
  }

  return scored.docs
    .map((session) =>
      toScoredMatch(
        session.id,
        session.data(),
        (rosters.get(session.id) ?? []).sort((a, b) => a.at - b.at),
      ),
    )
    .filter((match): match is ScoredMatch => !!match);
};

// Marks the week as sent for this table, once. Claimed before posting: a recap that
// fails to post is lost for the week, which beats one that posts twice.
const claimWeek = (db: Firestore, tableCode: string, week: Week): Promise<boolean> => {
  const ref = db.collection("tableIntegrations").doc(tableCode);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get("lastRecapWeek") === week.key) {
      return false;
    }

    tx.update(ref, { lastRecapWeek: week.key });
    return true;
  });
};

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const now = new Date();
  const week = lastFullWeek(now);
  const hoursIntoWeek = (now.getTime() - week.end.getTime()) / HOUR_MS;
  if (hoursIntoWeek < RECAP_FROM_HOUR_UTC || hoursIntoWeek >= RECAP_UNTIL_HOUR_UTC) {
    res.status(200).json({ week: week.key, posted: 0, reason: "only sent on Monday morning" });
    return;
  }

  let db: Firestore;
  try {
    db = getFirestore(ensureApp());
  } catch (err) {
    console.error("recap: init failed", err);
    res.status(500).json({ error: "Recap service not configured" });
    return;
  }

  try {
    const integrations = await db.collection("tableIntegrations").get();
    // Pinning the host keeps a mis-set webhook from turning this endpoint into an SSRF proxy.
    const due = integrations.docs.filter((table) => {
      const url: unknown = table.get("slackWebhookUrl");

      return (
        typeof url === "string" &&
        url.startsWith(SLACK_WEBHOOK_PREFIX) &&
        table.get("lastRecapWeek") !== week.key
      );
    });
    if (due.length === 0) {
      res.status(200).json({ week: week.key, posted: 0, reason: "nothing due" });
      return;
    }

    const stats = computeStats(await loadScoredMatches(db));
    let posted = 0;

    for (const table of due) {
      const tableCode = table.id;
      if (!(await claimWeek(db, tableCode, week))) {
        continue;
      }

      const recap = buildWeeklyRecap(stats, tableCode, week);
      if (!recap) {
        console.log(`recap: no scored games on ${tableCode} in the week of ${week.key}`);
        continue;
      }

      const name: unknown = (await db.collection("tables").doc(tableCode).get()).get("name");
      const payload = buildRecapPayload(
        appUrl,
        tableCode,
        typeof name === "string" && name ? name : tableCode,
        recap,
        week,
      );
      const response = await fetch(table.get("slackWebhookUrl") as string, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        posted += 1;
      } else {
        console.error(`recap: slack rejected ${response.status} ${await response.text()}`);
      }
    }

    console.log(`recap: week of ${week.key}, posted ${posted}/${due.length}`);
    res.status(200).json({ week: week.key, posted });
  } catch (err) {
    console.error("recap: failed", err);
    res.status(500).json({ error: "Recap failed" });
  }
}
