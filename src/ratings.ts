import type { MatchDisposition, MatchScore, MatchSize, TeamPosition } from "./matchmaking";

// Elo ratings and per-player statistics, recomputed from the scored match history on every
// load. A player has one rating across every table they play on; a table's leaderboard is
// that same rating, listed for the people who have played there. Nothing here is stored: the results are the source of truth, so a
// tweak to the formula re-rates every past game for free.

export const START_RATING = 1000;
// How far one 1v1 game can move a rating: an even match is worth half of this.
export const K_FACTOR = 32;
// A 2v2 moves each player's rating this much of what a 1v1 would. Its result is only
// partly down to any one player, so it says less about them; but partners change from
// game to game and results are scarce, so it is discounted rather than halved.
export const DOUBLES_WEIGHT = 0.75;

export const kFactorFor = (size: MatchSize): number =>
  size === 4 ? K_FACTOR * DOUBLES_WEIGHT : K_FACTOR;

// Scored games during which a player is marked "New". Everyone is ranked from their
// first game; the mark only says that a rating built on so few results will still swing.
// (Players used to go unranked until ten games, which on a small table left the board
// mostly without places and told newcomers they didn't count yet.)
export const NEW_PLAYER_GAMES = 3;

export type RatedPlayer = {
  uid: string;
  displayName: string;
  position: TeamPosition;
};

export type RatedTeam = {
  color: string;
  players: RatedPlayer[];
};

// Teams are always [Red, Blue], matching the score's red/blue goals.
export type ScoredMatch = {
  sessionId: string;
  tableCode: string;
  startedAt: Date;
  size: MatchSize;
  score: MatchScore;
  teams: [RatedTeam, RatedTeam];
  // Who started the match (account id). Ratings ignore it; the badges count it.
  startedBy?: string;
};

export type Tally = { games: number; wins: number };

export type Versus = Tally & { uid: string; displayName: string };

export type PlayerStats = {
  uid: string;
  displayName: string;
  rating: number;
  games: number;
  wins: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  front: Tally;
  back: Tally;
  // Rating after each game, oldest first.
  history: { at: Date; rating: number }[];
  // Win (true) or loss per game, oldest first.
  results: boolean[];
  partners: Versus[];
  opponents: Versus[];
  // Codes of the tables this player has a scored game on.
  tables: string[];
  // Position among all players, on any table, by rating.
  rank: number;
};

// A scored match together with what it did to the ratings: everyone's rating going in,
// and the points the Red and Blue sides gained or lost (always equal and opposite).
export type MatchRating = ScoredMatch & {
  before: Record<string, number>;
  delta: [number, number];
};

export type RatingStats = {
  // Everyone with a scored game, by rating.
  players: PlayerStats[];
  matches: Record<string, MatchRating>;
};

// "+11", "−11" or "±0", for showing a rating change.
export const formatDelta = (delta: number): string =>
  delta > 0 ? `+${delta}` : delta < 0 ? `−${-delta}` : "±0";

// Probability that a side rated `own` beats one rated `other`.
export const expectedScore = (own: number, other: number): number =>
  1 / (1 + 10 ** ((other - own) / 400));

// Points each player on a side rated `own` gains (or, negative, loses) against one rated
// `other`, in a match of the given size. The other side moves by the same amount the
// opposite way.
export const ratingDelta = (own: number, other: number, won: boolean, size: MatchSize): number =>
  Math.round(kFactorFor(size) * ((won ? 1 : 0) - expectedScore(own, other)));

export const teamAverage = (ratings: number[]): number =>
  ratings.length === 0
    ? START_RATING
    : Math.round(ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length);

export const winRate = ({ games, wins }: Tally): number | null =>
  games === 0 ? null : Math.round((wins / games) * 100);

export const ratingOf = (stats: RatingStats | null, uid: string): number =>
  stats?.players.find((player) => player.uid === uid)?.rating ?? START_RATING;

export const isNewPlayer = (player: PlayerStats): boolean => player.games < NEW_PLAYER_GAMES;

const isPosition = (value: unknown): value is TeamPosition =>
  value === "front" || value === "back" || value === "solo";

