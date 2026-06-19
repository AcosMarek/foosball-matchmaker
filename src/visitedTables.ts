import { isValidTableCode, normalizeTableCode } from "./matchmaking";
import type { FoosballTable } from "./types";

const STORAGE_KEY = "foosball:visitedTables";
const MAX_VISITED = 50;

// Add a table to the front of the visited list, de-duplicated by code and capped.
// Pure: returns a new list, never mutates the input.
export const upsertVisited = (
  list: FoosballTable[],
  table: FoosballTable,
): FoosballTable[] => {
  const code = normalizeTableCode(table.code);
  if (!isValidTableCode(code)) {
    return list;
  }

  const name = table.name.trim() || code;
  const rest = list.filter((entry) => entry.code !== code);

  return [{ code, name }, ...rest].slice(0, MAX_VISITED);
};

export const readVisitedTables = (): FoosballTable[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((entry) => ({
        code: normalizeTableCode(String(entry?.code || "")),
        name: String(entry?.name || ""),
      }))
      .filter((entry) => isValidTableCode(entry.code))
      .map((entry) => ({ code: entry.code, name: entry.name || entry.code }));
  } catch {
    // Corrupt JSON or storage being unavailable (e.g. private browsing).
    return [];
  }
};

export const writeVisitedTables = (list: FoosballTable[]): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Ignore storage being unavailable (e.g. private browsing).
  }
};
