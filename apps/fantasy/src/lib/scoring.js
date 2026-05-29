import scoringConfig from '../config/scoring.json';
import optaScoringConfig from '../config/opta_scoring.json';

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

/**
 * Calculate Opta-style fantasy points for a player.
 *
 * Uses DB column names (matches player_stats after migration 020).
 * Position must be one of: GK, DEF, MID, FWD.
 * Returns a float rounded to 1 decimal (e.g. 28.6).
 * Rounding to integers only happens at the fantasy_standings write boundary (Phase 5c).
 *
 * Spot-check: R. Freuler (MF) from Serbia vs Switzerland 2022 → 28.6
 */
export function calculateOptaPoints(stats, position) {
  const c = optaScoringConfig;
  let pts = 0;

  pts += (stats.goals ?? 0) * c.G;
  pts += (stats.shots_on_target ?? 0) * c.SOnT;
  pts += (stats.shots_off_target ?? 0) * c.SOffT;
  pts += (stats.blocked_shots ?? 0) * c.BS;
  pts += (stats.own_goals ?? 0) * c.OG;
  pts += (stats.assists ?? 0) * c.A;
  pts += (stats.passes ?? 0) * c.P;
  pts += (stats.crosses ?? 0) * c.C;
  pts += (stats.tackles ?? 0) * c.Tk;
  pts += (stats.interceptions ?? 0) * c.INT;
  pts += (stats.fouls_won ?? 0) * c.FW;
  pts += (stats.fouls_conceded ?? 0) * c.FC;
  pts += (stats.offsides ?? 0) * c.O;
  pts += (stats.yellow_cards ?? 0) * c.YC;
  pts += (stats.red_cards ?? 0) * c.RC;
  pts += (stats.penalties_won ?? 0) * c.PW;

  // Goals conceded: larger penalty for GK
  const gc = stats.goals_conceded ?? 0;
  pts += gc * (position === 'GK' ? c.GC_gk : c.GC_player);

  // Saves and penalty saves: GK only
  if (position === 'GK') {
    pts += (stats.saves ?? 0) * c.SAV_gk;
    pts += (stats.penalty_saves ?? 0) * c.PSAV_gk;
  }

  return Math.round(pts * 10) / 10;
}
