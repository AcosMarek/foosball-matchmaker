import { describe, expect, it } from "vitest";
import { chunk, summarizeDelivery } from "../api/_lib/pushFanout";

describe("chunk", () => {
  it("splits a list into groups no larger than the size", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("keeps a table larger than the Firestore `in` limit intact across groups", () => {
    const uids = Array.from({ length: 65 }, (_, i) => `u${i}`);
    const groups = chunk(uids, 30);

    expect(groups.map((group) => group.length)).toEqual([30, 30, 5]);
    expect(groups.flat()).toEqual(uids);
  });

  it("returns no groups for an empty list", () => {
    expect(chunk([], 30)).toEqual([]);
  });
});

describe("summarizeDelivery", () => {
  const targets = [
    { uid: "ada", token: "ada-phone" },
    { uid: "ada", token: "ada-laptop" },
    { uid: "bo", token: "bo-phone" },
    { uid: "cy", token: "cy-old" },
  ];

  it("counts a user once however many of their devices were reached", () => {
    const summary = summarizeDelivery(targets, [
      { success: true },
      { success: true },
      { success: true },
      { success: true },
    ]);

    expect(summary.delivered).toBe(4);
    expect(summary.notifiedUids.sort()).toEqual(["ada", "bo", "cy"]);
    expect(summary.deadTokens).toEqual([]);
  });

  it("still counts a user whose other device failed", () => {
    const summary = summarizeDelivery(targets, [
      { success: false, error: { code: "messaging/internal-error" } },
      { success: true },
      { success: false, error: { code: "messaging/internal-error" } },
      { success: true },
    ]);

    expect(summary.notifiedUids.sort()).toEqual(["ada", "cy"]);
  });

  it("marks only unregistered or invalid tokens for deletion", () => {
    const summary = summarizeDelivery(targets, [
      { success: false, error: { code: "messaging/registration-token-not-registered" } },
      { success: false, error: { code: "messaging/invalid-registration-token" } },
      { success: false, error: { code: "messaging/internal-error" } },
      { success: false },
    ]);

    expect(summary.delivered).toBe(0);
    expect(summary.notifiedUids).toEqual([]);
    expect(summary.deadTokens).toEqual(["ada-phone", "ada-laptop"]);
    expect(summary.failures).toEqual([
      "messaging/registration-token-not-registered",
      "messaging/invalid-registration-token",
      "messaging/internal-error",
      "unknown",
    ]);
  });
});
