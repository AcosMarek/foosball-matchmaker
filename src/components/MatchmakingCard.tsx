import { useState } from "react";
import styled from "@emotion/styled";
import type { User } from "firebase/auth";
import { getLatestSessionStart, joinSession, registerOnTable, startSession } from "../api";
import { useNow } from "../hooks";
import {
  MS_PER_MINUTE,
  START_COOLDOWN_MINUTES,
  SUPPORTED_PLAYER_COUNTS,
  buildMatchDisposition,
  canStartMatch,
  type MatchSize,
} from "../matchmaking";
import { Badge, Button, Card, Hint, PrimaryButton, Row } from "../ui";
import type { JoinedPlayer, Session } from "../types";
import { DispositionAlert } from "./DispositionAlert";

const PlayerChips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.5rem;
`;

const Chip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.25rem 0.65rem;
  border-radius: 999px;
  background: #f2f5f8;
  border: 1px solid #e0e6ea;
  font-size: 0.85rem;
`;

const ChipIndex = styled.span`
  font-weight: 700;
  color: #2e7d32;
`;

const Countdown = styled.p`
  margin: 0.5rem 0 0;
  font-weight: 600;
  color: #b26a00;
`;

const formatCountdown = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

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
  const matchFull = !!disposition;

  const now = useNow(!!activeSession);
  const cooldownMs = activeSession
    ? canStartMatch(activeSession.startedAt, new Date(now)).waitMs
    : 0;

  const handleStart = async (size: MatchSize) => {
    if (!user || !selectedTable) {
      return;
    }

    try {
      await registerOnTable(user, selectedTable);

      const availability = canStartMatch(await getLatestSessionStart(selectedTable));
      if (!availability.allowed) {
        const minutes = Math.ceil(availability.waitMs / MS_PER_MINUTE);
        setFeedback(`Another match was recently started. Try again in ${minutes} minute(s).`);
        return;
      }

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
            disabled={!user || !selectedTable || !!activeSession}
            onClick={() => handleStart(size)}
          >
            Start {size}-player match
          </PrimaryButton>
        ))}
        <Button
          type="button"
          disabled={!user || !selectedTable || !activeSession || matchFull}
          onClick={handleJoin}
        >
          Join active match
        </Button>
      </Row>
      <Hint>
        Only one new match may be started every {START_COOLDOWN_MINUTES} minutes per table.
      </Hint>
      {activeSession && cooldownMs > 0 && (
        <Countdown>New match can be launched in {formatCountdown(cooldownMs)}.</Countdown>
      )}
      {activeSession ? (
        <Hint>
          <Badge>{activeSession.targetPlayers}-player</Badge> Active match at {selectedTable}: started
          by {activeSession.startedByName} at {activeSession.startedAt.toLocaleTimeString()}.
        </Hint>
      ) : (
        <Hint>No active match right now.</Hint>
      )}
      {activeSession && (
        <>
          <Hint>
            Players joined: {sessionPlayers.length} / {targetPlayers}
            {sessionPlayers.length < targetPlayers
              ? ` (need ${targetPlayers - sessionPlayers.length} more)`
              : ""}
          </Hint>
          {sessionPlayers.length > 0 && (
            <PlayerChips>
              {sessionPlayers.map((player, index) => (
                <Chip key={player.uid}>
                  <ChipIndex>{index + 1}</ChipIndex>
                  {player.displayName}
                </Chip>
              ))}
            </PlayerChips>
          )}
        </>
      )}
      {disposition && <DispositionAlert disposition={disposition} waiting={waiting} />}
      {feedback && <Hint>{feedback}</Hint>}
    </Card>
  );
};
