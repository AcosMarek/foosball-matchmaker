import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import { getSessionDisposition, getSessionRosters, registerOnTable, remindToScore } from "./api";
import { currentDevice, needsHomeScreenInstall } from "./platform";
import { registerForPush } from "./push";
import { readVisitedTables, upsertVisited, writeVisitedTables } from "./visitedTables";
import {
  buildMatchDisposition,
  canStartMatch,
  isValidScore,
  reminderDueIn,
  resultWindowRemaining,
  type RosterEntry,
} from "./matchmaking";
import {
  computeStats,
  parseResultTeams,
  teamsFromDisposition,
  type ScoredMatch,
  type RatingStats,
} from "./ratings";
import { toDate } from "./utils";
import type { FoosballTable, JoinedPlayer, Session } from "./types";

// Sessions written before results shipped have no playerCount/result, so both are
// defaulted rather than assumed.
const readSession = (snapshot: QueryDocumentSnapshot<DocumentData>): Session | null => {
  const data = snapshot.data();
  const startedAt = toDate(data.startedAt);
  if (!startedAt) {
    return null;
  }

  const result = data.result;

  return {
    id: snapshot.id,
    startedAt,
    startedBy: String(data.startedBy || ""),
    startedByName: String(data.startedByName || "Unknown"),
    targetPlayers: data.targetPlayers === 2 ? 2 : 4,
    playerCount: Number(data.playerCount ?? 0),
    result: result
      ? {
          red: Number(result.red ?? 0),
          blue: Number(result.blue ?? 0),
          lineup: String(result.lineup || ""),
          recordedAt: toDate(result.recordedAt),
        }
      : null,
    cancelled: !!data.cancelled,
    teams: parseResultTeams(data.teams),
    readyAt: toDate(data.readyNotifiedAt),
    reminded: !!data.remindNotifiedAt,
  };
};

export const useAuth = (): User | null => {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  return user;
};

