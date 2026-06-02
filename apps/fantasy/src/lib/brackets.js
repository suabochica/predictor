/**
 * Generates the QF seeding for the 8-team single-elimination bracket.
 * standings: array of team objects sorted by total_points desc (rank 1..8)
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

/**
 * Determine H2H winner:
 * 1. Higher matchday points
 * 2. Higher captain points
 * 3. More goals scored
 * 4. Higher league seed (lower rank number wins)
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
  return teamA.league_rank < teamB.league_rank ? teamA : teamB;
}
