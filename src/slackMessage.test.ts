import { describe, expect, it } from "vitest";
import {
  buildSlackPayload,
  escapeSlack,
  parseRoster,
  type Roster,
} from "../api/_lib/slackMessage";

const APP_URL = "https://foosball-matchmaker.web.app";

const doubles = [
  {
    color: "Red",
    players: [
      { name: "Alice", position: "front" },
      { name: "Bob", position: "back" },
    ],
  },
  {
    color: "Blue",
    players: [
      { name: "Carol", position: "front" },
      { name: "Dave", position: "back" },
    ],
  },
];

const singles = [
  { color: "Red", players: [{ name: "Alice", position: "solo" }] },
  { color: "Blue", players: [{ name: "Bob", position: "solo" }] },
];

// Narrow the loose block union down to something assertable.
const blocksOf = (payload: ReturnType<typeof buildSlackPayload>) =>
  ("blocks" in payload ? payload.blocks : []) as {
    type: string;
    text?: { text: string };
    fields?: { text: string }[];
    elements?: { text?: { text: string }; url?: string; type: string }[];
  }[];

describe("slack escaping", () => {
  it("neutralises the characters slack treats as markup", () => {
    expect(escapeSlack("<http://evil|click> & <@here>")).toBe(
      "&lt;http://evil|click&gt; &amp; &lt;@here&gt;",
    );
  });

  it("leaves ordinary text untouched", () => {
    expect(escapeSlack("Alice joined the game — 2 spots left.")).toBe(
      "Alice joined the game — 2 spots left.",
    );
  });
});

describe("roster parsing", () => {
  it("accepts a 2v2 and a 1v1", () => {
    expect(parseRoster(doubles)).toHaveLength(2);
    expect(parseRoster(singles)).toHaveLength(2);
  });

  it("caps names so a long display name can't blow out the block", () => {
    const [team] = parseRoster([
      { color: "Red", players: [{ name: "x".repeat(200), position: "solo" }] },
      singles[1],
    ]);

    expect(team.players[0].name).toHaveLength(60);
  });

  it("rejects anything that is not exactly two teams", () => {
    expect(parseRoster(undefined)).toEqual([]);
    expect(parseRoster("nope")).toEqual([]);
    expect(parseRoster([])).toEqual([]);
    expect(parseRoster([doubles[0]])).toEqual([]);
    expect(parseRoster([...doubles, doubles[0]])).toEqual([]);
  });

  it("rejects colours and positions outside the allowlist", () => {
    expect(parseRoster([{ color: "Green", players: singles[0].players }, singles[1]])).toEqual([]);
    expect(
      parseRoster([{ color: "Red", players: [{ name: "Alice", position: "goalie" }] }, singles[1]]),
    ).toEqual([]);
  });

  it("rejects malformed players", () => {
    expect(parseRoster([{ color: "Red", players: [] }, singles[1]])).toEqual([]);
    expect(parseRoster([{ color: "Red", players: "Alice" }, singles[1]])).toEqual([]);
    expect(parseRoster([{ color: "Red", players: [{ name: 7, position: "solo" }] }, singles[1]])).toEqual(
      [],
    );
  });
});

