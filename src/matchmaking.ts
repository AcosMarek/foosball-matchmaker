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
