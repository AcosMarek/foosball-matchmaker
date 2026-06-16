import { describe, expect, it } from "vitest";
import { canStartMatch, isValidTableCode, normalizeTableCode } from "./matchmaking";

describe("table code handling", () => {
  it("normalizes and validates six character codes", () => {
    expect(normalizeTableCode(" ab12cd ")).toBe("AB12CD");
    expect(isValidTableCode("ab12cd")).toBe(true);
    expect(isValidTableCode("abc12")).toBe(false);
    expect(isValidTableCode("abc1234")).toBe(false);
    expect(isValidTableCode("abc-12")).toBe(false);
  });
});

describe("match start cooldown", () => {
  it("allows when there is no previous match", () => {
    expect(canStartMatch(null)).toEqual({ allowed: true, waitMs: 0 });
  });

  it("blocks start for 10 minutes", () => {
    const now = new Date("2026-01-01T10:00:00.000Z");
    const fiveMinutesAgo = new Date("2026-01-01T09:55:00.000Z");

    const result = canStartMatch(fiveMinutesAgo, now);

    expect(result.allowed).toBe(false);
    expect(result.waitMs).toBe(300000);
  });

  it("allows start exactly at the 10 minute boundary", () => {
    const now = new Date("2026-01-01T10:00:00.000Z");
    const tenMinutesAgo = new Date("2026-01-01T09:50:00.000Z");

    expect(canStartMatch(tenMinutesAgo, now)).toEqual({ allowed: true, waitMs: 0 });
  });
});
