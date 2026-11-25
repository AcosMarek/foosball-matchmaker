// Who a table's match alerts actually reach: everyone registered on it, and for each
// whether a device of theirs is signed up for push. Pure, so it can be tested without
// Firestore; api/members.ts does the reading.

export type MemberRow = { uid: string; displayName: string; email: string };

// One registered device. `updatedAt` is when it last (re)registered, in ms, if known.
export type TokenRow = { uid: string; updatedAt: number | null };

export type ReachEntry = {
  displayName: string;
  email: string;
  // Devices signed up for push. Zero means no alert reaches this player: they never
  // turned notifications on, or the registration they had has since expired.
  devices: number;
  // When their most recently registered device signed up, in ms; null without a device.
  lastRegistered: number | null;
};

export type TableReach = {
  registered: number;
  reachable: number;
  // Reachable players first, then by name.
  members: ReachEntry[];
};

const MAX_TEXT_LENGTH = 120;

export const summarizeReach = (members: MemberRow[], tokens: TokenRow[]): TableReach => {
  const devices = new Map<string, { count: number; last: number | null }>();
  for (const token of tokens) {
    const entry = devices.get(token.uid) ?? { count: 0, last: null };
    entry.count += 1;
    if (token.updatedAt !== null && (entry.last === null || token.updatedAt > entry.last)) {
      entry.last = token.updatedAt;
    }
    devices.set(token.uid, entry);
  }

  // A player registered twice on the same table (it shouldn't happen, the doc id is
  // table + uid) still counts once.
  const byUid = new Map(members.map((member) => [member.uid, member]));
  const entries = [...byUid.values()]
    .map((member): ReachEntry => {
      const registered = devices.get(member.uid);

      return {
        displayName: (member.displayName || "Player").slice(0, MAX_TEXT_LENGTH),
        email: member.email.slice(0, MAX_TEXT_LENGTH),
        devices: registered?.count ?? 0,
        lastRegistered: registered?.last ?? null,
      };
    })
    .sort(
      (a, b) =>
        Number(b.devices > 0) - Number(a.devices > 0) ||
        a.displayName.localeCompare(b.displayName) ||
        a.email.localeCompare(b.email),
    );

  return {
    registered: entries.length,
    reachable: entries.filter((entry) => entry.devices > 0).length,
    members: entries,
  };
};
