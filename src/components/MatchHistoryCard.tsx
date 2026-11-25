import styled from "@emotion/styled";
import { describeScore, matchSizeLabel, scoreWinner } from "../matchmaking";
import { matchesFor, type RatingStats } from "../ratings";
import { Badge, Card, Eyebrow, Hint, Icon } from "../ui";
import type { Session } from "../types";
import {
  MatchEntry,
  MatchList,
  MatchMeta,
  RatedMatchList,
  formatMatchTime,
} from "./RatedMatchList";

type Props = {
  tableCode: string;
  // The table's most recent sessions. Only a fallback: they cover a short window, so they
  // are used for results the ratings don't (yet) include.
  sessions: Session[];
  // Null while ratings are loading or unavailable.
  stats: RatingStats | null;
  // Commentary per match, by session id.
  notes: Record<string, string>;
  currentUid: string;
};

const Score = styled.span`
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--md-sys-color-on-surface);
`;

const Lineup = styled.p`
  flex-basis: 100%;
  margin: 0;
  font-size: 0.75rem;
  line-height: 1.125rem;
  color: var(--md-sys-color-on-surface-variant);
`;

const Unrated = styled.div`
  margin-top: 0.5rem;
`;

// Every scored match at the table, newest first, a page at a time. The list comes from
// the rating history, which holds all scored matches, rather than from the recent-session
// listener: that one only sees the last few sessions, most of them unfilled, so results
// used to drop out of view within days.
export const MatchHistoryCard = ({ tableCode, sessions, stats, notes, currentUid }: Props) => {
  const rated = stats ? matchesFor(stats, { tableCode }) : [];
  const unrated = sessions.filter((session) => session.result && !stats?.matches[session.id]);
  if (rated.length === 0 && unrated.length === 0) {
    return null;
  }

  return (
    <Card>
      <Eyebrow>
        <Icon size={16} aria-hidden>
          history
        </Icon>
        Match history
      </Eyebrow>
      {rated.length > 0 && <RatedMatchList matches={rated} currentUid={currentUid} notes={notes} />}
      {unrated.length > 0 && (
        <Unrated>
          <MatchList>
            {unrated.map((session) => {
              const result = session.result!;

              return (
                <MatchEntry key={session.id}>
                  <Score>{describeScore(result)}</Score>
                  <Badge>{scoreWinner(result)} wins</Badge>
                  <MatchMeta>
                    {matchSizeLabel(session.targetPlayers)} · {formatMatchTime(session.startedAt)}
                  </MatchMeta>
                  {result.lineup && <Lineup>{result.lineup}</Lineup>}
                </MatchEntry>
              );
            })}
          </MatchList>
        </Unrated>
      )}
      <Hint>
        Ratings are what each player held going into the match. Anyone who played in a match
        can log its score or cancel it, for an hour after it started.
      </Hint>
    </Card>
  );
};
