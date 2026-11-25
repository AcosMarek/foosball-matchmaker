// The .js extensions are required: package.json sets "type": "module", so the compiled
// function runs as ESM and Node will not resolve an extensionless relative import. Both
// src modules are free of runtime imports of their own, which is what lets a serverless
// function load them as they are.
import { buildMatchDisposition, isValidScore, type MatchPlayer } from "../../src/matchmaking.js";
import {
  K_FACTOR,
  PROVISIONAL_GAMES,
  START_RATING,
  matchesFor,
  parseResultTeams,
  tableStandings,
  teamAverage,
  teamsFromDisposition,
  type MatchRating,
  type RatingStats,
  type ScoredMatch,
} from "../../src/ratings.js";
import { escapeSlack } from "./slackMessage.js";

// The weekly Slack recap: what a table got up to over the last full week. Everything here
// is pure so it can be tested without Firestore or Slack; api/recap.ts does the I/O.

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type Week = {
  // Monday 00:00 UTC, inclusive.
  start: Date;
  // The following Monday 00:00 UTC, exclusive.
  end: Date;
  // The Monday's date, e.g. "2026-11-16". Names the week when recording that it was sent.
  key: string;
};

// The last full Monday-to-Sunday week before `now`. Weeks are cut in UTC: simple, and the
// hours around midnight are not when office foosball gets played.
export const lastFullWeek = (now: Date): Week => {
  const daysSinceMonday = (now.getUTCDay() + 6) % 7;
  const thisMonday = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - daysSinceMonday,
  );
  const start = new Date(thisMonday - 7 * DAY_MS);

  return { start, end: new Date(thisMonday), key: start.toISOString().slice(0, 10) };
};

// "16–22 Nov" or "30 Nov – 6 Dec".
export const formatWeek = ({ start, end }: Week): string => {
  const last = new Date(end.getTime() - DAY_MS);
  const month = (date: Date): string => MONTHS[date.getUTCMonth()];

  return start.getUTCMonth() === last.getUTCMonth()
    ? `${start.getUTCDate()}–${last.getUTCDate()} ${month(last)}`
    : `${start.getUTCDate()} ${month(start)} – ${last.getUTCDate()} ${month(last)}`;
};

type Stamp = { toDate(): Date };

const asDate = (value: unknown): Date | null =>
  value && typeof (value as Stamp).toDate === "function" ? (value as Stamp).toDate() : null;

// A scored session document as a rateable match; the server-side twin of readScoredMatch
// in src/hooks.ts. `roster` is the session's players in join order, used only for results
// from before teams were stored with the score.
export const toScoredMatch = (
  sessionId: string,
  data: Record<string, unknown>,
  roster: MatchPlayer[],
): ScoredMatch | null => {
  const startedAt = asDate(data.startedAt);
  const result = data.result as { red?: unknown; blue?: unknown; teams?: unknown } | undefined;
  if (!startedAt || !result) {
    return null;
  }

  const score = { red: Number(result.red), blue: Number(result.blue) };
  const size = data.targetPlayers === 2 ? 2 : 4;
  const fromRoster = buildMatchDisposition(roster, size);
  const teams = parseResultTeams(result.teams) ?? (fromRoster && teamsFromDisposition(fromRoster));
  if (!isValidScore(score) || !teams) {
    return null;
  }

  return {
    sessionId,
    tableCode: typeof data.tableCode === "string" ? data.tableCode : "",
    startedAt,
    size,
    score,
    teams,
  };
};

export type WeeklyRecap = {
  games: number;
  players: number;
  // Everyone tied for the most games that week (at most three names).
  mostActive: { names: string[]; games: number };
  // Whoever's rating rose the most over the week, if anyone's rose at all.
  climber: { name: string; gain: number; rating: number } | null;
  // The win the ratings least expected, if an underdog won at all.
  upset: {
    winners: string[];
    losers: string[];
    winnerRating: number;
    loserRating: number;
    score: string;
  } | null;
  // The top of the table's leaderboard as it stands.
  top: { name: string; rating: number; provisional: boolean }[];
};

const MAX_NAMES = 3;
const TOP_PLACES = 3;

