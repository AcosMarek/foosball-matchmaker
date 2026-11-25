import { describe, expect, it } from "vitest";
import { COMMENTARY_WORDINGS, commentaryForNew, matchCommentary } from "./commentary";
import { computeStats, type RatedTeam, type ScoredMatch } from "./ratings";
import { TEAM_NAME_COUNT, teamNamesFor } from "./teamNames";

const side = (color: string, uids: string[]): RatedTeam => ({
  color,
  players: uids.map((uid, index) => ({
    uid,
    displayName: `${uid.charAt(0).toUpperCase()}${uid.slice(1)} Example`,
    position: uids.length === 1 ? "solo" : index === 0 ? "front" : "back",
  })),
});

let counter = 0;
// A game an hour after the previous one, unless a gap in hours is given. The first side
// listed wins, conceding `against` goals.
const game = (winners: string[], losers: string[], against = 5, gapHours = 1): ScoredMatch => {
  counter += gapHours;

  return {
    sessionId: `g${counter}-${winners.join("")}-${losers.join("")}`,
    tableCode: "OFFICE",
    startedAt: new Date(Date.UTC(2026, 0, 1) + counter * 60 * 60 * 1000),
    size: winners.length === 1 ? 2 : 4,
    score: { red: 10, blue: against },
    teams: [side("Red", winners), side("Blue", losers)],
  };
};

const lineFor = (history: ScoredMatch[]): string => {
  const last = history[history.length - 1];

  return matchCommentary(computeStats(history))[last.sessionId];
};

// Enough ordinary games that nobody is a debutant or without a win any more, and nobody
// is on a streak: the pairs take turns winning.
const settled = (): ScoredMatch[] => [
  game(["ada"], ["bo"]),
  game(["bo"], ["ada"], 5, 30),
  game(["cy"], ["di"], 5, 30),
  game(["di"], ["cy"], 5, 30),
];

