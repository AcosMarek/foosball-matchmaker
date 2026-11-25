import { describe, expect, it } from "vitest";
import {
  buildNudgePayload,
  buildRecapPayload,
  buildWeeklyRecap,
  formatWeek,
  lastFullWeek,
  toScoredMatch,
  type Week,
} from "../api/_lib/recap";
import { computeStats, type RatedTeam, type ScoredMatch } from "./ratings";

const APP_URL = "https://foosball-matchmaker.web.app";

// Monday 16 Nov 2026 to Sunday 22 Nov 2026.
const week: Week = lastFullWeek(new Date("2026-11-25T09:00:00Z"));
const at = (iso: string): Date => new Date(`${iso}Z`);

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

let counter = 0;
const game = (
  startedAt: string,
  red: RatedTeam,
  blue: RatedTeam,
  score: [number, number],
  tableCode = "OFFICE",
): ScoredMatch => ({
  sessionId: `s${(counter += 1)}`,
  tableCode,
  startedAt: at(startedAt),
  size: red.players.length === 1 ? 2 : 4,
  score: { red: score[0], blue: score[1] },
  teams: [red, blue],
});

describe("recap week", () => {
  it("is the last full Monday-to-Sunday week", () => {
    expect(week.start).toEqual(at("2026-11-16T00:00:00"));
    expect(week.end).toEqual(at("2026-11-23T00:00:00"));
    expect(week.key).toBe("2026-11-16");
  });

  it("rolls over on Monday and not before", () => {
    expect(lastFullWeek(at("2026-11-22T23:59:59")).key).toBe("2026-11-09");
    expect(lastFullWeek(at("2026-11-23T00:00:00")).key).toBe("2026-11-16");
    expect(lastFullWeek(at("2026-11-29T12:00:00")).key).toBe("2026-11-16");
  });

  it("reads as a date range", () => {
    expect(formatWeek(week)).toBe("16–22 Nov");
    expect(formatWeek(lastFullWeek(at("2026-12-09T09:00:00")))).toBe("30 Nov – 6 Dec");
  });
});

describe("weekly recap", () => {
  // Before the week: ada beats bo three times, so she starts it well ahead of him.
  const earlier = [
    game("2026-11-02T10:00:00", solo("Red", "ada"), solo("Blue", "bo"), [10, 2]),
    game("2026-11-03T10:00:00", solo("Red", "ada"), solo("Blue", "bo"), [10, 4]),
    game("2026-11-04T10:00:00", solo("Red", "ada"), solo("Blue", "bo"), [10, 6]),
  ];
  const thisWeek = [
    // The underdog wins: the upset.
    game("2026-11-16T12:00:00", solo("Red", "bo"), solo("Blue", "ada"), [10, 8]),
    game("2026-11-17T12:00:00", pair("Red", "bo", "cy"), pair("Blue", "ada", "di"), [10, 5]),
    game("2026-11-18T12:00:00", solo("Red", "bo"), solo("Blue", "cy"), [3, 10]),
  ];
  const elsewhere = game("2026-11-19T12:00:00", solo("Red", "eve"), solo("Blue", "bo"), [10, 1], "LOBBY1");
  const later = game("2026-11-23T08:00:00", solo("Red", "ada"), solo("Blue", "di"), [10, 0]);
  const stats = computeStats([...earlier, ...thisWeek, elsewhere, later]);
  const recap = buildWeeklyRecap(stats, "OFFICE", week)!;

  it("counts only this table's games in the week", () => {
    expect(recap.games).toBe(3);
    expect(recap.players).toBe(4);
  });

  it("names whoever played most", () => {
    expect(recap.mostActive).toEqual({ names: ["BO"], games: 3 });
  });

  it("names everyone tied for most games", () => {
    const tied = buildWeeklyRecap(computeStats(thisWeek.slice(0, 1)), "OFFICE", week)!;

    expect(tied.mostActive).toEqual({ names: ["ADA", "BO"], games: 1 });
  });

  it("picks the biggest climber over the whole week", () => {
    // cy only won, twice. bo won twice too but then lost to cy and, on another table, to eve.
    expect(recap.climber?.name).toBe("CY");
    expect(recap.climber?.gain).toBeGreaterThan(0);
  });

  it("finds the win the ratings least expected", () => {
    expect(recap.upset).toMatchObject({ winners: ["BO"], losers: ["ADA"], score: "10–8" });
    expect(recap.upset!.winnerRating).toBeLessThan(recap.upset!.loserRating);
  });

  it("reports no upset when every favourite won", () => {
    const calm = buildWeeklyRecap(
      computeStats([
        ...earlier,
        game("2026-11-16T12:00:00", solo("Red", "ada"), solo("Blue", "bo"), [10, 1]),
      ]),
      "OFFICE",
      week,
    )!;

    expect(calm.upset).toBeNull();
    // bo only lost, so he is not a climber either, but ada is.
    expect(calm.climber?.name).toBe("ADA");
  });

  it("lists the top of the table, flagging ratings built on only a few games", () => {
    expect(recap.top).toHaveLength(3);
    expect(recap.top[0].rating).toBeGreaterThanOrEqual(recap.top[1].rating);
    // Ada, Bo and Cy head the table. Cy has played two games; the others well over three.
    expect(recap.top.map((entry) => [entry.name, entry.isNew])).toEqual(
      expect.arrayContaining([
        ["CY", true],
        ["ADA", false],
      ]),
    );

    const payload = buildRecapPayload(APP_URL, "OFFICE", "Office", recap, week);
    const footnote = payload.blocks.find((block) => block.type === "context") as
      | { elements: { text: string }[] }
      | undefined;
    expect(footnote?.elements[0].text).toBe("† new: fewer than 3 scored games so far");
  });

  it("has nothing to say about a week without games", () => {
    expect(buildWeeklyRecap(stats, "NOGAME", week)).toBeNull();
    expect(buildWeeklyRecap(computeStats(earlier), "OFFICE", week)).toBeNull();
  });

  it("renders as a Slack post with a link back to the table", () => {
    const payload = buildRecapPayload(APP_URL, "OFFICE", "Office <table>", recap, week);
    const [head, body] = payload.blocks as { text: { text: string } }[];
    const actions = payload.blocks[payload.blocks.length - 1] as { elements: { url: string }[] };

    expect(payload.text).toBe("Week in review · Office &lt;table&gt; · 16–22 Nov: 3 games, 4 players.");
    expect(head.text.text).toBe(":trophy:  *Week in review · Office &lt;table&gt; · 16–22 Nov*");
    expect(body.text.text).toContain(":soccer:  *3 games* logged by *4 players*");
    expect(body.text.text).toContain(":fire:  Most games: BO (3)");
    expect(body.text.text).toContain(":chart_with_upwards_trend:  Biggest climber: CY, +");
    expect(body.text.text).toContain(":boom:  Upset of the week: BO (");
    expect(body.text.text).toContain(":first_place_medal:  ");
    expect(actions.elements[0].url).toBe("https://foosball-matchmaker.web.app/?table=OFFICE");
  });

  it("drops the button when no app url is configured", () => {
    const payload = buildRecapPayload("", "OFFICE", "Office", recap, week);

    expect(payload.blocks.some((block) => block.type === "actions")).toBe(false);
  });
});

