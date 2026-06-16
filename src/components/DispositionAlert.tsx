import styled from "@emotion/styled";
import type { MatchDisposition, TeamPlayer } from "../matchmaking";

const GreenAlert = styled.div`
  margin-top: 0.9rem;
  border: 1px solid #2e7d32;
  background: linear-gradient(180deg, #eafaef, #e3f5e8);
  color: #1b5e20;
  border-radius: 12px;
  padding: 1rem 1.1rem;
  box-shadow: 0 6px 18px rgba(46, 125, 50, 0.15);
`;

const AlertTitle = styled.div`
  font-weight: 700;
  margin-bottom: 0.5rem;
  font-size: 1.05rem;
`;

const TeamLine = styled.div`
  display: flex;
  align-items: center;
  gap: 0.55rem;
  margin: 0.4rem 0;
`;

const ColorDot = styled.span`
  display: inline-block;
  width: 0.95rem;
  height: 0.95rem;
  border-radius: 50%;
  border: 1px solid rgba(0, 0, 0, 0.25);
  flex: none;
`;

const Waiting = styled.div`
  margin-top: 0.5rem;
  font-size: 0.85rem;
`;

const describeTeamPlayer = (teamPlayer: TeamPlayer): string => {
  if (teamPlayer.position === "front") {
    return `front/attack: ${teamPlayer.player.displayName}`;
  }

  if (teamPlayer.position === "back") {
    return `back/defense: ${teamPlayer.player.displayName}`;
  }

  return `${teamPlayer.player.displayName} (plays all rods)`;
};

type Props = {
  disposition: MatchDisposition;
  waiting: string[];
};

export const DispositionAlert = ({ disposition, waiting }: Props) => (
  <GreenAlert role="status">
    <AlertTitle>
      {disposition.size === 2
        ? "2 players ready — head to head!"
        : "4 players ready — teams are set!"}
    </AlertTitle>
    {disposition.teams.map((team) => (
      <TeamLine key={team.color}>
        <ColorDot style={{ background: team.colorHex }} />
        <span>
          <strong>{team.color}</strong> — {team.players.map(describeTeamPlayer).join("; ")}
        </span>
      </TeamLine>
    ))}
    {waiting.length > 0 && <Waiting>Waiting: {waiting.join(", ")}</Waiting>}
  </GreenAlert>
);
