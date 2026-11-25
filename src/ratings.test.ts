import { describe, expect, it } from "vitest";
import {
  ACTIVE_DAYS,
  DOUBLES_WEIGHT,
  K_FACTOR,
  NEW_PLAYER_GAMES,
  START_RATING,
  bestPartner,
  computeStats,
  expectedScore,
  isActive,
  isNewPlayer,
  kFactorFor,
  matchesFor,
  parseResultTeams,
  ratingChangeSince,
  ratingDelta,
  ratingOf,
  teamAverage,
  toughestOpponent,
  winRate,
  type RatedTeam,
  tableStandings,
  type ScoredMatch,
} from "./ratings";

const solo = (color: string, uid: string): RatedTeam => ({
  color,
  players: [{ uid, displayName: uid.toUpperCase(), position: "solo" }],
});

const pair = (color: string, front: string, back: string): RatedTeam => ({
  color,
  players: [
    { uid: front, displayName: front.toUpperCase(), position: "front" },
    { uid: back, displayName: back.toUpperCase(), position: "back" },
  ],
});

let clock = 0;
const day = (offset: number): Date => new Date(Date.UTC(2026, 0, 1 + offset));

const singles = (
  red: string,
  blue: string,
  redGoals: number,
  blueGoals: number,
  tableCode = "OFFICE",
): ScoredMatch => ({
  sessionId: `s${(clock += 1)}`,
  tableCode,
  startedAt: day(clock),
  size: 2,
  score: { red: redGoals, blue: blueGoals },
  teams: [solo("Red", red), solo("Blue", blue)],
});

const doubles = (
  red: [string, string],
  blue: [string, string],
  redGoals: number,
  blueGoals: number,
): ScoredMatch => ({
  sessionId: `s${(clock += 1)}`,
  tableCode: "OFFICE",
  startedAt: day(clock),
  size: 4,
  score: { red: redGoals, blue: blueGoals },
  teams: [pair("Red", ...red), pair("Blue", ...blue)],
});

const player = (matches: ScoredMatch[], uid: string) => {
  const found = computeStats(matches).players.find((entry) => entry.uid === uid);
  if (!found) {
    throw new Error(`no stats for ${uid}`);
  }

  return found;
};

describe("expectedScore", () => {
  it("gives equal sides an even chance", () => {
    expect(expectedScore(1000, 1000)).toBe(0.5);
  });

  it("favours the higher-rated side, symmetrically", () => {
    const favourite = expectedScore(1200, 1000);

    expect(favourite).toBeGreaterThan(0.75);
    expect(favourite + expectedScore(1000, 1200)).toBeCloseTo(1);
  });
});

