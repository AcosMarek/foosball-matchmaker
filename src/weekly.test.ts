import { describe, expect, it } from "vitest";
import {
  WEEKS_SHOWN,
  fillRate,
  weekStart,
  weeklyNumbers,
  weeklyWindowStart,
  type WeeklySession,
} from "./weekly";

// Wednesday 25 November 2026, mid-afternoon, local time.
const now = new Date(2026, 10, 25, 14, 30);

const session = (
  when: Date,
  state: "open" | "filled" | "scored" | "cancelled" = "open",
): WeeklySession => ({
  startedAt: when,
  filled: state !== "open",
  scored: state === "scored",
  cancelled: state === "cancelled",
});

describe("week boundaries", () => {
  it("starts a week on Monday at midnight", () => {
    expect(weekStart(now)).toEqual(new Date(2026, 10, 23));
    expect(weekStart(new Date(2026, 10, 23, 0, 0))).toEqual(new Date(2026, 10, 23));
    expect(weekStart(new Date(2026, 10, 22, 23, 59))).toEqual(new Date(2026, 10, 16));
  });

  it("keeps weeks seven calendar days long across a clock change", () => {
    // The last Sunday of October is when clocks go back in much of Europe.
    expect(weekStart(new Date(2026, 9, 28))).toEqual(new Date(2026, 9, 26));
    expect(weekStart(new Date(2026, 9, 25, 12))).toEqual(new Date(2026, 9, 19));
  });

  it("reaches back far enough to cover every week shown", () => {
    expect(weeklyWindowStart(now)).toEqual(new Date(2026, 9, 5));
    expect(weeklyWindowStart(now, 1)).toEqual(new Date(2026, 10, 23));
  });
});

describe("weekly numbers", () => {
  it("lists the last eight weeks, newest first, even when empty", () => {
    const rows = weeklyNumbers([], now);

    expect(rows).toHaveLength(WEEKS_SHOWN);
    expect(rows[0].start).toEqual(new Date(2026, 10, 23));
    expect(rows[7].start).toEqual(new Date(2026, 9, 5));
    expect(rows.every((row) => row.started === 0)).toBe(true);
    expect(rows.map((row) => row.current)).toEqual([true, ...Array(7).fill(false)]);
  });

  it("counts started, filled and scored as a funnel", () => {
    const [thisWeek] = weeklyNumbers(
      [
        session(new Date(2026, 10, 23, 9)),
        session(new Date(2026, 10, 24, 12), "filled"),
        session(new Date(2026, 10, 24, 13), "scored"),
        session(new Date(2026, 10, 25, 10), "cancelled"),
      ],
      now,
    );

    expect(thisWeek).toMatchObject({ started: 4, filled: 3, scored: 1, cancelled: 1 });
  });

  it("puts each match in the week it started", () => {
    const rows = weeklyNumbers(
      [
        session(new Date(2026, 10, 22, 23, 59), "scored"),
        session(new Date(2026, 10, 23, 0, 0)),
        session(new Date(2026, 10, 10, 12), "filled"),
      ],
      now,
    );

    expect(rows[0]).toMatchObject({ started: 1, scored: 0 });
    expect(rows[1]).toMatchObject({ started: 1, scored: 1 });
    expect(rows[2]).toMatchObject({ started: 1, filled: 1 });
  });

  it("ignores matches older than the weeks shown", () => {
    const rows = weeklyNumbers([session(new Date(2026, 5, 1), "scored")], now);

    expect(rows.reduce((total, row) => total + row.started, 0)).toBe(0);
  });

  it("counts a scored match as filled even if its player count never caught up", () => {
    const [thisWeek] = weeklyNumbers(
      [{ startedAt: new Date(2026, 10, 24), filled: false, scored: true, cancelled: false }],
      now,
    );

    expect(thisWeek).toMatchObject({ filled: 1, scored: 1 });
  });

  it("works out the share that filled", () => {
    const [week] = weeklyNumbers(
      [
        session(new Date(2026, 10, 24), "filled"),
        session(new Date(2026, 10, 24)),
        session(new Date(2026, 10, 24)),
      ],
      now,
    );

    expect(fillRate(week)).toBe(33);
    expect(fillRate(weeklyNumbers([], now)[0])).toBeNull();
  });
});
