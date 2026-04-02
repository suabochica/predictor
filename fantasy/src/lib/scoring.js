import scoringConfig from '../config/scoring.json';

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
  pts += stats.assists * scoringConfig.assists;

  // Clean sheet (60+ minutes required)
  if (stats.clean_sheet && stats.minutes_played >= 60) {
    pts += scoringConfig.clean_sheet[position] ?? 0;
  }

  // Saves (every 3)
  pts += Math.floor(stats.saves / 3) * scoringConfig.saves_per_3;

  // Penalty saves
  pts += stats.penalty_saves * scoringConfig.penalty_save;

  // Negative: cards, own goals, penalty misses
  pts += stats.yellow_cards * scoringConfig.yellow_card;
  pts += stats.red_cards * scoringConfig.red_card;
  pts += stats.own_goals * scoringConfig.own_goal;
  pts += stats.penalty_misses * scoringConfig.penalty_miss;

  // Goals conceded (GK/DEF only)
  if (['GK', 'DEF'].includes(position) && stats.goals_conceded > 0) {
    pts += Math.floor(stats.goals_conceded / 2) * scoringConfig.goals_conceded_per_2;
  }

  return pts;
}

export function applyCaptainMultiplier(points) {
  return points * scoringConfig.captain_multiplier;
}
