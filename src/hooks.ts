import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import { registerOnTable } from "./api";
import { canStartMatch, MS_PER_MINUTE, RESET_MINUTES } from "./matchmaking";
import { toDate } from "./utils";
import type { FoosballTable, JoinedPlayer, Session } from "./types";

export const useAuth = (): User | null => {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  return user;
};

export const useTables = (): FoosballTable[] => {
  const [tables, setTables] = useState<FoosballTable[]>([]);

  useEffect(() => {
    const q = query(collection(db, "tables"), orderBy("name"));

    return onSnapshot(q, (snapshot) => {
      setTables(
        snapshot.docs.map((tableDoc) => ({
          code: tableDoc.id,
          name: String(tableDoc.data().name || tableDoc.id),
        })),
      );
    });
  }, []);

  return tables;
};

export const useActiveSession = (selectedTable: string): Session | null => {
  const [activeSession, setActiveSession] = useState<Session | null>(null);

  useEffect(() => {
    if (!selectedTable) {
      setActiveSession(null);
      return;
    }

    const q = query(
      collection(db, "sessions"),
      where("tableCode", "==", selectedTable),
      orderBy("startedAt", "desc"),
      limit(1),
    );

    return onSnapshot(q, (snapshot) => {
      const hit = snapshot.docs[0];
      if (!hit) {
        setActiveSession(null);
        return;
      }

      const startedAt = toDate(hit.data().startedAt);
      if (!startedAt) {
        setActiveSession(null);
        return;
      }

      if (canStartMatch(startedAt).allowed) {
        setActiveSession(null);
        return;
      }

      const rawTarget = hit.data().targetPlayers;
      setActiveSession({
        id: hit.id,
        startedAt,
        startedByName: String(hit.data().startedByName || "Unknown"),
        targetPlayers: rawTarget === 2 ? 2 : 4,
      });
    });
  }, [selectedTable]);

  // Clear the active session the moment its start cooldown elapses, so the start
  // buttons re-enable and the countdown disappears without waiting for a snapshot.
  useEffect(() => {
    if (!activeSession) {
      return;
    }

    const remainingMs = canStartMatch(activeSession.startedAt).waitMs;
    const timer = setTimeout(() => setActiveSession(null), Math.max(0, remainingMs));

    return () => clearTimeout(timer);
  }, [activeSession]);

  return activeSession;
};

export const useSessionPlayers = (
  user: User | null,
  activeSessionId: string | null,
): JoinedPlayer[] => {
  const [sessionPlayers, setSessionPlayers] = useState<JoinedPlayer[]>([]);

  useEffect(() => {
    if (!user || !activeSessionId) {
      setSessionPlayers([]);
      return;
    }

    const q = query(collection(db, "sessionJoins"), where("sessionId", "==", activeSessionId));

    return onSnapshot(q, (snapshot) => {
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

      setSessionPlayers(players);
    });
  }, [user, activeSessionId]);

  return sessionPlayers;
};

// Counts everyone registered to receive notifications for the selected table,
// updating live as people join or leave. Reads require a signed-in user.
export const useTableMemberCount = (user: User | null, selectedTable: string): number => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user || !selectedTable) {
      setCount(0);
      return;
    }

    const q = query(collection(db, "tableMembers"), where("tableCode", "==", selectedTable));

    return onSnapshot(q, (snapshot) => setCount(snapshot.size));
  }, [user, selectedTable]);

  return count;
};

export const useIncomingNotifications = (user: User | null): void => {
  useEffect(() => {
    if (!user) {
      return;
    }

    const q = query(collection(db, "notifications"), where("toUid", "==", user.uid));

    return onSnapshot(q, (snapshot) => {
      const handleChanges = async () => {
        for (const change of snapshot.docChanges()) {
          if (change.type !== "added" || change.doc.data().read) {
            continue;
          }

          // Skip matches started more than the fill window ago: they've already
          // reset, so notifying is just stale noise (e.g. when several matches ran
          // while the browser was closed). Still mark them read to clear the queue.
          const createdAt = toDate(change.doc.data().createdAt);
          const isFresh =
            !!createdAt && Date.now() - createdAt.getTime() < RESET_MINUTES * MS_PER_MINUTE;

          if (
            isFresh &&
            typeof Notification !== "undefined" &&
            Notification.permission === "granted"
          ) {
            const message = String(change.doc.data().message || "A foosball match has started.");
            new Notification("Foosball Matchmaker", { body: message });
          }

          await updateDoc(change.doc.ref, { read: true });
        }
      };

      void handleChanges().catch(() => {});
    });
  }, [user]);
};

export const useNow = (active: boolean): number => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) {
      return;
    }

    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);

    return () => clearInterval(id);
  }, [active]);

  return now;
};

// Registers the signed-in user as a member of the selected table so they receive
// notifications when a match starts there. Runs automatically on table selection.
export const useTableRegistration = (user: User | null, selectedTable: string): void => {
  useEffect(() => {
    if (!user || !selectedTable) {
      return;
    }

    void registerOnTable(user, selectedTable).catch(() => {});
  }, [user, selectedTable]);
};
