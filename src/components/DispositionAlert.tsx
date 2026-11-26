import { Fragment } from "react";
import styled from "@emotion/styled";
import { ratingOf, teamAverage, type RatingStats } from "../ratings";
import { Icon, PlayerName, Rating } from "../ui";
import type { MatchDisposition, TeamPlayer } from "../matchmaking";

const Ready = styled.div`
  /* M3 tonal container — primary */
  margin-top: 1rem;
  border-radius: var(--md-shape-large);
  background: var(--md-sys-color-primary-container);
  color: var(--md-sys-color-on-primary-container);
  padding: 1rem 1.1rem;
  /* The teams slide in from outside the card's edges. */
  overflow: hidden;
`;

const SPRING = "cubic-bezier(0.2, 0.9, 0.3, 1.2)";

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
  /* The "game on" moment: Red arrives from the left and Blue from the right. It plays
     when this card first appears, which is when the match fills (or the page opens on a
     match that already has), and not again while the card stays on screen. */
  animation: slideInLeft 0.55s ${SPRING} both;
  &:last-of-type {
    animation-name: slideInRight;
    animation-delay: 0.15s;
  }
`;

const Versus = styled.div`
  justify-self: center;
  margin: -0.15rem 0;
  padding: 0.05rem 0.6rem;
  border-radius: var(--md-shape-full);
  background: var(--md-sys-color-on-primary-container);
  color: var(--md-sys-color-primary-container);
  font-size: 0.6875rem;
  line-height: 1rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  animation: popIn 0.4s cubic-bezier(0.2, 0.9, 0.3, 1.4) 0.55s both;
`;

const TeamName = styled.span`
  font-weight: 600;
`;

const Waiting = styled.div`
  margin-top: 0.7rem;
  font-size: 0.8125rem;
  line-height: 1.125rem;
  color: var(--md-sys-color-on-primary-container);
  animation: riseIn 0.4s ease-out 0.8s both;
`;

const TeamPlayers = styled.span`
  flex: 1;
  min-width: 0;
`;

// The side's made-up name for this match (see src/teamNames.ts).
const Nick = styled.span`
  display: block;
  font-size: 0.75rem;
  line-height: 1rem;
  font-style: italic;
  color: var(--md-sys-color-on-surface-variant);
`;

const Average = styled.span`
  flex: none;
  font-size: 0.75rem;
  color: var(--md-sys-color-on-surface-variant);
`;

const positionOf = (teamPlayer: TeamPlayer): string =>
  teamPlayer.position === "solo" ? "" : ` (${teamPlayer.position})`;

type Props = {
  disposition: MatchDisposition;
  waiting: string[];
  // Null while ratings are loading or unavailable; the teams then show names only.
  stats: RatingStats | null;
  // Made-up names for Red and Blue, for a 2v2; null for a 1v1.
  teamNames: [string, string] | null;
  // Who holds this table's championship belt, if anyone, and how often they have
  // defended it.
  championUid: string | null;
  beltDefences: number;
};

// A 1v1 with the champion in it is a title match: the belt goes to whoever wins.
const isTitleMatch = (disposition: MatchDisposition, championUid: string | null): boolean =>
  disposition.size === 2 &&
  disposition.teams.some((team) => team.players.some((entry) => entry.player.uid === championUid));

const headline = (disposition: MatchDisposition, titleMatch: boolean): string =>
  titleMatch
    ? "Title match — the belt is on the line!"
    : disposition.size === 2
      ? "Heads up — 1v1 is on!"
      : "Teams are set — 2v2!";

export const DispositionAlert = ({
  disposition,
  waiting,
  stats,
  teamNames,
  championUid,
  beltDefences,
}: Props) => (
  <Ready role="status">
    <ReadyHead>
      <Icon fill={1} aria-hidden>
        {isTitleMatch(disposition, championUid) ? "workspace_premium" : "sports_score"}
      </Icon>
      {headline(disposition, isTitleMatch(disposition, championUid))}
    </ReadyHead>
    <Teams>
      {disposition.teams.map((team, teamIndex) => (
        <Fragment key={team.color}>
          {teamIndex > 0 && <Versus aria-hidden>VS</Versus>}
          <Team style={{ borderLeftColor: team.cssColor }}>
            <TeamName style={{ color: team.cssColor }}>{team.color}</TeamName>
            <TeamPlayers>
              {teamNames && <Nick>{teamNames[teamIndex]}</Nick>}
              {team.players.map((entry, index) => (
                <span key={entry.player.uid}>
                  {index > 0 && ", "}
                  <PlayerName
                    name={entry.player.displayName}
                    champion={entry.player.uid === championUid}
                    defences={beltDefences}
                  />
                  {positionOf(entry)}
                  {stats && (
                    <>
                      {" "}
                      <Rating>{ratingOf(stats, entry.player.uid)}</Rating>
                    </>
                  )}
                </span>
              ))}
            </TeamPlayers>
            {stats && team.players.length > 1 && (
              <Average>
                avg{" "}
                {teamAverage(team.players.map((entry) => ratingOf(stats, entry.player.uid)))}
              </Average>
            )}
          </Team>
        </Fragment>
      ))}
    </Teams>
    {disposition.size === 4 && (
      <Waiting>Teams are balanced by rating, and front and back take turns.</Waiting>
    )}
    {waiting.length > 0 && <Waiting>Next up: {waiting.join(", ")}</Waiting>}
  </Ready>
);
