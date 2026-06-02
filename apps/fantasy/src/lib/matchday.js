import { calculatePlayerPoints, applyCaptainMultiplier } from './scoring';

/**
 * Run auto-substitution for a single team's lineup.
 *
 * Rules:
 * - Starter with minutes_played === 0 is eligible to be subbed out
 * - Captain is NEVER auto-subbed (per spec §5.3)
 * - First bench player (by bench_order) whose position keeps the formation
 *   valid is subbed in
 * - Returns a new lineup (starters/bench arrays) with subs applied
 */
export function applyAutoSubs(lineup, statsMap) {
  // lineup: { starters: [{id, position}], bench: [{id, position}], captainId, formation }
  const { captainId, bench } = lineup;
  let starters = [...lineup.starters];
  let remainingBench = [...bench];
  const subsApplied = []; // { playerOut, playerIn }

  for (const starter of [...starters]) {
    if (starter.id === captainId) continue; // captain never auto-subbed
    const stats = statsMap[starter.id];
    if (!stats || stats.minutes_played !== 0) continue; // played or no stats yet

    // Find first bench player that keeps formation valid
    for (let i = 0; i < remainingBench.length; i++) {
      const candidate = remainingBench[i];
      const proposedStarters = starters
        .filter((s) => s.id !== starter.id)
        .concat(candidate);

      if (isFormationValid(proposedStarters)) {
        starters = proposedStarters;
        remainingBench = remainingBench.filter((_, idx) => idx !== i);
        subsApplied.push({ playerOut: starter, playerIn: candidate });
        break;
      }
    }
  }

  return { starters, bench: remainingBench, subsApplied };
}

/**
 * Calculate total fantasy points for a team on a given matchday.
 * Manual subs only — the saved starting XI is final; a starter with no minutes scores 0.
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function isFormationValid(starters) {
  if (starters.length !== 11) return false;
  return starters.filter((p) => p.position === 'GK').length === 1;
}
