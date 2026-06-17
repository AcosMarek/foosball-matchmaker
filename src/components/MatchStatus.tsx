import styled from "@emotion/styled";
import { RESET_MINUTES, type MatchDisposition, type MatchPhase } from "../matchmaking";
import { Badge, Hint } from "../ui";
import type { JoinedPlayer, Session } from "../types";
import { DispositionAlert } from "./DispositionAlert";

const PlayerChips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.5rem;
`;

const Chip = styled.span`
  /* M3 assist chip */
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.3rem 0.75rem;
  border-radius: var(--md-shape-small);
  background: var(--md-sys-color-surface-container-high);
  border: 1px solid var(--md-sys-color-outline-variant);
  color: var(--md-sys-color-on-surface);
  font-size: 0.8125rem;
  line-height: 1.125rem;
`;

const ChipIndex = styled.span`
  font-weight: 700;
  color: var(--md-sys-color-primary);
`;

const Countdown = styled.p`
  margin: 0.5rem 0 0;
  font-weight: 500;
  color: var(--app-warning);
`;

const ResetNotice = styled.p`
  margin: 0.5rem 0 0;
  font-weight: 500;
  color: var(--md-sys-color-error);
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
  selectedTable: string;
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
  selectedTable,
  activeSession,
  sessionPlayers,
  targetPlayers,
  disposition,
  waiting,
  fillRemainingMs,
  cooldownMs,
}: Props) => (
  <>
    {liveSession && phase === "filling" && (
      <Countdown>
        Matchmaking resets in {formatCountdown(fillRemainingMs)} if it doesn’t fill.
      </Countdown>
    )}
    {matchFull && cooldownMs > 0 && (
      <Countdown>New match can be launched in {formatCountdown(cooldownMs)}.</Countdown>
    )}
    {phase === "expired" && (
      <ResetNotice>
        Matchmaking reset — not enough players joined in {RESET_MINUTES} minutes. Start a new match.
      </ResetNotice>
    )}
    {liveSession && activeSession ? (
      <Hint>
        <Badge>{activeSession.targetPlayers}-player</Badge> Active match at {selectedTable}: started
        by {activeSession.startedByName} at {activeSession.startedAt.toLocaleTimeString()}.
      </Hint>
    ) : (
      <Hint>No active match right now.</Hint>
    )}
    {liveSession && (
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
    {liveSession && disposition && <DispositionAlert disposition={disposition} waiting={waiting} />}
  </>
);