describe("match commentary", () => {
  it("gives every match a line", () => {
    const history = [...settled(), game(["ada", "cy"], ["bo", "di"], 6, 30)];
    const lines = matchCommentary(computeStats(history));

    expect(Object.keys(lines)).toHaveLength(history.length);
    expect(Object.values(lines).every((line) => line.length > 0)).toBe(true);
  });

  it("welcomes a winning debutant by first name", () => {
    expect(lineFor([game(["nora"], ["bo"])])).toContain("Nora");
    expect(lineFor([game(["nora"], ["bo"])])).not.toContain("Example");
  });

  it("marks a first win after earlier losses", () => {
    const history = [game(["ada"], ["bo"]), game(["ada"], ["bo"], 5, 30), game(["bo"], ["cy"], 5, 30)];

    // Bo had played twice and lost twice.
    expect(lineFor(history)).toMatch(/first win|Off the mark|account|wait is over/i);
    expect(lineFor(history)).toContain("Bo");
  });

  it("notices someone finally beating an opponent, and counts the attempts", () => {
    const history = [
      ...settled(),
      game(["ada"], ["cy"], 5, 30),
      game(["ada"], ["cy"], 5, 30),
      game(["cy"], ["ada"], 5, 30),
    ];
    const line = lineFor(history);

    expect(line).toContain("Cy");
    expect(line).toContain("Ada");
    expect(line).toMatch(/finally|tries|perfect record|at last|first time/);
  });

  it("calls the end of a winning streak", () => {
    const history = [
      ...settled(),
      game(["ada"], ["cy"], 5, 30),
      game(["ada"], ["di"], 5, 30),
      game(["ada"], ["cy"], 5, 30),
      game(["di"], ["ada"], 5, 30),
    ];

    // Ada had won three in a row before Di beat her.
    expect(lineFor(history)).toMatch(/3/);
    expect(lineFor(history)).toContain("Ada");
  });

  it("remarks on a streak when it reaches three, not on every win", () => {
    const third = [...settled(), game(["ada"], ["cy"], 5, 30), game(["ada"], ["di"], 5, 30), game(["ada"], ["cy"], 6, 30)];
    const fourth = [...third, game(["ada"], ["di"], 6, 30)];

    expect(lineFor(third)).toMatch(/\b3\b/);
    expect(lineFor(fourth)).not.toMatch(/\b4\b/);
  });

  it("knows a clean sheet and a thriller", () => {
    expect(lineFor([...settled(), game(["ada"], ["cy"], 0, 30)])).toMatch(
      /10–0|clean sheet|shutout|without reply|Not a single goal/,
    );
    expect(lineFor([...settled(), game(["ada"], ["cy"], 9, 30)])).toMatch(
      /10–9|single goal|One goal|thriller|last ball/,
    );
  });

  it("spots revenge in a quick rematch, but not in one days later", () => {
    const first = [...settled(), game(["ada"], ["cy"], 5, 30)];

    expect(lineFor([...first, game(["cy"], ["ada"], 5, 1)])).toMatch(
      /Revenge|one back|rematch|settles the score|One each/,
    );
    expect(lineFor([...first, game(["cy"], ["ada"], 5, 72)])).not.toMatch(
      /Revenge|one back|rematch|settles the score|One each/,
    );
  });

  it("uses plural verbs for a pair and singular for one player", () => {
    const pairs = [
      ...settled(),
      game(["ada", "cy"], ["bo", "di"], 5, 30),
      game(["bo", "di"], ["ada", "cy"], 5, 30),
    ];
    // Six ordinary 2v2 wins in a row walk through most of the "comfortable" wordings.
    const lines: string[] = [];
    for (let round = 0; round < 6; round += 1) {
      pairs.push(game(round % 2 ? ["ada", "cy"] : ["bo", "di"], round % 2 ? ["bo", "di"] : ["ada", "cy"], 5, 30));
      lines.push(lineFor(pairs));
    }

    expect(lines.join(" ")).not.toMatch(/& \w+ (was|takes|gets|holds) /);
  });

  it("rotates through the wordings before repeating one", () => {
    const history = settled();
    const lines: string[] = [];
    // Ordinary results between settled players, spaced out so nothing else applies.
    for (let round = 0; round < 8; round += 1) {
      history.push(game(round % 2 ? ["ada"] : ["bo"], round % 2 ? ["bo"] : ["ada"], 5, 30));
      lines.push(lineFor(history).replace(/Ada|Bo/g, "X"));
    }

    expect(new Set(lines).size).toBe(8);
  });

  it("has a catalogue big enough not to wear thin", () => {
    expect(COMMENTARY_WORDINGS).toBeGreaterThanOrEqual(80);
  });

  it("gives a new result the line it will have once it is in the history", () => {
    const history = settled();
    const next = game(["ada"], ["cy"], 0, 30);

    expect(commentaryForNew(computeStats(history), next)).toBe(lineFor([...history, next]));
  });
});

describe("team names", () => {
  it("gives a match the same two names every time", () => {
    expect(teamNamesFor("abc123")).toEqual(teamNamesFor("abc123"));
  });

  it("never gives both sides the same name", () => {
    for (let index = 0; index < 2000; index += 1) {
      const [red, blue] = teamNamesFor(`session-${index}`);
      expect(red).not.toBe(blue);
    }
  });

  it("draws on hundreds of names, with little repetition from match to match", () => {
    expect(TEAM_NAME_COUNT).toBeGreaterThan(500);

    const seen = new Set<string>();
    for (let index = 0; index < 100; index += 1) {
      for (const name of teamNamesFor(`match-${index}`)) {
        seen.add(name);
      }
    }
    // 200 names drawn across 100 matches: nearly all of them different.
    expect(seen.size).toBeGreaterThan(150);
  });

  it("keeps names short enough for a phone screen and a Slack column", () => {
    for (let index = 0; index < 500; index += 1) {
      for (const name of teamNamesFor(`s${index}`)) {
        expect(name.length).toBeLessThanOrEqual(28);
      }
    }
  });
});
