import type { User } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  getDocsFromServer,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import {
  buildMatchDisposition,
  describeDisposition,
  describeResult,
  generateTableCode,
  joinOutcome,
  matchSizeLabel,
  mergeRoster,
  type RosterEntry,
  type MatchDisposition,
  type MatchScore,
  type MatchSize,
  type TeamPosition,
} from "./matchmaking";
import { toDate } from "./utils";
import type { FoosballTable } from "./types";

const displayNameOf = (user: User): string => user.displayName || user.email || "Player";

const PUSH_ENDPOINT = import.meta.env.VITE_PUSH_ENDPOINT as string | undefined;

export const SLACK_WEBHOOK_PREFIX = "https://hooks.slack.com/services/";

type NotifyTeam = {
  color: string;
  players: { name: string; position: TeamPosition }[];
};

type NotifyPayload = {
  message: string;
  event: "start" | "join" | "ready" | "result" | "expired";
  recipients?: string[];
  tableCode?: string;
  teams?: NotifyTeam[];
};

// Fan-out via the serverless sender: Web Push plus a Slack post when the table has a
// webhook configured. A "start" is pushed to everyone registered on the table (the sender
// resolves them itself); every other event goes to the listed recipients. Resolves to the
// number of users reached by push, and rejects when the sender refuses the request so a
// misconfigured relay can't pass for a delivered alert. No-op until the endpoint is set,
// so local dev without it still works.
const sendNotification = async (
  user: User,
  { recipients = [], message, tableCode = "", event, teams = [] }: NotifyPayload,
): Promise<number> => {
  if (!PUSH_ENDPOINT || (recipients.length === 0 && !tableCode)) {
    return 0;
  }

  const idToken = await user.getIdToken();
  const response = await fetch(PUSH_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken, recipients, message, tableCode, event, teams }),
  });
  if (!response.ok) {
    throw new Error(`Notification sender answered ${response.status}`);
  }

  const result = (await response.json().catch(() => ({}))) as { sent?: unknown };

  return typeof result.sent === "number" ? result.sent : 0;
};

export const registerOnTable = async (user: User, tableCode: string): Promise<void> => {
  await setDoc(doc(db, "tableMembers", `${tableCode}_${user.uid}`), {
    tableCode,
    uid: user.uid,
    displayName: displayNameOf(user),
    joinedAt: serverTimestamp(),
    email: user.email || "",
  });
};

// Returns the joiner's position in the match. The counter bump makes this a transaction
// on the session doc, so simultaneous joins are serialised and each gets a distinct
// position instead of both reading the same stale count.
export const joinSession = async (
  user: User,
  sessionId: string,
  tableCode: string,
): Promise<number> => {
  const joinRef = doc(db, "sessionJoins", `${sessionId}_${user.uid}`);
  const sessionRef = doc(db, "sessions", sessionId);

  // Client transactions can't run queries, so the roster is sized up front. Taking the
  // larger of it and the stored counter repairs drift: joins written before playerCount
  // existed, or by a stale cached client on the old non-transactional path, added a
  // sessionJoins doc without ever incrementing the session.
  const joined = await getDocs(
    query(collection(db, "sessionJoins"), where("sessionId", "==", sessionId)),
  );

  return runTransaction(db, async (tx) => {
    const [joinSnap, sessionSnap] = await Promise.all([tx.get(joinRef), tx.get(sessionRef)]);
    const stored = Number(sessionSnap.data()?.playerCount ?? 0);
    const counted = Math.max(stored, joined.size);

    if (joinSnap.exists()) {
      if (counted > stored) {
        tx.update(sessionRef, { playerCount: counted });
      }

      return counted;
    }

    tx.set(joinRef, {
      sessionId,
      tableCode,
      uid: user.uid,
      joinedAt: serverTimestamp(),
      displayName: displayNameOf(user),
    });
    tx.update(sessionRef, { playerCount: counted + 1 });

    return counted + 1;
  });
};

