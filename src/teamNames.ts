// Made-up names for the two sides of a 2v2, purely for fun: "The Back-Row Bandits
// against Spin City". They mean nothing and are stored nowhere. A match's names are
// worked out from its id, so every screen and the Slack post agree on them without
// anything being saved.
//
// Variety comes from two sources: a hand-written list, and a generator that pairs a
// describing word with a noun. Together that is several hundred names, so a table would
// play for a long time before seeing one twice.

const HAND_PICKED = [
  "The Back-Row Bandits",
  "Spin City",
  "Rod Squad",
  "Table Manners",
  "The Wrist Twisters",
  "Goal Diggers",
  "The Deflectors",
  "Midfield Crisis",
  "The Bank Shots",
  "Pull Shot Posse",
  "Dead Ball Society",
  "The Handle Bars",
  "Slide Rulers",
  "The Bar Raisers",
  "Net Profit",
  "The Rattlers",
  "Tic-Tac Attack",
  "The Long Shots",
  "Own Goal Orchestra",
  "The Back Benchers",
  "Keepers of the Peace",
  "The Lunch Breakers",
  "Coffee Break United",
  "Desk Jockeys",
  "The Standing Meeting",
  "Out of Office",
  "Reply All Rovers",
  "The Deadline Dodgers",
  "Inbox Zero",
  "Monday Motivators",
  "The Quarterly Reviewers",
  "Ctrl Alt Defeat",
  "The Spreadsheet Strikers",
  "Wrist Assessment",
  "Offside Trap",
  "The Clean Sheets",
  "The Goal Getters",
  "Angle Grinders",
  "The Rebounders",
  "Corner Office",
  "The Post Hitters",
  "Kick-Off Meeting",
  "The Agenda Items",
  "Any Other Business",
  "The Stakeholders",
  "Team Building Exercise",
  "The Printer Jammers",
  "Low Battery",
  "The Mute Buttons",
  "You're On Mute",
  "The Calendar Invites",
  "Double Booked",
  "The Action Points",
  "Scope Creep",
  "The Hot Deskers",
  "Fire Drill",
  "The Late Arrivals",
  "Extra Time",
  "The Second Coffee",
  "Friday Feeling",
];

const DESCRIBERS = [
  "Flying",
  "Spinning",
  "Mighty",
  "Sneaky",
  "Relentless",
  "Humble",
  "Fearless",
  "Sleepy",
  "Caffeinated",
  "Unstoppable",
  "Wobbly",
  "Lucky",
  "Rusty",
  "Golden",
  "Thundering",
  "Silent",
  "Dizzy",
  "Cunning",
  "Reckless",
  "Polite",
  "Furious",
  "Tireless",
  "Bouncing",
  "Left-Handed",
];

const NOUNS = [
  "Strikers",
  "Defenders",
  "Goalkeepers",
  "Rods",
  "Wrists",
  "Handles",
  "Rebounds",
  "Rockets",
  "Badgers",
  "Vikings",
  "Foxes",
  "Penguins",
  "Wizards",
  "Legends",
  "Interns",
  "Managers",
  "Trolls",
  "Puffins",
  "Reindeer",
  "Moose",
  "Falcons",
  "Hammers",
  "Cannons",
  "Underdogs",
];

// How many different names there are to draw from.
export const TEAM_NAME_COUNT = HAND_PICKED.length + DESCRIBERS.length * NOUNS.length;

// FNV-1a: a small, well-spread hash, so that ids differing by one character land on
// unrelated names.
const hash = (text: string): number => {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }

  return value >>> 0;
};

// The hand-written names are the funnier ones, so they come up more often than their
// share of the catalogue: two draws in five. The rest come from the generator, which is
// what keeps the same name from turning up again for a long time.
const draw = (seed: string): string => {
  const value = hash(seed);
  const position = value >>> 3;
  if (value % 5 < 2) {
    return HAND_PICKED[position % HAND_PICKED.length];
  }

  const generated = position % (DESCRIBERS.length * NOUNS.length);

  return `The ${DESCRIBERS[Math.floor(generated / NOUNS.length)]} ${NOUNS[generated % NOUNS.length]}`;
};

// The names of the Red and the Blue side of a match: always the same two for the same
// match, and never the same name twice.
export const teamNamesFor = (sessionId: string): [string, string] => {
  const red = draw(`${sessionId}:red`);
  let blue = draw(`${sessionId}:blue`);
  for (let attempt = 1; blue === red; attempt += 1) {
    blue = draw(`${sessionId}:blue:${attempt}`);
  }

  return [red, blue];
};
