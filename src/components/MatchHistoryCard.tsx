import styled from "@emotion/styled";
import { describeScore, matchSizeLabel, scoreWinner } from "../matchmaking";
import { Badge, Card, Eyebrow, Hint, Icon } from "../ui";
import type { Session } from "../types";

type Props = {
  sessions: Session[];
};

const List = styled.ol`
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.5rem;
`;

const Entry = styled.li`
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
  padding: 0.6rem 0.75rem;
  border-radius: var(--md-shape-small);
  background: var(--md-sys-color-surface-container-high);
`;

const Score = styled.span`
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--md-sys-color-on-surface);
`;

const Meta = styled.span`
  font-size: 0.8125rem;
  color: var(--md-sys-color-on-surface-variant);
`;

const Lineup = styled.p`
  flex-basis: 100%;
  margin: 0;
  font-size: 0.75rem;
  line-height: 1.125rem;
  color: var(--md-sys-color-on-surface-variant);
`;

export const MatchHistoryCard = ({ sessions }: Props) => {
  const played = sessions.filter((session) => session.result);
  if (played.length === 0) {
    return null;
  }

  return (
    <Card>
      <Eyebrow>
        <Icon size={16} aria-hidden>
          history
        </Icon>
        Recent results
      </Eyebrow>
      <List>
        {played.map((session) => {
          const result = session.result!;

          return (
            <Entry key={session.id}>
              <Score>{describeScore(result)}</Score>
              <Badge>{scoreWinner(result)} wins</Badge>
              <Meta>
                {matchSizeLabel(session.targetPlayers)} ·{" "}
                {session.startedAt.toLocaleDateString([], { day: "numeric", month: "short" })}{" "}
                {session.startedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </Meta>
              {result.lineup && <Lineup>{result.lineup}</Lineup>}
            </Entry>
          );
        })}
      </List>
      <Hint>Only the player who started a match can log its score.</Hint>
    </Card>
  );
};
