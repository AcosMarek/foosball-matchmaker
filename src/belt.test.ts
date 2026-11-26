import { describe, expect, it } from "vitest";
import {
  BELT_VACANT_DAYS,
  beltEventForNew,
  beltOf,
  championOf,
  describeBeltEvent,
  tableBelt,
  type BeltMatch,
} from "./belt";
import { computeStats, type RatedTeam, type ScoredMatch } from "./ratings";

const side = (color: string, uids: string[]): RatedTeam => ({
  color,
  players: uids.map((uid, index) => ({
    uid,
    displayName: uid.charAt(0).toUpperCase() + uid.slice(1),
    position: uids.length === 1 ? "solo" : index === 0 ? "front" : "back",
  })),
});

const day = (offset: number): Date => new Date(Date.UTC(2026, 0, 1 + offset));

let counter = 0;
// A game on the given day; the first side listed wins.
const game = (
  dayOffset: number,
  winners: string[],
  losers: string[],
): BeltMatch => ({
  sessionId: `g${(counter += 1)}`,
  startedAt: day(dayOffset),
  score: { red: 10, blue: 6 },
  teams: [side("Red", winners), side("Blue", losers)],
});

const holder = (matches: BeltMatch[], now = day(20)): string | null =>
  tableBelt(matches, now).reign?.holder.uid ?? null;

describe("championship belt", () => {
  it("is vacant until a 1v1 has been scored", () => {
    expect(tableBelt([], day(0))).toEqual({ reign: null, events: {} });
  });

  it("goes to the winner of the first 1v1", () => {
    const first = game(1, ["ada"], ["bo"]);
    const belt = tableBelt([first], day(2));

    expect(belt.reign).toMatchObject({
      wonIn: first.sessionId,
      from: null,
      defences: 0,
    });
    expect(holder([first])).toBe("ada");
    expect(belt.events[first.sessionId].kind).toBe("claimed");
  });

  it("changes hands when the champion loses a 1v1", () => {
    const matches = [game(1, ["ada"], ["bo"]), game(2, ["cy"], ["ada"])];
    const belt = tableBelt(matches, day(3));

    expect(holder(matches)).toBe("cy");
    expect(belt.events[matches[1].sessionId]).toMatchObject({ kind: "taken" });
    expect(belt.events[matches[1].sessionId].from?.uid).toBe("ada");
  });

  it("counts a defence when the champion wins a 1v1", () => {
    const matches = [
      game(1, ["ada"], ["bo"]),
      game(2, ["ada"], ["cy"]),
      game(3, ["ada"], ["bo"]),
    ];
    const belt = tableBelt(matches, day(4));

    expect(holder(matches)).toBe("ada");
    expect(belt.reign?.defences).toBe(2);
    expect(belt.events[matches[2].sessionId]).toMatchObject({
      kind: "defended",
      defences: 2,
    });
  });

  it("is untouched by a 1v1 the champion isn't in", () => {
    const matches = [game(1, ["ada"], ["bo"]), game(2, ["cy"], ["di"])];
    const belt = tableBelt(matches, day(3));

    expect(holder(matches)).toBe("ada");
    expect(belt.events[matches[1].sessionId]).toBeUndefined();
    expect(belt.reign?.defences).toBe(0);
  });

  it("is never won, lost or defended in a 2v2", () => {
    const lost = [
      game(1, ["ada"], ["bo"]),
      game(2, ["cy", "di"], ["ada", "eve"]),
    ];
    const won = [
      game(1, ["ada"], ["bo"]),
      game(2, ["ada", "eve"], ["cy", "di"]),
    ];

    expect(holder(lost)).toBe("ada");
    expect(tableBelt(lost, day(3)).events[lost[1].sessionId]).toBeUndefined();
    expect(holder(won)).toBe("ada");
    expect(tableBelt(won, day(3)).reign?.defences).toBe(0);
  });

  it("leaves a table that only plays 2v2 without a belt", () => {
    const matches = [
      game(1, ["ada", "bo"], ["cy", "di"]),
      game(2, ["cy", "bo"], ["ada", "di"]),
    ];

    expect(tableBelt(matches, day(3))).toEqual({ reign: null, events: {} });
  });

  it("falls vacant when it hasn't been on the line for a month", () => {
    const won = game(1, ["ada"], ["bo"]);

    expect(holder([won], day(1 + BELT_VACANT_DAYS))).toBe("ada");
    expect(holder([won], day(2 + BELT_VACANT_DAYS))).toBeNull();
  });

  it("lets the winner of the next 1v1 claim a vacant belt", () => {
    const matches = [game(1, ["ada"], ["bo"]), game(40, ["cy"], ["di"])];
    const belt = tableBelt(matches, day(41));

    expect(holder(matches, day(41))).toBe("cy");
    expect(belt.events[matches[1].sessionId]).toMatchObject({
      kind: "claimed",
      from: null,
    });
  });

  it("keeps a reign alive through title matches only", () => {
    const defended = [game(1, ["ada"], ["bo"]), game(25, ["ada"], ["cy"])];
    const otherPeople = [game(1, ["ada"], ["bo"]), game(25, ["cy"], ["di"])];
    const doubles = [
      game(1, ["ada"], ["bo"]),
      game(25, ["ada", "bo"], ["cy", "di"]),
    ];

    expect(holder(defended, day(50))).toBe("ada");
    expect(holder(otherPeople, day(50))).toBeNull();
    expect(holder(doubles, day(50))).toBeNull();
  });

  it("replays games in the order they were played, whatever order they arrive in", () => {
    const matches = [
      game(1, ["ada"], ["bo"]),
      game(2, ["cy"], ["ada"]),
      game(3, ["bo"], ["cy"]),
    ];

    expect(holder([...matches].reverse())).toBe("bo");
  });

  it("describes what a game did to the belt", () => {
    const matches = [
      game(1, ["ada"], ["bo"]),
      game(2, ["ada"], ["cy"]),
      game(3, ["cy"], ["ada"]),
    ];
    const { events } = tableBelt(matches, day(4));

    expect(describeBeltEvent(events[matches[0].sessionId])).toBe(
      "Ada claims the vacant belt.",
    );
    expect(describeBeltEvent(events[matches[1].sessionId])).toBe(
      "Ada keeps the belt (defence no. 1).",
    );
    expect(describeBeltEvent(events[matches[2].sessionId])).toBe(
      "Cy takes the belt from Ada.",
    );
  });
});

