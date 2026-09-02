// Shared, testable core for turning a matchday's fantasy points into a table
// position — both the 'cumulative' (World Cup) and 'h2h' (UCL) group formats.
// See Phase A4 of /home/lucas/.claude/plans/we-have-been-doing-eventual-hejlsberg.md

const round1 = (n) => Math.round((n ?? 0) * 10) / 10;

/**
 * Resolves one side of one H2H fixture into a result + league points, per the
 * competition's configured scoring (h2h_win_points, h2h_draw_points,
 * h2h_narrow_loss_points, h2h_narrow_loss_margin).
 *
 * Both scores are rounded to 1 decimal before comparing — matchday_points is
 * numeric(8,1) and raw float comparison has caused real bugs in this repo.
 */
export function h2hResult(ptsFor, ptsAgainst, cfg) {
  const forRounded = round1(ptsFor);
  const againstRounded = round1(ptsAgainst);

  if (forRounded === againstRounded) {
    return { result: 'D', points: cfg.h2h_draw_points };
  }
  if (forRounded > againstRounded) {
    return { result: 'W', points: cfg.h2h_win_points };
  }
  const margin = round1(againstRounded - forRounded);
  if (margin <= cfg.h2h_narrow_loss_margin) {
    return { result: 'L', points: cfg.h2h_narrow_loss_points };
  }
  return { result: 'L', points: 0 };
}

/**
 * Builds per-team H2H records from the drawn fixtures and each team's points
 * for the matchday it was fixtured in.
 *
 * `pointsByMatchdayTeam` is `{ [matchday_id]: { [team_id]: matchday_points } }`
 * — presence of a `team_id` key is what "has a fantasy_standings row" means. A
 * fixture counts as played once *either* side has a row; a missing side scores
 * 0.0. A fixture where neither side has played yet is skipped entirely (its
 * matchday hasn't been scored).
 *
 * Returns `{ [team_id]: { played, won, drawn, lost, h2h_points, points_for,
 * points_against } }`.
 */
export function computeH2HRecords(fixtures, pointsByMatchdayTeam, cfg) {
  const records = {};
  const ensure = (teamId) => {
    if (!records[teamId]) {
      records[teamId] = {
        team_id: teamId,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        h2h_points: 0,
        points_for: 0,
        points_against: 0,
      };
    }
    return records[teamId];
  };

  for (const fixture of fixtures) {
    const { matchday_id: matchdayId, team_a_id: teamAId, team_b_id: teamBId } = fixture;
    const mdPoints = pointsByMatchdayTeam[matchdayId] ?? {};
    const hasA = mdPoints[teamAId] != null;
    const hasB = mdPoints[teamBId] != null;
    if (!hasA && !hasB) continue; // matchday not yet scored for this fixture

    const aVal = mdPoints[teamAId] ?? 0;
    const bVal = mdPoints[teamBId] ?? 0;

    const recA = ensure(teamAId);
    const recB = ensure(teamBId);

    const aOutcome = h2hResult(aVal, bVal, cfg);
    const bOutcome = h2hResult(bVal, aVal, cfg);

    recA.played += 1;
    recB.played += 1;
    recA.points_for += aVal;
    recA.points_against += bVal;
    recB.points_for += bVal;
    recB.points_against += aVal;
    recA.h2h_points += aOutcome.points;
    recB.h2h_points += bOutcome.points;
    if (aOutcome.result === 'W') recA.won += 1;
    else if (aOutcome.result === 'D') recA.drawn += 1;
    else recA.lost += 1;
    if (bOutcome.result === 'W') recB.won += 1;
    else if (bOutcome.result === 'D') recB.drawn += 1;
    else recB.lost += 1;
  }

  for (const rec of Object.values(records)) {
    rec.h2h_points = round1(rec.h2h_points);
    rec.points_for = round1(rec.points_for);
    rec.points_against = round1(rec.points_against);
  }

  return records;
}

/**
 * Sorts standings entries into table order.
 *
 * 'h2h': league points → total fantasy points → goals scored → captain points
 * → team_id (ascending, for determinism).
 * 'cumulative': exactly today's two-key sort (total points → goals scored),
 * unchanged, with no extra tiebreak.
 */
export function rankStandings(entries, format) {
  const sorted = [...entries];
  if (format === 'h2h') {
    sorted.sort((a, b) => {
      if (b.h2h_points !== a.h2h_points) return b.h2h_points - a.h2h_points;
      if (b.total_points !== a.total_points) return b.total_points - a.total_points;
      if (b.goals_scored !== a.goals_scored) return b.goals_scored - a.goals_scored;
      const aCap = a.captain_points ?? 0;
      const bCap = b.captain_points ?? 0;
      if (bCap !== aCap) return bCap - aCap;
      return a.team_id - b.team_id;
    });
  } else {
    sorted.sort((a, b) => {
      if (b.total_points !== a.total_points) return b.total_points - a.total_points;
      return b.goals_scored - a.goals_scored;
    });
  }
  return sorted;
}
