import { useState } from "react";
import type { User } from "firebase/auth";
import { joinSession, registerOnTable, startSession } from "../api";
import { useNow } from "../hooks";
import {
  RESET_MINUTES,
  SUPPORTED_PLAYER_COUNTS,
  buildMatchDisposition,
  canStartMatch,
  fillWindowRemaining,
  matchPhase,
  type MatchSize,
} from "../matchmaking";
import { Button, Card, Hint, PrimaryButton, Row } from "../ui";
import type { JoinedPlayer, Session } from "../types";
import { MatchStatus } from "./MatchStatus";

type Props = {
  user: User | null;
  selectedTable: string;
  selectedTableName: string;
  activeSession: Session | null;
  sessionPlayers: JoinedPlayer[];
};

export const MatchmakingCard = ({
  user,
  selectedTable,
  selectedTableName,
  activeSession,
  sessionPlayers,
}: Props) => {
  const [feedback, setFeedback] = useState("");

  const targetPlayers = activeSession?.targetPlayers ?? 4;
  const disposition = activeSession ? buildMatchDisposition(sessionPlayers, targetPlayers) : null;
  const waiting = disposition
    ? sessionPlayers.slice(disposition.size).map((player) => player.displayName)
    : [];

  const now = useNow(!!activeSession);
  const phase = activeSession
    ? matchPhase(activeSession.startedAt, sessionPlayers.length, targetPlayers, new Date(now))
    : null;
  const liveSession = !!activeSession && phase !== "expired";
  const matchFull = phase === "ready";
  const fillRemainingMs = activeSession
    ? fillWindowRemaining(activeSession.startedAt, new Date(now))
    : 0;
  const cooldownMs = activeSession
    ? canStartMatch(activeSession.startedAt, new Date(now)).waitMs
    : 0;

  const handleStart = async (size: MatchSize) => {
    if (!user || !selectedTable) {
      return;
    }

    try {
      await registerOnTable(user, selectedTable);

      const notified = await startSession(user, selectedTable, size);
      setFeedback(
        notified > 0
          ? `Started a ${size}-player match. Notified ${notified} other player(s).`
          : `Started a ${size}-player match. No other registered players to notify yet.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setFeedback(`Could not start the match: ${message}`);
    }
  };

  const handleJoin = async () => {
    if (!activeSession || !user || !selectedTable) {
      return;
    }

    try {
      await registerOnTable(user, selectedTable);
      await joinSession(user, activeSession.id, selectedTable);
      setFeedback(`Joined the match started by ${activeSession.startedByName}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setFeedback(`Could not join the match: ${message}`);
    }
  };

  return (
    <Card>
      <h2>Matchmaking</h2>
      <p>Current table: {selectedTableName}</p>
      <Row>
        {SUPPORTED_PLAYER_COUNTS.map((size) => (
          <PrimaryButton
            key={size}
            type="button"
            disabled={!user || !selectedTable || liveSession}
            onClick={() => handleStart(size)}
          >
            Start {size}-player match
          </PrimaryButton>
        ))}
        <Button
          type="button"
          disabled={!user || !selectedTable || !liveSession || matchFull}
          onClick={handleJoin}
        >
          Join active match
        </Button>
      </Row>
      <Hint>
        A match resets if it doesn’t fill within {RESET_MINUTES} minutes, so anyone can start again.
      </Hint>
      <MatchStatus
        phase={phase}
        liveSession={liveSession}
        matchFull={matchFull}
        selectedTable={selectedTable}
        activeSession={activeSession}
        sessionPlayers={sessionPlayers}
        targetPlayers={targetPlayers}
        disposition={disposition}
        waiting={waiting}
        fillRemainingMs={fillRemainingMs}
        cooldownMs={cooldownMs}
      />
      {feedback && <Hint>{feedback}</Hint>}
    </Card>
  );
};
