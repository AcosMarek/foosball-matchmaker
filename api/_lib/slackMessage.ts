export type RosterPlayer = { name: string; position: string };
export type Roster = { color: string; players: RosterPlayer[] };

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
  expired: "Start a new match",
};

const MAX_NAME_LENGTH = 60;

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
    const team = rawTeam as { color?: unknown; players?: unknown };
    if (typeof team.color !== "string" || !TEAM_ICON[team.color] || !Array.isArray(team.players)) {
      return [];
    }

    const players: RosterPlayer[] = [];
    for (const rawPlayer of team.players.slice(0, 2)) {
      const player = rawPlayer as { name?: unknown; position?: unknown };
      if (
        typeof player.name !== "string" ||
        typeof player.position !== "string" ||
        !POSITION_ICON[player.position]
      ) {
        return [];
      }

      players.push({ name: player.name.slice(0, MAX_NAME_LENGTH), position: player.position });
    }

    if (players.length === 0) {
      return [];
    }
    roster.push({ color: team.color, players });
  }

  return roster;
};

const rosterField = (team: Roster) => ({
  type: "mrkdwn",
  text: [
    `${TEAM_ICON[team.color]}  *${escapeSlack(team.color)}*`,
    ...team.players.map((player) => `${POSITION_ICON[player.position]}  ${escapeSlack(player.name)}`),
  ].join("\n"),
});

// A `url` button needs no action_id and no interactivity request URL — Slack just opens
// the link. The plain `text` stays as the notification fallback.
export const buildSlackPayload = (
  appUrl: string,
  tableCode: string,
  event: string,
  text: string,
  roster: Roster[],
) => {
  const body = escapeSlack(text);
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
        url: `${appUrl}/?table=${encodeURIComponent(tableCode)}`,
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
