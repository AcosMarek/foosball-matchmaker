import styled from "@emotion/styled";
import { describeScore, matchSizeLabel, scoreWinner, teamColorHex } from "../matchmaking";
import { formatDelta, type MatchRating, type RatingStats } from "../ratings";
import { Badge, Card, Delta, Eyebrow, Hint, Icon, Rating } from "../ui";
import type { MatchResult, Session } from "../types";

type Props = {
  sessions: Session[];
  // Null while ratings are loading or unavailable; results then show without them.
  stats: RatingStats | null;
  currentUid: string;
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

const Sides = styled.div`
  flex-basis: 100%;
  display: grid;
  gap: 0.2rem;
`;

const Side = styled.div`
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  font-size: 0.875rem;
  line-height: 1.25rem;
`;

const SideName = styled.span`
  flex: none;
  min-width: 2.4rem;
  font-weight: 600;
`;

const Players = styled.span`
  flex: 1;
  min-width: 0;
`;

const Goals = styled.span<{ won: boolean }>`
  flex: none;
  min-width: 1.5rem;
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-weight: ${(props) => (props.won ? 700 : 400)};
`;

const Change = styled(Delta)`
  flex: none;
  min-width: 2rem;
  text-align: right;
`;

// A rated result: each side with the rating its players took into the match, the goals,
// and the points the side gained or lost.
const RatedSides = ({
  rating,
  result,
  currentUid,
}: {
  rating: MatchRating;
  result: MatchResult;
  currentUid: string;
}) => {
  const goals = [result.red, result.blue];

  return (
    <Sides>
      {rating.teams.map((team, side) => (
        <Side key={team.color}>
          <SideName style={{ color: teamColorHex(team.color) }}>{team.color}</SideName>
          <Players>
            {team.players.map((player, index) => (
              <span key={player.uid}>
                {index > 0 && ", "}
                {player.uid === currentUid ? <strong>{player.displayName}</strong> : player.displayName}{" "}
                <Rating>{rating.before[player.uid]}</Rating>
              </span>
            ))}
          </Players>
          <Goals won={goals[side] > goals[1 - side]}>{goals[side]}</Goals>
          <Change value={rating.delta[side]}>{formatDelta(rating.delta[side])}</Change>
        </Side>
      ))}
    </Sides>
  );
};

export const MatchHistoryCard = ({ sessions, stats, currentUid }: Props) => {
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
          const rating = stats?.matches[session.id];
          const when = (
            <Meta>
              {matchSizeLabel(session.targetPlayers)} ·{" "}
              {session.startedAt.toLocaleDateString([], { day: "numeric", month: "short" })}{" "}
              {session.startedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </Meta>
          );

          return rating ? (
            <Entry key={session.id}>
              {when}
              <RatedSides rating={rating} result={result} currentUid={currentUid} />
            </Entry>
          ) : (
            <Entry key={session.id}>
              <Score>{describeScore(result)}</Score>
              <Badge>{scoreWinner(result)} wins</Badge>
              {when}
              {result.lineup && <Lineup>{result.lineup}</Lineup>}
            </Entry>
          );
        })}
      </List>
      <Hint>
        Ratings are what each player held going into the match. Only the player who started a
        match can log its score.
      </Hint>
    </Card>
  );
};