export const useVisitedTables = (): {
  visited: FoosballTable[];
  addVisited: (table: FoosballTable) => void;
} => {
  const [visited, setVisited] = useState<FoosballTable[]>(() => readVisitedTables());

  const addVisited = useCallback((table: FoosballTable) => {
    setVisited((current) => {
      const next = upsertVisited(current, table);
      writeVisitedTables(next);
      return next;
    });
  }, []);

  return { visited, addVisited };
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

      const session = readSession(hit);
      if (!session) {
        setActiveSession(null);
        return;
      }

      // A logged result or a cancellation ends the match, freeing the table for a new
      // game rather than holding it until the start cooldown lapses.
      setActiveSession(
        session.result || session.cancelled || canStartMatch(session.startedAt).allowed
          ? null
          : session,
      );
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

const RECENT_SESSIONS = 10;

// Recent matches at the table, newest first. Feeds both the results history and the
// creator's outstanding-score prompt, so it stays a single listener.
export const useRecentSessions = (selectedTable: string): Session[] => {
  const [sessions, setSessions] = useState<Session[]>([]);

  useEffect(() => {
    if (!selectedTable) {
      setSessions([]);
      return;
    }

    const q = query(
      collection(db, "sessions"),
      where("tableCode", "==", selectedTable),
      orderBy("startedAt", "desc"),
      limit(RECENT_SESSIONS),
    );

    return onSnapshot(q, (snapshot) => {
      setSessions(snapshot.docs.map(readSession).filter((session): session is Session => !!session));
    });
  }, [selectedTable]);

  return sessions;
};

// The filled matches the user played in that are still open (no score, not cancelled) and
// young enough to log, oldest first. Usually one, but a new match started before the last one was logged
// leaves two, and the earlier one must stay reachable while the later one is played.
// Anyone in a match may log it, so being its starter is only the shortcut: for other
// matches the lineup is looked up, once per match, to see whether the user was in one of
// the teams (someone who joined after it filled is in the queue, not the match).
export const usePendingResults = (user: User | null, sessions: Session[]): Session[] => {
  const [playedIn, setPlayedIn] = useState<Record<string, boolean>>({});
  const [now, setNow] = useState(() => Date.now());
  const requested = useRef(new Set<string>());
  const uid = user?.uid ?? null;

  const unscored = useMemo(
    () =>
      sessions
        .filter(
          (session) =>
            !session.result &&
            !session.cancelled &&
            session.playerCount >= session.targetPlayers &&
            resultWindowRemaining(session.startedAt, new Date(now)) > 0,
        )
        .reverse(),
    [sessions, now],
  );

  // Re-filter the moment the oldest match's hour runs out, so its prompt goes away
  // without waiting for a snapshot.
  useEffect(() => {
    if (unscored.length === 0) {
      return;
    }

    const remainingMs = Math.min(
      ...unscored.map((session) => resultWindowRemaining(session.startedAt)),
    );
    const timer = setTimeout(() => setNow(Date.now()), remainingMs);

    return () => clearTimeout(timer);
  }, [unscored]);

  // Another account on the same device has played different matches.
  const account = useRef(uid);
  useEffect(() => {
    account.current = uid;
    requested.current = new Set();
    setPlayedIn({});
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      return;
    }

    for (const session of unscored) {
      if (session.startedBy === uid || requested.current.has(session.id)) {
        continue;
      }

      // An answer is kept unless the account changed meanwhile. It is deliberately not
      // dropped when a newer session snapshot arrives: the lookup isn't repeated, so a
      // dropped answer would hide the prompt for good.
      requested.current.add(session.id);
      getSessionDisposition(session.id, session.targetPlayers, session.teams)
        .then((disposition) => {
          if (account.current !== uid) {
            return;
          }
          if (!disposition) {
            // The roster came back short of a full match; ask again on the next snapshot.
            requested.current.delete(session.id);
            return;
          }

          const played = disposition.teams.some((team) =>
            team.players.some((entry) => entry.player.uid === uid),
          );
          setPlayedIn((current) => ({ ...current, [session.id]: played }));
        })
        .catch((error) => {
          // Leave it unrequested so the next snapshot tries again.
          requested.current.delete(session.id);
          console.error("Couldn't check the match lineup", error);
        });
    }
  }, [uid, unscored]);

  return useMemo(
    () => unscored.filter((session) => session.startedBy === uid || playedIn[session.id]),
    [unscored, uid, playedIn],
  );
};

// The match whose score has just come in, for a player who was waiting on it: a session
// that was among their pending results and now has one. Only a change seen happening
// counts, so opening the app on an already-scored match celebrates nothing. Whoever
// logged the score and the other players, who see it arrive, are treated alike.
export const useJustScored = (
  pending: Session[],
  sessions: Session[],
): { session: Session | null; clear: () => void } => {
  const waiting = useRef(new Set<string>());
  const [scoredId, setScoredId] = useState("");

  useEffect(() => {
    const scored = sessions.find((session) => session.result && waiting.current.has(session.id));
    for (const session of sessions) {
      if (session.result || session.cancelled) {
        waiting.current.delete(session.id);
      }
    }
    for (const session of pending) {
      waiting.current.add(session.id);
    }

    if (scored) {
      setScoredId(scored.id);
    }
  }, [pending, sessions]);

  const clear = useCallback(() => setScoredId(""), []);
  const session = useMemo(
    () => sessions.find((entry) => entry.id === scoredId && entry.result) ?? null,
    [sessions, scoredId],
  );

  return { session, clear };
};

