const TABLE_CODE_LENGTH = 6;
const TABLE_CODE_RE = /^[A-Z0-9]{6}$/;
export const MS_PER_MINUTE = 60 * 1000;
const START_COOLDOWN_MS = 10 * MS_PER_MINUTE;

export const normalizeTableCode = (value: string) => value.trim().toUpperCase();

export const isValidTableCode = (value: string) => TABLE_CODE_RE.test(normalizeTableCode(value));

export const generateTableCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";

  for (let i = 0; i < TABLE_CODE_LENGTH; i += 1) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }

  return result;
};

export const canStartMatch = (
  lastStartedAt: Date | null,
  now: Date = new Date(),
): { allowed: boolean; waitMs: number } => {
  if (!lastStartedAt) {
    return { allowed: true, waitMs: 0 };
  }

  const elapsedMs = now.getTime() - lastStartedAt.getTime();
  if (elapsedMs >= START_COOLDOWN_MS) {
    return { allowed: true, waitMs: 0 };
  }

  return { allowed: false, waitMs: START_COOLDOWN_MS - elapsedMs };
};

export const START_COOLDOWN_MINUTES = START_COOLDOWN_MS / MS_PER_MINUTE;

export const SUPPORTED_PLAYER_COUNTS = [2, 4] as const;

export type MatchSize = (typeof SUPPORTED_PLAYER_COUNTS)[number];

export const matchSizeLabel = (size: MatchSize): string => (size === 2 ? "1v1" : "2v2");

export type JoinOutcome = { filled: true } | { filled: false; remaining: number };

export type RosterEntry = MatchPlayer & { joinedAt: Date | null };

// Unions roster sources by uid, in join order. The live listener and a fresh query can
// each be a step behind the other, so neither is trustworthy alone. A player whose
// serverTimestamp hasn't resolved yet reads as null and sorts last — they just joined.
export const mergeRoster = (...sources: RosterEntry[][]): RosterEntry[] => {
  const byUid = new Map<string, RosterEntry>();

  for (const entry of sources.flat()) {
    if (!entry.uid) {
      continue;
    }

    const existing = byUid.get(entry.uid);
    if (!existing || (!existing.joinedAt && entry.joinedAt)) {
      byUid.set(entry.uid, entry);
    }
  }

  const order = (entry: RosterEntry) => entry.joinedAt?.getTime() ?? Number.MAX_SAFE_INTEGER;

  return [...byUid.values()].sort((a, b) => order(a) - order(b));
};

// Whether a join filled the match. The serialised counter is authoritative and the roster
// read only decorates the announcement, so whichever is further along decides — a lagging
// read must never cancel the fill, nor repeat a number an earlier joiner already posted.
export const joinOutcome = (
  position: number,
  rosterSize: number,
  targetPlayers: MatchSize,
): JoinOutcome => {
  const joined = Math.max(position, rosterSize);

  return joined >= targetPlayers
    ? { filled: true }
    : { filled: false, remaining: targetPlayers - joined };
};

export type MatchPlayer = {
  uid: string;
  displayName: string;
};

export type TeamPosition = "front" | "back" | "solo";

export type TeamPlayer = {
  player: MatchPlayer;
  position: TeamPosition;
};

export type TeamDisposition = {
  color: string;
  colorHex: string;
  players: TeamPlayer[];
};

export type MatchDisposition = {
  size: MatchSize;
  teams: [TeamDisposition, TeamDisposition];
};

const RED = { color: "Red", colorHex: "#d32f2f" };
const BLUE = { color: "Blue", colorHex: "#1976d2" };

export const teamColorHex = (color: string): string =>
  color === RED.color ? RED.colorHex : BLUE.colorHex;

// Splits the first `size` joined players (in join order) into two colored teams.
// 1v1 (size 2): one solo player per color, who plays the whole table.
// 2v2 (size 4): each color gets a front (attack) and a back (defense).
export const buildMatchDisposition = (
  players: MatchPlayer[],
  size: MatchSize,
): MatchDisposition | null => {
  if (players.length < size) {
    return null;
  }

  if (size === 2) {
    const [first, second] = players;

    return {
      size,
      teams: [
        { ...RED, players: [{ player: first, position: "solo" }] },
        { ...BLUE, players: [{ player: second, position: "solo" }] },
      ],
    };
  }

  const [first, second, third, fourth] = players;

  return {
    size,
    teams: [
      {
        ...RED,
        players: [
          { player: first, position: "front" },
          { player: second, position: "back" },
        ],
      },
      {
        ...BLUE,
        players: [
          { player: third, position: "front" },
          { player: fourth, position: "back" },
        ],
      },
    ],
  };
};

const describeTeamPlayerText = (teamPlayer: TeamPlayer): string =>
  teamPlayer.position === "solo"
    ? teamPlayer.player.displayName
    : `${teamPlayer.player.displayName} (${teamPlayer.position})`;