describe("quiet-week nudge", () => {
  // ada won on the 2nd and nothing was played in the recap week.
  const stats = computeStats([
    game("2026-11-02T10:00:00", solo("Red", "ada"), solo("Blue", "bo"), [10, 2]),
  ]);
  const textOf = (now: string): string => {
    const payload = buildNudgePayload(APP_URL, "OFFICE", "Office", stats, lastFullWeek(at(now)))!;

    return (payload.blocks[0] as { text: { text: string } }).text.text;
  };

  it("invites people to play without mentioning the quiet week", () => {
    const payload = buildNudgePayload(APP_URL, "OFFICE", "Office <1>", stats, week)!;
    const [head, actions] = payload.blocks as {
      text?: { text: string };
      elements?: { url: string; text: { text: string } }[];
    }[];

    expect(head.text?.text).toContain(":soccer:  *New week at Office &lt;1&gt;*\n");
    expect(payload.text).toContain("New week at Office &lt;1&gt;. ");
    expect(payload.text).not.toMatch(/no (games|matches)|nothing|quiet/i);
    expect(actions.elements?.[0].text.text).toBe("Start a game");
    expect(actions.elements?.[0].url).toBe("https://foosball-matchmaker.web.app/?table=OFFICE");
  });

  it("says something different each week, cycling through four messages", () => {
    const mondays = ["2026-11-23", "2026-11-30", "2026-12-07", "2026-12-14", "2026-12-21"].map(
      (day) => textOf(`${day}T09:00:00`),
    );

    expect(new Set(mondays.slice(0, 4)).size).toBe(4);
    expect(mondays[4]).toBe(mondays[0]);
    expect(mondays.filter((text) => text.includes("ADA")).length).toBe(2);
  });

  it("stays silent once nobody on the table has played for 60 days", () => {
    expect(buildNudgePayload(APP_URL, "OFFICE", "Office", stats, lastFullWeek(at("2027-02-03T09:00:00")))).toBeNull();
    expect(buildNudgePayload(APP_URL, "NOGAME", "Lobby", stats, week)).toBeNull();
  });
});

describe("scored session parsing", () => {
  const stamp = (iso: string) => ({ toDate: () => at(iso) });
  const roster = ["a", "b", "c", "d"].map((uid) => ({ uid, displayName: uid.toUpperCase() }));

  it("uses the teams stored with the result", () => {
    const match = toScoredMatch(
      "s1",
      {
        tableCode: "OFFICE",
        startedAt: stamp("2026-11-16T12:00:00"),
        targetPlayers: 4,
        result: { red: 10, blue: 7, teams: [pair("Red", "a", "d"), pair("Blue", "b", "c")] },
      },
      roster,
    );

    expect(match?.teams[0].players.map((player) => player.uid)).toEqual(["a", "d"]);
    expect(match?.score).toEqual({ red: 10, blue: 7 });
  });

  it("falls back to the join order for older results", () => {
    const match = toScoredMatch(
      "s1",
      {
        tableCode: "OFFICE",
        startedAt: stamp("2026-11-16T12:00:00"),
        targetPlayers: 4,
        result: { red: 4, blue: 10 },
      },
      roster,
    );

    expect(match?.teams[0].players.map((player) => player.uid)).toEqual(["a", "b"]);
    expect(match?.teams[1].players.map((player) => player.uid)).toEqual(["c", "d"]);
  });

  it("skips sessions that can't be rated", () => {
    const base = { tableCode: "OFFICE", startedAt: stamp("2026-11-16T12:00:00"), targetPlayers: 4 };

    expect(toScoredMatch("s1", base, roster)).toBeNull();
    expect(toScoredMatch("s1", { ...base, result: { red: 7, blue: 7 } }, roster)).toBeNull();
    expect(toScoredMatch("s1", { ...base, result: { red: 10, blue: 7 } }, roster.slice(0, 2))).toBeNull();
    expect(toScoredMatch("s1", { ...base, startedAt: null, result: { red: 10, blue: 7 } }, roster)).toBeNull();
  });
});
