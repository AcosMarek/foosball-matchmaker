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
