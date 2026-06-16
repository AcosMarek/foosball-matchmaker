import { useMemo, useState } from "react";
import { isValidTableCode, normalizeTableCode } from "./matchmaking";
import { GlobalStyles, Header, Subtitle, Title, Wrapper } from "./ui";
import {
  useActiveSession,
  useAuth,
  useIncomingNotifications,
  useSessionPlayers,
  useTableRegistration,
  useTables,
} from "./hooks";
import { AuthCard } from "./components/AuthCard";
import { AdminTableCard } from "./components/AdminTableCard";
import { TableSelector } from "./components/TableSelector";
import { MatchmakingCard } from "./components/MatchmakingCard";
import { QrCard } from "./components/QrCard";

const tableFromSearch = () => {
  const raw = new URLSearchParams(window.location.search).get("table") || "";
  const code = normalizeTableCode(raw);

  return isValidTableCode(code) ? code : "";
};

export default function App() {
  const user = useAuth();
  const tables = useTables();
  const [selectedTable, setSelectedTable] = useState<string>(tableFromSearch());
  const activeSession = useActiveSession(selectedTable);
  const sessionPlayers = useSessionPlayers(user, activeSession?.id ?? null);
  useIncomingNotifications(user);
  useTableRegistration(user, selectedTable);

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
