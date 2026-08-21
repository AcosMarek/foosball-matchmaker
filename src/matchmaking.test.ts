import { describe, expect, it } from "vitest";
import {
  buildMatchDisposition,
  canStartMatch,
  describeScore,
  fillWindowRemaining,
  isValidScore,
  isValidTableCode,
  joinOutcome,
  matchPhase,
  mergeRoster,
  normalizeTableCode,
  scoreWinner,
} from "./matchmaking";

describe("table code handling", () => {
  it("normalizes and validates six character codes", () => {
    expect(normalizeTableCode(" ab12cd ")).toBe("AB12CD");
    expect(isValidTableCode("ab12cd")).toBe(true);
    expect(isValidTableCode("abc12")).toBe(false);
    expect(isValidTableCode("abc1234")).toBe(false);
    expect(isValidTableCode("abc-12")).toBe(false);
  });
});

describe("match scores", () => {
  it("accepts a finished game with the winner on ten", () => {
    expect(isValidScore({ red: 10, blue: 0 })).toBe(true);
    expect(isValidScore({ red: 10, blue: 9 })).toBe(true);
    expect(isValidScore({ red: 4, blue: 10 })).toBe(true);
  });

  it("rejects unfinished games, ties and scores past ten", () => {
    expect(isValidScore({ red: 9, blue: 7 })).toBe(false);
    expect(isValidScore({ red: 10, blue: 10 })).toBe(false);
    expect(isValidScore({ red: 11, blue: 3 })).toBe(false);
  });

  it("rejects blanks, negatives and fractions", () => {
    expect(isValidScore({ red: Number.NaN, blue: 10 })).toBe(false);
    expect(isValidScore({ red: -1, blue: 10 })).toBe(false);
    expect(isValidScore({ red: 10, blue: 1.5 })).toBe(false);
  });

  it("names the winner", () => {
    expect(scoreWinner({ red: 10, blue: 7 })).toBe("Red");
    expect(scoreWinner({ red: 7, blue: 10 })).toBe("Blue");
  });

  it("formats a score line", () => {
    expect(describeScore({ red: 10, blue: 7 })).toBe("Red 10 – Blue 7");
  });
});

describe("match start cooldown", () => {
  it("allows when there is no previous match", () => {
    expect(canStartMatch(null)).toEqual({ allowed: true, waitMs: 0 });
  });

  it("blocks start for 10 minutes", () => {
    const now = new Date("2026-01-01T10:00:00.000Z");
    const fiveMinutesAgo = new Date("2026-01-01T09:55:00.000Z");

    const result = canStartMatch(fiveMinutesAgo, now);

    expect(result.allowed).toBe(false);
    expect(result.waitMs).toBe(300000);
  });

  it("allows start exactly at the 10 minute boundary", () => {
    const now = new Date("2026-01-01T10:00:00.000Z");
    const tenMinutesAgo = new Date("2026-01-01T09:50:00.000Z");

    expect(canStartMatch(tenMinutesAgo, now)).toEqual({ allowed: true, waitMs: 0 });
  });
});

describe("match disposition", () => {
  const players = [
    { uid: "1", displayName: "Alice" },
    { uid: "2", displayName: "Bob" },
    { uid: "3", displayName: "Carol" },
    { uid: "4", displayName: "Dave" },
  ];

  it("returns null until enough players have joined", () => {
    expect(buildMatchDisposition(players.slice(0, 1), 2)).toBeNull();
    expect(buildMatchDisposition(players.slice(0, 3), 4)).toBeNull();
  });

  it("pairs two players as solo opponents", () => {
    const disposition = buildMatchDisposition(players.slice(0, 2), 2);

    expect(disposition?.size).toBe(2);
    expect(disposition?.teams[0]).toMatchObject({
      color: "Red",
      players: [{ player: { displayName: "Alice" }, position: "solo" }],
    });
    expect(disposition?.teams[1]).toMatchObject({
      color: "Blue",
      players: [{ player: { displayName: "Bob" }, position: "solo" }],
    });
  });

  it("splits four players into two colored teams with front and back", () => {
    const disposition = buildMatchDisposition(players, 4);

    expect(disposition?.size).toBe(4);
    expect(disposition?.teams[0]).toMatchObject({
      color: "Red",
      players: [
        { player: { displayName: "Alice" }, position: "front" },
        { player: { displayName: "Bob" }, position: "back" },
      ],
    });
    expect(disposition?.teams[1]).toMatchObject({
      color: "Blue",
      players: [
        { player: { displayName: "Carol" }, position: "front" },
        { player: { displayName: "Dave" }, position: "back" },
      ],
    });
  });

  it("uses the first players in join order when more have joined", () => {
    const disposition = buildMatchDisposition([...players, { uid: "5", displayName: "Eve" }], 4);

    expect(disposition?.teams[1].players[1].player.displayName).toBe("Dave");
  });
});

