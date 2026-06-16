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
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import { generateTableCode, type MatchSize } from "./matchmaking";
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
