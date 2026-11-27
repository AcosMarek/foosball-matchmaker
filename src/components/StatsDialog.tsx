import { useEffect, useRef } from "react";
import styled from "@emotion/styled";
import {
  START_RATING,
  bestPartner,
  formatDelta,
  ratingChangeSince,
  toughestOpponent,
  winRate,
  type MatchRating,
  type PlayerStats,
  type Versus,
} from "../ratings";
import { BADGES, type BadgeHolder, type HeldBadge } from "../badges";
import { Delta, Dialog, Eyebrow, Hint, Icon, IconButton, thinScrollbar } from "../ui";
import { RatedMatchList } from "./RatedMatchList";

const Head = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
`;

const Metrics = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
  margin-bottom: 0.75rem;
`;

const Metric = styled.div`
  padding: 0.6rem 0.75rem;
  border-radius: var(--md-shape-medium);
  background: var(--md-sys-color-surface-container-lowest);
`;

const MetricLabel = styled.div`
  font-size: 0.75rem;
  line-height: 1rem;
  color: var(--md-sys-color-on-surface-variant);
  /* A long table name is cut short rather than making one tile taller than the rest */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const MetricValue = styled.div`
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  font-size: 1.5rem;
  line-height: 2rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
`;

const MetricNote = styled.span`
  font-size: 0.8125rem;
  font-weight: 400;
  color: var(--md-sys-color-on-surface-variant);
`;

const Line = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.45rem 0;
  border-top: 1px solid var(--md-sys-color-outline-variant);
  font-size: 0.875rem;
  line-height: 1.25rem;
  font-variant-numeric: tabular-nums;
  & > :first-of-type {
    color: var(--md-sys-color-on-surface-variant);
  }
`;

// The badges this player holds, and behind a fold every badge the table hands out.
const Badges = styled.div`
  padding: 0.45rem 0 0.2rem;
  border-top: 1px solid var(--md-sys-color-outline-variant);
`;

const BadgeRow = styled.div<{ vacant?: boolean }>`
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  padding: 0.3rem 0;
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: ${(props) =>
    props.vacant ? "var(--md-sys-color-on-surface-variant)" : "var(--md-sys-color-on-surface)"};
  /* The icon. */
  & > :first-child {
    flex: none;
    margin-top: 0.05rem;
    color: ${(props) =>
      props.vacant ? "var(--md-sys-color-outline)" : "var(--md-sys-color-primary)"};
  }
`;

const BadgeName = styled.span`
  font-weight: 500;
`;

const BadgeNote = styled.div`
  font-size: 0.8125rem;
  line-height: 1.15rem;
  color: var(--md-sys-color-on-surface-variant);
`;

const AllBadges = styled.details`
  & > summary {
    width: fit-content;
    padding: 0.2rem 0;
    cursor: pointer;
    font-size: 0.875rem;
    line-height: 1.25rem;
    font-weight: 500;
    color: var(--md-sys-color-primary);
    border-radius: var(--md-shape-small);
    -webkit-tap-highlight-color: transparent;
  }
  & > summary:focus-visible {
    outline: 2px solid var(--md-sys-color-primary);
    outline-offset: 2px;
  }
`;

const Form = styled.span<{ won: boolean }>`
  font-weight: 600;
  color: ${(props) => (props.won ? "var(--md-sys-color-primary)" : "var(--md-sys-color-error)")};
`;

// The dialog is as tall as the screen allows and laid out as a column, so the figures stay
// put and only the match list below them scrolls.
const Sheet = styled(Dialog)`
  max-height: calc(100dvh - 2rem);
  /* Only reached on a screen too short for the figures plus a few matches */
  overflow-y: auto;
  ${thinScrollbar}
  &[open] {
    display: flex;
    flex-direction: column;
  }
`;

const History = styled.div`
  display: flex;
  flex-direction: column;
  flex: 0 1 auto;
  /* Room for one match, so the list can't be squeezed out of sight */
  min-height: 6.5rem;
  margin-top: 0.5rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--md-sys-color-outline-variant);
  /* The dialog already sits on the tone match entries normally use */
  --match-entry-bg: var(--md-sys-color-surface-container-lowest);
`;