describe("computeStats ratings", () => {
  it("moves equal players by half the K-factor, zero-sum", () => {
    const stats = computeStats([singles("ada", "bo", 10, 4)]);

    expect(ratingOf(stats, "ada")).toBe(START_RATING + 16);
    expect(ratingOf(stats, "bo")).toBe(START_RATING - 16);
    expect(stats.matches.s1 ?? Object.values(stats.matches)[0]).toMatchObject({
      delta: [16, -16],
    });
  });

  it("rewards an upset more than an expected win", () => {
    // Ada beats Bo four times to open a gap, then the two outcomes are compared.
    const lead = Array.from({ length: 4 }, () => singles("ada", "bo", 10, 5));
    const expected = computeStats([...lead, singles("ada", "bo", 10, 5)]);
    const upset = computeStats([...lead, singles("ada", "bo", 5, 10)]);
    const lastDelta = (stats: typeof expected) => {
      const deltas = Object.values(stats.matches);
      return deltas[deltas.length - 1].delta;
    };

    expect(lastDelta(expected)[0]).toBeGreaterThan(0);
    expect(lastDelta(expected)[0]).toBeLessThan(16);
    expect(lastDelta(upset)[1]).toBeGreaterThan(16);
  });

  it("rates a 2v2 on the team average and moves both teammates equally", () => {
    const stats = computeStats([doubles(["ada", "bo"], ["cy", "di"], 10, 7)]);

    // An even 2v2 is worth three quarters of an even 1v1's 16 points.
    expect(ratingOf(stats, "ada")).toBe(START_RATING + 12);
    expect(ratingOf(stats, "bo")).toBe(START_RATING + 12);
    expect(ratingOf(stats, "cy")).toBe(START_RATING - 12);
    expect(ratingOf(stats, "di")).toBe(START_RATING - 12);
  });

  it("moves ratings less in a 2v2 than in a 1v1 between the same ratings", () => {
    expect(kFactorFor(2)).toBe(K_FACTOR);
    expect(kFactorFor(4)).toBe(K_FACTOR * DOUBLES_WEIGHT);

    // Even sides, then a favourite winning, then an underdog winning.
    expect(ratingDelta(1000, 1000, true, 2)).toBe(16);
    expect(ratingDelta(1000, 1000, true, 4)).toBe(12);
    expect(ratingDelta(1200, 1000, true, 2)).toBe(8);
    expect(ratingDelta(1200, 1000, true, 4)).toBe(6);
    expect(ratingDelta(1000, 1200, true, 2)).toBe(24);
    expect(ratingDelta(1000, 1200, true, 4)).toBe(18);
  });

  it("keeps a match zero-sum whatever its size", () => {
    for (const size of [2, 4] as const) {
      expect(ratingDelta(1100, 1000, true, size) + ratingDelta(1000, 1100, false, size)).toBe(0);
    }

    const { delta } = Object.values(
      computeStats([doubles(["ada", "bo"], ["cy", "di"], 3, 10)]).matches,
    )[0];
    expect(delta).toEqual([-12, 12]);
  });

  it("replays matches in the order they were played, whatever order they arrive in", () => {
    const matches = [
      singles("ada", "bo", 10, 2),
      singles("bo", "cy", 10, 2),
      singles("cy", "ada", 10, 2),
    ];

    expect(computeStats([...matches].reverse()).players).toEqual(
      computeStats(matches).players,
    );
  });

  it("records the rating each player took into a match", () => {
    const first = singles("ada", "bo", 10, 1);
    const second = singles("ada", "bo", 10, 1);
    const stats = computeStats([first, second]);

    expect(stats.matches[first.sessionId].before).toEqual({ ada: 1000, bo: 1000 });
    expect(stats.matches[second.sessionId].before).toEqual({ ada: 1016, bo: 984 });
  });

  it("skips a match with an empty side or a player on both teams", () => {
    const broken: ScoredMatch = { ...singles("ada", "ada", 10, 3) };
    const empty: ScoredMatch = {
      ...singles("ada", "bo", 10, 3),
      teams: [solo("Red", "ada"), { color: "Blue", players: [] }],
    };

    expect(computeStats([broken, empty]).players).toEqual([]);
  });

  it("treats an unknown player as unrated", () => {
    expect(ratingOf(computeStats([]), "nobody")).toBe(START_RATING);
    expect(ratingOf(null, "nobody")).toBe(START_RATING);
  });
});

describe("computeStats records", () => {
  const matches = [
    doubles(["ada", "bo"], ["cy", "di"], 10, 6),
    doubles(["ada", "bo"], ["cy", "di"], 10, 8),
    doubles(["cy", "ada"], ["bo", "di"], 3, 10),
    singles("ada", "di", 10, 0),
  ];

  it("tallies games, wins, goals and form", () => {
    const ada = player(matches, "ada");

    expect(ada).toMatchObject({ games: 4, wins: 3, losses: 1, goalsFor: 33, goalsAgainst: 24 });
    expect(ada.results).toEqual([true, true, false, true]);
    expect(ada.history).toHaveLength(4);
  });

  it("splits 2v2 results by position and leaves 1v1 out of both", () => {
    const ada = player(matches, "ada");

    expect(ada.front).toEqual({ games: 2, wins: 2 });
    expect(ada.back).toEqual({ games: 1, wins: 0 });
  });

  it("finds the best partner and the toughest opponent", () => {
    const ada = player(matches, "ada");

    expect(bestPartner(ada)).toMatchObject({ uid: "bo", games: 2, wins: 2 });
    // Ada met Di four times and Cy twice; Bo only once, which is too few to count.
    expect(toughestOpponent(ada)).toMatchObject({ uid: "di", games: 4, wins: 3 });
  });

  it("ignores pairings with a single game together", () => {
    const one = player([doubles(["ada", "bo"], ["cy", "di"], 10, 6)], "ada");

    expect(bestPartner(one)).toBeNull();
    expect(toughestOpponent(one)).toBeNull();
  });
});

