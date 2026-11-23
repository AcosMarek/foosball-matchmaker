import { useEffect, useRef } from "react";
import styled from "@emotion/styled";
import {
  PROVISIONAL_GAMES,
  START_RATING,
  bestPartner,
  formatDelta,
  isProvisional,
  ratingChangeSince,
  toughestOpponent,
  winRate,
  type PlayerStats,
  type Versus,
} from "../ratings";
import { Delta, Dialog, Eyebrow, Hint, Icon, IconButton } from "../ui";

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

const Form = styled.span<{ won: boolean }>`
  font-weight: 600;
  color: ${(props) => (props.won ? "var(--md-sys-color-primary)" : "var(--md-sys-color-error)")};
`;

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
      style={{ display: "block", marginBottom: "0.5rem" }}
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

type Props = {
  // Null until this player has a scored game on any table.
  player: PlayerStats | null;
  // Place on the selected table's leaderboard (null when provisional or not on it), out
  // of `placedCount` ranked players there.
  place: number | null;
  placedCount: number;
  tableName: string;
  onClose: () => void;
};

export const StatsDialog = ({ player, place, placedCount, tableName, onClose }: Props) => {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const since = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000);
  const recentChange = player ? ratingChangeSince(player, since) : 0;
  const gamesToRank = player ? PROVISIONAL_GAMES - player.games : 0;

  return (
    <Dialog
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
          Your statistics · all tables
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
              {isProvisional(player) ? (
                <MetricValue>
                  –
                  <MetricNote>
                    {gamesToRank} more game{gamesToRank === 1 ? "" : "s"}
                  </MetricNote>
                </MetricValue>
              ) : place === null ? (
                <MetricValue>
                  –<MetricNote>no games here</MetricNote>
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

          {player.front.games + player.back.games > 0 && (
            <Line>
              <span>Front / back</span>
              <span>
                {percent(winRate(player.front))} · {percent(winRate(player.back))}
              </span>
            </Line>
          )}
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
        </>
      )}
    </Dialog>
  );
};
