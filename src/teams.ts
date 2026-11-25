import {
  buildMatchDisposition,
  teamCssColor,
  type MatchDisposition,
  type MatchPlayer,
  type MatchSize,
  type TeamDisposition,
} from "./matchmaking";
import { START_RATING, type RatedTeam, type RatingStats } from "./ratings";

// How a 2v2's teams are picked. They used to follow the join order (first two against
// the last two), which let two strong players pair up by arriving together and always
// put the starter in Red's front seat. Now the four are split into the two sides with the
// closest combined rating, and each pair's seats go to whoever is due a turn there.

type Form = {
  rating: number;
  // Games played up front minus games played at the back: the higher it is, the more
  // this player is owed a turn in defense.
  frontLean: number;
};

const formOf = (stats: RatingStats | null, uid: string): Form => {
  const player = stats?.players.find((entry) => entry.uid === uid);

  return {
    rating: player?.rating ?? START_RATING,
    frontLean: player ? player.front.games - player.back.games : 0,
  };
};

// Splits the first `size` players into balanced teams. Every tie falls back to the join
// order, so four unrated players (or ratings that haven't loaded) get exactly the teams
// the join order gave before. Red is always the side of the first player in. A 1v1 has
// nothing to balance.
export const balanceTeams = (
  players: MatchPlayer[],
  size: MatchSize,
  stats: RatingStats | null,
): MatchDisposition | null => {
  const joinOrder = buildMatchDisposition(players, size);
  if (!joinOrder || size === 2) {
    return joinOrder;
  }

  const [a, b, c, d] = players;
  const pairings: [MatchPlayer[], MatchPlayer[]][] = [
    [
      [a, b],
      [c, d],
    ],
    [
      [a, c],
      [b, d],
    ],
    [
      [a, d],
      [b, c],
    ],
  ];

  const strength = (team: MatchPlayer[]): number =>
    team.reduce((sum, player) => sum + formOf(stats, player.uid).rating, 0);
  const gap = ([red, blue]: [MatchPlayer[], MatchPlayer[]]): number =>
    Math.abs(strength(red) - strength(blue));
  // Strictly smaller only, so the earliest pairing wins a tie.
  const [red, blue] = pairings.reduce((chosen, candidate) =>
    gap(candidate) < gap(chosen) ? candidate : chosen,
  );

  const seat = (team: MatchPlayer[], base: TeamDisposition): TeamDisposition => {
    const [first, second] = team;
    const swap = formOf(stats, second.uid).frontLean < formOf(stats, first.uid).frontLean;
    const [front, back] = swap ? [second, first] : [first, second];

    return {
      ...base,
      players: [
        { player: front, position: "front" },
        { player: back, position: "back" },
      ],
    };
  };

  return { size, teams: [seat(red, joinOrder.teams[0]), seat(blue, joinOrder.teams[1])] };
};

// Teams as stored on a session or a result, back in the shape the UI draws.
export const dispositionFromTeams = (
  teams: [RatedTeam, RatedTeam],
  size: MatchSize,
): MatchDisposition => {
  const [red, blue] = teams.map(
    (team): TeamDisposition => ({
      color: team.color,
      cssColor: teamCssColor(team.color),
      players: team.players.map((player) => ({
        player: { uid: player.uid, displayName: player.displayName },
        position: player.position,
      })),
    }),
  );

  return { size, teams: [red, blue] };
};