// Points the winning side took from a match; more than half of K means the ratings had
// the other side as favourite.
const winnerGain = (match: MatchRating): number =>
  match.delta[match.score.red > match.score.blue ? 0 : 1];

// One table's recap for one week, or null when no scored game was played there in it:
// a recap of nothing isn't worth a post.
export const buildWeeklyRecap = (
  stats: RatingStats,
  tableCode: string,
  week: Week,
): WeeklyRecap | null => {
  const inWeek = (at: Date): boolean =>
    at.getTime() >= week.start.getTime() && at.getTime() < week.end.getTime();
  const matches = matchesFor(stats, { tableCode }).filter((match) => inWeek(match.startedAt));
  if (matches.length === 0) {
    return null;
  }

  const played = new Map<string, number>();
  for (const match of matches) {
    for (const player of match.teams.flatMap((team) => team.players)) {
      played.set(player.uid, (played.get(player.uid) ?? 0) + 1);
    }
  }

  // Current names: someone who renamed themselves mid-week appears once, as they are now.
  const byUid = new Map(stats.players.map((player) => [player.uid, player]));
  const nameOf = (uid: string): string => byUid.get(uid)?.displayName ?? "Player";

  const mostGames = Math.max(...played.values());
  const mostActive = [...played]
    .filter(([, games]) => games === mostGames)
    .map(([uid]) => nameOf(uid))
    .sort((a, b) => a.localeCompare(b))
    .slice(0, MAX_NAMES);

  // A rating is one figure across every table, so the climb counts the whole week, for
  // anyone who played here in it.
  const climbs = [...played.keys()]
    .map((uid) => {
      const history = byUid.get(uid)?.history ?? [];
      const before = history.filter((entry) => entry.at.getTime() < week.start.getTime());
      const during = history.filter((entry) => entry.at.getTime() < week.end.getTime());
      const baseline = before.length > 0 ? before[before.length - 1].rating : START_RATING;
      const rating = during.length > 0 ? during[during.length - 1].rating : baseline;

      return { name: nameOf(uid), gain: rating - baseline, rating };
    })
    .filter((climb) => climb.gain > 0)
    .sort((a, b) => b.gain - a.gain || a.name.localeCompare(b.name));

  const surprise = matches
    .filter((match) => winnerGain(match) > K_FACTOR / 2)
    .sort((a, b) => winnerGain(b) - winnerGain(a))[0];
  const side = (match: MatchRating, index: number) => ({
    names: match.teams[index].players.map((player) => nameOf(player.uid)),
    rating: teamAverage(match.teams[index].players.map((player) => match.before[player.uid])),
  });
  const upset = (() => {
    if (!surprise) {
      return null;
    }

    const redWon = surprise.score.red > surprise.score.blue;
    const winner = side(surprise, redWon ? 0 : 1);
    const loser = side(surprise, redWon ? 1 : 0);
    const { red, blue } = surprise.score;

    return {
      winners: winner.names,
      losers: loser.names,
      winnerRating: winner.rating,
      loserRating: loser.rating,
      score: `${Math.max(red, blue)}–${Math.min(red, blue)}`,
    };
  })();

  return {
    games: matches.length,
    players: played.size,
    mostActive: { names: mostActive, games: mostGames },
    climber: climbs[0] ?? null,
    upset,
    top: tableStandings(stats, tableCode, week.end)
      .slice(0, TOP_PLACES)
      .map(({ player, place }) => ({
        name: player.displayName,
        rating: player.rating,
        provisional: place === null,
      })),
  };
};

