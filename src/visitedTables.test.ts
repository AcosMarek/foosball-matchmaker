import { describe, expect, it } from "vitest";
import { upsertVisited, withoutVisited } from "./visitedTables";

describe("withoutVisited", () => {
  const list = [
    { code: "AAA111", name: "Bryne" },
    { code: "BBB222", name: "Bergen" },
  ];

  it("drops the table and keeps the rest in order", () => {
    expect(withoutVisited(list, "AAA111")).toEqual([{ code: "BBB222", name: "Bergen" }]);
    expect(withoutVisited(list, " bbb222 ")).toEqual([{ code: "AAA111", name: "Bryne" }]);
  });

  it("returns the same list when the table isn't in it", () => {
    expect(withoutVisited(list, "CCC333")).toBe(list);
  });
});

describe("upsertVisited", () => {
  it("adds a new table to the front", () => {
    const result = upsertVisited([{ code: "AAA111", name: "Bryne" }], {
      code: "BBB222",
      name: "Bergen",
    });

    expect(result).toEqual([
      { code: "BBB222", name: "Bergen" },
      { code: "AAA111", name: "Bryne" },
    ]);
  });

  it("de-duplicates by code and moves the entry to the front", () => {
    const result = upsertVisited(
      [
        { code: "AAA111", name: "Bryne" },
        { code: "BBB222", name: "Bergen" },
      ],
      { code: "AAA111", name: "Bryne HQ" },
    );

    expect(result).toEqual([
      { code: "AAA111", name: "Bryne HQ" },
      { code: "BBB222", name: "Bergen" },
    ]);
  });

  it("normalizes the code and falls back to the code when the name is blank", () => {
    const result = upsertVisited([], { code: " bb12cd ", name: "  " });

    expect(result).toEqual([{ code: "BB12CD", name: "BB12CD" }]);
  });

  it("ignores codes that are not valid table codes", () => {
    const list = [{ code: "AAA111", name: "Bryne" }];

    expect(upsertVisited(list, { code: "nope", name: "Bad" })).toBe(list);
  });

  it("caps the list and drops the oldest entry", () => {
    const full = Array.from({ length: 50 }, (_, index) => ({
      code: `TBL${String(index).padStart(3, "0")}`,
      name: `Table ${index}`,
    }));

    const result = upsertVisited(full, { code: "NEW001", name: "Newest" });

    expect(result).toHaveLength(50);
    expect(result[0]).toEqual({ code: "NEW001", name: "Newest" });
    expect(result.some((entry) => entry.code === "TBL049")).toBe(false);
  });
});
