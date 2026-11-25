import {
  computeStats,
  kFactorFor,
  type RatedPlayer,
  type RatingStats,
  type ScoredMatch,
} from "./ratings";

// One line of commentary for every scored match: "Nora's first win. Remember the date."
// It is worked out from the results alone, by replaying them in order, so it can be shown
// for any match in the history and reads the same on every screen and in Slack.
//
// A match is checked against a list of things worth remarking on, most notable first: a
// debut win, a first win, finally beating someone, a streak ending, a 10–0, an upset, a
// streak growing, a 10–9, a milestone, revenge. A match with none of those still gets a
// line, chosen by how close it was.
//
// Each kind of remark has several wordings, used in rotation: a wording comes round again
// only after all the others of its kind have been used, so a table sees the whole
// catalogue before anything repeats. The losing side is teased gently at most; these are
// colleagues, and some of them are new.

type Kind =
  | "debutWin"
  | "firstWin"
  | "finally"
  | "streakEnded"
  | "revenge"
  | "cleanSheet"
  | "upset"
  | "streak"
  | "thriller"
  | "milestone"
  | "close"
  | "comfortable"
  | "oneSided";

// What a wording may mention. `p` is whoever the remark is about (the debutant, the
// player on a streak); `n` a count that goes with it.
type Context = {
  W: string;
  L: string;
  p: string;
  n: number;
  // Picks the verb form: `v` for the winners, `lv` for the losers, `pv` for `p`.
  v: (one: string, many: string) => string;
  lv: (one: string, many: string) => string;
  pv: (one: string, many: string) => string;
};

type Wording = (c: Context) => string;

const WORDINGS: Record<Kind, Wording[]> = {
  debutWin: [
    (c) => `${c.p} ${c.pv("wins", "win")} on debut. Welcome to the table.`,
    (c) => `First game, first win for ${c.p}. Beginner's luck, or a new force?`,
    (c) => `${c.p} ${c.pv("arrives", "arrive")} with a win. The table has been warned.`,
    (c) => `A debut to remember for ${c.p}.`,
    (c) => `${c.p}: played one, won one. A perfect record.`,
    (c) => `New here, and already winning. Hello, ${c.p}.`,
  ],
  firstWin: [
    (c) => `${c.p}'s first win. Remember the date.`,
    (c) => `Off the mark at last: a first win for ${c.p}.`,
    (c) => `${c.p} ${c.pv("gets", "get")} that first win. The second is always easier.`,
    (c) => `The wait is over. ${c.p} ${c.pv("has", "have")} a win.`,
    (c) => `First win for ${c.p}. Cake is traditional.`,
    (c) => `${c.p} ${c.pv("opens", "open")} the account.`,
  ],
  finally: [
    (c) => `${c.W} finally beats ${c.L}, at attempt number ${c.n}.`,
    (c) => `${c.n} tries it took, but ${c.W} has beaten ${c.L}.`,
    (c) => `${c.L}'s perfect record against ${c.W} is gone.`,
    (c) => `Persistence pays: ${c.W} gets one over ${c.L} at last.`,
    (c) => `${c.W} beats ${c.L} for the first time. It only took ${c.n} games.`,
  ],
  streakEnded: [
    (c) => `${c.p}'s run of ${c.n} wins ends here.`,
    (c) => `All good things end. ${c.n} straight wins for ${c.p}, and then this.`,
    (c) => `${c.W} ${c.v("stops", "stop")} ${c.p}'s streak at ${c.n}.`,
    (c) => `The streak is over: ${c.p} had won ${c.n} in a row.`,
    (c) => `${c.p} was on ${c.n} in a row. Not any more.`,
    (c) => `Somebody had to do it. ${c.W} ${c.v("ends", "end")} ${c.p}'s run of ${c.n}.`,
  ],
  revenge: [
    (c) => `Revenge for ${c.W}.`,
    (c) => `${c.W} ${c.v("gets", "get")} one back.`,
    () => `The rematch goes the other way.`,
    () => `Honours even after that rematch.`,
    (c) => `${c.W} ${c.v("settles", "settle")} the score.`,
    () => `One each. A decider seems only fair.`,
  ],
  cleanSheet: [
    () => `10–0. We won't speak of this again.`,
    (c) => `A clean sheet for ${c.W}. Ruthless.`,
    (c) => `10–0. ${c.L} will want a rematch, or a hug.`,
    (c) => `Not a single goal past ${c.W}.`,
    () => `10–0. The ball barely left one half.`,
    (c) => `A shutout. ${c.W} ${c.v("was", "were")} in no mood to share.`,
    (c) => `Ten without reply for ${c.W}.`,
    () => `10–0. Somebody check the table is level.`,
  ],
  upset: [
    (c) => `Nobody saw that coming. ${c.W} ${c.v("beats", "beat")} the favourites.`,
    (c) => `Upset! The ratings had ${c.L} winning that one.`,
    (c) => `${c.W} ${c.v("tears", "tear")} up the form book.`,
    (c) => `So much for ratings. ${c.W} ${c.v("takes", "take")} it.`,
    (c) => `The underdog bites: ${c.W} over ${c.L}.`,
    (c) => `${c.L} ${c.lv("was", "were")} the favourite. ${c.W} had other ideas.`,
  ],
  streak: [
    (c) => `${c.n} in a row for ${c.p}. Somebody stop this.`,
    (c) => `${c.p} makes it ${c.n} wins on the bounce.`,
    (c) => `That's ${c.n} straight for ${c.p}.`,
    (c) => `${c.p} is on a run: ${c.n} and counting.`,
    (c) => `Win number ${c.n} in a row for ${c.p}. Who's next?`,
    (c) => `${c.n} wins without a loss for ${c.p}. The table is getting nervous.`,
  ],
  thriller: [
    () => `10–9. As close as it gets.`,
    (c) => `Decided by a single goal. ${c.W} ${c.v("edges", "edge")} it.`,
    () => `10–9. Hearts were in mouths.`,
    (c) => `One goal in it. ${c.L} will replay that last ball all day.`,
    (c) => `A thriller: ${c.W} by the narrowest margin.`,
    () => `10–9. Nobody deserved to lose that.`,
    (c) => `Down to the last ball, and ${c.W} ${c.v("takes", "take")} it.`,
    () => `It doesn't get tighter than 10–9.`,
  ],
  milestone: [
    (c) => `Game number ${c.n} for ${c.p}.`,
    (c) => `${c.p} brings up ${c.n} games.`,
    (c) => `${c.n} games played for ${c.p}. A regular.`,
    (c) => `A milestone: ${c.p} has now played ${c.n} games.`,
  ],
  close: [
    () => `Tight to the end.`,
    (c) => `${c.L} made ${c.W} work for that.`,
    () => `Closer than the score suggests.`,
    () => `A proper contest.`,
    (c) => `${c.W} ${c.v("holds", "hold")} on.`,
    () => `That could have gone either way.`,
    () => `Hard fought, well won.`,
    (c) => `${c.L} pushed all the way.`,
  ],
  comfortable: [
    (c) => `A solid win for ${c.W}.`,
    (c) => `${c.W} ${c.v("was", "were")} always in control.`,
    (c) => `Job done for ${c.W}.`,
    () => `Comfortable in the end.`,
    (c) => `${c.W} ${c.v("takes", "take")} the points.`,
    (c) => `No drama: ${c.W} ${c.v("gets", "get")} it done.`,
    () => `A tidy win.`,
    (c) => `${c.W}, with room to spare.`,
  ],
  oneSided: [
    (c) => `${c.W} ${c.v("was", "were")} in a hurry.`,
    () => `Over quickly.`,
    (c) => `${c.W} made that look easy.`,
    () => `A one-sided affair.`,
    (c) => `${c.L} will want another go.`,
    (c) => `Dominant from ${c.W}.`,
    () => `That was brisk.`,
    (c) => `${c.W} barely broke a sweat.`,
  ],
};

