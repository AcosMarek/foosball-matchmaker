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
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import {
  buildMatchDisposition,
  describeDisposition,
  generateTableCode,
  type MatchSize,
} from "./matchmaking";
import { toDate } from "./utils";

const displayNameOf = (user: User): string => user.displayName || user.email || "Player";

export const registerOnTable = async (user: User, tableCode: string): Promise<void> => {
  await setDoc(doc(db, "tableMembers", `${tableCode}_${user.uid}`), {
    tableCode,
    uid: user.uid,
    displayName: displayNameOf(user),
    joinedAt: serverTimestamp(),
    email: user.email || "",
  });
};

export const joinSession = async (
  user: User,
  sessionId: string,
  tableCode: string,
): Promise<void> => {
  await setDoc(doc(db, "sessionJoins", `${sessionId}_${user.uid}`), {
    sessionId,
    tableCode,
    uid: user.uid,
    joinedAt: serverTimestamp(),
    displayName: displayNameOf(user),
  });
};

export const notifyTableMembers = async (user: User, tableCode: string): Promise<number> => {
  const snapshot = await getDocs(
    query(collection(db, "tableMembers"), where("tableCode", "==", tableCode)),
  );
  const others = snapshot.docs.filter((member) => member.data().uid !== user.uid);

  await Promise.all(
    others.map((member) =>
      addDoc(collection(db, "notifications"), {
        toUid: member.data().uid,
        tableCode,
        read: false,
        createdAt: serverTimestamp(),
        message: `${user.displayName || "A player"} started matchmaking on ${tableCode}.`,
      }),
    ),
  );

  return others.length;
};

// When a join fills a match, ping its participants with the final lineup. A one-time
// transactional claim on the session guarantees the "Game on!" alert is sent exactly
// once, even if several players fill the match at nearly the same moment. The player who
// triggered the fill is skipped (they already see the lineup on screen). Best-effort.
export const notifyMatchReady = async (
  user: User,
  sessionId: string,
  tableCode: string,
  targetPlayers: MatchSize,
): Promise<number> => {
  const snapshot = await getDocs(
    query(collection(db, "sessionJoins"), where("sessionId", "==", sessionId)),
  );
  const players = snapshot.docs
    .map((joinDoc) => {
      const data = joinDoc.data();
      return {
        uid: String(data.uid || ""),
        displayName: String(data.displayName || "Player"),
        joinedAt: toDate(data.joinedAt),
      };
    })
    .sort((a, b) => (a.joinedAt?.getTime() ?? 0) - (b.joinedAt?.getTime() ?? 0));

  const disposition =
    players.length >= targetPlayers ? buildMatchDisposition(players, targetPlayers) : null;
  if (!disposition) {
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

  const lineup = describeDisposition(disposition);
  const recipients = players.slice(0, targetPlayers).filter((player) => player.uid !== user.uid);

  await Promise.all(
    recipients.map((player) =>
      addDoc(collection(db, "notifications"), {
        toUid: player.uid,
        tableCode,
        read: false,
        createdAt: serverTimestamp(),
        message: `Game on! ${lineup}`,
      }),
    ),
  );

  return recipients.length;
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
  });

  await joinSession(user, sessionRef.id, tableCode);
  return notifyTableMembers(user, tableCode);
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