describe("join outcome", () => {
  it("counts down the remaining spots while filling", () => {
    expect(joinOutcome(2, 2, 4)).toEqual({ filled: false, remaining: 2 });
    expect(joinOutcome(3, 3, 4)).toEqual({ filled: false, remaining: 1 });
  });

  it("fills on the deciding join", () => {
    expect(joinOutcome(4, 4, 4)).toEqual({ filled: true });
    expect(joinOutcome(2, 2, 2)).toEqual({ filled: true });
  });

  // A lagging roster read once cancelled the fill and posted "0 spots left" instead.
  it("fills on the counter even when the roster read lags behind", () => {
    expect(joinOutcome(4, 2, 4)).toEqual({ filled: true });
    expect(joinOutcome(2, 0, 2)).toEqual({ filled: true });
  });

  it("fills on the roster even when the counter lags behind", () => {
    expect(joinOutcome(1, 4, 4)).toEqual({ filled: true });
  });

  it("never reports more spots than the lagging source would suggest", () => {
    expect(joinOutcome(1, 3, 4)).toEqual({ filled: false, remaining: 1 });
  });
});

describe("roster merging", () => {
  const at = (iso: string) => new Date(iso);
  const alice = { uid: "1", displayName: "Alice", joinedAt: at("2026-01-01T10:00:00Z") };
  const bob = { uid: "2", displayName: "Bob", joinedAt: at("2026-01-01T10:01:00Z") };

  it("unions sources that each saw only part of the roster", () => {
    expect(mergeRoster([alice], [bob])).toEqual([alice, bob]);
  });

  it("does not double count a player both sources saw", () => {
    expect(mergeRoster([alice, bob], [bob])).toHaveLength(2);
  });

  // The joiner's own serverTimestamp has not resolved yet, so they arrive with a null.
  it("puts a player whose timestamp has not resolved last", () => {
    const pending = { uid: "3", displayName: "Carol", joinedAt: null };

    expect(mergeRoster([bob, alice], [pending]).map((entry) => entry.uid)).toEqual(["1", "2", "3"]);
  });

  it("prefers the copy that has a resolved timestamp", () => {
    const pending = { uid: "1", displayName: "Alice", joinedAt: null };

    expect(mergeRoster([pending], [alice])[0].joinedAt).toEqual(alice.joinedAt);
  });

  it("ignores entries without a uid", () => {
    expect(mergeRoster([{ uid: "", displayName: "Ghost", joinedAt: null }], [alice])).toEqual([
      alice,
    ]);
  });
});

describe("match fill window", () => {
  const start = new Date("2026-01-01T10:00:00.000Z");

  it("counts down the five minute fill window", () => {
    const twoMinutesIn = new Date("2026-01-01T10:02:00.000Z");
    expect(fillWindowRemaining(start, twoMinutesIn)).toBe(3 * 60 * 1000);
  });

  it("is ready once enough players joined", () => {
    expect(matchPhase(start, 4, 4, start)).toBe("ready");
  });

  it("is filling within five minutes when short of players", () => {
    const fourMinutesIn = new Date("2026-01-01T10:04:00.000Z");
    expect(matchPhase(start, 2, 4, fourMinutesIn)).toBe("filling");
  });

  it("expires after five minutes without enough players", () => {
    const sixMinutesIn = new Date("2026-01-01T10:06:00.000Z");
    expect(matchPhase(start, 2, 4, sixMinutesIn)).toBe("expired");
  });
});