// How many different lines the commentary can produce, not counting the names in them.
export const COMMENTARY_WORDINGS = Object.values(WORDINGS).reduce(
  (total, wordings) => total + wordings.length,
  0,
);

// A streak is worth a remark when it starts to look like one, then now and again, not on
// every single win of a dominant player.
const STREAK_MARKS = new Set([3, 5, 7, 10]);
const isStreakMark = (streak: number): boolean =>
  STREAK_MARKS.has(streak) || (streak > 10 && streak % 5 === 0);
const MILESTONES = new Set([10, 25, 50, 100, 150, 200, 250, 500]);
// A streak has to be this long for its end to be news.
const STREAK_WORTH_ENDING = 3;
// Losses in a row to the same opponent before a win counts as "finally".
const LOSSES_BEFORE_FINALLY = 2;
// A rematch is revenge only while the first game is still fresh.
const REVENGE_WINDOW_MS = 24 * 60 * 60 * 1000;
// The winners took this share of the points on offer or more: the ratings gave them
// about one chance in three, or less.
const UPSET_SHARE = 0.65;

const firstName = (player: RatedPlayer): string =>
  player.displayName.trim().split(/\s+/)[0] || "Player";

// "Ada", "Ada & Bo".
const namesOf = (players: RatedPlayer[]): string => players.map(firstName).join(" & ");

const sideKey = (players: RatedPlayer[]): string =>
  players
    .map((player) => player.uid)
    .sort()
    .join("+");

type Form = { games: number; wins: number; streak: number };

