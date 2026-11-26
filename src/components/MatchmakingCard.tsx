import { useEffect, useRef, useState } from "react";
import styled from "@emotion/styled";
import type { User } from "firebase/auth";
import {
  ensureTeams,
  joinSession,
  notifyJoin,
  notifyTableMembers,
  registerOnTable,
  startSession,
} from "../api";
import { useNow } from "../hooks";
import {
  SUPPORTED_PLAYER_COUNTS,
  canStartMatch,
  fillWindowRemaining,
  joinLinkMatches,
  matchPhase,
  matchSizeLabel,
  type MatchSize,
} from "../matchmaking";
import { Card, Eyebrow, Hint, Icon, PrimaryButton, Row } from "../ui";
import type { RatingStats } from "../ratings";
import { teamNamesFor } from "../teamNames";
import { balanceTeams, dispositionFromTeams } from "../teams";
import type { JoinedPlayer, Session } from "../types";
import { MatchStatus } from "./MatchStatus";

const TEAM_REPAIR_DELAY_MS = 4000;

const TableLine = styled.p`
  margin: 0 0 0.9rem;
  font-size: 1.125rem;
  line-height: 1.5rem;
  color: var(--md-sys-color-on-surface);
  & strong {
    font-weight: 600;
  }
`;

// The one action that matters while a match is filling, so it takes the whole row: wider
// and taller than a standard M3 button, with the live pulse to draw the eye.
const JoinButton = styled(PrimaryButton)`
  width: 100%;
  min-height: 56px;
  font-size: 1.0625rem;
  line-height: 1.5rem;
  font-weight: 600;
  animation: pulse 1.8s ease-out infinite;
`;

const JoinMeta = styled.span`
  font-weight: 400;
  opacity: 0.85;
`;

type Props = {
  user: User | null;
  selectedTable: string;
  selectedTableName: string;
  activeSession: Session | null;
  sessionPlayers: JoinedPlayer[];
  stats: RatingStats | null;
  // Who holds this table's championship belt, if anyone, and how often they have
  // defended it.
  championUid: string | null;
  beltDefences: number;
  // Set when the app was opened through Slack's "Jump in" button: when that post went
  // out, in ms. The card then joins the match it was posted for, once, and reports back
  // through `onAutoJoinDone` whether or not there was anything to join.
  autoJoinStamp: number | null;
  onAutoJoinDone: () => void;
};

