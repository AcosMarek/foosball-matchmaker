import { useEffect, useLayoutEffect, useRef, useState } from "react";
import styled from "@emotion/styled";
import { prefersReducedMotion } from "../motion";
import {
  ACTIVE_DAYS,
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
  /* Lets a row that is sliding up be lifted above the ones it passes. */
  position: relative;
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

const Landing = styled(Place)`
  color: var(--md-sys-color-primary);
  font-weight: 600;
  animation: dropIn 0.5s cubic-bezier(0.2, 0.9, 0.3, 1.4) 0.9s both;
`;

const Falling = styled(Badge)`
  animation: breakAway 0.7s cubic-bezier(0.5, 0, 0.9, 0.5) 0.4s both;
`;

const Welcome = styled(Hint)`
  color: var(--md-sys-color-primary);
  font-weight: 500;
  animation: riseIn 0.5s ease-out 1.3s both;
`;

const SLIDE_MS = 650;
const RANKED_SEEN_PREFIX = "foosball:rankedSeen:";
// The ranked moment is for someone who has just got there. Anyone further past the
// threshold than this was ranked long ago and is only marked as having seen it.
const RANKED_FRESH_GAMES = 3;

// Slides rows to their new places when the order changes, so an overtake is seen to
// happen and the list doesn't simply reshuffle. Each row is moved back to where it was a
// moment ago and let go; a row that went up is lifted over the others and flashes. A new
// `scope` (another table) is a different list, not a reorder, so nothing moves then.
//
// Where a row "was" is worked out from the old order and the rows' present heights. It is
// not a position remembered from the last render, because the layout shifts without one
// (the icon font arriving, the window being resized) and a stale measurement sends rows
// sliding in from the wrong place.
const useSlideOnReorder = (
  list: React.RefObject<HTMLOListElement>,
  order: string[],
  scope: string,
): void => {
  const lastOrder = useRef(order);
  const lastScope = useRef(scope);
  const orderKey = order.join();

  useLayoutEffect(() => {
    const previousOrder = lastOrder.current;
    const reordered = lastScope.current === scope && previousOrder.join() !== orderKey;
    lastOrder.current = order;
    lastScope.current = scope;
    if (!reordered || prefersReducedMotion()) {
      return;
    }

    const rows = Array.from(list.current?.children ?? []) as HTMLElement[];
    const heights = new Map(rows.map((row) => [row.dataset.uid ?? "", row.offsetHeight]));
    // Distance from the top of the list to a row, were the rows stacked in `sequence`.
    const topIn = (sequence: string[], uid: string): number => {
      let top = 0;
      for (const other of sequence) {
        if (other === uid) {
          break;
        }
        top += heights.get(other) ?? 0;
      }

      return top;
    };

    for (const row of rows) {
      const uid = row.dataset.uid ?? "";
      // Someone new to the list has no old place to come from.
      if (!previousOrder.includes(uid)) {
        continue;
      }

      const before = topIn(previousOrder, uid);
      const now = topIn(order, uid);
      if (before !== now) {
        const slide = row.animate(
          [{ transform: `translateY(${before - now}px)` }, { transform: "none" }],
          { duration: SLIDE_MS, easing: "cubic-bezier(0.3, 0.8, 0.3, 1.1)" },
        );
        if (before > now) {
          row.style.zIndex = "1";
          slide.finished
            .catch(() => {})
            .then(() => {
              row.style.zIndex = "";
            });
          // Fades back to the row's own background, spelled out because older mobile
          // browsers don't accept a keyframe that leaves the end colour to be inferred.
          row.animate(
            [
              { backgroundColor: "#b7f397" },
              { backgroundColor: getComputedStyle(row).backgroundColor },
            ],
            { duration: SLIDE_MS * 2 },
          );
        }
      }
    }
    // `order` itself is a new array on every render; its contents are what matter.
  }, [list, orderKey, scope]);
};

// Whether to play the "you're ranked" moment: once per device, the first time the app
// is opened with this player ranked, and only if that is news.
const useRankedMoment = (uid: string, ranked: boolean, games: number): boolean => {
  const [celebrating, setCelebrating] = useState(false);

  useEffect(() => {
    if (!ranked) {
      return;
    }

    // If storage can't be read the moment is skipped, never repeated on every visit.
    let seen = true;
    try {
      seen = localStorage.getItem(RANKED_SEEN_PREFIX + uid) === "1";
      localStorage.setItem(RANKED_SEEN_PREFIX + uid, "1");
    } catch {
      // Ignore storage being unavailable (e.g. private browsing).
    }

    if (!seen && games < PROVISIONAL_GAMES + RANKED_FRESH_GAMES) {
      setCelebrating(true);
    }
    // `games` is deliberately left out: it is read once, when the player turns ranked,
    // and later games must not run this again.
  }, [uid, ranked]);

  return celebrating;
};

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
  const list = useRef<HTMLOListElement>(null);
  const order = (standings ?? []).map((entry) => entry.player.uid);
  useSlideOnReorder(list, order, tableName);

  const own = standings?.find((entry) => entry.player.uid === currentUid);
  const celebrating = useRankedMoment(
    currentUid,
    !!own && own.place !== null,
    own?.player.games ?? 0,
  );
  // The badge is put back for the moment so it can fall off, then removed for good.
  const [badgeGone, setBadgeGone] = useState(false);

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
        <Hint>
          No scored matches on this table in the last {ACTIVE_DAYS} days. Log a result to get on
          the board.
        </Hint>
      ) : (
        <>
          <List ref={list}>
            {standings.map(({ player, place }) => {
              const provisional = isProvisional(player);
              const justRanked = celebrating && player.uid === currentUid;

              return (
                <Entry key={player.uid} data-uid={player.uid} own={player.uid === currentUid}>
                  {justRanked ? <Landing>{place}</Landing> : <Place>{place ?? "–"}</Place>}
                  <SmallAvatar aria-hidden>
                    {player.displayName.trim().charAt(0).toUpperCase() || "?"}
                  </SmallAvatar>
                  <Name muted={provisional}>
                    <span>
                      {player.displayName}
                      {player.uid === currentUid && " (you)"}
                    </span>
                    {provisional && <Badge>Provisional</Badge>}
                    {justRanked && !badgeGone && (
                      <Falling aria-hidden onAnimationEnd={() => setBadgeGone(true)}>
                        Provisional
                      </Falling>
                    )}
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
          {celebrating && (
            <Welcome role="status">
              {PROVISIONAL_GAMES} scored games. You're ranked — welcome to the board.
            </Welcome>
          )}
          <Hint>
            Games · wins–losses · rating, counted across all tables. Ranked after{" "}
            {PROVISIONAL_GAMES} scored games. Players with no game in the last {ACTIVE_DAYS} days
            are hidden.
          </Hint>
        </>
      )}
    </Card>
  );
};