// The commentary for every match in the history, by session id.
export const matchCommentary = (stats: RatingStats): Record<string, string> => {
  const lines: Record<string, string> = {};
  const form = new Map<string, Form>();
  // For each pairing of sides, who won last time and when.
  const lastMeeting = new Map<string, { winner: string; at: number }>();
  // For each pair of 1v1 opponents, how many times in a row the first has lost to the
  // second since last beating them.
  const lossesTo = new Map<string, number>();
  const used: Partial<Record<Kind, number>> = {};

  const formOf = (player: RatedPlayer): Form => {
    const existing = form.get(player.uid);
    if (existing) {
      return existing;
    }

    const created = { games: 0, wins: 0, streak: 0 };
    form.set(player.uid, created);
    return created;
  };

  const ordered = Object.values(stats.matches).sort(
    (a, b) => a.startedAt.getTime() - b.startedAt.getTime(),
  );

  for (const match of ordered) {
    const redWon = match.score.red > match.score.blue;
    const winners = match.teams[redWon ? 0 : 1].players;
    const losers = match.teams[redWon ? 1 : 0].players;
    const loserGoals = Math.min(match.score.red, match.score.blue);
    const winnerKey = sideKey(winners);
    const loserKey = sideKey(losers);
    const pairing = [winnerKey, loserKey].sort().join(" v ");
    const duel = winners.length === 1 && losers.length === 1;
    const beatenBy = `${winnerKey}>${loserKey}`;

    // Everything is judged on the form the players brought into the match.
    const debutants = winners.filter((player) => formOf(player).games === 0);
    const firstTimers = winners.filter(
      (player) => formOf(player).games > 0 && formOf(player).wins === 0,
    );
    const priorLosses = duel ? (lossesTo.get(beatenBy) ?? 0) : 0;
    const stopped = [...losers]
      .filter((player) => formOf(player).streak >= STREAK_WORTH_ENDING)
      .sort((a, b) => formOf(b).streak - formOf(a).streak)[0];
    const previous = lastMeeting.get(pairing);
    const revenge =
      !!previous &&
      previous.winner === loserKey &&
      match.startedAt.getTime() - previous.at <= REVENGE_WINDOW_MS;
    const upset = match.delta[redWon ? 0 : 1] >= UPSET_SHARE * kFactorFor(match.size);
    const onARun = [...winners]
      .filter((player) => isStreakMark(formOf(player).streak + 1))
      .sort((a, b) => formOf(b).streak - formOf(a).streak)[0];
    const marking = [...winners, ...losers].find((player) =>
      MILESTONES.has(formOf(player).games + 1),
    );

    let kind: Kind;
    let about: RatedPlayer[] = [];
    let count = 0;
    if (debutants.length > 0) {
      kind = "debutWin";
      about = debutants;
    } else if (firstTimers.length > 0) {
      kind = "firstWin";
      about = firstTimers;
    } else if (priorLosses >= LOSSES_BEFORE_FINALLY) {
      kind = "finally";
      count = priorLosses + 1;
    } else if (stopped) {
      kind = "streakEnded";
      about = [stopped];
      count = formOf(stopped).streak;
    } else if (revenge) {
      kind = "revenge";
    } else if (loserGoals === 0) {
      kind = "cleanSheet";
    } else if (upset) {
      kind = "upset";
    } else if (onARun) {
      kind = "streak";
      about = [onARun];
      count = formOf(onARun).streak + 1;
    } else if (loserGoals === 9) {
      kind = "thriller";
    } else if (marking) {
      kind = "milestone";
      about = [marking];
      count = formOf(marking).games + 1;
    } else {
      kind = loserGoals >= 7 ? "close" : loserGoals >= 4 ? "comfortable" : "oneSided";
    }

    const pick = (many: boolean) => (one: string, several: string) => (many ? several : one);
    const turn = used[kind] ?? 0;
    used[kind] = turn + 1;
    lines[match.sessionId] = WORDINGS[kind][turn % WORDINGS[kind].length]({
      W: namesOf(winners),
      L: namesOf(losers),
      p: namesOf(about),
      n: count,
      v: pick(winners.length > 1),
      lv: pick(losers.length > 1),
      pv: pick(about.length > 1),
    });

    for (const player of winners) {
      const current = formOf(player);
      current.games += 1;
      current.wins += 1;
      current.streak += 1;
    }
    for (const player of losers) {
      const current = formOf(player);
      current.games += 1;
      current.streak = 0;
    }
    lastMeeting.set(pairing, { winner: winnerKey, at: match.startedAt.getTime() });
    if (duel) {
      lossesTo.set(beatenBy, 0);
      const reverse = `${loserKey}>${winnerKey}`;
      lossesTo.set(reverse, (lossesTo.get(reverse) ?? 0) + 1);
    }
  }

  return lines;
};

// The commentary a match would get once it is in the history: for announcing a result at
// the moment it is logged, before the ratings have caught up with it.
export const commentaryForNew = (stats: RatingStats, match: ScoredMatch): string =>
  matchCommentary(computeStats([...Object.values(stats.matches), match]))[match.sessionId] ?? "";
