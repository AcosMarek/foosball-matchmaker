import { useState } from "react";
import styled from "@emotion/styled";
import { matchSizeLabel, teamColorHex } from "../matchmaking";
import { formatDelta, type MatchRating } from "../ratings";
import { Delta, Rating, TextButton } from "../ui";

export const MatchList = styled.ol`
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.5rem;
`;

// `--match-entry-bg` lets a host surface that already uses the default tone (the stats
// dialog) swap in one that stands out against it.
export const MatchEntry = styled.li`
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
  padding: 0.6rem 0.75rem;
  border-radius: var(--md-shape-small);
  background: var(--match-entry-bg, var(--md-sys-color-surface-container-high));
`;

export const MatchMeta = styled.span`
  font-size: 0.8125rem;
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

const More = styled(TextButton)`
  margin-top: 0.5rem;
`;

// "22 Oct 10:58", with the year once the match is from an earlier one.
export const formatMatchTime = (at: Date, now: Date = new Date()): string => {
  const date = at.toLocaleDateString([], {
    day: "numeric",
    month: "short",
    ...(at.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });

  return `${date} ${at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
};

const DEFAULT_PAGE = 5;

type Props = {
  // Newest first.
  matches: MatchRating[];
  currentUid: string;
  // Names the table in each entry; for lists that span tables.
  tableLabel?: (tableCode: string) => string;
  pageSize?: number;
};

// Rated results, a page at a time: each side with the rating its players took into the
// match, the goals, and the points the side gained or lost.
export const RatedMatchList = ({
  matches,
  currentUid,
  tableLabel,
  pageSize = DEFAULT_PAGE,
}: Props) => {
  const [shown, setShown] = useState(pageSize);
  const hidden = matches.length - shown;

  return (
    <>
      <MatchList>
        {matches.slice(0, shown).map((match) => {
          const goals = [match.score.red, match.score.blue];

          return (
            <MatchEntry key={match.sessionId}>
              <MatchMeta>
                {matchSizeLabel(match.size)} · {formatMatchTime(match.startedAt)}
                {tableLabel && ` · ${tableLabel(match.tableCode)}`}
              </MatchMeta>
              <Sides>
                {match.teams.map((team, side) => (
                  <Side key={team.color}>
                    <SideName style={{ color: teamColorHex(team.color) }}>{team.color}</SideName>
                    <Players>
                      {team.players.map((player, index) => (
                        <span key={player.uid}>
                          {index > 0 && ", "}
                          {player.uid === currentUid ? (
                            <strong>{player.displayName}</strong>
                          ) : (
                            player.displayName
                          )}{" "}
                          <Rating>{match.before[player.uid]}</Rating>
                        </span>
                      ))}
                    </Players>
                    <Goals won={goals[side] > goals[1 - side]}>{goals[side]}</Goals>
                    <Change value={match.delta[side]}>{formatDelta(match.delta[side])}</Change>
                  </Side>
                ))}
              </Sides>
            </MatchEntry>
          );
        })}
      </MatchList>
      {hidden > 0 && (
        <More type="button" onClick={() => setShown(shown + pageSize)}>
          Show older ({hidden} more)
        </More>
      )}
    </>
  );
};