// One-line text summary of a match disposition, e.g. "Red: Ada vs Blue: Bo" or
// "Red: Ada (front), Bo (back) vs Blue: Cy (front), Di (back)". Used for notifications.
export const describeDisposition = (disposition: MatchDisposition): string =>
  disposition.teams
    .map((team) => `${team.color}: ${team.players.map(describeTeamPlayerText).join(", ")}`)
    .join(" vs ");

export type MatchScore = {
  red: number;
  blue: number;
};

export const WINNING_GOALS = 10;

// A game runs to exactly 10: the winner sits on WINNING_GOALS and the loser anywhere
// below it, so a valid score can never be a draw or an unfinished game.
export const isValidScore = ({ red, blue }: MatchScore): boolean => {
  const isLoserScore = (goals: number): boolean =>
    Number.isInteger(goals) && goals >= 0 && goals < WINNING_GOALS;

  return (
    (red === WINNING_GOALS && isLoserScore(blue)) || (blue === WINNING_GOALS && isLoserScore(red))
  );
};

export const scoreWinner = ({ red, blue }: MatchScore): string => (red > blue ? "Red" : "Blue");

export const describeScore = ({ red, blue }: MatchScore): string => `Red ${red} – Blue ${blue}`;

export const describeResult = (score: MatchScore): string =>
  `${describeScore(score)} — ${scoreWinner(score)} wins.`;

// A score can be logged for an hour after the match started. After that the match stays
// unscored for good, so nobody is asked about (or can invent) a game from days ago. The
// Firestore rules enforce the same hour.
export const RESULT_WINDOW_MINUTES = 60;
const RESULT_WINDOW_MS = RESULT_WINDOW_MINUTES * MS_PER_MINUTE;

// Time (ms) left to log a match's score.
export const resultWindowRemaining = (startedAt: Date, now: Date = new Date()): number =>
  Math.max(0, RESULT_WINDOW_MS - (now.getTime() - startedAt.getTime()));

export const resultDeadline = (startedAt: Date): Date =>
  new Date(startedAt.getTime() + RESULT_WINDOW_MS);

// How long after a match filled its players are nudged to log the score, if nobody has.
// A game takes ten minutes or so; api/send.ts holds the same figure and has the last word.
export const REMIND_AFTER_MINUTES = 15;
const REMIND_AFTER_MS = REMIND_AFTER_MINUTES * MS_PER_MINUTE;

// Time (ms) until that nudge is due; 0 once it is.
export const reminderDueIn = (filledAt: Date, now: Date = new Date()): number =>
  Math.max(0, REMIND_AFTER_MS - (now.getTime() - filledAt.getTime()));

export const RESET_MINUTES = 5;
const RESET_MS = RESET_MINUTES * MS_PER_MINUTE;

// ---- "Jump in" links ----
// The match-start post in Slack links to the table with `join=<seconds>`, the time the
// post went out. Opening the app through it joins that match without a second tap. The
// time does two jobs: it lets the link go stale, and it ties the link to one match.

const SECOND_MS = 1000;
// A post goes out moments after its match is created, on a different clock from the one
// that stamped the match. These bound how far apart the two times may be.
const JOIN_LINK_EARLY_MS = 60 * SECOND_MS;
const JOIN_LINK_LATE_MS = 2 * MS_PER_MINUTE;

// The `join` value of a link as a time in ms, or null when it is missing, malformed, from
// the future, or older than any match could still be filling.
export const parseJoinStamp = (raw: string | null, now: Date = new Date()): number | null => {
  if (!raw || !/^\d{9,11}$/.test(raw)) {
    return null;
  }

  const stamp = Number(raw) * SECOND_MS;
  const age = now.getTime() - stamp;

  return age >= -JOIN_LINK_EARLY_MS && age <= RESET_MS + JOIN_LINK_LATE_MS ? stamp : null;
};

// Whether a join link was posted for the match that started at `startedAt`, as opposed
// to an earlier or later one on the same table.
export const joinLinkMatches = (stamp: number, startedAt: Date): boolean => {
  const lag = stamp - startedAt.getTime();

  return lag >= -JOIN_LINK_EARLY_MS && lag <= JOIN_LINK_LATE_MS;
};

export type MatchPhase = "filling" | "ready" | "expired";

// Time (ms) left in the fill window before an unfilled match resets.
export const fillWindowRemaining = (startedAt: Date, now: Date = new Date()): number =>
  Math.max(0, RESET_MS - (now.getTime() - startedAt.getTime()));

// "ready" once enough players joined, "filling" while still gathering players within the
// window, and "expired" once the window elapses without enough players (matchmaking resets).
export const matchPhase = (
  startedAt: Date,
  playerCount: number,
  requiredPlayers: number,
  now: Date = new Date(),
): MatchPhase => {
  if (playerCount >= requiredPlayers) {
    return "ready";
  }

  return fillWindowRemaining(startedAt, now) > 0 ? "filling" : "expired";
};
