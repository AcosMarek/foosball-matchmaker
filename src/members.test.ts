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
      uid: "bo",
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

  it("returns the account id for removal, and nothing about the devices but counts", () => {
    const reach = summarizeReach([member("ada")], [device("ada", 5)]);

    expect(Object.keys(reach.members[0]).sort()).toEqual([
      "devices",
      "displayName",
      "email",
      "lastRegistered",
      "uid",
    ]);
  });

  it("leaves out players who left the table or were taken off it", () => {
    const reach = summarizeReach(
      [member("ada"), { ...member("bo"), removed: true }, { ...member("cy"), removed: false }],
      [device("ada"), device("bo")],
    );

    expect(reach).toMatchObject({ registered: 2, reachable: 1 });
    expect(reach.members.map((entry) => entry.uid)).toEqual(["ada", "cy"]);
  });

  it("copes with an empty table and a missing name", () => {
    expect(summarizeReach([], [])).toEqual({ registered: 0, reachable: 0, members: [] });
    expect(summarizeReach([member("ada", "")], []).members[0].displayName).toBe("Player");
  });
});
