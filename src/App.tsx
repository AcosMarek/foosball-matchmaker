import { useEffect, useMemo, useState } from "react";
import { isValidTableCode, normalizeTableCode } from "./matchmaking";
import { getTable } from "./api";
import { Brand, GlobalStyles, RodMark, TopBar, Wrapper } from "./ui";
import {
  useActiveSession,
  useAuth,
  useNotifications,
  usePendingResults,
  useRecentSessions,
  useScoreReminders,
  useSessionPlayers,
  useTableMemberCount,
  useRatingStats,
  useTableRegistration,
  useVisitedTables,
} from "./hooks";
import type { FoosballTable } from "./types";
import { AuthBar, SignInPanel } from "./components/AuthCard";
import { AdminTableCard } from "./components/AdminTableCard";
import { NotificationPrompt } from "./components/NotificationPrompt";
import { TableSelector } from "./components/TableSelector";
import { MatchmakingCard } from "./components/MatchmakingCard";
import { MatchHistoryCard } from "./components/MatchHistoryCard";
import { LeaderboardCard } from "./components/LeaderboardCard";
import { StatsDialog } from "./components/StatsDialog";
import { matchesFor, tableStandings } from "./ratings";
import { RecordResultCard } from "./components/RecordResultCard";
import { QrCard } from "./components/QrCard";

const STORAGE_KEY = "foosball:selectedTable";

const validTableCode = (raw: string): string => {
  const code = normalizeTableCode(raw || "");

  return isValidTableCode(code) ? code : "";
};

const tableFromSearch = () =>
  validTableCode(new URLSearchParams(window.location.search).get("table") || "");

const storedTable = (): string => {
  try {
    return validTableCode(localStorage.getItem(STORAGE_KEY) || "");
  } catch {
    return "";
  }
};

// Prefer a table provided via the URL; otherwise restore the last selected one.
const initialTable = (): string => tableFromSearch() || storedTable();

export default function App() {
  const user = useAuth();
  const { visited, addVisited } = useVisitedTables();
  const [selectedTable, setSelectedTable] = useState<string>(initialTable);
  const activeSession = useActiveSession(selectedTable);
  const sessionPlayers = useSessionPlayers(user, activeSession?.id ?? null);
  const tableMemberCount = useTableMemberCount(user, selectedTable);
  const recentSessions = useRecentSessions(selectedTable);
  const notifications = useNotifications(user);
  const stats = useRatingStats(user);
  // This table's leaderboard: the overall ratings of the people who have played here.
  const standings = useMemo(
    () => (stats && selectedTable ? tableStandings(stats, selectedTable) : null),
    [stats, selectedTable],
  );
  const [statsOpen, setStatsOpen] = useState(false);
  useTableRegistration(user, selectedTable);

  // Remember the last selected table so it is restored on the next visit.
  useEffect(() => {
    try {
      if (selectedTable) {
        localStorage.setItem(STORAGE_KEY, selectedTable);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Ignore storage being unavailable (e.g. private browsing).
    }
  }, [selectedTable]);

  // Resolve a table chosen via deep link or restored from a previous visit: look it up
  // to capture its name and remember it, or clear the selection if the code is unknown.
  useEffect(() => {
    if (!selectedTable || visited.some((table) => table.code === selectedTable)) {
      return;
    }

    let cancelled = false;
    getTable(selectedTable)
      .then((table) => {
        if (cancelled) {
          return;
        }
        if (table) {
          addVisited(table);
        } else {
          setSelectedTable("");
        }
      })
      .catch(() => {
        // Leave the selection untouched on transient errors.
      });

    return () => {
      cancelled = true;
    };
  }, [selectedTable, visited, addVisited]);

  const handleJoinTable = (table: FoosballTable) => {
    addVisited(table);
    setSelectedTable(table.code);
  };

  const adminEmails = useMemo(
    () =>
      (import.meta.env.VITE_ADMIN_EMAILS || "")
        .split(",")
        .map((email: string) => email.trim().toLowerCase())
        .filter(Boolean),
    [],
  );
  const isAdmin = !!user?.email && adminEmails.includes(user.email.toLowerCase());

  // Matches the signed-in user played in that haven't been scored yet. They outlive the
  // normal session lifecycle, so a player can still log one after the cooldown lapses or
  // a new match has started, for up to an hour.
  const pendingResults = usePendingResults(user, recentSessions);
  useScoreReminders(user, selectedTable, recentSessions);

  const selectedTableName =
    visited.find((table) => table.code === selectedTable)?.name ||
    selectedTable ||
    "No table selected";

  return (
    <Wrapper>
      <GlobalStyles />
      <TopBar>
        <Brand>
          <RodMark />
          <span>Foosball</span>
        </Brand>
        {user && (
          <AuthBar
            user={user}
            permission={notifications.permission}
            onRequestNotifications={notifications.requestPermission}
            onOpenStats={selectedTable ? () => setStatsOpen(true) : undefined}
          />
        )}
      </TopBar>

      {notifications.promptOpen && (
        <NotificationPrompt
          onActivate={notifications.requestPermission}
          onDismiss={notifications.dismissPrompt}
          onSilence={notifications.silencePrompt}
        />
      )}

      {user && statsOpen && (
        <StatsDialog
          player={stats?.players.find((player) => player.uid === user.uid) ?? null}
          place={standings?.find((entry) => entry.player.uid === user.uid)?.place ?? null}
          placedCount={standings?.filter((entry) => entry.place !== null).length ?? 0}
          tableName={selectedTableName}
          matches={stats ? matchesFor(stats, { uid: user.uid }) : []}
          tableLabel={(code) => visited.find((table) => table.code === code)?.name || code}
          onClose={() => setStatsOpen(false)}
        />
      )}

      {!user && <SignInPanel />}

      {user && (
        <>
          <TableSelector
            tables={visited}
            selectedTable={selectedTable}
            memberCount={tableMemberCount}
            onSelect={setSelectedTable}
            onJoin={handleJoinTable}
          />

          <MatchmakingCard
            user={user}
            selectedTable={selectedTable}
            selectedTableName={selectedTableName}
            activeSession={activeSession}
            sessionPlayers={sessionPlayers}
            stats={stats}
          />

          {pendingResults.map((session) => (
            <RecordResultCard
              key={session.id}
              user={user}
              session={session}
              tableCode={selectedTable}
              stats={stats}
            />
          ))}

          {selectedTable && (
            <LeaderboardCard
              standings={standings}
              tableName={selectedTableName}
              currentUid={user.uid}
            />
          )}

          {selectedTable && (
            <MatchHistoryCard
              tableCode={selectedTable}
              sessions={recentSessions}
              stats={stats}
              currentUid={user.uid}
            />
          )}

          {selectedTable && <QrCard selectedTable={selectedTable} />}
        </>
      )}

      {isAdmin && user && (
        <AdminTableCard
          user={user}
          selectedTable={selectedTable}
          selectedTableName={selectedTableName}
          onCreated={setSelectedTable}
        />
      )}
    </Wrapper>
  );
}
