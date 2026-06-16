import type { MatchPlayer, MatchSize } from "./matchmaking";

export type FoosballTable = {
  code: string;
  name: string;
};

export type Session = {
  id: string;
  startedAt: Date;
  startedByName: string;
  targetPlayers: MatchSize;
};

export type JoinedPlayer = MatchPlayer & {
  joinedAt: Date | null;
};
