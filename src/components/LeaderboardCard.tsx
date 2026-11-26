import { useEffect, useLayoutEffect, useRef, useState } from "react";
import styled from "@emotion/styled";
import { prefersReducedMotion } from "../motion";
import {
  ACTIVE_DAYS,
  NEW_PLAYER_GAMES,
  isNewPlayer,
  ratingChangeSince,
  type PlayerStats,
  type Standing,
} from "../ratings";
import {
  Avatar,
  Badge,
  BeltMedal,
  Card,
  ChampionBadge,
  Eyebrow,
  Hint,
  Icon,
  PlayerName,
} from "../ui";
import { BELT_VACANT_DAYS, type Belt } from "../belt";

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

const Name = styled.span`
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.15rem 0.4rem;
  min-width: 0;
  flex: 1;
  color: var(--md-sys-color-on-surface);
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

const Points = styled.span`
  flex: none;
  min-width: 2.6rem;
  text-align: right;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--md-sys-color-on-surface);
`;

const Landing = styled(Place)`
  color: var(--md-sys-color-primary);
  font-weight: 600;
  animation: dropIn 0.5s cubic-bezier(0.2, 0.9, 0.3, 1.4) 0.5s both;
`;

// The explanations, folded away until asked for.
const About = styled.details`
  margin-top: 0.5rem;
  & > summary {
    width: fit-content;
    padding: 0.15rem 0;
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

const Welcome = styled(Hint)`
  color: var(--md-sys-color-primary);
  font-weight: 500;
  animation: riseIn 0.5s ease-out 0.9s both;
`;

const SLIDE_MS = 650;
const WELCOMED_PREFIX = "foosball:welcomedOnBoard:";

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
    // Read from the theme at the moment it is needed: script-driven animations can't
    // take a CSS variable, and the highlight is a different green in the dark theme.
    const flashColor =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--md-sys-color-primary-container")
        .trim() || "#b7f397";
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
              { backgroundColor: flashColor },
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

// Whether to play the welcome: once per device, the first time the app is opened with
// this player on the board, and only while they are new. Someone who has been playing for
// a while is quietly marked as welcomed instead.
const useWelcomeMoment = (uid: string, onBoard: boolean, games: number): boolean => {
  const [welcoming, setWelcoming] = useState(false);

  useEffect(() => {
    if (!onBoard) {
      return;
    }

    // If storage can't be read the moment is skipped, never repeated on every visit.
    let seen = true;
    try {
      seen = localStorage.getItem(WELCOMED_PREFIX + uid) === "1";
      localStorage.setItem(WELCOMED_PREFIX + uid, "1");
    } catch {
      // Ignore storage being unavailable (e.g. private browsing).
    }

    if (!seen && games <= NEW_PLAYER_GAMES) {
      setWelcoming(true);
    }
    // `games` is deliberately left out: it is read once, when the player first shows on
    // the board, and later games must not run this again.
  }, [uid, onBoard]);

  return welcoming;
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
  // This table's championship belt; null while the history is loading or unavailable.
  belt: Belt | null;
};

export const LeaderboardCard = ({ standings, tableName, currentUid, belt }: Props) => {
  const list = useRef<HTMLOListElement>(null);
  const order = (standings ?? []).map((entry) => entry.player.uid);
  useSlideOnReorder(list, order, tableName);

  const own = standings?.find((entry) => entry.player.uid === currentUid);
  const welcoming = useWelcomeMoment(currentUid, !!own, own?.player.games ?? 0);

  const reign = belt?.reign ?? null;
  // A table that has never had a 1v1 has no belt to speak of.
  const hadBelt = Object.keys(belt?.events ?? {}).length > 0;

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
              const justArrived = welcoming && player.uid === currentUid;
              const champion = player.uid === reign?.holder.uid;

              return (
                <Entry key={player.uid} data-uid={player.uid} own={player.uid === currentUid}>
                  {justArrived ? <Landing>{place}</Landing> : <Place>{place}</Place>}
                  <SmallAvatar aria-hidden>
                    {player.displayName.trim().charAt(0).toUpperCase() || "?"}
                  </SmallAvatar>
                  <Name>
                    <span>
                      <PlayerName name={player.displayName} champion={champion} medal={false} />
                      {player.uid === currentUid && " (you)"}
                    </span>
                    {champion && reign && (
                      <ChampionBadge
                        title={`Has held the belt since ${reign.since.toLocaleDateString()}`}
                      >
                        <BeltMedal defences={reign.defences} size={14} />
                        Champion
                      </ChampionBadge>
                    )}
                    {isNewPlayer(player) && <Badge>New</Badge>}
                  </Name>
                  <Record>
                    {player.games} · {player.wins}–{player.losses}
                  </Record>
                  <Points>{player.rating}</Points>
                  <Trend player={player} />
                </Entry>
              );
            })}
          </List>
          {welcoming && own && (
            <Welcome role="status">
              You're on the board at number {own.place}. Welcome to the table.
            </Welcome>
          )}
          {/* One line to read the columns by, and one more only when there is something to
              do about the belt. The rest is a tap away, so the board itself stays short. */}
          <Hint>Games · wins–losses · rating</Hint>
          {!reign && hadBelt && (
            <Hint>The belt is vacant. Win the next 1v1 here to claim it.</Hint>
          )}
          <About>
            <summary>How the board works</summary>
            <Hint>
              Ratings are counted across all tables. "New" marks a player's first{" "}
              {NEW_PLAYER_GAMES} scored games, while their rating is still settling. Players with
              no game in the last {ACTIVE_DAYS} days are hidden.
            </Hint>
            {hadBelt && (
              <Hint>
                The Champion holds the table's belt, and the number by the medal is how many
                times they have defended it. Beat them in a 1v1 and it is yours. A belt that
                isn't played for in {BELT_VACANT_DAYS} days falls vacant.
              </Hint>
            )}
          </About>
        </>
      )}
    </Card>
  );
};
