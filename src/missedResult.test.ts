import { describe, expect, it } from "vitest";
import { CATCH_UP_MS, missedResult } from "./missedResult";
import type { RatedTeam } from "./ratings";
import type { Session } from "./types";

const HOUR = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 27, 12);

const side = (color: string, uids: string[]): RatedTeam => ({
  color,
  players: uids.map((uid) => ({ uid, displayName: uid, position: "solo" })),
});

let counter = 0;
// A 1v1 between ada and bo, scored `hoursAgo` hours ago by `recordedBy`.
const scored = (hoursAgo: number, { recordedBy = "bo", players = ["ada", "bo"] } = {}): Session => ({
  id: `s${(counter += 1)}`,
  startedAt: new Date(NOW - hoursAgo * HOUR - 10 * 60 * 1000),
  startedBy: "bo",
  startedByName: "bo",
  targetPlayers: 2,
  playerCount: 2,
  result: {
    red: 10,
    blue: 4,
    lineup: "",
    recordedAt: new Date(NOW - hoursAgo * HOUR),
    recordedBy,
  },
  cancelled: false,
  cancelledBy: "",
  cancelledByName: "",
  teams: [side("Red", [players[0]]), side("Blue", [players[1]])],
  readyAt: null,
  reminded: false,
});

describe("the result a player missed", () => {
  it("is their last game, when someone else logged the score", () => {
    const game = scored(2);

    expect(missedResult([game], "ada", 0, NOW)).toBe(game);
  });

  it("is nothing for the player who logged the score", () => {
    expect(missedResult([scored(2)], "bo", 0, NOW)).toBeNull();
  });

  it("is nothing once a result card has been closed here since", () => {
    const game = scored(2);

    expect(missedResult([game], "ada", NOW - HOUR, NOW)).toBeNull();
    expect(missedResult([game], "ada", NOW - 3 * HOUR, NOW)).toBe(game);
  });

  it("is nothing for a result more than a day old", () => {
    expect(missedResult([scored(25)], "ada", 0, NOW)).toBeNull();
    expect(missedResult([scored(CATCH_UP_MS / HOUR)], "ada", 0, NOW)).not.toBeNull();
  });

  it("is only ever the latest game, however many were missed", () => {
    const older = scored(5);
    const latest = scored(1);

    expect(missedResult([older, latest], "ada", 0, NOW)).toBe(latest);
  });

  it("is nothing when the latest game is one the player logged, even with older ones unseen", () => {
    expect(missedResult([scored(5), scored(1, { recordedBy: "ada" })], "ada", 0, NOW)).toBeNull();
  });

  it("ignores games the player was not in, and games without a score yet", () => {
    const others = scored(1, { players: ["cy", "di"] });
    const open: Session = { ...scored(1), result: null };
    const unstamped: Session = {
      ...scored(1),
      result: { red: 10, blue: 4, lineup: "", recordedAt: null },
    };

    expect(missedResult([others, open, unstamped], "ada", 0, NOW)).toBeNull();
  });
});
