import { describe, expect, it } from "vitest";
import { buildMatchDisposition, type MatchDisposition, type MatchPlayer } from "./matchmaking";
import { computeStats, teamsFromDisposition, type RatingStats, type ScoredMatch } from "./ratings";
import { balanceTeams, dispositionFromTeams } from "./teams";

const person = (uid: string): MatchPlayer => ({ uid, displayName: uid.toUpperCase() });
const four = ["a", "b", "c", "d"].map(person);

// Only the fields balancing reads matter, so stats are built from a rating and how often
// the player sat front or back rather than from a replayed history.
const statsOf = (
  entries: Record<string, { rating: number; front?: number; back?: number }>,
): RatingStats => {
  const base = computeStats([]);

  return {
    ...base,
    players: Object.entries(entries).map(([uid, { rating, front = 0, back = 0 }]) => ({
      uid,
      displayName: uid.toUpperCase(),
      rating,
      games: front + back,
      wins: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      front: { games: front, wins: 0 },
      back: { games: back, wins: 0 },
      history: [],
      results: [],
      partners: [],
      opponents: [],
      tables: [],
      rank: null,
    })),
  };
};

const lineup = (disposition: MatchDisposition | null): string =>
  (disposition?.teams ?? [])
    .map(
      (team) =>
        `${team.color}:${team.players.map((entry) => `${entry.player.uid}/${entry.position}`).join("+")}`,
    )
    .join(" ");

describe("team balancing", () => {
  it("keeps the join order when nobody has a rating yet", () => {
    expect(balanceTeams(four, 4, null)).toEqual(buildMatchDisposition(four, 4));
    expect(balanceTeams(four, 4, statsOf({}))).toEqual(buildMatchDisposition(four, 4));
  });

  it("splits up the two strongest players", () => {
    const stats = statsOf({
      a: { rating: 1200 },
      b: { rating: 1180 },
      c: { rating: 900 },
      d: { rating: 880 },
    });

    // Join order would be 2380 against 1780; a+d against b+c is 2080 each.
    expect(lineup(balanceTeams(four, 4, stats))).toBe("Red:a/front+d/back Blue:b/front+c/back");
  });

  it("picks the closest split when none is even", () => {
    const stats = statsOf({
      a: { rating: 1300 },
      b: { rating: 1000 },
      c: { rating: 1050 },
      d: { rating: 1000 },
    });

    // a+b v c+d: 250 apart. a+c v b+d: 350. a+d v b+c: 250. The earlier pairing wins the tie.
    expect(lineup(balanceTeams(four, 4, stats))).toBe("Red:a/front+b/back Blue:c/front+d/back");
  });

  it("always puts the first player in on Red", () => {
    const stats = statsOf({
      a: { rating: 800 },
      b: { rating: 1300 },
      c: { rating: 1250 },
      d: { rating: 900 },
    });
    const teams = balanceTeams(four, 4, stats)?.teams;

    expect(teams?.[0].color).toBe("Red");
    expect(teams?.[0].players.some((entry) => entry.player.uid === "a")).toBe(true);
  });

  it("seats whoever has played front less up front", () => {
    const stats = statsOf({
      a: { rating: 1000, front: 6, back: 0 },
      b: { rating: 1000, front: 1, back: 3 },
      c: { rating: 1000, front: 2, back: 2 },
      d: { rating: 1000, front: 2, back: 2 },
    });

    // a has only ever played front, so b takes it; c and d are level and keep join order.
    expect(lineup(balanceTeams(four, 4, stats))).toBe("Red:b/front+a/back Blue:c/front+d/back");
  });

  it("ignores anyone queued behind the first four", () => {
    const stats = statsOf({ e: { rating: 2000 } });
    const teams = balanceTeams([...four, person("e")], 4, stats);

    expect(lineup(teams)).toBe("Red:a/front+b/back Blue:c/front+d/back");
  });

  it("leaves a 1v1 in join order and needs a full match", () => {
    const stats = statsOf({ a: { rating: 900 }, b: { rating: 1300 } });

    expect(lineup(balanceTeams(four.slice(0, 2), 2, stats))).toBe("Red:a/solo Blue:b/solo");
    expect(balanceTeams(four.slice(0, 3), 4, stats)).toBeNull();
  });

  it("uses ratings earned from real results", () => {
    const match = (red: string, blue: string, at: number): ScoredMatch => ({
      sessionId: `m${at}`,
      tableCode: "OFFICE",
      startedAt: new Date(Date.UTC(2026, 0, at)),
      size: 2,
      score: { red: 10, blue: 3 },
      teams: [
        { color: "Red", players: [{ uid: red, displayName: red, position: "solo" }] },
        { color: "Blue", players: [{ uid: blue, displayName: blue, position: "solo" }] },
      ],
    });
    // a and b have each won twice, c and d have each lost twice.
    const stats = computeStats([match("a", "c", 1), match("b", "d", 2), match("a", "d", 3), match("b", "c", 4)]);
    const [red, blue] = balanceTeams(four, 4, stats)!.teams;
    const uids = (team: typeof red) => team.players.map((entry) => entry.player.uid);

    // Either mixed split will do; what matters is that the two winners are kept apart.
    expect(uids(red)).toContain("a");
    expect(uids(red)).not.toContain("b");
    expect(uids(blue)).toContain("b");
  });
});

describe("stored teams", () => {
  it("survive a round trip through the stored shape", () => {
    const stats = statsOf({ a: { rating: 1200 }, b: { rating: 1180 }, c: { rating: 900 } });
    const balanced = balanceTeams(four, 4, stats)!;

    expect(dispositionFromTeams(teamsFromDisposition(balanced), 4)).toEqual(balanced);
  });
});
