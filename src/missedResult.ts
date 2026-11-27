import type { Session } from "./types";

// The result card (ResultCelebration) is shown the moment a score comes in, to whoever has
// the app open then: usually the player who logged it and nobody else. This is what lets
// the others catch up: the next time they open the app, their last game's result is shown
// once, if it is still news.

// A result older than this is not worth a card.
export const CATCH_UP_MS = 24 * 60 * 60 * 1000;

const playedIn = (session: Session, uid: string): boolean =>
  !!session.teams?.some((team) => team.players.some((player) => player.uid === uid));

// The game to catch `uid` up on when they open the app, or null: the last scored game
// they played in, if they have not seen its result on this device (`seenAt`, in ms: the
// last time a result card was closed here), did not log the score themselves (then they
// saw the card as they did), and it was scored within the last day. Only ever the latest
// game: someone who played three since their last visit is told about one.
export const missedResult = (
  sessions: Session[],
  uid: string,
  seenAt: number,
  now: number,
): Session | null => {
  const scoredAt = (session: Session): number => session.result?.recordedAt?.getTime() ?? 0;
  const latest = sessions
    .filter((session) => scoredAt(session) > 0 && playedIn(session, uid))
    .sort((a, b) => scoredAt(b) - scoredAt(a))[0];
  if (!latest) {
    return null;
  }

  const at = scoredAt(latest);

  return at > seenAt && now - at <= CATCH_UP_MS && latest.result?.recordedBy !== uid
    ? latest
    : null;
};
