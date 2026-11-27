// The .js extension is required: the weekly recap function loads this module as it is
// (see api/_lib/recap.ts), and Node will not resolve an extensionless relative import.
import { expectedScore, teamAverage, type MatchRating, type RatingStats } from "./ratings.js";

// Badges: small, mostly teasing titles a table hands out by itself, worked out from the
// scored games and nothing else. Each has one holder (or one pair) per table and changes
// hands whenever someone else earns it, the way the belt does. Nothing is stored: who
// holds what at any moment follows from the games played up to then, which is also how
// the weekly recap tells that a badge changed hands.
//
// They are kept off the leaderboard on purpose. A name there has room for the belt and
// little else, so the badges live in the statistics dialog and the weekly Slack recap.

export type BadgeId = "ringleader" | "busiest" | "rookie" | "wall" | "giantKiller" | "divorce";

export type BadgeInfo = {
  id: BadgeId;
  name: string;
  // A Material Symbols name, for the app.
  icon: string;
  // The same idea as a Slack emoji.
  emoji: string;
  // How it is earned, for the list of badges nobody holds yet.
  rule: string;
};

// Days of games most badges are counted over, so that each can be won back.
export const BADGE_DAYS = 30;
const BUSY_DAYS = 7;
const RINGLEADER_MIN_STARTED = 3;
const BUSY_MIN_GAMES = 5;
const ROOKIE_MIN_GAMES = 3;
// A player stops being a rookie, and can start being teased, at this many games.
export const SEASONED_GAMES = 20;
// No badge looks at who stood at the front or the back: tables rotate through the
// positions by rules of their own, so the app's idea of them says little. The Wall
// counts the goals a player's side let in, wherever they stood.
const WALL_MIN_GAMES = 8;
// A win counts as giant-killing when the ratings gave the winners this chance or less.
const UPSET_ODDS = 0.4;
const DIVORCE_MIN_GAMES = 4;
const DIVORCE_WIN_RATE = 0.4;

export const BADGES: BadgeInfo[] = [
  {
    id: "ringleader",
    name: "Ringleader",
    icon: "campaign",
    emoji: ":mega:",
    rule: `Starts the most games: at least ${RINGLEADER_MIN_STARTED} in the last ${BADGE_DAYS} days.`,
  },
  {
    id: "busiest",
    name: "Does anyone here work?",
    icon: "coffee",
    emoji: ":coffee:",
    rule: `Plays the most games in a week: at least ${BUSY_MIN_GAMES}.`,
  },
  {
    id: "rookie",
    name: "Rookie of the month",
    icon: "rocket_launch",
    emoji: ":rocket:",
    rule: `The biggest rating climb in ${BADGE_DAYS} days by someone with fewer than ${SEASONED_GAMES} games.`,
  },
  {
    id: "wall",
    name: "The Wall",
    icon: "shield",
    emoji: ":shield:",
    rule: `Lets in the fewest goals a game, over at least ${WALL_MIN_GAMES} games in ${BADGE_DAYS} days.`,
  },
  {
    id: "giantKiller",
    name: "Giant Killer",
    icon: "swords",
    emoji: ":crossed_swords:",
    rule: `Won the game the ratings least expected in the last ${BADGE_DAYS} days.`,
  },
  {
    id: "divorce",
    name: "Divorce Pending",
    icon: "heart_broken",
    emoji: ":broken_heart:",
    rule: `The pair with the worst record together: at least ${DIVORCE_MIN_GAMES} games in ${BADGE_DAYS} days, both with ${SEASONED_GAMES} games behind them.`,
  },
];

export type BadgeHolder = { uid: string; displayName: string };