describe("slack payload", () => {
  it("posts joins as plain text so a burst can't repeat the same button", () => {
    const payload = buildSlackPayload(APP_URL, "MG3586", "join", "Alice joined the game.", []);

    expect(payload).toEqual({ text: "Alice joined the game." });
  });

  it("degrades to plain text when no app url is configured", () => {
    const payload = buildSlackPayload("", "MG3586", "ready", "Game on!", parseRoster(doubles));

    expect(payload).toEqual({ text: "Game on!" });
  });

  it("gives start, ready and expired their own button", () => {
    const labelFor = (event: string) =>
      blocksOf(buildSlackPayload(APP_URL, "MG3586", event, "hi", []))
        .find((block) => block.type === "actions")
        ?.elements?.[0].text?.text;

    expect(labelFor("start")).toBe("Jump in");
    expect(labelFor("ready")).toBe("Open table");
    expect(labelFor("expired")).toBe("Start a new match");
  });

  const buttonUrl = (event: string, nowMs?: number) =>
    blocksOf(buildSlackPayload(APP_URL, "MG3586", event, "hi", [], nowMs)).find(
      (block) => block.type === "actions",
    )?.elements?.[0].url;

  it("deep links back to the table", () => {
    expect(buttonUrl("ready")).toBe("https://foosball-matchmaker.web.app/?table=MG3586");
    expect(buttonUrl("expired")).toBe("https://foosball-matchmaker.web.app/?table=MG3586");
  });

  it("makes the match-start button a join link stamped with when it was posted", () => {
    expect(buttonUrl("start", 1_795_600_000_999)).toBe(
      "https://foosball-matchmaker.web.app/?table=MG3586&join=1795600000",
    );
  });

  it("renders a 2v2 as two side-by-side columns with a legend", () => {
    const blocks = blocksOf(
      buildSlackPayload(APP_URL, "MG3586", "ready", "Game on!", parseRoster(doubles)),
    );

    expect(blocks[0].text?.text).toContain("2v2");
    expect(blocks[1].fields).toHaveLength(2);
    expect(blocks[1].fields?.[0].text).toBe(
      ":red_circle:  *Red*\n:crossed_swords:  Alice\n:shield:  Bob",
    );
    expect(blocks[1].fields?.[1].text).toBe(
      ":large_blue_circle:  *Blue*\n:crossed_swords:  Carol\n:shield:  Dave",
    );
    expect(blocks.some((block) => block.type === "context")).toBe(true);
  });

  it("renders a 1v1 without the attack/defense legend", () => {
    const blocks = blocksOf(
      buildSlackPayload(APP_URL, "MG3586", "ready", "Game on!", parseRoster(singles)),
    );

    expect(blocks[0].text?.text).toContain("1v1");
    expect(blocks[1].fields?.[0].text).toBe(":red_circle:  *Red*\n:dart:  Alice");
    expect(blocks[1].fields?.[1].text).toBe(":large_blue_circle:  *Blue*\n:dart:  Bob");
    expect(blocks.some((block) => block.type === "context")).toBe(false);
  });

  it("still announces a fill when the roster is missing", () => {
    const blocks = blocksOf(buildSlackPayload(APP_URL, "MG3586", "ready", "Game on! 4/4 in.", []));

    expect(blocks[0].text?.text).toBe("Game on! 4/4 in.");
    expect(blocks.some((block) => block.type === "actions")).toBe(true);
  });

  it("escapes player names and message text inside the blocks", () => {
    const hostile: Roster[] = parseRoster([
      { color: "Red", players: [{ name: "<!channel>", position: "solo" }] },
      singles[1],
    ]);
    const payload = buildSlackPayload(APP_URL, "MG3586", "ready", "Game on! <@here>", hostile);
    const blocks = blocksOf(payload);

    expect(payload.text).toBe("Game on! &lt;@here&gt;");
    expect(blocks[1].fields?.[0].text).toContain("&lt;!channel&gt;");
  });

  it("shows each player's rating and the team average when a match fills", () => {
    const rated = parseRoster([
      {
        color: "Red",
        players: [
          { name: "Alice", position: "front", rating: 1042 },
          { name: "Bob", position: "back", rating: 981 },
        ],
      },
      {
        color: "Blue",
        players: [
          { name: "Carol", position: "front", rating: 1000 },
          { name: "Dave", position: "back", rating: 1030 },
        ],
      },
    ]);
    const blocks = blocksOf(buildSlackPayload(APP_URL, "MG3586", "ready", "Game on!", rated));

    expect(blocks[1].fields?.[0].text).toBe(
      ":red_circle:  *Red*  ·  avg 1012\n:crossed_swords:  Alice  ·  1042\n:shield:  Bob  ·  981",
    );
    expect(blocks[1].fields?.[1].text).toBe(
      ":large_blue_circle:  *Blue*  ·  avg 1015\n:crossed_swords:  Carol  ·  1000\n:shield:  Dave  ·  1030",
    );
  });

  it("gives a 1v1 ratings but no average", () => {
    const rated = parseRoster([
      { color: "Red", players: [{ name: "Alice", position: "solo", rating: 1042 }] },
      { color: "Blue", players: [{ name: "Bob", position: "solo", rating: 981 }] },
    ]);
    const blocks = blocksOf(buildSlackPayload(APP_URL, "MG3586", "ready", "Game on!", rated));

    expect(blocks[1].fields?.[0].text).toBe(":red_circle:  *Red*\n:dart:  Alice  ·  1042");
  });

  it("drops ratings that aren't plausible instead of dropping the lineup", () => {
    const [red] = parseRoster([
      {
        color: "Red",
        players: [
          { name: "Alice", position: "front", rating: "1042" },
          { name: "Bob", position: "back", rating: 99999, delta: 5 },
        ],
      },
      doubles[1],
    ]);

    expect(red.players).toEqual([
      { name: "Alice", position: "front" },
      { name: "Bob", position: "back" },
    ]);
  });

  it("posts a result with what it did to every rating", () => {
    const settled = parseRoster([
      {
        color: "Red",
        players: [
          { name: "Alice", position: "front", rating: 1042, delta: 16 },
          { name: "Bob", position: "back", rating: 981, delta: 16 },
        ],
      },
      {
        color: "Blue",
        players: [
          { name: "Carol", position: "front", rating: 1000, delta: -16 },
          { name: "Dave", position: "back", rating: 1030, delta: -16 },
        ],
      },
    ]);
    const payload = buildSlackPayload(
      APP_URL,
      "MG3586",
      "result",
      "Full time — Red 10 – Blue 7 — Red wins.",
      settled,
    );
    const blocks = blocksOf(payload);

    expect(payload.text).toBe("Full time — Red 10 – Blue 7 — Red wins.");
    expect(blocks[0].text?.text).toBe(":checkered_flag:  Full time — Red 10 – Blue 7 — Red wins.");
    expect(blocks[1].fields?.[0].text).toBe(
      ":red_circle:  *Red*\n:crossed_swords:  Alice  ·  1042 → 1058 (+16)\n:shield:  Bob  ·  981 → 997 (+16)",
    );
    expect(blocks[1].fields?.[1].text).toBe(
      ":large_blue_circle:  *Blue*\n:crossed_swords:  Carol  ·  1000 → 984 (−16)\n:shield:  Dave  ·  1030 → 1014 (−16)",
    );
    expect(blocks.some((block) => block.type === "actions")).toBe(false);
  });

  it("keeps a result as plain text when no ratings came with it", () => {
    const text = "Full time — Red 10 – Blue 7 — Red wins.";

    expect(buildSlackPayload(APP_URL, "MG3586", "result", text, [])).toEqual({ text });
    expect(buildSlackPayload(APP_URL, "MG3586", "result", text, parseRoster(doubles))).toEqual({
      text,
    });
  });

  it("keeps the fallback text alongside the blocks for notification previews", () => {
    const payload = buildSlackPayload(
      APP_URL,
      "MG3586",
      "ready",
      "Game on! Red: Alice",
      parseRoster(doubles),
    );

    expect(payload.text).toBe("Game on! Red: Alice");
  });
});
