import type { MatchPlayer, MatchScore, MatchSize } from "./matchmaking";

export type FoosballTable = {
  code: string;
  name: string;
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
};

export type JoinedPlayer = MatchPlayer & {
  joinedAt: Date | null;
};