export type HeldBadge = {
  badge: BadgeInfo;
  // One player, or the two of a pair (the winners of a 2v2, a doomed partnership).
  holders: BadgeHolder[];
  // The figures that earned it, as a sentence.
  reason: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? "" : "s"}`;

const firstNames = (holders: BadgeHolder[]): string =>
  holders.map((holder) => holder.displayName.trim().split(/\s+/)[0] || "Player").join(" & ");

type Count = { uid: string; count: number; at: number };

// Whoever has the most of something, from `minimum` up. A tie goes to whoever got there
// first, so a badge is taken by passing its holder and not by drawing level with them.
// `events` must be in the order they happened.
const mostOften = (events: { uid: string; at: Date }[], minimum: number): Count | null => {
  const counts = new Map<string, Count>();
  for (const { uid, at } of events) {
    counts.set(uid, { uid, count: (counts.get(uid)?.count ?? 0) + 1, at: at.getTime() });
  }

  return (
    [...counts.values()]
      .filter((entry) => entry.count >= minimum)
      .sort((a, b) => b.count - a.count || a.at - b.at || a.uid.localeCompare(b.uid))[0] ?? null
  );
};

const winnersFirst = (match: MatchRating) => {
  const redWon = match.score.red > match.score.blue;
  const [red, blue] = match.teams;

  return redWon ? { winners: red, losers: blue } : { winners: blue, losers: red };
};

// The badges held on one table as of `now`, in the order of BADGES. A badge nobody has
// earned is left out.
export const badgesAt = (
  stats: RatingStats,
  tableCode: string,
  now: Date = new Date(),
): HeldBadge[] => {
  const until = now.getTime();
  const played = Object.values(stats.matches)
    .filter((match) => match.startedAt.getTime() < until)
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  const here = played.filter((match) => match.tableCode === tableCode);
  const within = (days: number): MatchRating[] =>
    here.filter((match) => match.startedAt.getTime() >= until - days * DAY_MS);
  const month = within(BADGE_DAYS);

  // Current names: someone who renamed themselves holds their badges as they are now.
  const names = new Map(stats.players.map((player) => [player.uid, player.displayName]));
  const holder = (uid: string): BadgeHolder => ({ uid, displayName: names.get(uid) ?? "Player" });

  // Games behind each player by then, on any table: what makes a rookie or a veteran.
  const games = new Map<string, number>();
  for (const match of played) {
    for (const player of match.teams.flatMap((team) => team.players)) {
      games.set(player.uid, (games.get(player.uid) ?? 0) + 1);
    }
  }
  const gamesOf = (uid: string): number => games.get(uid) ?? 0;

  const held = new Map<BadgeId, Omit<HeldBadge, "badge">>();

  // Ringleader: the games only happen because someone starts them.
  const starter = mostOften(
    month
      // Someone who starts games but has never played one has no name here.
      .filter((match) => !!match.startedBy && names.has(match.startedBy))
      .map((match) => ({ uid: match.startedBy as string, at: match.startedAt })),
    RINGLEADER_MIN_STARTED,
  );
  if (starter) {
    held.set("ringleader", {
      holders: [holder(starter.uid)],
      reason: `Started ${plural(starter.count, "game")} in the last ${BADGE_DAYS} days.`,
    });
  }

  const busiest = mostOften(
    within(BUSY_DAYS).flatMap((match) =>
      match.teams.flatMap((team) =>
        team.players.map((player) => ({ uid: player.uid, at: match.startedAt })),
      ),
    ),
    BUSY_MIN_GAMES,
  );
  if (busiest) {
    held.set("busiest", {
      holders: [holder(busiest.uid)],
      reason: `${plural(busiest.count, "game")} in the last ${BUSY_DAYS} days.`,
    });
  }

  // Per player over the month: games and rating won here, and goals their side let in.
  type Month = { uid: string; games: number; gain: number; conceded: number };
  const monthly = new Map<string, Month>();
  // Per pair of teammates over the month.
  type Pair = { uids: [string, string]; games: number; wins: number };
  const pairs = new Map<string, Pair>();

  for (const match of month) {
    const redWon = match.score.red > match.score.blue;
    match.teams.forEach((team, index) => {
      const won = index === 0 ? redWon : !redWon;
      const conceded = index === 0 ? match.score.blue : match.score.red;

      for (const player of team.players) {
        const entry = monthly.get(player.uid) ?? {
          uid: player.uid,
          games: 0,
          gain: 0,
          conceded: 0,
        };
        entry.games += 1;
        entry.gain += match.delta[index];
        entry.conceded += conceded;
        monthly.set(player.uid, entry);
      }

      if (team.players.length === 2) {
        const uids = team.players.map((player) => player.uid).sort() as [string, string];
        const pair = pairs.get(uids.join()) ?? { uids, games: 0, wins: 0 };
        pair.games += 1;
        pair.wins += won ? 1 : 0;
        pairs.set(uids.join(), pair);
      }
    });
  }

  const rookie = [...monthly.values()]
    .filter(
      (entry) =>
        gamesOf(entry.uid) < SEASONED_GAMES && entry.games >= ROOKIE_MIN_GAMES && entry.gain > 0,
    )
    .sort((a, b) => b.gain - a.gain || b.games - a.games || a.uid.localeCompare(b.uid))[0];
  if (rookie) {
    held.set("rookie", {
      holders: [holder(rookie.uid)],
      reason: `Up ${rookie.gain} rating points in ${plural(rookie.games, "game")}, with fewer than ${SEASONED_GAMES} played.`,
    });
  }

  const wall = [...monthly.values()]
    .filter((entry) => entry.games >= WALL_MIN_GAMES)
    .sort(
      (a, b) =>
        a.conceded / a.games - b.conceded / b.games ||
        b.games - a.games ||
        a.uid.localeCompare(b.uid),
    )[0];
  if (wall) {
    held.set("wall", {
      holders: [holder(wall.uid)],
      reason: `Lets in ${(wall.conceded / wall.games).toFixed(1)} goals a game, over ${plural(wall.games, "game")}.`,
    });
  }

  // Giant Killer: the least likely win of the month. Between two equally unlikely ones,
  // the later is the one people remember.
  const upset = month
    .map((match) => {
      const { winners, losers } = winnersFirst(match);
      const rating = (uids: { uid: string }[]): number =>
        teamAverage(uids.map((player) => match.before[player.uid]));
      const winnerRating = rating(winners.players);
      const loserRating = rating(losers.players);

      return { match, winners, losers, gap: loserRating - winnerRating, odds: expectedScore(winnerRating, loserRating) };
    })
    .filter((entry) => entry.odds <= UPSET_ODDS)
    .sort(
      (a, b) => a.odds - b.odds || b.match.startedAt.getTime() - a.match.startedAt.getTime(),
    )[0];
  if (upset) {
    const { red, blue } = upset.match.score;
    const beaten = upset.losers.players.map((player) => holder(player.uid));
    held.set("giantKiller", {
      holders: upset.winners.players.map((player) => holder(player.uid)),
      reason: `Beat ${firstNames(beaten)} ${Math.max(red, blue)}–${Math.min(red, blue)} from ${upset.gap} rating points down.`,
    });
  }

  // Divorce Pending teases, so it is kept for pairs who have both been around a while.
  const doomed = [...pairs.values()]
    .filter(
      (pair) =>
        pair.games >= DIVORCE_MIN_GAMES &&
        pair.wins / pair.games < DIVORCE_WIN_RATE &&
        pair.uids.every((uid) => gamesOf(uid) >= SEASONED_GAMES),
    )
    .sort(
      (a, b) =>
        a.wins / a.games - b.wins / b.games ||
        b.games - a.games ||
        a.uids.join().localeCompare(b.uids.join()),
    )[0];
  if (doomed) {
    held.set("divorce", {
      holders: doomed.uids.map(holder),
      reason: `${doomed.wins === 0 ? "No wins" : plural(doomed.wins, "win")} in ${doomed.games} games together.`,
    });
  }

  return BADGES.flatMap((badge) => {
    const entry = held.get(badge.id);

    return entry ? [{ badge, ...entry }] : [];
  });
};

export type BadgeChange = HeldBadge & {
  // Who held it before; empty when nobody did.
  previous: BadgeHolder[];
};

const sameHolders = (a: BadgeHolder[], b: BadgeHolder[]): boolean =>
  a.length === b.length && a.every((holder) => b.some((other) => other.uid === holder.uid));

// The badges that found a new holder between two moments, as held at the later one. A
// badge that merely lapsed (nobody earns it any more) is not news and is left out.
export const badgeChanges = (
  stats: RatingStats,
  tableCode: string,
  from: Date,
  to: Date,
): BadgeChange[] => {
  const before = new Map(badgesAt(stats, tableCode, from).map((held) => [held.badge.id, held]));

  return badgesAt(stats, tableCode, to).flatMap((held) => {
    const previous = before.get(held.badge.id)?.holders ?? [];

    return sameHolders(previous, held.holders) ? [] : [{ ...held, previous }];
  });
};

// The badges one game handed to someone who played in it: what was held the moment
// before it, against the moment after. A badge the game sent elsewhere (a player lets in
// ten and The Wall passes to someone who wasn't there) is left for the weekly recap.
export const badgesWonIn = (stats: RatingStats, match: MatchRating): BadgeChange[] => {
  const played = new Set(match.teams.flatMap((team) => team.players.map((player) => player.uid)));
  const before = match.startedAt;
  const after = new Date(before.getTime() + 1);

  return badgeChanges(stats, match.tableCode, before, after).filter((change) =>
    change.holders.some((holder) => played.has(holder.uid)),
  );
};

// "You take it from Jonas.", "Ada takes it from you.", "Ada & Bo have it now.": who has
// the badge and whom they took it from, worded for `viewerUid` when they are on either
// side of it.
export const describeBadgeChange = (change: BadgeChange, viewerUid = ""): string => {
  // First names, with the viewer as `you` when they are among them.
  const named = (holders: BadgeHolder[], you: string): string => {
    const others = holders.filter((holder) => holder.uid !== viewerUid);

    return others.length === holders.length
      ? firstNames(holders)
      : [you, ...others.map((holder) => firstNames([holder]))].join(" and ");
  };
  const mine = change.holders.some((holder) => holder.uid === viewerUid);
  // "You" takes the plural, as two holders do.
  const several = mine || change.holders.length > 1;
  const who = named(change.holders, "You");

  return change.previous.length > 0
    ? `${who} take${several ? "" : "s"} it from ${named(change.previous, "you")}.`
    : `${who} ${several ? "have" : "has"} it now.`;
};