// Reads the teams stored on a result. Older results carry none (their teams are rebuilt
// from the join order instead), and the data is client-written, so nothing is assumed.
export const parseResultTeams = (raw: unknown): [RatedTeam, RatedTeam] | null => {
  if (!Array.isArray(raw) || raw.length !== 2) {
    return null;
  }

  const teams = raw.map((entry): RatedTeam | null => {
    const team = entry as { color?: unknown; players?: unknown } | null;
    if (!team || typeof team.color !== "string" || !Array.isArray(team.players)) {
      return null;
    }

    const players = team.players.map((item): RatedPlayer | null => {
      const player = item as { uid?: unknown; displayName?: unknown; position?: unknown } | null;
      if (!player || typeof player.uid !== "string" || !player.uid || !isPosition(player.position)) {
        return null;
      }

      return {
        uid: player.uid,
        displayName: typeof player.displayName === "string" ? player.displayName : "Player",
        position: player.position,
      };
    });

    return players.length > 0 && players.every((player) => player !== null)
      ? { color: team.color, players: players as RatedPlayer[] }
      : null;
  });

  const [red, blue] = teams;

  return red && blue && red.color === "Red" && blue.color === "Blue" ? [red, blue] : null;
};

export const teamsFromDisposition = (disposition: MatchDisposition): [RatedTeam, RatedTeam] => {
  const [red, blue] = disposition.teams.map((team) => ({
    color: team.color,
    players: team.players.map((entry) => ({
      uid: entry.player.uid,
      displayName: entry.player.displayName,
      position: entry.position,
    })),
  }));

  return [red, blue];
};

const emptyStats = (uid: string, displayName: string): PlayerStats => ({
  uid,
  displayName,
  rating: START_RATING,
  games: 0,
  wins: 0,
  losses: 0,
  goalsFor: 0,
  goalsAgainst: 0,
  front: { games: 0, wins: 0 },
  back: { games: 0, wins: 0 },
  history: [],
  results: [],
  partners: [],
  opponents: [],
  tables: [],
  // Set once every match has been replayed.
  rank: 0,
});

const bump = (list: Versus[], other: RatedPlayer, won: boolean): void => {
  let entry = list.find((item) => item.uid === other.uid);
  if (!entry) {
    entry = { uid: other.uid, displayName: other.displayName, games: 0, wins: 0 };
    list.push(entry);
  }

  entry.displayName = other.displayName;
  entry.games += 1;
  entry.wins += won ? 1 : 0;
};

// A match is rated only when both sides have players and nobody appears twice.
const isRateable = ({ teams: [red, blue] }: ScoredMatch): boolean => {
  const uids = [...red.players, ...blue.players].map((player) => player.uid);

  return red.players.length > 0 && blue.players.length > 0 && new Set(uids).size === uids.length;
};

// Replays the scored matches in the order they were played. A team's strength is the
// average of its players, and both teammates move by the same amount, so a 1v1 and a 2v2
// feed one shared rating, with a 2v2 counting for a little less (DOUBLES_WEIGHT). The
// margin of victory is ignored: 10–9 counts like 10–0.
export const computeStats = (matches: ScoredMatch[]): RatingStats => {
  const byUid = new Map<string, PlayerStats>();
  const rated: Record<string, MatchRating> = {};
  const statsFor = (player: RatedPlayer): PlayerStats => {
    const existing = byUid.get(player.uid);
    if (existing) {
      // The most recent match wins, so a renamed player shows their current name.
      existing.displayName = player.displayName;
      return existing;
    }

    const created = emptyStats(player.uid, player.displayName);
    byUid.set(player.uid, created);
    return created;
  };

  const ordered = [...matches]
    .filter(isRateable)
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());

  for (const match of ordered) {
    const [red, blue] = match.teams;
    const everyone = [...red.players, ...blue.players];
    const before: Record<string, number> = {};
    for (const player of everyone) {
      before[player.uid] = statsFor(player).rating;
    }

    const redRating = teamAverage(red.players.map((player) => before[player.uid]));
    const blueRating = teamAverage(blue.players.map((player) => before[player.uid]));
    const redWon = match.score.red > match.score.blue;
    const redDelta = ratingDelta(redRating, blueRating, redWon, match.size);
    rated[match.sessionId] = { ...match, before, delta: [redDelta, -redDelta] };

    const sides = [
      { team: red, rivals: blue, won: redWon, delta: redDelta, scored: match.score.red },
      { team: blue, rivals: red, won: !redWon, delta: -redDelta, scored: match.score.blue },
    ];

    for (const { team, rivals, won, delta, scored } of sides) {
      const conceded = match.score.red + match.score.blue - scored;

      for (const player of team.players) {
        const stats = statsFor(player);
        stats.rating += delta;
        stats.games += 1;
        stats.wins += won ? 1 : 0;
        stats.losses += won ? 0 : 1;
        stats.goalsFor += scored;
        stats.goalsAgainst += conceded;
        stats.history.push({ at: match.startedAt, rating: stats.rating });
        if (!stats.tables.includes(match.tableCode)) {
          stats.tables.push(match.tableCode);
        }
        stats.results.push(won);

        if (player.position === "front" || player.position === "back") {
          stats[player.position].games += 1;
          stats[player.position].wins += won ? 1 : 0;
        }

        for (const partner of team.players) {
          if (partner.uid !== player.uid) {
            bump(stats.partners, partner, won);
          }
        }
        for (const rival of rivals.players) {
          bump(stats.opponents, rival, won);
        }
      }
    }
  }

  const byRating = (a: PlayerStats, b: PlayerStats): number =>
    b.rating - a.rating || b.games - a.games || a.displayName.localeCompare(b.displayName);
  const players = [...byUid.values()].sort(byRating);
  players.forEach((player, index) => {
    player.rank = index + 1;
  });

  return { players, matches: rated };
};

