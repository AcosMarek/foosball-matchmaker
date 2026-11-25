// Weekly activity at a table, for the admin: how many matches were started, how many of
// those filled, and how many got a score. The three steps are the funnel that decides
// whether people actually play, so their week-on-week movement is how to tell whether a
// change to the app helped.

// What the count needs to know about a match.
export type WeeklySession = {
  startedAt: Date;
  // Enough players joined for it to be played.
  filled: boolean;
  // A result was logged.
  scored: boolean;
  // A player called it off.
  cancelled: boolean;
};

export type WeekNumbers = {
  // Monday 00:00, local time.
  start: Date;
  // The Sunday that ends the week, for labelling.
  lastDay: Date;
  started: number;
  filled: number;
  scored: number;
  cancelled: number;
  // True for the week that is still running, whose numbers are not final.
  current: boolean;
};

export const WEEKS_SHOWN = 8;

// The Monday that begins the week `date` falls in. Built from calendar fields rather than
// by subtracting milliseconds, so a week that contains a clock change is still seven
// calendar days.
export const weekStart = (date: Date): Date => {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));

  return monday;
};

const addDays = (date: Date, days: number): Date => {
  const moved = new Date(date);
  moved.setDate(moved.getDate() + days);

  return moved;
};

// When the oldest of the weeks shown begins: nothing before it needs to be loaded.
export const weeklyWindowStart = (now: Date = new Date(), weeks: number = WEEKS_SHOWN): Date =>
  addDays(weekStart(now), -7 * (weeks - 1));

// The last `weeks` weeks, newest first, including weeks in which nothing happened.
export const weeklyNumbers = (
  sessions: WeeklySession[],
  now: Date = new Date(),
  weeks: number = WEEKS_SHOWN,
): WeekNumbers[] => {
  const thisWeek = weekStart(now);
  const rows = Array.from({ length: weeks }, (_, index): WeekNumbers => {
    const start = addDays(thisWeek, -7 * index);

    return {
      start,
      lastDay: addDays(start, 6),
      started: 0,
      filled: 0,
      scored: 0,
      cancelled: 0,
      current: index === 0,
    };
  });
  const byStart = new Map(rows.map((row) => [row.start.getTime(), row]));

  for (const session of sessions) {
    const row = byStart.get(weekStart(session.startedAt).getTime());
    if (!row) {
      continue;
    }

    row.started += 1;
    // A scored match was certainly played, whatever its player count says.
    row.filled += session.filled || session.scored ? 1 : 0;
    row.scored += session.scored ? 1 : 0;
    row.cancelled += session.cancelled ? 1 : 0;
  }

  return rows;
};

// "17–23 Nov" or "30 Nov – 6 Dec".
export const formatWeek = ({ start, lastDay }: WeekNumbers): string => {
  const month = (date: Date): string => date.toLocaleDateString([], { month: "short" });

  return start.getMonth() === lastDay.getMonth()
    ? `${start.getDate()}–${lastDay.getDate()} ${month(lastDay)}`
    : `${start.getDate()} ${month(start)} – ${lastDay.getDate()} ${month(lastDay)}`;
};

// Share of started matches that filled, as a whole percentage; null when none started.
export const fillRate = ({ started, filled }: WeekNumbers): number | null =>
  started === 0 ? null : Math.round((filled / started) * 100);
