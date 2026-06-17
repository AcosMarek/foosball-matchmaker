import { useEffect, useMemo, useState } from "react";
import { isValidTableCode, normalizeTableCode } from "./matchmaking";
import { GlobalStyles, Header, Subtitle, Title, Wrapper } from "./ui";
import {
  useActiveSession,
  useAuth,
  useIncomingNotifications,
  useSessionPlayers,
  useTableMemberCount,
  useTableRegistration,
  useTables,
} from "./hooks";
import { AuthCard } from "./components/AuthCard";
import { AdminTableCard } from "./components/AdminTableCard";
import { TableSelector } from "./components/TableSelector";
import { MatchmakingCard } from "./components/MatchmakingCard";
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
  const tables = useTables();
  const [selectedTable, setSelectedTable] = useState<string>(initialTable);
  const activeSession = useActiveSession(selectedTable);
  const sessionPlayers = useSessionPlayers(user, activeSession?.id ?? null);
  const tableMemberCount = useTableMemberCount(user, selectedTable);
  useIncomingNotifications(user);
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

  const adminEmails = useMemo(
    () =>
      (import.meta.env.VITE_ADMIN_EMAILS || "")
        .split(",")
        .map((email: string) => email.trim().toLowerCase())
        .filter(Boolean),
    [],
  );
  const isAdmin = !!user?.email && adminEmails.includes(user.email.toLowerCase());

  const selectedTableName =
    tables.find((table) => table.code === selectedTable)?.name || selectedTable || "No table selected";

  return (
    <Wrapper>
      <GlobalStyles />
      <Header>
        <Title>⚽ Foosball Matchmaker</Title>
        <Subtitle>Start a match, grab teammates, and see who plays where.</Subtitle>
      </Header>

      <AuthCard user={user} />

      {isAdmin && user && <AdminTableCard user={user} onCreated={setSelectedTable} />}

      <TableSelector
        user={user}
        tables={tables}
        selectedTable={selectedTable}
        memberCount={tableMemberCount}
        onSelect={setSelectedTable}
      />

      <MatchmakingCard
        user={user}
        selectedTable={selectedTable}
        selectedTableName={selectedTableName}
        activeSession={activeSession}
        sessionPlayers={sessionPlayers}
      />

      {selectedTable && <QrCard selectedTable={selectedTable} />}
    </Wrapper>
  );
}
