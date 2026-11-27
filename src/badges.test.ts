import { describe, expect, it } from "vitest";
import { BADGES, badgeChanges, badgesAt, type BadgeId, type HeldBadge } from "./badges";
import { computeStats, type RatedTeam, type ScoredMatch } from "./ratings";

const TABLE = "TABLE1";

const side = (color: string, uids: string[]): RatedTeam => ({
  color,
  players: uids.map((uid, index) => ({
    uid,
    displayName: `${uid.charAt(0).toUpperCase()}${uid.slice(1)} Olsen`,
    position: uids.length === 1 ? "solo" : index === 0 ? "front" : "back",
  })),
});

const day = (offset: number): Date => new Date(Date.UTC(2026, 0, 1 + offset, 12));
// Badges are read on day 60, so "the last 30 days" starts on day 30.
const NOW = day(60);

let counter = 0;
// A game on the given day; the first side listed wins, 10 to `loserGoals`.
const game = (
  dayOffset: number,
  winners: string[],
  losers: string[],
  { startedBy = "", loserGoals = 6, table = TABLE } = {},
): ScoredMatch => ({
  sessionId: `g${(counter += 1)}`,
  tableCode: table,
  startedAt: new Date(day(dayOffset).getTime() + counter * 1000),
  size: winners.length === 1 ? 2 : 4,
  score: { red: 10, blue: loserGoals },
  teams: [side("Red", winners), side("Blue", losers)],
  startedBy,
});

const held = (matches: ScoredMatch[], id: BadgeId, now = NOW): HeldBadge | undefined =>
  badgesAt(computeStats(matches), TABLE, now).find((entry) => entry.badge.id === id);

const holders = (entry: HeldBadge | undefined): string[] =>
  entry?.holders.map((holder) => holder.uid) ?? [];

