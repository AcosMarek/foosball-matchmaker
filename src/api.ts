import type { User } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
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

// Fire-and-forget fan-out via the serverless sender: Web Push to the listed users, plus a
// Slack post when the table has a webhook configured. No-op until the endpoint is set, so
// local dev without it still works.
const sendNotification = async (
  user: User,
  { recipients = [], message, tableCode = "", event, teams = [] }: NotifyPayload,
): Promise<void> => {
  if (!PUSH_ENDPOINT || (recipients.length === 0 && !tableCode)) {
    return;
  }

  const idToken = await user.getIdToken();
  await fetch(PUSH_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken, recipients, message, tableCode, event, teams }),
  });
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

export const notifyTableMembers = async (
  user: User,
  tableCode: string,
  targetPlayers: MatchSize,
): Promise<number> => {
  const snapshot = await getDocs(
    query(collection(db, "tableMembers"), where("tableCode", "==", tableCode)),
  );
  const others = snapshot.docs.filter((member) => member.data().uid !== user.uid);
  const message = `${user.displayName || "A player"} started a ${matchSizeLabel(
    targetPlayers,
  )} on ${tableCode}.`;

  await Promise.all(
    others.map((member) =>
      addDoc(collection(db, "notifications"), {
        toUid: member.data().uid,
        tableCode,
        read: false,
        createdAt: serverTimestamp(),
        message,
      }),
    ),
  );

  // Slack only: members are already covered by the notification docs above, and pushing
  // here too would double-notify them. Best-effort, so a relay outage can't block a start.
  await sendNotification(user, { message, tableCode, event: "start" }).catch((error) =>
    console.error("start notification failed", error),
  );

  return others.length;
};

// Roster for a session, in join order.
const readSessionPlayers = async (sessionId: string) => {
  const snapshot = await getDocs(
    query(collection(db, "sessionJoins"), where("sessionId", "==", sessionId)),
  );

  return snapshot.docs
    .map((joinDoc) => {
      const data = joinDoc.data();
      return {
        uid: String(data.uid || ""),
        displayName: String(data.displayName || "Player"),
        joinedAt: toDate(data.joinedAt),
      };
    })
    .sort((a, b) => (a.joinedAt?.getTime() ?? 0) - (b.joinedAt?.getTime() ?? 0));
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
): Promise<number> => {
  let players = await readSessionPlayers(sessionId);

  // The counter is authoritative and the roster only decorates the announcement. Re-read
  // once when it lags so a slow roster can't downgrade the deciding join.
  if (players.length < targetPlayers && position >= targetPlayers) {
    players = await readSessionPlayers(sessionId);
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

  // Delivered via Web Push so recipients are alerted even with the tab closed. No
  // Firestore notification doc here: that path only fires in an open tab and would
  // double-notify foreground users. `message` stays the terse push body; Slack renders
  // the roster from `teams` instead.
  await sendNotification(user, {
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

  return recipients.length;
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

export const startSession = async (
  user: User,
  tableCode: string,
  targetPlayers: MatchSize,
): Promise<number> => {
  const sessionRef = await addDoc(collection(db, "sessions"), {
    tableCode,
    startedBy: user.uid,
    startedByName: displayNameOf(user),
    startedAt: serverTimestamp(),
    targetPlayers,
    playerCount: 0,
  });

  await joinSession(user, sessionRef.id, tableCode);
  return notifyTableMembers(user, tableCode, targetPlayers);
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
