import { useState } from "react";
import styled from "@emotion/styled";
import type { User } from "firebase/auth";
import { joinSession, registerOnTable, startSession } from "../api";
import { useNow } from "../hooks";
import {
  SUPPORTED_PLAYER_COUNTS,
  buildMatchDisposition,
  canStartMatch,
  fillWindowRemaining,
  matchPhase,
  type MatchSize,
} from "../matchmaking";
import { Button, Card, Eyebrow, Hint, Icon, PrimaryButton, Row } from "../ui";
import type { JoinedPlayer, Session } from "../types";
import { MatchStatus } from "./MatchStatus";

const sizeLabel = (size: MatchSize): string => (size === 2 ? "1v1" : "2v2");

const TableLine = styled.p`
  margin: 0 0 0.9rem;
  font-size: 1.125rem;
  line-height: 1.5rem;
  color: var(--md-sys-color-on-surface);
  & strong {
    font-weight: 600;
  }
`;

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
          ? `${sizeLabel(size)} is on — pinged ${notified} player${notified === 1 ? "" : "s"}.`
          : `${sizeLabel(size)} is on — you're first in.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setFeedback(`Couldn't start: ${message}`);
    }
  };

  const handleJoin = async () => {
    if (!activeSession || !user || !selectedTable) {
      return;
    }

    try {
      await registerOnTable(user, selectedTable);
      await joinSession(user, activeSession.id, selectedTable);
      setFeedback("You're in. Good luck.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setFeedback(`Couldn't join: ${message}`);
    }
  };

  return (
    <Card>
      <Eyebrow>
        <Icon size={16} aria-hidden>
          sports_esports
        </Icon>
        Matchmaking
      </Eyebrow>
      <TableLine>
        Playing at <strong>{selectedTableName}</strong>
      </TableLine>
      <Row>
        {SUPPORTED_PLAYER_COUNTS.map((size) => (
          <PrimaryButton
            key={size}
            type="button"
            disabled={!selectedTable || liveSession}
            onClick={() => handleStart(size)}
          >
            <Icon aria-hidden>add</Icon>
            New {sizeLabel(size)}
          </PrimaryButton>
        ))}
        <Button
          type="button"
          disabled={!selectedTable || !liveSession || matchFull}
          onClick={handleJoin}
        >
          Jump in
        </Button>
      </Row>
      <MatchStatus
        phase={phase}
        liveSession={liveSession}
        matchFull={matchFull}
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
