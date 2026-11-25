import type { VercelRequest, VercelResponse } from "@vercel/node";
import { FieldValue, Timestamp, getFirestore, type Firestore } from "firebase-admin/firestore";
// The .js extensions are required: package.json sets "type": "module", so the compiled
// function runs as ESM and Node will not resolve an extensionless relative import.
import { ensureApp, verifyIdToken } from "./_lib/firebaseAdmin.js";
import {
  isActiveMember,
  summarizeReach,
  type MemberRow,
  type TokenRow,
} from "./_lib/members.js";
import { chunk } from "./_lib/pushFanout.js";

// Admin-only: who a table's match alerts reach. For every player registered on the table
// it reports whether a device of theirs is signed up for push. Device registrations are
// private to each account in the Firestore rules, so only the server can put the two
// lists side by side, and it does so only for callers listed in the `admins` collection.
// The tokens themselves never leave the server: the reply carries counts and dates.
//
// With `removeUid` it first takes that player off the table, then answers with the list
// as it now stands. Removal flags the player's record on this one table and touches
// nothing else: their other tables, devices, rating and match history stay as they are.
//
// Env vars: FIREBASE_SERVICE_ACCOUNT and ALLOWED_ORIGIN, as in api/send.ts.
const allowedOrigin = process.env.ALLOWED_ORIGIN ?? "*";

const TABLE_CODE_RE = /^[A-Z0-9]{6}$/;
// Firebase account ids: short, and never containing a slash that could reach another path.
const UID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_MEMBERS = 500;
// Firestore caps an `in` filter at 30 values.
const TOKEN_QUERY_CHUNK = 30;

const text = (value: unknown): string => (typeof value === "string" ? value : "");

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { idToken, tableCode, removeUid } = (req.body ?? {}) as {
    idToken?: unknown;
    tableCode?: unknown;
    removeUid?: unknown;
  };
  const removing = removeUid !== undefined && removeUid !== "";
  if (
    typeof idToken !== "string" ||
    typeof tableCode !== "string" ||
    !TABLE_CODE_RE.test(tableCode) ||
    (removing && (typeof removeUid !== "string" || !UID_RE.test(removeUid)))
  ) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }

  let db: Firestore;
  try {
    db = getFirestore(ensureApp());
  } catch (err) {
    console.error("members: init failed", err);
    res.status(500).json({ error: "Service not configured" });
    return;
  }

  const callerUid = await verifyIdToken(idToken);
  if (!callerUid) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    // The same test the Firestore rules use for admin-only writes.
    if (!(await db.collection("admins").doc(callerUid).get()).exists) {
      console.warn("members: caller is not an admin");
      res.status(403).json({ error: "Admins only" });
      return;
    }

    if (removing) {
      // Records are keyed table + player, so this can only ever touch the one table. A
      // player who isn't on it is left alone rather than given a "removed" record.
      const record = db.collection("tableMembers").doc(`${tableCode}_${removeUid as string}`);
      if ((await record.get()).exists) {
        await record.set(
          { removed: true, removedAt: FieldValue.serverTimestamp(), removedBy: callerUid },
          { merge: true },
        );
        console.log(`members: removed a player from ${tableCode}`);
      }
    }

    const registered = await db
      .collection("tableMembers")
      .where("tableCode", "==", tableCode)
      .limit(MAX_MEMBERS)
      .get();
    const members: MemberRow[] = registered.docs
      .map((member) => ({
        uid: text(member.get("uid")),
        displayName: text(member.get("displayName")),
        email: text(member.get("email")),
        removed: member.get("removed") === true,
      }))
      .filter((member) => member.uid !== "" && isActiveMember(member));

    const snapshots = await Promise.all(
      chunk([...new Set(members.map((member) => member.uid))], TOKEN_QUERY_CHUNK).map((group) =>
        db.collection("pushTokens").where("uid", "in", group).get(),
      ),
    );
    const tokens: TokenRow[] = snapshots
      .flatMap((snapshot) => snapshot.docs)
      .map((device) => {
        const updatedAt: unknown = device.get("updatedAt");

        return {
          uid: text(device.get("uid")),
          updatedAt: updatedAt instanceof Timestamp ? updatedAt.toMillis() : null,
        };
      })
      .filter((device) => device.uid !== "");

    res.status(200).json(summarizeReach(members, tokens));
  } catch (err) {
    console.error("members: failed", err);
    res.status(500).json({ error: "Couldn't read the table's members" });
  }
}
