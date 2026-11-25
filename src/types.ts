import type { MatchPlayer, MatchScore, MatchSize } from "./matchmaking";
import type { RatedTeam } from "./ratings";

export type FoosballTable = {
  code: string;
  name: string;
};

// A table the player is no longer on: `left` when they chose to go, false when the app
// found on opening it that they had been taken off (or had left on another device).
export type Departure = {
  table: FoosballTable;
  left: boolean;
};

export type MatchResult = MatchScore & {
  lineup: string;
  recordedAt: Date | null;
};

export type Session = {
  id: string;
  startedAt: Date;
  startedBy: string;
  startedByName: string;
  targetPlayers: MatchSize;
  playerCount: number;
  result: MatchResult | null;
  // Called off by one of its players: it gets no score and changes nobody's rating.
  cancelled: boolean;
  // The teams picked when the match filled, [Red, Blue]. Null until then, and for matches
  // from before teams were stored, whose teams follow the join order.
  teams: [RatedTeam, RatedTeam] | null;
  // When the match filled; null while it is filling.
  readyAt: Date | null;
  // Whether its players have already been reminded to log the score.
  reminded: boolean;
};

export type JoinedPlayer = MatchPlayer & {
  joinedAt: Date | null;
};
