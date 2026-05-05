/**
 * Generates the championship bracket seeding from final league standings.
 * standings: array of team objects sorted by total_points desc (rank 1..12)
 */
export function generateChampionshipBracket(standings) {
  const top8 = standings.slice(0, 8);
  return [
    { label: 'Match A', teamA: top8[0], teamB: top8[7] },
    { label: 'Match B', teamA: top8[3], teamB: top8[4] },
    { label: 'Match C', teamA: top8[1], teamB: top8[6] },
    { label: 'Match D', teamA: top8[2], teamB: top8[5] },
  ];
}

export function generateRelegationBracket(standings) {
  const bottom4 = standings.slice(8, 12);
  return [
    { label: 'Match X', teamA: bottom4[0], teamB: bottom4[3] },
    { label: 'Match Y', teamA: bottom4[1], teamB: bottom4[2] },
  ];
}

/**
 * Determine H2H winner with tiebreaker rules:
 * 1. Higher matchday points
 * 2. Higher captain points
 * 3. More goals scored
 * 4. Higher league seed
 */
export function resolveH2H(matchup) {
  const { teamA, teamB } = matchup;

  if (teamA.matchday_points !== teamB.matchday_points) {
    return teamA.matchday_points > teamB.matchday_points ? teamA : teamB;
  }
  if (teamA.captain_points !== teamB.captain_points) {
    return teamA.captain_points > teamB.captain_points ? teamA : teamB;
  }
  if (teamA.goals_scored !== teamB.goals_scored) {
    return teamA.goals_scored > teamB.goals_scored ? teamA : teamB;
  }
  // Higher seed (lower rank number) wins
  return teamA.league_rank < teamB.league_rank ? teamA : teamB;
}