// Nudges a match's players to log their score once it has sat open for a while. Nothing
// on the server runs on a timer, so, like the timed-out announcement, it is whichever
// client has the table open that notices and asks the sender. The sender checks the match
// really is due and sends at most one nudge however many clients ask, which is why this
// only needs to ask once per match and can ignore the answer.
export const useScoreReminders = (
  user: User | null,
  tableCode: string,
  sessions: Session[],
): void => {
  const asked = useRef(new Set<string>());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!user || !tableCode) {
      return;
    }

    const now = new Date();
    let nextDueMs = Number.POSITIVE_INFINITY;

    for (const session of sessions) {
      const open = !session.result && !session.cancelled && !session.reminded;
      const full = session.playerCount >= session.targetPlayers;
      if (!open || !full || asked.current.has(session.id)) {
        continue;
      }
      if (resultWindowRemaining(session.startedAt, now) === 0) {
        continue;
      }

      const waitMs = reminderDueIn(session.readyAt ?? session.startedAt, now);
      if (waitMs > 0) {
        nextDueMs = Math.min(nextDueMs, waitMs);
        continue;
      }

      asked.current.add(session.id);
      void remindToScore(user, session.id, tableCode).catch((error) =>
        console.error("Score reminder failed", error),
      );
    }

    if (!Number.isFinite(nextDueMs)) {
      return;
    }

    const timer = setTimeout(() => setTick((count) => count + 1), nextDueMs + 1000);

    return () => clearTimeout(timer);
  }, [user, tableCode, sessions, tick]);
};

// A scored session as a rateable match. Results recorded before teams were stored fall
// back to the join order, the same rule that assigned the teams on the day.
const readScoredMatch = (
  snapshot: QueryDocumentSnapshot<DocumentData>,
  rosters: Map<string, RosterEntry[]>,
): ScoredMatch | null => {
  const data = snapshot.data();
  const startedAt = toDate(data.startedAt);
  const result = data.result;
  if (!startedAt || !result) {
    return null;
  }

  const score = { red: Number(result.red), blue: Number(result.blue) };
  const size = data.targetPlayers === 2 ? 2 : 4;
  const fromRoster = buildMatchDisposition(rosters.get(snapshot.id) ?? [], size);
  const teams = parseResultTeams(result.teams) ?? (fromRoster && teamsFromDisposition(fromRoster));
  if (!isValidScore(score) || !teams) {
    return null;
  }

  return {
    sessionId: snapshot.id,
    tableCode: String(data.tableCode || ""),
    startedAt,
    size,
    score,
    teams,
  };
};