describe("ranking", () => {
  const season = (games: number): ScoredMatch[] =>
    Array.from({ length: games }, () => singles("ada", "bo", 10, 5));

  it("ranks a player from their very first game", () => {
    const stats = computeStats(season(1));

    expect(stats.players.map((entry) => [entry.uid, entry.rank])).toEqual([
      ["ada", 1],
      ["bo", 2],
    ]);
  });

  it("ranks everyone by rating, however few games they have", () => {
    const stats = computeStats([...season(SEASON_GAMES), singles("cy", "di", 10, 9)]);

    // Cy's single win puts him above Di and above Bo, who has lost ten.
    expect(stats.players.map((entry) => [entry.uid, entry.rank])).toEqual([
      ["ada", 1],
      ["cy", 2],
      ["di", 3],
      ["bo", 4],
    ]);
  });

  it("marks a player as new for their first three games only", () => {
    const find = (games: number) =>
      computeStats(season(games)).players.find((entry) => entry.uid === "ada")!;

    expect(NEW_PLAYER_GAMES).toBe(3);
    expect(isNewPlayer(find(1))).toBe(true);
    expect(isNewPlayer(find(2))).toBe(true);
    expect(isNewPlayer(find(3))).toBe(false);
  });
});

// Enough games for a rating to have moved well away from the start.
const SEASON_GAMES = 10;

describe("across tables", () => {
  const season = [
    ...Array.from({ length: SEASON_GAMES }, () => singles("ada", "bo", 10, 5, "OFFICE")),
    ...Array.from({ length: SEASON_GAMES }, () => singles("cy", "di", 10, 5, "LOUNGE")),
    singles("ada", "di", 10, 5, "LOUNGE"),
    singles("eli", "bo", 10, 5, "OFFICE"),
  ];

  it("carries one rating from table to table", () => {
    const home = computeStats(season.slice(0, SEASON_GAMES));
    const both = computeStats(season);
    const ada = both.players.find((entry) => entry.uid === "ada");

    // The away game at LOUNGE moved the same rating Ada built at OFFICE.
    expect(ada?.rating).toBeGreaterThan(ratingOf(home, "ada"));
    expect(ada?.tables).toEqual(["OFFICE", "LOUNGE"]);
    expect(ada?.games).toBe(SEASON_GAMES + 1);
  });

  const today = season[season.length - 1].startedAt;

  it("lists only a table's own players, placed among themselves", () => {
    const stats = computeStats(season);
    const office = tableStandings(stats, "OFFICE", today);
    const lounge = tableStandings(stats, "LOUNGE", today);

    // Eli has played once and won, which already puts him on the board, above Bo.
    expect(office.map((entry) => [entry.player.uid, entry.place])).toEqual([
      ["ada", 1],
      ["eli", 2],
      ["bo", 3],
    ]);
    expect(lounge.map((entry) => entry.player.uid).sort()).toEqual(["ada", "cy", "di"]);
    expect(lounge.map((entry) => entry.place)).toEqual([1, 2, 3]);
    // Overall, players from the other table are ahead of Bo too, but his place at OFFICE
    // counts only the three who play there.
    expect(stats.players.find((entry) => entry.uid === "bo")?.rank).toBeGreaterThan(3);
  });

  it("returns the whole match history, newest first, by table or by player", () => {
    const stats = computeStats(season);
    const everything = matchesFor(stats, {});

    expect(everything).toHaveLength(season.length);
    expect(everything[0].sessionId).toBe(season[season.length - 1].sessionId);
    expect(matchesFor(stats, { tableCode: "LOUNGE" })).toHaveLength(SEASON_GAMES + 1);
    expect(matchesFor(stats, { uid: "ada" })).toHaveLength(SEASON_GAMES + 1);
    // Ada's one away game is the only match that is both hers and at LOUNGE.
    expect(
      matchesFor(stats, { tableCode: "LOUNGE", uid: "ada" }).map((match) => match.sessionId),
    ).toEqual([season[SEASON_GAMES * 2].sessionId]);
  });

  it("has no standings for a table nobody has scored on", () => {
    expect(tableStandings(computeStats(season), "EMPTY1", today)).toEqual([]);
  });
});