describe("the belt from the rating history", () => {
  const scored = (
    tableCode: string,
    dayOffset: number,
    winners: string[],
    losers: string[],
  ): ScoredMatch => ({
    ...game(dayOffset, winners, losers),
    tableCode,
    size: winners.length === 1 ? 2 : 4,
  });

  const history = [
    scored("OFFICE", 1, ["ada"], ["bo"]),
    scored("OFFICE", 2, ["cy"], ["ada"]),
    scored("CELLAR", 3, ["bo"], ["cy"]),
    scored("CELLAR", 4, ["ada", "di"], ["bo", "cy"]),
  ];
  const stats = computeStats(history);

  it("keeps a belt per table", () => {
    expect(championOf(stats, "OFFICE", day(5))).toBe("cy");
    expect(championOf(stats, "CELLAR", day(5))).toBe("bo");
    expect(championOf(stats, "ATTIC1", day(5))).toBeNull();
    expect(beltOf(stats, "OFFICE", day(5)).reign?.from?.uid).toBe("ada");
  });

  it("has no champion without ratings or a table", () => {
    expect(championOf(null, "OFFICE", day(5))).toBeNull();
    expect(championOf(stats, "", day(5))).toBeNull();
  });

  it("says what a game about to be logged would do to the belt", () => {
    const upset = scored("OFFICE", 5, ["di"], ["cy"]);
    const defence = scored("OFFICE", 5, ["cy"], ["di"]);
    const bystanders = scored("OFFICE", 5, ["ada"], ["bo"]);
    const doubles = scored("OFFICE", 5, ["ada", "di"], ["cy", "bo"]);

    expect(beltEventForNew(stats, "OFFICE", upset)).toMatchObject({
      kind: "taken",
    });
    expect(beltEventForNew(stats, "OFFICE", defence)).toMatchObject({
      kind: "defended",
      defences: 1,
    });
    expect(beltEventForNew(stats, "OFFICE", bystanders)).toBeNull();
    expect(beltEventForNew(stats, "OFFICE", doubles)).toBeNull();
  });
});
