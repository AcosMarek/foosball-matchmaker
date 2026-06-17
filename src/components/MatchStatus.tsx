import styled from "@emotion/styled";
import {
  RESET_MINUTES,
  START_COOLDOWN_MINUTES,
  MS_PER_MINUTE,
  type MatchDisposition,
  type MatchPhase,
} from "../matchmaking";
import { Badge, CountdownRing, Icon, LiveDot, StatValue } from "../ui";
import type { JoinedPlayer, Session } from "../types";
import { DispositionAlert } from "./DispositionAlert";

const RESET_TOTAL_MS = RESET_MINUTES * MS_PER_MINUTE;
const COOLDOWN_TOTAL_MS = START_COOLDOWN_MINUTES * MS_PER_MINUTE;

const StatusBlock = styled.div`
  margin-top: 1.1rem;
  padding-top: 1.1rem;
  border-top: 1px solid var(--md-sys-color-outline-variant);
`;

const Idle = styled.p`
  margin: 0;
  font-size: 0.95rem;
  color: var(--md-sys-color-on-surface-variant);
`;

const LiveRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  font-size: 0.875rem;
  color: var(--md-sys-color-on-surface-variant);
  margin-bottom: 0.7rem;
`;

const StatRow = styled.div`
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
`;

const StatHint = styled.span`
  font-size: 0.875rem;
  color: var(--md-sys-color-on-surface-variant);
`;

const PlayerChips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.7rem;
`;

const Chip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.3rem 0.75rem 0.3rem 0.3rem;
  border-radius: var(--md-shape-full);
  background: var(--md-sys-color-surface-container-high);
  color: var(--md-sys-color-on-surface);
  font-size: 0.8125rem;
  animation: chipIn 0.25s ease-out both;
`;

const ChipIndex = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.35rem;
  height: 1.35rem;
  border-radius: 50%;
  background: var(--md-sys-color-primary);
  color: var(--md-sys-color-on-primary);
  font-size: 0.7rem;
  font-weight: 700;
  flex: none;
`;

const CountWrap = styled.div`
  margin-top: 0.9rem;
`;

const ResetNotice = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 0.9rem;
  border-radius: var(--md-shape-small);
  background: var(--md-sys-color-error-container);
  color: var(--md-sys-color-on-error-container);
  font-size: 0.875rem;
  font-weight: 500;
`;

const formatCountdown = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

type Props = {
  phase: MatchPhase | null;
  liveSession: boolean;
  matchFull: boolean;
  activeSession: Session | null;
  sessionPlayers: JoinedPlayer[];
  targetPlayers: number;
  disposition: MatchDisposition | null;
  waiting: string[];
  fillRemainingMs: number;
  cooldownMs: number;
};

export const MatchStatus = ({
  phase,
  liveSession,
  matchFull,
  activeSession,
  sessionPlayers,
  targetPlayers,
  disposition,
  waiting,
  fillRemainingMs,
  cooldownMs,
}: Props) => {
  if (phase === "expired") {
    return (
      <StatusBlock>
        <ResetNotice role="status">
          <Icon size={18} aria-hidden>
            timer_off
          </Icon>
          Reset — not enough players in {RESET_MINUTES} min. Start a fresh one.
        </ResetNotice>
      </StatusBlock>
    );
  }

  if (!liveSession || !activeSession) {
    return (
      <StatusBlock>
        <Idle>No match running. Start one above.</Idle>
      </StatusBlock>
    );
  }

  const remaining = targetPlayers - sessionPlayers.length;

  return (
    <StatusBlock>
      <LiveRow>
        <LiveDot aria-hidden />
        <Badge>{activeSession.targetPlayers === 2 ? "1v1" : "2v2"}</Badge>
        <span>
          {activeSession.startedByName} ·{" "}
          {activeSession.startedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </LiveRow>

      <StatRow>
        <StatValue>
          {sessionPlayers.length}/{targetPlayers}
        </StatValue>
        <StatHint>{remaining > 0 ? `${remaining} more to go` : "table's full"}</StatHint>
      </StatRow>

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

      {phase === "filling" && (
        <CountWrap>
          <CountdownRing
            remainingMs={fillRemainingMs}
            totalMs={RESET_TOTAL_MS}
            timeText={formatCountdown(fillRemainingMs)}
            label="until this resets"
            tone="warning"
          />
        </CountWrap>
      )}
      {matchFull && cooldownMs > 0 && (
        <CountWrap>
          <CountdownRing
            remainingMs={cooldownMs}
            totalMs={COOLDOWN_TOTAL_MS}
            timeText={formatCountdown(cooldownMs)}
            label="until the next match"
            tone="primary"
          />
        </CountWrap>
      )}

      {disposition && <DispositionAlert disposition={disposition} waiting={waiting} />}
    </StatusBlock>
  );
};