describe("badges", () => {
  it("hands out nothing on a table without games", () => {
    expect(badgesAt(computeStats([]), TABLE, NOW)).toEqual([]);
  });

  it("lists what is held in the order the badges are defined", () => {
    const matches = [40, 41, 42, 55, 56].map((at) => game(at, ["ada"], ["bo"], { startedBy: "ada" }));
    const ids = badgesAt(computeStats(matches), TABLE, NOW).map((entry) => entry.badge.id);

    expect(ids).toEqual(BADGES.map((badge) => badge.id).filter((id) => ids.includes(id)));
    expect(ids).toContain("ringleader");
  });

  describe("Ringleader", () => {
    it("goes to whoever started the most games this month", () => {
      const matches = [
        ...[40, 41, 42].map((at) => game(at, ["ada"], ["bo"], { startedBy: "ada" })),
        ...[43, 44].map((at) => game(at, ["ada"], ["bo"], { startedBy: "bo" })),
      ];
      const badge = held(matches, "ringleader");

      expect(holders(badge)).toEqual(["ada"]);
      expect(badge?.holders[0].displayName).toBe("Ada Olsen");
      expect(badge?.reason).toBe("Started 3 games in the last 30 days.");
    });

    it("needs three games started, and only counts the last 30 days", () => {
      const twoRecent = [40, 41].map((at) => game(at, ["ada"], ["bo"], { startedBy: "ada" }));
      const old = [10, 11, 12].map((at) => game(at, ["ada"], ["bo"], { startedBy: "ada" }));

      expect(held([...old, ...twoRecent], "ringleader")).toBeUndefined();
    });

    it("is taken by passing the holder, not by drawing level", () => {
      const level = [
        ...[40, 41, 42].map((at) => game(at, ["ada"], ["bo"], { startedBy: "ada" })),
        ...[43, 44, 45].map((at) => game(at, ["ada"], ["bo"], { startedBy: "bo" })),
      ];
      expect(holders(held(level, "ringleader"))).toEqual(["ada"]);

      const passed = [...level, game(46, ["ada"], ["bo"], { startedBy: "bo" })];
      expect(holders(held(passed, "ringleader"))).toEqual(["bo"]);
    });
  });

  describe("Does anyone here work?", () => {
    it("goes to the player with the most games in the last week, from five", () => {
      const week = ["bo", "cy", "di", "ed", "bo"].map((rival, index) =>
        game(54 + index, ["ada"], [rival]),
      );
      const badge = held(week, "busiest");

      expect(holders(badge)).toEqual(["ada"]);
      expect(badge?.reason).toBe("5 games in the last 7 days.");
      expect(held(week.slice(1), "busiest")).toBeUndefined();
    });

    it("ignores games from before the week", () => {
      const spread = [40, 41, 42, 43, 44].map((at) => game(at, ["ada"], ["bo"]));

      expect(held(spread, "busiest")).toBeUndefined();
    });
  });

  describe("Rookie of the month", () => {
    it("goes to the newcomer whose rating rose the most", () => {
      const matches = [
        ...[40, 41, 42].map((at) => game(at, ["ada"], ["bo"])),
        game(43, ["cy"], ["bo"]),
      ];
      const badge = held(matches, "rookie");

      expect(holders(badge)).toEqual(["ada"]);
      expect(badge?.reason).toMatch(/^Up \d+ rating points in 3 games, with fewer than 20 played\.$/);
    });

    it("leaves out anyone with twenty games behind them", () => {
      // Ada has been winning for a long time; Cy is new and wins three.
      const veteran = Array.from({ length: 20 }, (_, index) => game(31 + index, ["ada"], ["bo"]));
      const matches = [...veteran, ...[52, 53, 54].map((at) => game(at, ["cy"], ["di"]))];

      expect(holders(held(matches, "rookie"))).toEqual(["cy"]);
    });

    it("is not given for a month of losing", () => {
      const matches = [40, 41, 42].map((at) => game(at, ["ada"], ["bo"]));
      const rookie = held(matches, "rookie");

      expect(holders(rookie)).not.toContain("bo");
    });
  });

  describe("The Wall", () => {
    it("goes to the back player who lets in the fewest goals a game", () => {
      // Ada plays back for the winners and lets in 2 a game; Di plays back for the losers.
      const matches = [40, 41, 42, 43, 44].map((at) =>
        game(at, ["bo", "ada"], ["cy", "di"], { loserGoals: 2 }),
      );
      const badge = held(matches, "wall");

      expect(holders(badge)).toEqual(["ada"]);
      expect(badge?.reason).toBe("Lets in 2.0 goals a game at the back, over 5 games.");
      expect(held(matches.slice(1), "wall")).toBeUndefined();
    });
  });

  describe("Giant Killer", () => {
    // Ada beats Bo six times and is then well ahead of the newcomer Cy.
    const run = [31, 32, 33, 34, 35, 36].map((at) => game(at, ["ada"], ["bo"]));

    it("goes to whoever won the game the ratings least expected", () => {
      const badge = held([...run, game(40, ["cy"], ["ada"])], "giantKiller");

      expect(holders(badge)).toEqual(["cy"]);
      expect(badge?.reason).toMatch(/^Beat Ada 10–6 from \d+ rating points down\.$/);
    });

    it("is not given for beating someone of about the same rating", () => {
      expect(held([game(40, ["cy"], ["di"])], "giantKiller")).toBeUndefined();
      expect(held(run, "giantKiller")).toBeUndefined();
    });

    it("is shared by both winners of a 2v2", () => {
      // A 2v2 moves a rating less than a 1v1, so the favourites need a longer run.
      const strong = [30, 31, 32, 33, 34, 35, 36, 37, 38].map((at) =>
        game(at, ["ada", "bo"], ["ed", "fay"]),
      );
      const badge = held([...strong, game(40, ["cy", "di"], ["ada", "bo"])], "giantKiller");

      expect(holders(badge).sort()).toEqual(["cy", "di"]);
      expect(badge?.reason).toMatch(/^Beat Ada & Bo 10–6 from \d+ rating points down\.$/);
    });
  });

  describe("Divorce Pending", () => {
    // Twenty games each before the month in question, evenly won and lost.
    const history = (count: number): ScoredMatch[] =>
      Array.from({ length: count }, (_, index) =>
        index % 2 === 0
          ? game(1 + index, ["ada", "bo"], ["cy", "di"])
          : game(1 + index, ["cy", "di"], ["ada", "bo"]),
      );
    const losses = [40, 41, 42, 43].map((at) => game(at, ["cy", "di"], ["ada", "bo"]));

    it("goes to the pair with the worst record together", () => {
      const badge = held([...history(20), ...losses], "divorce");

      expect(holders(badge)).toEqual(["ada", "bo"]);
      expect(badge?.reason).toBe("No wins in 4 games together.");
    });

    it("needs four games together in the month", () => {
      expect(held([...history(20), ...losses.slice(1)], "divorce")).toBeUndefined();
    });

    it("never lands on a newcomer", () => {
      expect(held([...history(10), ...losses], "divorce")).toBeUndefined();
    });

    it("is not given to a pair that wins its share", () => {
      const even = [
        ...[40, 41].map((at) => game(at, ["cy", "di"], ["ada", "bo"])),
        ...[42, 43].map((at) => game(at, ["ada", "bo"], ["cy", "di"])),
      ];

      expect(held([...history(20), ...even], "divorce")).toBeUndefined();
    });
  });

  it("counts only this table's games, and none from after the moment asked about", () => {
    const elsewhere = [40, 41, 42].map((at) =>
      game(at, ["ada"], ["bo"], { startedBy: "ada", table: "OTHER1" }),
    );
    const later = [61, 62, 63].map((at) => game(at, ["ada"], ["bo"], { startedBy: "ada" }));

    expect(held([...elsewhere, ...later], "ringleader")).toBeUndefined();
    expect(holders(held(later, "ringleader", day(70)))).toEqual(["ada"]);
  });

  describe("changes of holder", () => {
    const boLeads = [40, 41, 42].map((at) => game(at, ["ada"], ["bo"], { startedBy: "bo" }));
    const adaPasses = [51, 52, 53, 54].map((at) => game(at, ["ada"], ["bo"], { startedBy: "ada" }));

    it("reports a badge that found a new holder, and who had it", () => {
      const stats = computeStats([...boLeads, ...adaPasses]);
      const change = badgeChanges(stats, TABLE, day(50), NOW).find(
        (entry) => entry.badge.id === "ringleader",
      );

      expect(change?.holders.map((holder) => holder.uid)).toEqual(["ada"]);
      expect(change?.previous.map((holder) => holder.uid)).toEqual(["bo"]);
    });

    it("reports a badge held for the first time, with nobody before", () => {
      const stats = computeStats(adaPasses);
      const change = badgeChanges(stats, TABLE, day(50), NOW).find(
        (entry) => entry.badge.id === "ringleader",
      );

      expect(change?.previous).toEqual([]);
    });

    it("says nothing about a badge that stayed where it was", () => {
      const stats = computeStats(boLeads);
      const ids = badgeChanges(stats, TABLE, day(50), NOW).map((entry) => entry.badge.id);

      expect(ids).not.toContain("ringleader");
    });
  });
});
