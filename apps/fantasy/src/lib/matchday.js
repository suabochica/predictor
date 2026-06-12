import { calculatePlayerPoints, applyCaptainMultiplier } from './scoring';

// Manual subs only — no auto-substitution. The saved starting XI is final.

/**
 * Calculate total fantasy points for a team on a given matchday.
 * A starter with no minutes scores 0; bench is never promoted.
 *
 * Returns { totalPoints, goalsScored, breakdown: [{ playerId, basePoints, isCaptain, finalPoints }], subsApplied: [] }
 */
export function calculateTeamMatchdayPoints(lineup, statsMap, positionMap, scorerFn = calculatePlayerPoints) {
  const { starters, captainId } = lineup;

  let totalPoints = 0;
  let goalsScored = 0;
  const breakdown = [];

  for (const player of starters) {
    const stats = statsMap[player.id];
    const position = positionMap[player.id] ?? player.position;
    const base = stats ? scorerFn(stats, position) : 0;
    const isCaptain = player.id === captainId;
    const final = isCaptain ? applyCaptainMultiplier(base) : base;

    totalPoints += final;
    goalsScored += stats?.goals ?? 0;
    breakdown.push({
      playerId: player.id,
      basePoints: base,
      finalPoints: final,
      isCaptain,
      subbedIn: false,
      subbedOut: false,
    });
  }

  return { totalPoints, goalsScored, breakdown, subsApplied: [] };
}
