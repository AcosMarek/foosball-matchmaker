import { describe, expect, it } from "vitest";
import {
  buildMatchDisposition,
  canStartMatch,
  fillWindowRemaining,
  isValidTableCode,
  matchPhase,
  normalizeTableCode,
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