export type Standing = {
  player: PlayerStats;
  // Position among the players listed on this table's leaderboard.
  place: number;
};

// Days without a scored game before a player drops off the leaderboards. They keep their
// rating and reappear with their next game; this is what clears out abandoned accounts,
// such as the second login of someone who now plays under another.
export const ACTIVE_DAYS = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

// Whether the player has a scored game, on any table, within the last ACTIVE_DAYS.
export const isActive = (player: PlayerStats, now: Date = new Date()): boolean => {
  const last = player.history[player.history.length - 1];

  return !!last && now.getTime() - last.at.getTime() <= ACTIVE_DAYS * DAY_MS;
};

// One table's leaderboard: everyone with a scored game there who is still active, in
// rating order. The rating is the player's overall one, but places are counted among the
// players listed so the board reads 1, 2, 3 rather than skipping people who only play
// elsewhere or have stopped playing.
export const tableStandings = (
  stats: RatingStats,
  tableCode: string,
  now: Date = new Date(),
): Standing[] => {
  let place = 0;

  return stats.players
    .filter((player) => player.tables.includes(tableCode) && isActive(player, now))
    .map((player) => ({ player, place: (place += 1) }));
};

// Every rated match, newest first, optionally narrowed to one table and/or one player.
// This is the full history: unlike the live session listeners it has no cut-off.
export const matchesFor = (
  stats: RatingStats,
  { tableCode, uid }: { tableCode?: string; uid?: string },
): MatchRating[] =>
  Object.values(stats.matches)
    .filter(
      (match) =>
        (!tableCode || match.tableCode === tableCode) &&
        (!uid || match.teams.some((team) => team.players.some((player) => player.uid === uid))),
    )
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

// Rating gained or lost since `since`, measured from the rating held going into it.
export const ratingChangeSince = (player: PlayerStats, since: Date): number => {
  const earlier = player.history.filter((entry) => entry.at.getTime() < since.getTime());
  const baseline = earlier.length > 0 ? earlier[earlier.length - 1].rating : START_RATING;

  return player.rating - baseline;
};

const MIN_SHARED_GAMES = 2;

const rate = (entry: Versus): number => entry.wins / entry.games;

// The teammate this player wins most with. One game together proves nothing, so a pairing
// needs a couple before it counts; ties go to the pairing with more games behind it.
export const bestPartner = (player: PlayerStats): Versus | null =>
  player.partners
    .filter((entry) => entry.games >= MIN_SHARED_GAMES)
    .sort((a, b) => rate(b) - rate(a) || b.games - a.games)[0] ?? null;

// The opponent this player loses to most often.
export const toughestOpponent = (player: PlayerStats): Versus | null =>
  player.opponents
    .filter((entry) => entry.games >= MIN_SHARED_GAMES)
    .sort((a, b) => rate(a) - rate(b) || b.games - a.games)[0] ?? null;
