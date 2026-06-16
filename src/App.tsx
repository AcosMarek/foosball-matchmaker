import { useEffect, useMemo, useState } from "react";
import styled from "@emotion/styled";
import { onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import {
  Timestamp,
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { auth, db, googleAuthProvider } from "./firebase";
import {
  START_COOLDOWN_MINUTES,
  canStartMatch,
  generateTableCode,
  isValidTableCode,
  normalizeTableCode,
} from "./matchmaking";

type FoosballTable = {
  code: string;
  name: string;
};

type Session = {
  id: string;
  startedAt: Date;
  startedByName: string;
};

const Wrapper = styled.main`
  font-family: Inter, system-ui, sans-serif;
  max-width: 900px;
  margin: 0 auto;
  padding: 1.5rem;
`;

const Card = styled.section`
  border: 1px solid #d9d9d9;
  border-radius: 12px;
  padding: 1rem;
  margin-bottom: 1rem;
`;

const Row = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
`;

const Input = styled.input`
  padding: 0.5rem;
`;

const Button = styled.button`
  padding: 0.5rem 0.9rem;
`;

const Hint = styled.p`
  margin-top: 0.5rem;
  color: #555;
`;

const toDate = (value: unknown): Date | null => {
  if (value instanceof Timestamp) {
    return value.toDate();
  }

  return null;
};

const tableFromSearch = () => {
  const raw = new URLSearchParams(window.location.search).get("table") || "";
  const code = normalizeTableCode(raw);

  return isValidTableCode(code) ? code : "";
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [tables, setTables] = useState<FoosballTable[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>(tableFromSearch());
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [joinInfo, setJoinInfo] = useState("");
  const [feedback, setFeedback] = useState("");
  const [newTableName, setNewTableName] = useState("");

  const adminEmails = useMemo(
    () =>
      (import.meta.env.VITE_ADMIN_EMAILS || "")
        .split(",")
        .map((email: string) => email.trim().toLowerCase())
        .filter(Boolean),
    [],
  );

  const isAdmin = !!user?.email && adminEmails.includes(user.email.toLowerCase());

  useEffect(() => onAuthStateChanged(auth, setUser), []);

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

      const availability = canStartMatch(startedAt);
      if (availability.allowed) {
        setActiveSession(null);
        return;
      }

      setActiveSession({
        id: hit.id,
        startedAt,
        startedByName: String(hit.data().startedByName || "Unknown"),
      });
    });
  }, [selectedTable]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const q = query(
      collection(db, "notifications"),
      where("toUid", "==", user.uid),
      where("read", "==", false),
      orderBy("createdAt", "desc"),
    );

    return onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        if (change.type !== "added") {
          return;
        }

        const message = String(change.doc.data().message || "A foosball match has started.");
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification("Foosball Matchmaker", { body: message });
        }

        await updateDoc(change.doc.ref, { read: true });
      });
    });
  }, [user]);

  const selectedTableName =
    tables.find((table) => table.code === selectedTable)?.name || selectedTable || "No table selected";

  const joinTable = async () => {
    if (!user || !selectedTable) {
      return;
    }

    const key = `${selectedTable}_${user.uid}`;
    await setDoc(doc(db, "tableMembers", key), {
      tableCode: selectedTable,
      uid: user.uid,
      displayName: user.displayName || user.email || "Player",
      joinedAt: serverTimestamp(),
      email: user.email || "",
    });

    setJoinInfo(`Registered on table ${selectedTable}.`);
  };

  const notifyMembers = async (tableCode: string) => {
    if (!user) {
      return;
    }

    const q = query(collection(db, "tableMembers"), where("tableCode", "==", tableCode));
    const snapshot = await getDocs(q);
    const docs = snapshot.docs.filter((member) => member.data().uid !== user.uid);

    await Promise.all(
      docs.map((member) =>
        addDoc(collection(db, "notifications"), {
          toUid: member.data().uid,
          tableCode,
          read: false,
          createdAt: serverTimestamp(),
          message: `${user.displayName || "A player"} started matchmaking on ${tableCode}.`,
        }),
      ),
    );
  };

  const startMatchmaking = async () => {
    if (!user || !selectedTable) {
      return;
    }

    await joinTable();

    const q = query(
      collection(db, "sessions"),
      where("tableCode", "==", selectedTable),
      orderBy("startedAt", "desc"),
      limit(1),
    );
    const latest = await getDocs(q);
    const latestDate = toDate(latest.docs[0]?.data().startedAt);
    const availability = canStartMatch(latestDate);

    if (!availability.allowed) {
      const minutes = Math.ceil(availability.waitMs / 60000);
      setFeedback(`Another match was recently started. Try again in ${minutes} minute(s).`);
      return;
    }

    if (activeSession) {
      setFeedback("There is already an active matchmaking session. Join it instead.");
      return;
    }

    await addDoc(collection(db, "sessions"), {
      tableCode: selectedTable,
      startedBy: user.uid,
      startedByName: user.displayName || user.email || "Player",
      startedAt: serverTimestamp(),
    });

    await notifyMembers(selectedTable);
    setFeedback(`Started matchmaking at ${selectedTable}. Notifications sent to previous players.`);
  };

  const joinActiveSession = async () => {
    if (!activeSession || !user || !selectedTable) {
      return;
    }

    await joinTable();
    await setDoc(doc(db, "sessionJoins", `${activeSession.id}_${user.uid}`), {
      sessionId: activeSession.id,
      tableCode: selectedTable,
      uid: user.uid,
      joinedAt: serverTimestamp(),
      displayName: user.displayName || user.email || "Player",
    });

    setFeedback(`Joined active session started by ${activeSession.startedByName}.`);
  };

  const requestNotifications = async () => {
    if (typeof Notification === "undefined") {
      setFeedback("Notifications are not supported in this browser.");
      return;
    }

    if (Notification.permission === "default") {
      await Notification.requestPermission();
    }

    setFeedback(`Notification permission: ${Notification.permission}`);
  };

  const createTable = async () => {
    if (!isAdmin) {
      setFeedback("Only admins can add tables.");
      return;
    }

    const tableName = newTableName.trim();
    if (!tableName) {
      setFeedback("Table name is required.");
      return;
    }

    let code = generateTableCode();
    let targetDoc = doc(db, "tables", code);

    while ((await getDoc(targetDoc)).exists()) {
      code = generateTableCode();
      targetDoc = doc(db, "tables", code);
    }

    await setDoc(targetDoc, {
      code,
      name: tableName,
      createdBy: user?.uid,
      createdAt: serverTimestamp(),
    });

    setNewTableName("");
    setSelectedTable(code);
    setFeedback(`Created table ${tableName} (${code}).`);
  };

  const qrUrl = selectedTable
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(`${window.location.origin}?table=${selectedTable}`)}`
    : "";

  return (
    <Wrapper>
      <h1>Foosball Matchmaker</h1>

      <Card>
        {user ? (
          <>
            <p>Signed in as {user.displayName || user.email}</p>
            <Row>
              <Button type="button" onClick={requestNotifications}>
                Enable browser notifications
              </Button>
              <Button type="button" onClick={() => signOut(auth)}>
                Sign out
              </Button>
            </Row>
            <Hint>
              Notification status:{" "}
              {typeof Notification === "undefined" ? "unsupported" : Notification.permission}
            </Hint>
          </>
        ) : (
          <Button type="button" onClick={() => signInWithPopup(auth, googleAuthProvider)}>
            Sign in with Google
          </Button>
        )}
      </Card>

      {isAdmin && (
        <Card>
          <h2>Admin: add foosball table</h2>
          <Row>
            <Input
              placeholder="Table name"
              value={newTableName}
              onChange={(event) => setNewTableName(event.target.value)}
            />
            <Button type="button" onClick={createTable}>
              Add table
            </Button>
          </Row>
          <Hint>Codes are generated automatically as 6 characters.</Hint>
        </Card>
      )}

      <Card>
        <h2>Select table</h2>
        <Row>
          <select value={selectedTable} onChange={(event) => setSelectedTable(event.target.value)}>
            <option value="">Choose table</option>
            {tables.map((table) => (
              <option key={table.code} value={table.code}>
                {table.name} ({table.code})
              </option>
            ))}
          </select>
          {user && (
            <Button type="button" onClick={joinTable}>
              Register on table
            </Button>
          )}
        </Row>
        {joinInfo && <Hint>{joinInfo}</Hint>}
      </Card>

      <Card>
        <h2>Matchmaking</h2>
        <p>Current table: {selectedTableName}</p>
        <Row>
          <Button type="button" disabled={!user || !selectedTable} onClick={startMatchmaking}>
            Start matchmaking
          </Button>
          <Button
            type="button"
            disabled={!user || !activeSession || !selectedTable}
            onClick={joinActiveSession}
          >
            Join active matchmaking
          </Button>
        </Row>
        <Hint>
          Only one new matchmaking session may be started every {START_COOLDOWN_MINUTES} minutes per
          table.
        </Hint>
        {activeSession ? (
          <Hint>
            Active session at {selectedTable}: started by {activeSession.startedByName} at{" "}
            {activeSession.startedAt.toLocaleTimeString()}.
          </Hint>
        ) : (
          <Hint>No active session right now.</Hint>
        )}
        {feedback && <Hint>{feedback}</Hint>}
      </Card>

      {selectedTable && (
        <Card>
          <h2>QR code for this table</h2>
          <p>
            Share this code in the building so anyone can scan and join quickly: <b>{selectedTable}</b>
          </p>
          <img alt={`QR code for table ${selectedTable}`} src={qrUrl} width={220} height={220} />
        </Card>
      )}
    </Wrapper>
  );
}