const HistoryScroll = styled.div`
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  /* Keeps the scroll bar clear of the entries without narrowing them */
  margin-right: -0.75rem;
  padding-right: 0.75rem;
  ${thinScrollbar}
`;

const HistoryLabel = styled.div`
  margin-bottom: 0.5rem;
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--md-sys-color-on-surface-variant);
`;

const HISTORY_PAGE = 5;
const TREND_WIDTH = 280;
const TREND_HEIGHT = 48;
const TREND_PAD = 4;
const RECENT_DAYS = 30;
const FORM_GAMES = 5;

// Rating after each game, starting from the rating everyone begins on.
const Trend = ({ player }: { player: PlayerStats }) => {
  const ratings = [START_RATING, ...player.history.map((entry) => entry.rating)];
  const low = Math.min(...ratings);
  const span = Math.max(...ratings) - low || 1;
  const step = (TREND_WIDTH - TREND_PAD * 2) / (ratings.length - 1);
  const points = ratings
    .map((rating, index) => {
      const x = TREND_PAD + index * step;
      const y = TREND_HEIGHT - TREND_PAD - ((rating - low) / span) * (TREND_HEIGHT - TREND_PAD * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${TREND_WIDTH} ${TREND_HEIGHT}`}
      width="100%"
      height={TREND_HEIGHT}
      role="img"
      aria-label={`Rating over ${player.games} games, from ${START_RATING} to ${player.rating}`}
      // flexShrink: the dialog is a column that gives height to the match list, and an SVG
      // would otherwise be the first thing squeezed.
      style={{ display: "block", marginBottom: "0.5rem", flexShrink: 0 }}
    >
      <polyline
        points={points}
        fill="none"
        stroke="var(--md-sys-color-primary)"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
};

const percent = (value: number | null): string => (value === null ? "–" : `${value}%`);

const record = (entry: Versus | null): string =>
  entry ? `${entry.displayName} · ${entry.wins}–${entry.games - entry.wins}` : "–";

const firstName = (displayName: string): string => displayName.trim().split(/\s+/)[0] || "Player";

const namesOf = (holders: BadgeHolder[]): string =>
  holders.map((holder) => holder.displayName).join(" & ");

const BadgeIcon = ({ name }: { name: string }) => (
  <Icon size={20} aria-hidden>
    {name}
  </Icon>
);

// The badges `uid` holds, each with the figures behind it; then, folded away, the whole
// set for the table, with how to earn the ones nobody holds.
const BadgeSection = ({
  uid,
  badges,
  tableName,
}: {
  uid: string;
  badges: HeldBadge[];
  tableName: string;
}) => {
  const mine = badges.filter((held) => held.holders.some((holder) => holder.uid === uid));

  return (
    <Badges>
      {mine.map((held) => {
        const partners = held.holders.filter((holder) => holder.uid !== uid);

        return (
          <BadgeRow key={held.badge.id}>
            <BadgeIcon name={held.badge.icon} />
            <div>
              <BadgeName>{held.badge.name}</BadgeName>
              <BadgeNote>
                {partners.length > 0 && `With ${namesOf(partners)}. `}
                {held.reason}
              </BadgeNote>
            </div>
          </BadgeRow>
        );
      })}
      <AllBadges>
        <summary>Badges at {tableName}</summary>
        {BADGES.map((badge) => {
          const held = badges.find((entry) => entry.badge.id === badge.id);

          return (
            <BadgeRow key={badge.id} vacant={!held}>
              <BadgeIcon name={badge.icon} />
              <div>
                <BadgeName>{badge.name}</BadgeName>
                {held ? ` · ${namesOf(held.holders)}` : " · nobody yet"}
                <BadgeNote>{held ? held.reason : badge.rule}</BadgeNote>
              </div>
            </BadgeRow>
          );
        })}
      </AllBadges>
    </Badges>
  );
};

type Props = {
  // Null until this player has a scored game on any table.
  player: PlayerStats | null;
  // Whether these are the viewer's own statistics, which decides how they are worded.
  own: boolean;
  // Place on the selected table's leaderboard (null when not on it), out of the
  // `placedCount` players listed there.
  place: number | null;
  placedCount: number;
  tableName: string;
  // Every badge held on the selected table right now.
  badges: HeldBadge[];
  // This player's rated matches on every table, newest first.
  matches: MatchRating[];
  tableLabel: (tableCode: string) => string;
  // Commentary per match, by session id.
  notes: Record<string, string>;
  onClose: () => void;
};

export const StatsDialog = ({
  player,
  own,
  place,
  placedCount,
  tableName,
  badges,
  matches,
  tableLabel,
  notes,
  onClose,
}: Props) => {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const since = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000);
  const recentChange = player ? ratingChangeSince(player, since) : 0;

  return (
    <Sheet
      ref={dialogRef}
      aria-labelledby="stats-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      // A click that lands on the dialog element itself is a click on its backdrop.
      onClick={(event) => {
        if (event.target === dialogRef.current) {
          onClose();
        }
      }}
    >
      <Head>
        <Eyebrow id="stats-title">
          <Icon size={16} aria-hidden>
            bar_chart
          </Icon>
          {own || !player ? "Your statistics" : player.displayName} · all tables
        </Eyebrow>
        <IconButton
          type="button"
          title="Close"
          aria-label="Close"
          onClick={onClose}
          style={{ margin: "-0.6rem -0.6rem 0 0" }}
        >
          <Icon aria-hidden>close</Icon>
        </IconButton>
      </Head>

      {!player ? (
        <Hint>
          No scored games yet. Play a match and log the result — everyone starts on{" "}
          {START_RATING}.
        </Hint>
      ) : (
        <>
          <Metrics>
            <Metric>
              <MetricLabel>Rating</MetricLabel>
              <MetricValue>
                {player.rating}
                {recentChange !== 0 && (
                  <Delta value={recentChange} title={`Last ${RECENT_DAYS} days`}>
                    {formatDelta(recentChange)}
                  </Delta>
                )}
              </MetricValue>
            </Metric>
            <Metric>
              <MetricLabel>Rank at {tableName}</MetricLabel>
              {place === null ? (
                <MetricValue>
                  –<MetricNote>not on this board</MetricNote>
                </MetricValue>
              ) : (
                <MetricValue>
                  {place}
                  <MetricNote>of {placedCount}</MetricNote>
                </MetricValue>
              )}
            </Metric>
            <Metric>
              <MetricLabel>Played</MetricLabel>
              <MetricValue>
                {player.games}
                <MetricNote>
                  {player.wins}–{player.losses}
                </MetricNote>
              </MetricValue>
            </Metric>
            <Metric>
              <MetricLabel>Win rate</MetricLabel>
              <MetricValue>{percent(winRate(player))}</MetricValue>
            </Metric>
          </Metrics>

          <Trend player={player} />

          <Line>
            <span>Goals for / against</span>
            <span>
              {player.goalsFor} · {player.goalsAgainst}
            </span>
          </Line>
          <Line>
            <span>Best partner</span>
            <span>{record(bestPartner(player))}</span>
          </Line>
          <Line>
            <span>Toughest opponent</span>
            <span>{record(toughestOpponent(player))}</span>
          </Line>
          <Line>
            <span>Last {Math.min(FORM_GAMES, player.results.length)}</span>
            <span>
              {player.results.slice(-FORM_GAMES).map((won, index) => (
                <Form key={index} won={won}>
                  {won ? "W" : "L"}{" "}
                </Form>
              ))}
            </span>
          </Line>

          <BadgeSection uid={player.uid} badges={badges} tableName={tableName} />

          <History>
            <HistoryLabel>{own ? "Your" : `${firstName(player.displayName)}'s`} matches</HistoryLabel>
            <HistoryScroll>
              <RatedMatchList
                matches={matches}
                currentUid={player.uid}
                tableLabel={tableLabel}
                notes={notes}
                pageSize={HISTORY_PAGE}
              />
            </HistoryScroll>
          </History>
        </>
      )}
    </Sheet>
  );
};