// Elo ratings and player statistics across every table, live: they update the moment a
// result is logged anywhere. Null while loading or when the history can't be read.
// Ordering by the result's timestamp is what restricts the listener to scored sessions
// (Firestore leaves out documents missing the ordered field), so the many unfilled
// matches are never downloaded.
export const useRatingStats = (user: User | null): RatingStats | null => {
  const [stats, setStats] = useState<RatingStats | null>(null);

  useEffect(() => {
    setStats(null);
    if (!user) {
      return;
    }

    const rosters = new Map<string, RosterEntry[]>();
    let latest = 0;
    let cancelled = false;

    const q = query(collection(db, "sessions"), orderBy("result.recordedAt", "asc"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const run = async () => {
          const turn = (latest += 1);
          const missing = snapshot.docs
            .filter((scored) => !parseResultTeams(scored.data().result?.teams))
            .map((scored) => scored.id)
            .filter((id) => !rosters.has(id));

          if (missing.length > 0) {
            const loaded = await getSessionRosters(missing);
            for (const id of missing) {
              rosters.set(id, loaded.get(id) ?? []);
            }
          }

          // A newer snapshot may have overtaken this one while the rosters loaded.
          if (cancelled || turn !== latest) {
            return;
          }

          setStats(
            computeStats(
              snapshot.docs
                .map((scored) => readScoredMatch(scored, rosters))
                .filter((match): match is ScoredMatch => !!match),
            ),
          );
        };

        void run().catch((error) => console.error("Statistics failed to load", error));
      },
      (error) => console.error("Statistics unavailable", error),
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [user]);

  return stats;
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

const NOTIFICATION_PROMPT_KEY = "foosball:notificationPromptOff";

export type NotificationState = NotificationPermission | "unsupported";

const notificationsSupported = (): boolean => typeof Notification !== "undefined";

const promptSilenced = (): boolean => {
  try {
    return localStorage.getItem(NOTIFICATION_PROMPT_KEY) === "1";
  } catch {
    // Ignore storage being unavailable (e.g. private browsing).
    return false;
  }
};

// Notification permission plus the sign-in prompt shown to users who haven't decided
// yet. "Don't remind me" is persisted; dismissing lasts until the next sign-in.
export const useNotifications = (
  user: User | null,
): {
  permission: NotificationState;
  promptOpen: boolean;
  requestPermission: () => void;
  dismissPrompt: () => void;
  silencePrompt: () => void;
} => {
  const [permission, setPermission] = useState<NotificationState>(() =>
    notificationsSupported() ? Notification.permission : "unsupported",
  );
  const [dismissed, setDismissed] = useState(true);
  const uid = user?.uid ?? null;

  // Re-arm the prompt on every sign-in unless it was silenced for good.
  useEffect(() => {
    setDismissed(!uid || promptSilenced());
  }, [uid]);

  // Returning visitors who already granted permission still need their device token
  // registered (and refreshed) on load, as does anyone who just granted it.
  useEffect(() => {
    if (!user || permission !== "granted") {
      return;
    }

    void registerForPush(user).catch((error) =>
      console.error("Push registration failed", error),
    );
  }, [user, permission]);

  const requestPermission = useCallback(() => {
    if (!notificationsSupported()) {
      return;
    }

    void Notification.requestPermission()
      .then(setPermission)
      .catch((error) => console.error("Notification permission request failed", error));
  }, []);

  const dismissPrompt = useCallback(() => setDismissed(true), []);

  const silencePrompt = useCallback(() => {
    setDismissed(true);
    try {
      localStorage.setItem(NOTIFICATION_PROMPT_KEY, "1");
    } catch {
      // Ignore storage being unavailable (e.g. private browsing).
    }
  }, []);

  return {
    // Only "default" is actionable: a blocked permission can't be re-requested from script.
    promptOpen: !!user && permission === "default" && !dismissed,
    permission,
    requestPermission,
    dismissPrompt,
    silencePrompt,
  };
};

const INSTALL_PROMPT_KEY = "foosball:installPromptOff";

// The "add this app to your home screen" hint for iPhones and iPads in a browser tab,
// where notifications can't be turned on at all. `needed` is false on every other device
// and once the app runs from the home screen, so none of this is ever seen there. Like
// the notification prompt it opens on sign-in, "Got it" lasts until the next one and
// "Don't remind me" is remembered; `show` reopens it from the bell.
export const useInstallHint = (
  user: User | null,
): {
  needed: boolean;
  open: boolean;
  show: () => void;
  dismiss: () => void;
  silence: () => void;
} => {
  const needed = useMemo(() => needsHomeScreenInstall(currentDevice()), []);
  const [dismissed, setDismissed] = useState(true);
  const uid = user?.uid ?? null;

  useEffect(() => {
    let silenced = false;
    try {
      silenced = localStorage.getItem(INSTALL_PROMPT_KEY) === "1";
    } catch {
      // Ignore storage being unavailable (e.g. private browsing).
    }

    setDismissed(!uid || silenced);
  }, [uid]);

  const show = useCallback(() => setDismissed(false), []);
  const dismiss = useCallback(() => setDismissed(true), []);
  const silence = useCallback(() => {
    setDismissed(true);
    try {
      localStorage.setItem(INSTALL_PROMPT_KEY, "1");
    } catch {
      // Ignore storage being unavailable (e.g. private browsing).
    }
  }, []);

  return { needed, open: needed && !!user && !dismissed, show, dismiss, silence };
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
