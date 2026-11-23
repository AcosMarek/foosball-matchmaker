import styled from "@emotion/styled";
import {
  PROVISIONAL_GAMES,
  isProvisional,
  ratingChangeSince,
  type PlayerStats,
  type Standing,
} from "../ratings";
import { Avatar, Badge, Card, Eyebrow, Hint, Icon } from "../ui";

const List = styled.ol`
  list-style: none;
  margin: 0;
  padding: 0;
`;

const Entry = styled.li<{ own: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.45rem 0.5rem;
  margin: 0 -0.5rem;
  border-radius: var(--md-shape-small);
  background: ${(props) =>
    props.own ? "var(--md-sys-color-surface-container-high)" : "transparent"};
  font-size: 0.875rem;
  line-height: 1.25rem;
`;

const Place = styled.span`
  width: 1.1rem;
  flex: none;
  text-align: center;
  font-variant-numeric: tabular-nums;
  color: var(--md-sys-color-on-surface-variant);
`;

const SmallAvatar = styled(Avatar)`
  width: 28px;
  height: 28px;
  font-size: 0.75rem;
`;

const Name = styled.span<{ muted: boolean }>`
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.15rem 0.4rem;
  min-width: 0;
  flex: 1;
  color: ${(props) =>
    props.muted ? "var(--md-sys-color-on-surface-variant)" : "var(--md-sys-color-on-surface)"};
  & > :first-of-type {
    /* Never squeezed by the badge: on a narrow screen the badge drops below instead */
    flex: none;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const Record = styled.span`
  flex: none;
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  color: var(--md-sys-color-on-surface-variant);
`;

const Points = styled.span<{ muted: boolean }>`
  flex: none;
  min-width: 2.6rem;
  text-align: right;
  font-weight: ${(props) => (props.muted ? 400 : 600)};
  font-variant-numeric: tabular-nums;
  color: ${(props) =>
    props.muted ? "var(--md-sys-color-on-surface-variant)" : "var(--md-sys-color-on-surface)"};
`;

const RECENT_DAYS = 30;

// Direction of the rating over the last month: up, down, or no movement.
const Trend = ({ player }: { player: PlayerStats }) => {
  const since = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000);
  const change = ratingChangeSince(player, since);
  const [icon, color, label] =
    change > 0
      ? ["trending_up", "var(--md-sys-color-primary)", "Rating up"]
      : change < 0
        ? ["trending_down", "var(--md-sys-color-error)", "Rating down"]
        : ["remove", "var(--md-sys-color-outline)", "Rating unchanged"];

  return (
    <Icon size={18} style={{ color }} role="img" aria-label={`${label} over ${RECENT_DAYS} days`}>
      {icon}
    </Icon>
  );
};

type Props = {
  // This table's players in rating order; null while the history is loading or unavailable.
  standings: Standing[] | null;
  tableName: string;
  currentUid: string;
};

export const LeaderboardCard = ({ standings, tableName, currentUid }: Props) => {
  if (!standings) {
    return null;
  }

  return (
    <Card>
      <Eyebrow>
        <Icon size={16} aria-hidden>
          trophy
        </Icon>
        Leaderboard · {tableName}
      </Eyebrow>
      {standings.length === 0 ? (
        <Hint>No scored matches on this table yet. Log a result to get on the board.</Hint>
      ) : (
        <>
          <List>
            {standings.map(({ player, place }) => {
              const provisional = isProvisional(player);

              return (
                <Entry key={player.uid} own={player.uid === currentUid}>
                  <Place>{place ?? "–"}</Place>
                  <SmallAvatar aria-hidden>
                    {player.displayName.trim().charAt(0).toUpperCase() || "?"}
                  </SmallAvatar>
                  <Name muted={provisional}>
                    <span>
                      {player.displayName}
                      {player.uid === currentUid && " (you)"}
                    </span>
                    {provisional && <Badge>Provisional</Badge>}
                  </Name>
                  <Record>
                    {player.games} · {player.wins}–{player.losses}
                  </Record>
                  <Points muted={provisional}>{player.rating}</Points>
                  <Trend player={player} />
                </Entry>
              );
            })}
          </List>
          <Hint>
            Games · wins–losses · rating, counted across all tables. Ranked after{" "}
            {PROVISIONAL_GAMES} scored games.
          </Hint>
        </>
      )}
    </Card>
  );
};
