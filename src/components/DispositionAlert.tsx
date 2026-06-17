import styled from "@emotion/styled";
import { Icon } from "../ui";
import type { MatchDisposition, TeamPlayer } from "../matchmaking";

const Ready = styled.div`
  /* M3 tonal container — primary */
  margin-top: 1rem;
  border-radius: var(--md-shape-large);
  background: var(--md-sys-color-primary-container);
  color: var(--md-sys-color-on-primary-container);
  padding: 1rem 1.1rem;
`;

const ReadyHead = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  font-size: 1rem;
  line-height: 1.5rem;
  margin-bottom: 0.75rem;
`;

const Teams = styled.div`
  display: grid;
  gap: 0.5rem;
`;

const Team = styled.div`
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.55rem 0.75rem;
  border-radius: var(--md-shape-small);
  background: var(--md-sys-color-surface-container-lowest);
  border-left: 4px solid var(--md-sys-color-outline-variant);
  color: var(--md-sys-color-on-surface);
  font-size: 0.875rem;
  line-height: 1.25rem;
`;

const TeamName = styled.span`
  font-weight: 600;
`;

const Waiting = styled.div`
  margin-top: 0.7rem;
  font-size: 0.8125rem;
  line-height: 1.125rem;
  color: var(--md-sys-color-on-primary-container);
`;

const describeTeamPlayer = (teamPlayer: TeamPlayer): string =>
  teamPlayer.position === "solo"
    ? teamPlayer.player.displayName
    : `${teamPlayer.player.displayName} (${teamPlayer.position})`;

type Props = {
  disposition: MatchDisposition;
  waiting: string[];
};

export const DispositionAlert = ({ disposition, waiting }: Props) => (
  <Ready role="status">
    <ReadyHead>
      <Icon fill={1} aria-hidden>
        sports_score
      </Icon>
      {disposition.size === 2 ? "Heads up — 1v1 is on!" : "Teams are set — 2v2!"}
    </ReadyHead>
    <Teams>
      {disposition.teams.map((team) => (
        <Team key={team.color} style={{ borderLeftColor: team.colorHex }}>
          <TeamName style={{ color: team.colorHex }}>{team.color}</TeamName>
          <span>{team.players.map(describeTeamPlayer).join(", ")}</span>
        </Team>
      ))}
    </Teams>
    {waiting.length > 0 && <Waiting>Next up: {waiting.join(", ")}</Waiting>}
  </Ready>
);