export const MatchmakingCard = ({
  user,
  selectedTable,
  selectedTableName,
  activeSession,
  sessionPlayers,
  stats,
  championUid,
  beltDefences,
  autoJoinStamp,
  onAutoJoinDone,
}: Props) => {
  const [feedback, setFeedback] = useState("");
  const [joinedSessionId, setJoinedSessionId] = useState("");

  const targetPlayers = activeSession?.targetPlayers ?? 4;
  // The stored teams are the ones that count. Until they land, a moment after the match
  // fills, this shows the pick this client would make, which is normally the same one.
  const disposition = !activeSession
    ? null
    : activeSession.teams
      ? dispositionFromTeams(activeSession.teams, targetPlayers)
      : balanceTeams(sessionPlayers, targetPlayers, stats);
  const waiting = disposition
    ? sessionPlayers.slice(disposition.size).map((player) => player.displayName)
    : [];

  const now = useNow(!!activeSession);
  const phase = activeSession
    ? matchPhase(activeSession.startedAt, sessionPlayers.length, targetPlayers, new Date(now))
    : null;
  const liveSession = !!activeSession && phase !== "expired";
  const matchFull = phase === "ready";

  // The roster listener can trail the session by a moment, so the starter and a player
  // who just joined are counted as in without waiting for it.
  const joined =
    !!user &&
    !!activeSession &&
    (activeSession.startedBy === user.uid ||
      joinedSessionId === activeSession.id ||
      sessionPlayers.some((player) => player.uid === user.uid));
  const canJoin = liveSession && !matchFull && !joined;
  const spotsLeft = Math.max(0, targetPlayers - sessionPlayers.length);
  const fillRemainingMs = activeSession
    ? fillWindowRemaining(activeSession.startedAt, new Date(now))
    : 0;
  const cooldownMs = activeSession
    ? canStartMatch(activeSession.startedAt, new Date(now)).waitMs
    : 0;

  // A match that times out simply resets. It used to be announced in Slack ("No game,
  // timed out with 1/4 players"), which singled out the one person who had tried to get a
  // game going; trying must never cost anything.
  // The join that fills a match stores its teams. If that client dropped out before it
  // could, any player still looking at the full match stores them instead, after a pause
  // that lets the usual path go first. Waits for ratings, since storing without them
  // would settle for the join order.
  const hasTeams = !!activeSession?.teams;
  const activeSessionId = activeSession?.id ?? "";
  useEffect(() => {
    if (!activeSessionId || !matchFull || hasTeams || !joined || !stats) {
      return;
    }

    const timer = setTimeout(() => {
      void ensureTeams(activeSessionId, sessionPlayers, targetPlayers, stats).catch((error) =>
        console.error("Couldn't store the teams", error),
      );
    }, TEAM_REPAIR_DELAY_MS);

    return () => clearTimeout(timer);
  }, [activeSessionId, matchFull, hasTeams, joined, stats, sessionPlayers, targetPlayers]);

  const handleStart = async (size: MatchSize) => {
    if (!user || !selectedTable) {
      return;
    }

    try {
      await registerOnTable(user, selectedTable);
      await startSession(user, selectedTable, size);
      setFeedback(`${matchSizeLabel(size)} is on — you're first in.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setFeedback(`Couldn't start: ${message}`);
      return;
    }

    // Best-effort: the match exists either way, so a failed alert must not surface as a
    // failed start — but it must not pass silently either.
    try {
      const notified = await notifyTableMembers(user, selectedTable, size, stats);
      if (notified > 0) {
        setFeedback(
          `${matchSizeLabel(size)} is on — pinged ${notified} player${notified === 1 ? "" : "s"}.`,
        );
      }
    } catch (error) {
      console.error("notifyTableMembers failed", error);
      setFeedback(`${matchSizeLabel(size)} is on, but the table couldn't be alerted.`);
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
      setJoinedSessionId(activeSession.id);
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
        sessionPlayers,
        stats,
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

  // Opened through Slack's "Jump in": join without a second tap. Waits until the match
  // and its roster have loaded, since both arrive a moment after the page does and the
  // roster is what says whether this player is already in. The flag is spent on the first
  // verdict either way: joined, or nothing to join (a different match, a full or timed-out
  // one, or already in it), in which case the table simply opens as usual.
  const rosterLoaded = sessionPlayers.length > 0;
  const linkedSessionId =
    autoJoinStamp !== null &&
    activeSession &&
    joinLinkMatches(autoJoinStamp, activeSession.startedAt)
      ? activeSession.id
      : "";
  const autoJoin = useRef({ handleJoin, onAutoJoinDone, spent: false });
  autoJoin.current.handleJoin = handleJoin;
  autoJoin.current.onAutoJoinDone = onAutoJoinDone;
  useEffect(() => {
    if (autoJoinStamp === null || !user || !activeSession || autoJoin.current.spent) {
      return;
    }
    if (linkedSessionId && !rosterLoaded) {
      return;
    }

    // Marked before anything else so that no second run of this effect can join twice.
    autoJoin.current.spent = true;
    autoJoin.current.onAutoJoinDone();
    if (linkedSessionId && canJoin) {
      void autoJoin.current.handleJoin();
    }
  }, [autoJoinStamp, user, activeSession, linkedSessionId, rosterLoaded, canJoin]);

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
        {canJoin ? (
          // Starting is impossible while a match is filling, so joining replaces the start
          // buttons rather than competing with two disabled ones.
          <JoinButton type="button" disabled={!selectedTable} onClick={handleJoin}>
            <Icon size={24} aria-hidden>
              sports_soccer
            </Icon>
            Jump in
            <JoinMeta>
              · {spotsLeft} spot{spotsLeft === 1 ? "" : "s"} left
            </JoinMeta>
          </JoinButton>
        ) : (
          SUPPORTED_PLAYER_COUNTS.map((size) => (
            <PrimaryButton
              key={size}
              type="button"
              disabled={!selectedTable || liveSession}
              onClick={() => handleStart(size)}
            >
              <Icon aria-hidden>add</Icon>
              New {matchSizeLabel(size)}
            </PrimaryButton>
          ))
        )}
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
        stats={stats}
        teamNames={activeSession && targetPlayers === 4 ? teamNamesFor(activeSession.id) : null}
        championUid={championUid}
        beltDefences={beltDefences}
        currentUid={user?.uid ?? ""}
      />
      {feedback && <Hint>{feedback}</Hint>}
    </Card>
  );
};
