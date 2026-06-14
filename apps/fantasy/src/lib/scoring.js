import scoringConfig from '../config/scoring.json';
import compositeScoringConfig from '../config/composite_scoring.json';

export function calculatePlayerPoints(stats, position) {
  let pts = 0;

  // Playing time
  if (stats.minutes_played >= 60) {
    pts += scoringConfig.minutes['60+'];
  } else if (stats.minutes_played >= 1) {
    pts += scoringConfig.minutes['1-59'];
  }

  // Goals
  if (stats.goals > 0) {
    pts += stats.goals * scoringConfig.goals[position];
  }

  // Assists
  pts += (stats.assists ?? 0) * scoringConfig.assists;

  // Clean sheet (60+ minutes required)
  if (stats.clean_sheet && stats.minutes_played >= 60) {
    pts += scoringConfig.clean_sheet[position] ?? 0;
  }

  // Saves (every 3)
  pts += Math.floor((stats.saves ?? 0) / 3) * scoringConfig.saves_per_3;

  // Penalty saves
  pts += (stats.penalty_saves ?? 0) * scoringConfig.penalty_save;

  // Negative: cards, own goals, penalty misses
  pts += (stats.yellow_cards ?? 0) * scoringConfig.yellow_card;
  pts += (stats.red_cards ?? 0) * scoringConfig.red_card;
  pts += (stats.own_goals ?? 0) * scoringConfig.own_goal;
  pts += (stats.penalty_misses ?? 0) * scoringConfig.penalty_miss;

  // Goals conceded (GK/DEF only)
  if (['GK', 'DEF'].includes(position) && (stats.goals_conceded ?? 0) > 0) {
    pts += Math.floor((stats.goals_conceded ?? 0) / 2) * scoringConfig.goals_conceded_per_2;
  }

  return pts;
}

export function applyCaptainMultiplier(points) {
  return points * scoringConfig.captain_multiplier;
}

export function calculateCompositePoints(stats, position) {
  let pts = calculatePlayerPoints(stats, position);
  const b = compositeScoringConfig.bonuses;
  for (const [col, weights] of Object.entries(b)) {
    pts += (stats[col] ?? 0) * (weights[position] ?? 0);
  }
  return Math.round(pts * 10) / 10;
}

export function getActivePoints(stats, position, system) {
  return system === 'current'
    ? (stats.total_points ?? calculatePlayerPoints(stats, position))
    : calculateCompositePoints(stats, position);
}

export function sumSeasonPointsByPlayer(rows, positionById, system) {
  const map = {};
  for (const s of rows) {
    const pos = positionById[s.player_id];
    if (!pos) continue;
    map[s.player_id] = (map[s.player_id] ?? 0) + getActivePoints(s, pos, system);
  }
  for (const id of Object.keys(map)) map[id] = Math.round(map[id] * 10) / 10;
  return map;
}
