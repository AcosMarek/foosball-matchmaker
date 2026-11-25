// `rating` is the Elo rating the player took into the match, and `delta` what a logged
// result did to it. Both are optional: the app leaves them out while ratings are loading.
export type RosterPlayer = { name: string; position: string; rating?: number; delta?: number };
// `name` is the side's made-up name for the match ("Spin City"), sent for a 2v2.
export type Roster = { color: string; name?: string; players: RosterPlayer[] };

// Slack shortcodes rather than literal emoji so rendering never depends on source encoding.
const TEAM_ICON: Record<string, string> = { Red: ":red_circle:", Blue: ":large_blue_circle:" };
const POSITION_ICON: Record<string, string> = {
  front: ":crossed_swords:",
  back: ":shield:",
  solo: ":dart:",
};

// Fixed labels, picked server-side: the button text must never be caller-supplied. Joins
// are deliberately absent — a burst of them would repeat the same button down the channel.
const CALL_TO_ACTION: Record<string, string> = {
  start: "Jump in",
  ready: "Open table",
};

const MAX_NAME_LENGTH = 60;
const MAX_TEAM_NAME_LENGTH = 40;
// Ratings start at 1000 and move at most 32 a game, so anything outside these bounds is
// not a rating the app produced.
const MAX_RATING = 5000;
const MAX_DELTA = 100;

// A number that isn't a plausible whole rating is dropped rather than failing the roster:
// the lineup is still worth posting without it.
const wholeNumber = (value: unknown, min: number, max: number): number | undefined =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max
    ? value
    : undefined;

// Slack mrkdwn only interprets these three characters, so escaping them stops a relayed
// message from injecting links or markup into the channel.
export const escapeSlack = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Rosters are rebuilt from a strict shape, so nothing a caller sends can turn into Slack
// markup or an unexpected block. Anything malformed degrades to a plain post.
export const parseRoster = (value: unknown): Roster[] => {
  if (!Array.isArray(value) || value.length !== 2) {
    return [];
  }

  const roster: Roster[] = [];
  for (const rawTeam of value) {
    const team = rawTeam as { color?: unknown; players?: unknown; name?: unknown };
    if (typeof team.color !== "string" || !TEAM_ICON[team.color] || !Array.isArray(team.players)) {
      return [];
    }

    const players: RosterPlayer[] = [];
    for (const rawPlayer of team.players.slice(0, 2)) {
      const player = rawPlayer as {
        name?: unknown;
        position?: unknown;
        rating?: unknown;
        delta?: unknown;
      };
      if (
        typeof player.name !== "string" ||
        typeof player.position !== "string" ||
        !POSITION_ICON[player.position]
      ) {
        return [];
      }

      const rating = wholeNumber(player.rating, 0, MAX_RATING);
      const delta = wholeNumber(player.delta, -MAX_DELTA, MAX_DELTA);
      players.push({
        name: player.name.slice(0, MAX_NAME_LENGTH),
        position: player.position,
        ...(rating === undefined ? {} : { rating }),
        // A change means nothing without the rating it applies to.
        ...(rating === undefined || delta === undefined ? {} : { delta }),
      });
    }

    if (players.length === 0) {
      return [];
    }
    // A team name is decoration: anything that isn't a short string is simply left out.
    const name =
      typeof team.name === "string" ? team.name.trim().slice(0, MAX_TEAM_NAME_LENGTH) : "";
    roster.push({ color: team.color, ...(name ? { name } : {}), players });
  }

  return roster;
};

// "+16", "−16" or "±0". A real minus sign, so a loss lines up with a gain.
const formatDelta = (delta: number): string =>
  delta > 0 ? `+${delta}` : delta < 0 ? `−${-delta}` : "±0";

// "1042" going into a match, or "1042 → 1058 (+16)" once its result is in.
const ratingText = ({ rating, delta }: RosterPlayer): string => {
  if (rating === undefined) {
    return "";
  }

  return delta === undefined
    ? `  ·  ${rating}`
    : `  ·  ${rating} → ${rating + delta} (${formatDelta(delta)})`;
};

// A pair's strength is the average of its two ratings, the same figure the app uses to
// work out who was favoured. Shown before the game only; afterwards the changes say more.
const teamAverageText = (team: Roster): string => {
  const ratings = team.players.map((player) => player.rating);
  const settled = team.players.some((player) => player.delta !== undefined);
  if (ratings.length < 2 || settled || ratings.some((rating) => rating === undefined)) {
    return "";
  }

  const total = (ratings as number[]).reduce((sum, rating) => sum + rating, 0);

  return `  ·  avg ${Math.round(total / ratings.length)}`;
};

const rosterField = (team: Roster) => ({
  type: "mrkdwn",
  text: [
    `${TEAM_ICON[team.color]}  *${escapeSlack(team.color)}*${teamAverageText(team)}`,
    // Underscores would end the italics early, so a name containing one is shown plain.
    ...(team.name
      ? [team.name.includes("_") ? escapeSlack(team.name) : `_${escapeSlack(team.name)}_`]
      : []),
    ...team.players.map(
      (player) =>
        `${POSITION_ICON[player.position]}  ${escapeSlack(player.name)}${ratingText(player)}`,
    ),
  ].join("\n"),
});

// A `url` button needs no action_id and no interactivity request URL — Slack just opens
// the link. The plain `text` stays as the notification fallback.
//
// The "Jump in" button of a match-start post also carries `join`, the time it was posted
// (in seconds). The app takes that as an instruction to join the match straight away, and
// uses the time to tell this match from a later one, so a button pressed on an old post
// only opens the table. `nowMs` is a parameter for the tests' sake.
export const buildSlackPayload = (
  appUrl: string,
  tableCode: string,
  event: string,
  text: string,
  roster: Roster[],
  nowMs: number = Date.now(),
) => {
  const body = escapeSlack(text);

  // A result needs no button, but it is worth more than one line when the app sent the
  // ratings along: the score, then what the game did to each player.
  const rated = roster.length === 2 && roster.every((team) =>
    team.players.every((player) => player.delta !== undefined),
  );
  if (event === "result" && rated) {
    return {
      text: body,
      blocks: [
        { type: "section", text: { type: "mrkdwn", text: `:checkered_flag:  ${body}` } },
        { type: "section", fields: roster.map(rosterField) },
      ],
    };
  }

  const label = CALL_TO_ACTION[event];
  if (!appUrl || !label) {
    return { text: body };
  }

  const actions = {
    type: "actions",
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: label },
        url: `${appUrl}/?table=${encodeURIComponent(tableCode)}${
          event === "start" ? `&join=${Math.floor(nowMs / 1000)}` : ""
        }`,
        style: "primary",
      },
    ],
  };

  // Two `fields` render side by side, which reads far better as a lineup than one
  // run-on sentence. The legend is pointless in a 1v1, where nobody has a position.
  if (event === "ready" && roster.length === 2) {
    const size = roster[0].players.length === 1 ? "1v1" : "2v2";
    const positioned = roster.some((team) =>
      team.players.some((player) => player.position !== "solo"),
    );

    return {
      text: body,
      blocks: [
        { type: "section", text: { type: "mrkdwn", text: `:soccer:  *Game on!*  ·  ${size}` } },
        { type: "section", fields: roster.map(rosterField) },
        ...(positioned
          ? [
              {
                type: "context",
                elements: [{ type: "mrkdwn", text: ":crossed_swords: attack  ·  :shield: defense" }],
              },
            ]
          : []),
        actions,
      ],
    };
  }

  return {
    text: body,
    blocks: [{ type: "section", text: { type: "mrkdwn", text: body } }, actions],
  };
};
