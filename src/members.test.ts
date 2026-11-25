import { describe, expect, it } from "vitest";
import { summarizeReach, type MemberRow, type TokenRow } from "../api/_lib/members";

const member = (uid: string, displayName = uid.toUpperCase()): MemberRow => ({
  uid,
  displayName,
  email: `${uid}@example.com`,
});

const device = (uid: string, updatedAt: number | null = null): TokenRow => ({ uid, updatedAt });

describe("table reach", () => {
  it("counts who is registered and who has a device signed up", () => {
    const reach = summarizeReach(
      [member("ada"), member("bo"), member("cy")],
      [device("bo", 100), device("bo", 300), device("cy", 200)],
    );

    expect(reach.registered).toBe(3);
    expect(reach.reachable).toBe(2);
  });

  it("lists reachable players first, then by name", () => {
    const reach = summarizeReach(
      [member("zed"), member("ada"), member("bo"), member("cy")],
      [device("zed"), device("bo")],
    );

    expect(reach.members.map((entry) => entry.displayName)).toEqual(["BO", "ZED", "ADA", "CY"]);
  });

  it("reports each player's devices and the latest sign-up", () => {
    const reach = summarizeReach(
      [member("ada"), member("bo")],
      [device("bo", 100), device("bo", 300), device("bo", null)],
    );
    const [bo, ada] = reach.members;

    expect(bo).toEqual({
      displayName: "BO",
      email: "bo@example.com",
      devices: 3,
      lastRegistered: 300,
    });
    expect(ada).toMatchObject({ devices: 0, lastRegistered: null });
  });

  it("ignores devices of people who aren't on the table", () => {
    const reach = summarizeReach([member("ada")], [device("stranger", 100)]);

    expect(reach).toMatchObject({ registered: 1, reachable: 0 });
  });

  it("counts a player once even if registered twice", () => {
    const reach = summarizeReach([member("ada"), member("ada")], [device("ada")]);

    expect(reach).toMatchObject({ registered: 1, reachable: 1 });
  });

  it("never returns ids or tokens, only names, emails and counts", () => {
    const reach = summarizeReach([member("ada")], [device("ada", 5)]);

    expect(Object.keys(reach.members[0]).sort()).toEqual([
      "devices",
      "displayName",
      "email",
      "lastRegistered",
    ]);
  });

  it("copes with an empty table and a missing name", () => {
    expect(summarizeReach([], [])).toEqual({ registered: 0, reachable: 0, members: [] });
    expect(summarizeReach([member("ada", "")], []).members[0].displayName).toBe("Player");
  });
});