const MEDALS = [":first_place_medal:", ":second_place_medal:", ":third_place_medal:"];

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? "" : "s"}`;

// "Ada", "Ada & Bo" or "Ada, Bo & Cy", escaped for Slack.
const listNames = (names: string[]): string => {
  const safe = names.map(escapeSlack);

  return safe.length <= 1 ? safe.join("") : `${safe.slice(0, -1).join(", ")} & ${safe[safe.length - 1]}`;
};

const recapLines = (recap: WeeklyRecap): string[] => {
  const lines = [
    `:soccer:  *${plural(recap.games, "game")}* logged by *${plural(recap.players, "player")}*`,
    `:fire:  Most games: ${listNames(recap.mostActive.names)} (${recap.mostActive.games}${
      recap.mostActive.names.length > 1 ? " each" : ""
    })`,
  ];

  if (recap.climber) {
    const { name, gain, rating } = recap.climber;
    lines.push(
      `:chart_with_upwards_trend:  Biggest climber: ${escapeSlack(name)}, +${gain} to ${rating}`,
    );
  }

  if (recap.upset) {
    const { winners, losers, winnerRating, loserRating, score } = recap.upset;
    const label = (names: string[], rating: number): string =>
      `${listNames(names)} (${names.length > 1 ? "avg " : ""}${rating})`;
    lines.push(
      `:boom:  Upset of the week: ${label(winners, winnerRating)} beat ${label(
        losers,
        loserRating,
      )}, ${score}`,
    );
  }

  if (recap.top.length > 0) {
    lines.push(
      recap.top
        .map(
          (entry, index) =>
            // A dagger, not an asterisk: Slack would read a pair of those as bold.
            `${MEDALS[index]}  ${escapeSlack(entry.name)} ${entry.rating}${
              entry.provisional ? "†" : ""
            }`,
        )
        .join("  ·  "),
    );
  }

  return lines;
};

const tableButton = (appUrl: string, tableCode: string, label: string) =>
  appUrl
    ? [
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: label },
              url: `${appUrl}/?table=${encodeURIComponent(tableCode)}`,
              style: "primary",
            },
          ],
        },
      ]
    : [];

type Leader = { name: string; rating: number };

// What a quiet week gets instead of a recap: an invitation, never a remark that nothing
// was played. One per week in turn, so two Mondays in a row don't read the same.
const NUDGES: ((leader: Leader) => string)[] = [
  ({ name, rating }) =>
    `${name} is top of the table on ${rating}. Who's taking a shot at it this week?`,
  () => "A game to 10 takes about ten minutes. Start one and the app rallies the players for you.",
  ({ name, rating }) => `Ratings only move when you play, and ${name} (${rating}) is the one to beat.`,
  () => "2v2 teams are balanced by rating, so every game is a close one. Who's in?",
];

// The Monday post for a table with no scored game last week, or null when nobody on its
// leaderboard is active any more: a table that has gone quiet for good (no game in
// ACTIVE_DAYS) is left in peace rather than nudged every week for ever.
export const buildNudgePayload = (
  appUrl: string,
  tableCode: string,
  tableName: string,
  stats: RatingStats,
  week: Week,
) => {
  const [top] = tableStandings(stats, tableCode, week.end);
  if (!top) {
    return null;
  }

  const turn = Math.floor(week.start.getTime() / (7 * DAY_MS)) % NUDGES.length;
  const line = NUDGES[turn]({
    name: escapeSlack(top.player.displayName),
    rating: top.player.rating,
  });
  const title = `New week at ${escapeSlack(tableName)}`;

  return {
    text: `${title}. ${line}`,
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: `:soccer:  *${title}*\n${line}` } },
      ...tableButton(appUrl, tableCode, "Start a game"),
    ],
  };
};

// The Slack post. As with the match alerts, the plain `text` is the notification
// fallback and the button is a `url` element that needs no interactivity endpoint.
export const buildRecapPayload = (
  appUrl: string,
  tableCode: string,
  tableName: string,
  recap: WeeklyRecap,
  week: Week,
) => {
  const title = `Week in review · ${escapeSlack(tableName)} · ${formatWeek(week)}`;
  const lines = recapLines(recap);
  const footnote = recap.top.some((entry) => entry.provisional)
    ? [
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `† provisional: fewer than ${PROVISIONAL_GAMES} scored games`,
            },
          ],
        },
      ]
    : [];

  return {
    text: `${title}: ${plural(recap.games, "game")}, ${plural(recap.players, "player")}.`,
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: `:trophy:  *${title}*` } },
      { type: "section", text: { type: "mrkdwn", text: lines.join("\n") } },
      ...footnote,
      ...tableButton(appUrl, tableCode, "Open table"),
    ],
  };
};