// Announces a new match to the table: Web Push to every registered member (so they hear
// about it with the tab closed) plus Slack. Resolves to the number of members actually
// reached, which can be well below the registered count — not everyone has notifications
// switched on. Rejects when the sender fails, so the caller can say so.
export const notifyTableMembers = (
  user: User,
  tableCode: string,
  targetPlayers: MatchSize,
): Promise<number> =>
  sendNotification(user, {
    message: `${user.displayName || "A player"} started a ${matchSizeLabel(
      targetPlayers,
    )} on ${tableCode}.`,
    tableCode,
    event: "start",
  });

// Roster for a session, in join order. Forced to the server: a player arriving straight
// from a Slack link has a partly-synced cache holding their own write but not everyone
// else's, and a short read here costs the announcement its teams.
const readSessionPlayers = async (sessionId: string): Promise<RosterEntry[]> => {
  const joins = query(collection(db, "sessionJoins"), where("sessionId", "==", sessionId));
  const snapshot = await getDocsFromServer(joins).catch((error) => {
    console.error("roster read fell back to cache", error);
    return getDocs(joins);
  });

  return mergeRoster(
    snapshot.docs.map((joinDoc) => {
      const data = joinDoc.data();
      return {
        uid: String(data.uid || ""),
        displayName: String(data.displayName || "Player"),
        joinedAt: toDate(data.joinedAt),
      };
    }),
  );
};

// Every join posts to Slack so the channel can watch a match fill up. The join that fills
// it instead pushes the final lineup to the players already in: a one-time transactional
// claim on the session guarantees that "Game on!" alert is sent exactly once, even if
// several players fill the match at nearly the same moment. The player who triggered the
// fill is skipped (they already see the lineup on screen). Best-effort throughout.
export const notifyJoin = async (
  user: User,
  sessionId: string,
  tableCode: string,
  targetPlayers: MatchSize,
  position: number,
  knownPlayers: RosterEntry[] = [],
): Promise<number> => {
  // Three sources, unioned: the query can come back short, the listener can lag the join
  // that just happened, and the joiner themselves is guaranteed to be in the match.
  const self: RosterEntry = {
    uid: user.uid,
    displayName: displayNameOf(user),
    joinedAt: null,
  };
  let players = mergeRoster(await readSessionPlayers(sessionId), knownPlayers, [self]);

  if (players.length < targetPlayers && position >= targetPlayers) {
    players = mergeRoster(await readSessionPlayers(sessionId), players);
  }

  const outcome = joinOutcome(position, players.length, targetPlayers);
  if (!outcome.filled) {
    await sendNotification(user, {
      message: `${displayNameOf(user)} joined the game — ${outcome.remaining} spot${
        outcome.remaining === 1 ? "" : "s"
      } left.`,
      tableCode,
      event: "join",
    });

    return 0;
  }

  const sessionRef = doc(db, "sessions", sessionId);
  const claimed = await runTransaction(db, async (tx) => {
    const snap = await tx.get(sessionRef);
    if (!snap.exists() || snap.data().readyNotifiedAt) {
      return false;
    }
    tx.update(sessionRef, { readyNotifiedAt: serverTimestamp() });
    return true;
  });
  if (!claimed) {
    return 0;
  }

  // Built from whatever the roster read returned: a short read costs the lineup detail
  // but must never cost the announcement itself.
  const disposition = buildMatchDisposition(players, targetPlayers);
  const lineup = disposition
    ? describeDisposition(disposition)
    : `${players.length}/${targetPlayers} in.`;
  const recipients = players.slice(0, targetPlayers).filter((player) => player.uid !== user.uid);

  // Delivered via Web Push so recipients are alerted even with the tab closed. `message`
  // stays the terse push body; Slack renders the roster from `teams` instead.
  return sendNotification(user, {
    message: `Game on! ${lineup}`,
    recipients: recipients.map((player) => player.uid),
    tableCode,
    event: "ready",
    teams: (disposition?.teams ?? []).map((team) => ({
      color: team.color,
      players: team.players.map((entry) => ({
        name: entry.player.displayName,
        position: entry.position,
      })),
    })),
  });
};

