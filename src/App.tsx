import { useEffect, useMemo, useState } from "react";
import { isValidTableCode, normalizeTableCode } from "./matchmaking";
import { getTable, leaveTable, registerOnTable } from "./api";
import { Brand, GlobalStyles, RodMark, TopBar, Wrapper } from "./ui";
import {
  useActiveSession,
  useAuth,
  useInstallHint,
  useJustScored,
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
import type { Departure, FoosballTable } from "./types";
import { AuthBar, SignInPanel } from "./components/AuthCard";
import { LeaveTable } from "./components/LeaveTable";
import { AdminTableCard } from "./components/AdminTableCard";
import { InstallPrompt } from "./components/InstallPrompt";
import { NotificationPrompt } from "./components/NotificationPrompt";
import { TableSelector } from "./components/TableSelector";
import { MatchmakingCard } from "./components/MatchmakingCard";
import { MatchHistoryCard } from "./components/MatchHistoryCard";
import { LeaderboardCard } from "./components/LeaderboardCard";
import { StatsDialog } from "./components/StatsDialog";
import { matchesFor, tableStandings } from "./ratings";
import { RecordResultCard } from "./components/RecordResultCard";
import { ResultCelebration } from "./components/ResultCelebration";
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
  const { visited, addVisited, removeVisited } = useVisitedTables();
  const [selectedTable, setSelectedTable] = useState<string>(initialTable);
  // The table this player has just left or been taken off, kept so they can be told and
  // offered a way back.
  const [departed, setDeparted] = useState<Departure | null>(null);
  const activeSession = useActiveSession(selectedTable);
  const sessionPlayers = useSessionPlayers(user, activeSession?.id ?? null);
  const tableMemberCount = useTableMemberCount(user, selectedTable);
  const recentSessions = useRecentSessions(selectedTable);
  const notifications = useNotifications(user);
  const installHint = useInstallHint(user);
  const stats = useRatingStats(user);
  // This table's leaderboard: the overall ratings of the people who have played here.
  const standings = useMemo(
    () => (stats && selectedTable ? tableStandings(stats, selectedTable) : null),
    [stats, selectedTable],
  );
  const [statsOpen, setStatsOpen] = useState(false);

  // Puts a table out of sight on this device: off the list, deselected, and with a note
  // saying so. Used both when the player leaves and when the app finds, on opening the
  // table, that they are no longer on it.
  const handleDeparted = (code: string, left: boolean) => {
    const name = visited.find((table) => table.code === code)?.name || code;
    removeVisited(code);
    setSelectedTable((current) => (current === code ? "" : current));
    setDeparted({ table: { code, name }, left });
  };
  useTableRegistration(user, selectedTable, (code) => handleDeparted(code, false));

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

  // On an iPhone in a browser tab, keep the selected table in the address bar. Adding the
  // site to the home screen saves the address it was added from, and the installed app
  // starts with empty storage, so this is what lets it open on the right table. Left
  // alone everywhere else, where the address never needs to change.
  const keepTableInAddress = installHint.needed;
  useEffect(() => {
    if (!keepTableInAddress) {
      return;
    }

    try {
      const url = new URL(window.location.href);
      if (selectedTable) {
        url.searchParams.set("table", selectedTable);
      } else {
        url.searchParams.delete("table");
      }
      window.history.replaceState(window.history.state, "", url);
    } catch {
      // The address is a convenience; the app works without it.
    }
  }, [keepTableInAddress, selectedTable]);

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

  // Joining by code, or rejoining, is a decision by the player, so it registers them
  // outright (clearing any earlier removal) before the table is opened; merely opening a
  // table would not.
  const handleJoinTable = (table: FoosballTable) => {
    setDeparted(null);
    addVisited(table);
    if (!user) {
      setSelectedTable(table.code);
      return;
    }

    void registerOnTable(user, table.code)
      .catch((error) => console.error("Couldn't join the table", error))
      .finally(() => setSelectedTable(table.code));
  };

  const handleLeaveTable = async () => {
    if (!user || !selectedTable) {
      return;
    }

    const code = selectedTable;
    await leaveTable(user, code);
    handleDeparted(code, true);
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
  const justScored = useJustScored(pendingResults, recentSessions);
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
            onShowInstallHint={installHint.needed ? installHint.show : undefined}
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

      {installHint.open && (
        <InstallPrompt onDismiss={installHint.dismiss} onSilence={installHint.silence} />
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
            departed={departed}
            onDismissDeparted={() => setDeparted(null)}
          />

          <MatchmakingCard
            user={user}
            selectedTable={selectedTable}
            selectedTableName={selectedTableName}
            activeSession={activeSession}
            sessionPlayers={sessionPlayers}
            stats={stats}
          />

          {justScored.session && (
            <ResultCelebration
              key={justScored.session.id}
              session={justScored.session}
              match={stats?.matches[justScored.session.id] ?? null}
              currentUid={user.uid}
              onClose={justScored.clear}
            />
          )}

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

      {/* Last on the page on purpose: leaving is rare, and nobody should do it by accident. */}
      {user && selectedTable && (
        <LeaveTable key={selectedTable} tableName={selectedTableName} onLeave={handleLeaveTable} />
      )}
    </Wrapper>
  );
}
