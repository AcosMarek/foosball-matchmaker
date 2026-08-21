import { useEffect, useRef, useState } from "react";
import styled from "@emotion/styled";
import type { User } from "firebase/auth";
import {
  joinSession,
  notifyJoin,
  notifyMatchExpired,
  registerOnTable,
  startSession,
} from "../api";
import { useNow } from "../hooks";
import {
  SUPPORTED_PLAYER_COUNTS,
  buildMatchDisposition,
  canStartMatch,
  fillWindowRemaining,
  matchPhase,
  matchSizeLabel,
  type MatchSize,
} from "../matchmaking";
import { Button, Card, Eyebrow, Hint, Icon, PrimaryButton, Row } from "../ui";
import type { JoinedPlayer, Session } from "../types";
import { MatchStatus } from "./MatchStatus";

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

  // Only clients with the table open can notice the window lapse, so whoever sees it
  // first announces and the claim collapses the rest.
  const expiryAnnounced = useRef("");
  useEffect(() => {
    if (!user || !activeSession || !selectedTable || phase !== "expired") {
      return;
    }
    if (expiryAnnounced.current === activeSession.id) {
      return;
    }

    expiryAnnounced.current = activeSession.id;
    void notifyMatchExpired(
      user,
      activeSession.id,
      selectedTable,
      activeSession.targetPlayers,
    ).catch((error) => console.error("notifyMatchExpired failed", error));
  }, [user, activeSession, selectedTable, phase]);

  const handleStart = async (size: MatchSize) => {
    if (!user || !selectedTable) {
      return;
    }

    try {
      await registerOnTable(user, selectedTable);

      const notified = await startSession(user, selectedTable, size);
      setFeedback(
        notified > 0
          ? `${matchSizeLabel(size)} is on — pinged ${notified} player${notified === 1 ? "" : "s"}.`
          : `${matchSizeLabel(size)} is on — you're first in.`,
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

    let position = 0;
    try {
      await registerOnTable(user, selectedTable);
      position = await joinSession(user, activeSession.id, selectedTable);
      setFeedback("You're in. Good luck.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setFeedback(`Couldn't join: ${message}`);
      return;
    }

    // Best-effort: if this join filled the match, ping the other participants.
    // Joining already succeeded, so failures here must not surface as a join error.
    try {
      const pinged = await notifyJoin(
        user,
        activeSession.id,
        selectedTable,
        activeSession.targetPlayers,
        position,
      );
      if (pinged > 0) {
        setFeedback(`Game on! Pinged ${pinged} player${pinged === 1 ? "" : "s"}.`);
      }
    } catch (error) {
      // Swallowing this silently once cost three matches their announcement with no trace.
      console.error("notifyJoin failed", error);
      setFeedback("You're in, but the alert couldn't be posted.");
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
            New {matchSizeLabel(size)}
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