// Announces a match that ran out of time before filling. The claim keeps it to one post
// however many clients notice the window lapse at the same moment.
export const notifyMatchExpired = async (
  user: User,
  sessionId: string,
  tableCode: string,
  targetPlayers: MatchSize,
): Promise<void> => {
  const sessionRef = doc(db, "sessions", sessionId);
  const claimed = await runTransaction(db, async (tx) => {
    const snap = await tx.get(sessionRef);
    if (!snap.exists() || snap.data().expiredNotifiedAt || snap.data().readyNotifiedAt) {
      return false;
    }

    tx.update(sessionRef, { expiredNotifiedAt: serverTimestamp() });
    return true;
  });
  if (!claimed) {
    return;
  }

  // A join can still land between the claim and this read; announcing a washout next to
  // a "Game on!" would contradict it.
  const players = await readSessionPlayers(sessionId);
  if (players.length >= targetPlayers) {
    return;
  }

  await sendNotification(user, {
    message: `No game — the ${matchSizeLabel(targetPlayers)} on ${tableCode} timed out with ${
      players.length
    }/${targetPlayers} players.`,
    tableCode,
    event: "expired",
  });
};

export const getLatestSessionStart = async (tableCode: string): Promise<Date | null> => {
  const snapshot = await getDocs(
    query(
      collection(db, "sessions"),
      where("tableCode", "==", tableCode),
      orderBy("startedAt", "desc"),
      limit(1),
    ),
  );

  return toDate(snapshot.docs[0]?.data().startedAt);
};

// Creates the match and seats its starter. Announcing it is a separate, best-effort step
// (notifyTableMembers) so a notification failure can't read as a failed start.
export const startSession = async (
  user: User,
  tableCode: string,
  targetPlayers: MatchSize,
): Promise<void> => {
  const sessionRef = await addDoc(collection(db, "sessions"), {
    tableCode,
    startedBy: user.uid,
    startedByName: displayNameOf(user),
    startedAt: serverTimestamp(),
    targetPlayers,
    playerCount: 0,
  });

  await joinSession(user, sessionRef.id, tableCode);
};

export const getTable = async (code: string): Promise<FoosballTable | null> => {
  const snapshot = await getDoc(doc(db, "tables", code));
  if (!snapshot.exists()) {
    return null;
  }

  return { code: snapshot.id, name: String(snapshot.data().name || snapshot.id) };
};

export const createTable = async (user: User, name: string): Promise<string> => {
  let code = generateTableCode();
  let targetDoc = doc(db, "tables", code);

  while ((await getDoc(targetDoc)).exists()) {
    code = generateTableCode();
    targetDoc = doc(db, "tables", code);
  }

  await setDoc(targetDoc, {
    code,
    name,
    createdBy: user.uid,
    createdAt: serverTimestamp(),
  });

  return code;
};

export const isSlackWebhookUrl = (url: string): boolean => url.startsWith(SLACK_WEBHOOK_PREFIX);
// Admin-only: these live in tableIntegrations so the world-readable table doc never
// carries the webhook secret. Rules reject both calls for everyone else.
export const getTableSlackWebhook = async (tableCode: string): Promise<string> => {
  const snapshot = await getDoc(doc(db, "tableIntegrations", tableCode));

  return snapshot.exists() ? String(snapshot.data().slackWebhookUrl || "") : "";
};

export const setTableSlackWebhook = async (
  user: User,
  tableCode: string,
  webhookUrl: string,
): Promise<void> => {
  await setDoc(
    doc(db, "tableIntegrations", tableCode),
    {
      tableCode,
      slackWebhookUrl: webhookUrl,
      updatedBy: user.uid,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
};

export const getSessionDisposition = async (
  sessionId: string,
  targetPlayers: MatchSize,
): Promise<MatchDisposition | null> =>
  buildMatchDisposition(await readSessionPlayers(sessionId), targetPlayers);

// Only the player who started the match may log its score; the rules enforce that too,
// so a tampered client can't write someone else's result. Slack is best-effort.
export const recordMatchResult = async (
  user: User,
  sessionId: string,
  tableCode: string,
  score: MatchScore,
  lineup: string,
): Promise<void> => {
  await updateDoc(doc(db, "sessions", sessionId), {
    result: {
      red: score.red,
      blue: score.blue,
      lineup,
      recordedBy: user.uid,
      recordedAt: serverTimestamp(),
    },
  });

  await sendNotification(user, {
    message: `Full time — ${describeResult(score)}`,
    tableCode,
    event: "result",
  }).catch(() => {});
};