describe("activity", () => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const early = Array.from({ length: SEASON_GAMES }, () => singles("ada", "bo", 10, 5));
  const late = Array.from({ length: SEASON_GAMES }, () => singles("cy", "di", 10, 5));
  const stats = computeStats([...early, ...late]);
  const lastEarly = early[early.length - 1].startedAt;
  const find = (uid: string) => stats.players.find((entry) => entry.uid === uid)!;

  it("counts a player as active up to and including the 60th day", () => {
    const onTheDay = new Date(lastEarly.getTime() + ACTIVE_DAYS * DAY_MS);

    expect(isActive(find("ada"), onTheDay)).toBe(true);
    expect(isActive(find("ada"), new Date(onTheDay.getTime() + 1))).toBe(false);
  });

  it("hides players who have stopped playing and closes the gap in places", () => {
    // Ada shares the top of the board while everyone is active...
    const lastLate = late[late.length - 1].startedAt;
    expect(
      tableStandings(stats, "OFFICE", lastLate).map((entry) => [entry.player.uid, entry.place]),
    ).toEqual([
      ["ada", 1],
      ["cy", 2],
      ["bo", 3],
      ["di", 4],
    ]);

    // ...and is gone once her last game is more than 60 days old, with Cy now first.
    const later = new Date(lastEarly.getTime() + (ACTIVE_DAYS + 1) * DAY_MS);
    expect(
      tableStandings(stats, "OFFICE", later).map((entry) => [entry.player.uid, entry.place]),
    ).toEqual([
      ["cy", 1],
      ["di", 2],
    ]);
    // Hidden, not reset: the rating is untouched for when she plays again.
    expect(find("ada").rating).toBeGreaterThan(START_RATING);
  });

  it("goes by the latest game on any table", () => {
    const away = singles("bo", "eli", 10, 5, "LOUNGE");
    const withAway = computeStats([...early, ...late, away]);
    const later = new Date(lastEarly.getTime() + (ACTIVE_DAYS + 1) * DAY_MS);

    // Bo last played at OFFICE too long ago, but a recent game at LOUNGE keeps him listed.
    expect(tableStandings(withAway, "OFFICE", later).map((entry) => entry.player.uid)).toContain(
      "bo",
    );
  });
});

describe("helpers", () => {
  it("measures rating change from the rating held before the cut-off", () => {
    const matches = [
      singles("ada", "bo", 10, 5),
      singles("ada", "bo", 10, 5),
      singles("ada", "bo", 10, 5),
    ];
    const ada = player(matches, "ada");
    const cutOff = matches[1].startedAt;

    expect(ratingChangeSince(ada, cutOff)).toBe(ada.rating - ada.history[0].rating);
    expect(ratingChangeSince(ada, new Date(0))).toBe(ada.rating - START_RATING);
  });

  it("averages team ratings and reports win rate as a whole percentage", () => {
    expect(teamAverage([1124, 986])).toBe(1055);
    expect(teamAverage([])).toBe(START_RATING);
    expect(winRate({ games: 24, wins: 14 })).toBe(58);
    expect(winRate({ games: 0, wins: 0 })).toBeNull();
  });
});

describe("parseResultTeams", () => {
  const stored = [
    { color: "Red", players: [{ uid: "ada", displayName: "Ada", position: "front" }] },
    { color: "Blue", players: [{ uid: "bo", displayName: "Bo", position: "back" }] },
  ];

  it("reads teams stored on a result", () => {
    expect(parseResultTeams(stored)).toEqual(stored);
  });

  it("falls back to a placeholder name", () => {
    const teams = parseResultTeams([
      { color: "Red", players: [{ uid: "ada", position: "solo" }] },
      stored[1],
    ]);

    expect(teams?.[0].players[0].displayName).toBe("Player");
  });

  it("rejects anything missing, malformed or in the wrong order", () => {
    expect(parseResultTeams(undefined)).toBeNull();
    expect(parseResultTeams([stored[0]])).toBeNull();
    expect(parseResultTeams([stored[1], stored[0]])).toBeNull();
    expect(parseResultTeams([{ color: "Red", players: [] }, stored[1]])).toBeNull();
    expect(
      parseResultTeams([{ color: "Red", players: [{ uid: "", position: "solo" }] }, stored[1]]),
    ).toBeNull();
    expect(
      parseResultTeams([{ color: "Red", players: [{ uid: "ada", position: "wing" }] }, stored[1]]),
    ).toBeNull();
  });
});
