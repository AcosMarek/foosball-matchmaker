import { firstName } from "./commentary";
import type { MatchScore } from "./matchmaking";
import {
  matchesFor,
  type RatedPlayer,
  type RatedTeam,
  type RatingStats,
} from "./ratings";

// The championship belt: one per table, held by one player, and fought for only in 1v1s.
// Unlike the ratings it has no memory of how good anyone is. Beat the holder and it is
// yours, so anyone can take it in a single game.
//
// The rules, in full:
//   - Only a 1v1 counts. A 2v2 never moves the belt and never counts as defending it, so
//     a table that only plays 2v2 simply has no belt.
//   - The winner of a table's first scored 1v1 is its first champion.
//   - The belt is on the line in every 1v1 the champion plays at that table. If they
//     lose, the winner takes it. If they win, that is a defence.
//   - A belt that hasn't been on the line for BELT_VACANT_DAYS falls vacant, and the
//     winner of the table's next 1v1 claims it. A champion who stops playing can't sit
//     on it for ever.
//
// Like the ratings it is worked out from the scored games every time, and never stored.

export const BELT_VACANT_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

// What the belt needs to know about a game; every rated match already has this shape.
export type BeltMatch = {
  sessionId: string;
  startedAt: Date;
  score: MatchScore;
  teams: [RatedTeam, RatedTeam];
};

export type Reign = {
  holder: RatedPlayer;
  // The game it was won in, and when.
  wonIn: string;
  since: Date;
  // Whom it was taken from; null when it was claimed while vacant.
  from: RatedPlayer | null;
  // 1v1s the holder has won since.
  defences: number;
  // The last game it was on the line in (the one it was won in, if none since).
  lastOnTheLine: Date;
};

// What one game did to the belt. Games the champion wasn't in did nothing (unless the
// belt was vacant) and have no event.
export type BeltEvent = {
  kind: "claimed" | "taken" | "defended";
  holder: RatedPlayer;
  from: RatedPlayer | null;
  // For a defence, how many the holder has now made.
  defences: number;
};

export type Belt = {
  // The current reign, or null while the belt is vacant.
  reign: Reign | null;
  events: Record<string, BeltEvent>;
};

const isDuel = ({ teams: [red, blue] }: BeltMatch): boolean =>
  red.players.length === 1 &&
  blue.players.length === 1 &&
  red.players[0].uid !== blue.players[0].uid;

const hasLapsed = (reign: Reign, at: Date): boolean =>
  at.getTime() - reign.lastOnTheLine.getTime() > BELT_VACANT_DAYS * DAY_MS;

// What one 1v1 does to the belt: the reign after it, and the event if it mattered.
const playGame = (
  current: Reign | null,
  match: BeltMatch,
): { reign: Reign | null; event: BeltEvent | null } => {
  const held = current && !hasLapsed(current, match.startedAt) ? current : null;
  const redWon = match.score.red > match.score.blue;
  const winner = match.teams[redWon ? 0 : 1].players[0];
  const loser = match.teams[redWon ? 1 : 0].players[0];

  if (!held || loser.uid === held.holder.uid) {
    const from = held ? held.holder : null;

    return {
      reign: {
        holder: winner,
        wonIn: match.sessionId,
        since: match.startedAt,
        from,
        defences: 0,
        lastOnTheLine: match.startedAt,
      },
      event: {
        kind: held ? "taken" : "claimed",
        holder: winner,
        from,
        defences: 0,
      },
    };
  }

  if (winner.uid === held.holder.uid) {
    const defences = held.defences + 1;

    return {
      // The holder as named in this game, so a champion who renames is shown as they are.
      reign: {
        ...held,
        holder: winner,
        defences,
        lastOnTheLine: match.startedAt,
      },
      event: { kind: "defended", holder: winner, from: null, defences },
    };
  }

  return { reign: held, event: null };
};

// The belt of one table, from that table's scored games in any order. Anything that isn't
// a 1v1 is passed over.
export const tableBelt = (
  matches: BeltMatch[],
  now: Date = new Date(),
): Belt => {
  const events: Record<string, BeltEvent> = {};
  const ordered = matches
    .filter(isDuel)
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  const reign = ordered.reduce<Reign | null>((current, match) => {
    const step = playGame(current, match);
    if (step.event) {
      events[match.sessionId] = step.event;
    }

    return step.reign;
  }, null);

  return { reign: reign && !hasLapsed(reign, now) ? reign : null, events };
};

// A table's belt, from the rating history.
export const beltOf = (
  stats: RatingStats,
  tableCode: string,
  now: Date = new Date(),
): Belt => tableBelt(matchesFor(stats, { tableCode }), now);

// The uid of a table's champion, or null while the belt is vacant or ratings are missing.
export const championOf = (
  stats: RatingStats | null,
  tableCode: string,
  now: Date = new Date(),
): string | null =>
  stats && tableCode
    ? (beltOf(stats, tableCode, now).reign?.holder.uid ?? null)
    : null;

// What a game would do to the belt once it is in the history: for announcing a result at
// the moment it is logged, before the ratings have caught up with it.
export const beltEventForNew = (
  stats: RatingStats,
  tableCode: string,
  match: BeltMatch,
): BeltEvent | null =>
  tableBelt([...matchesFor(stats, { tableCode }), match], match.startedAt)
    .events[match.sessionId] ?? null;

// One sentence on what a game did to the belt, for announcements and the match history.
export const describeBeltEvent = (event: BeltEvent): string => {
  // First names, as in the commentary this sentence is shown beside.
  const name = firstName(event.holder);

  if (event.kind === "claimed") {
    return `${name} claims the vacant belt.`;
  }
  if (event.kind === "taken") {
    return `${name} takes the belt from ${event.from ? firstName(event.from) : "the champion"}.`;
  }

  return `${name} keeps the belt (defence no. ${event.defences}).`;
};
