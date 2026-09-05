import scoringConfig from '../config/scoring.json';
import compositeScoringConfig from '../config/composite_scoring.json';

// Maps each snake_case stats column to its camelCase key in
// `fantasy.scoring.labels` (packages/i18n/src/catalogs/*/fantasy.ts).
const LABEL_KEYS = {
  minutes: 'minutes',
  goals: 'goals',
  assists: 'assists',
  clean_sheet: 'cleanSheet',
  saves: 'saves',
  penalty_saves: 'penaltySaves',
  yellow_cards: 'yellowCards',
  red_cards: 'redCards',
  own_goals: 'ownGoals',
  penalty_misses: 'penaltyMisses',
  goals_conceded: 'goalsConceded',
  shots_on_target: 'shotsOnTarget',
  shots_off_target: 'shotsOffTarget',
  blocked_shots: 'blockedShots',
  tackles: 'tackles',
  interceptions: 'interceptions',
  passes: 'passes',
  crosses: 'crosses',
  fouls_won: 'foulsWon',
  fouls_conceded: 'foulsConceded',
  offsides: 'offsides',
  penalties_won: 'penaltiesWon',
};

// `t` is optional — callers that only need the summed points (not the
// display label) can omit it; the key itself is a safe non-crashing fallback.
function labelFor(key, t) {
  return t ? t(`fantasy.scoring.labels.${LABEL_KEYS[key]}`) : LABEL_KEYS[key];
}

// Returns { key, label, count, unit, points } per scoring rule.
// unit=null means the rule is tiered/boolean (saves÷3, GC÷2, minutes tiers, clean sheet).
// Callers should filter out zero-points items for display, but always sum the full list.
// The minutes item is always included so a "no minutes" row is visible.
export function basePointsBreakdown(stats, position, t) {
  const items = [];
  const mins = stats.minutes_played ?? 0;

  let minPts = 0;
  if (mins >= 60) minPts = scoringConfig.minutes['60+'];
  else if (mins >= 1) minPts = scoringConfig.minutes['1-59'];
  items.push({ key: 'minutes', label: labelFor('minutes', t), count: mins, unit: null, points: minPts });

  const goals = stats.goals ?? 0;
  if (goals > 0) {
    const unit = scoringConfig.goals[position];
    items.push({ key: 'goals', label: labelFor('goals', t), count: goals, unit, points: goals * unit });
  }

  const assists = stats.assists ?? 0;
  if (assists > 0) {
    items.push({ key: 'assists', label: labelFor('assists', t), count: assists, unit: scoringConfig.assists, points: assists * scoringConfig.assists });
  }

  if (stats.clean_sheet && mins >= 60) {
    const csPoints = scoringConfig.clean_sheet[position] ?? 0;
    if (csPoints > 0) {
      items.push({ key: 'clean_sheet', label: labelFor('clean_sheet', t), count: 1, unit: null, points: csPoints });
    }
  }

  const saves = stats.saves ?? 0;
  if (saves > 0) {
    items.push({ key: 'saves', label: labelFor('saves', t), count: saves, unit: null, points: Math.floor(saves / 3) * scoringConfig.saves_per_3 });
  }

  const penSaves = stats.penalty_saves ?? 0;
  if (penSaves > 0) {
    items.push({ key: 'penalty_saves', label: labelFor('penalty_saves', t), count: penSaves, unit: scoringConfig.penalty_save, points: penSaves * scoringConfig.penalty_save });
  }

  const yellow = stats.yellow_cards ?? 0;
  if (yellow > 0) {
    items.push({ key: 'yellow_cards', label: labelFor('yellow_cards', t), count: yellow, unit: scoringConfig.yellow_card, points: yellow * scoringConfig.yellow_card });
  }

  const red = stats.red_cards ?? 0;
  if (red > 0) {
    items.push({ key: 'red_cards', label: labelFor('red_cards', t), count: red, unit: scoringConfig.red_card, points: red * scoringConfig.red_card });
  }

  const ownGoals = stats.own_goals ?? 0;
  if (ownGoals > 0) {
    items.push({ key: 'own_goals', label: labelFor('own_goals', t), count: ownGoals, unit: scoringConfig.own_goal, points: ownGoals * scoringConfig.own_goal });
  }

  const penMisses = stats.penalty_misses ?? 0;
  if (penMisses > 0) {
    items.push({ key: 'penalty_misses', label: labelFor('penalty_misses', t), count: penMisses, unit: scoringConfig.penalty_miss, points: penMisses * scoringConfig.penalty_miss });
  }

  if (['GK', 'DEF'].includes(position)) {
    const gc = stats.goals_conceded ?? 0;
    if (gc > 0) {
      items.push({ key: 'goals_conceded', label: labelFor('goals_conceded', t), count: gc, unit: null, points: Math.floor(gc / 2) * scoringConfig.goals_conceded_per_2 });
    }
  }

  return items;
}

export function compositeBreakdown(stats, position, t) {
  const items = basePointsBreakdown(stats, position, t);
  for (const [col, weights] of Object.entries(compositeScoringConfig.bonuses)) {
    const count = stats[col] ?? 0;
    const unit = weights[position] ?? 0;
    items.push({ key: col, label: labelFor(col, t), count, unit, points: count * unit });
  }
  return items;
}

// Returns the canonical breakdown for display. For 'current' system, appends a
// reconciliation item if stored total_points diverges from computed base sum.
export function breakdownPoints(stats, position, system, t) {
  if (system === 'opta') return compositeBreakdown(stats, position, t);
  const items = basePointsBreakdown(stats, position, t);
  const computed = items.reduce((sum, item) => sum + item.points, 0);
  const stored = stats.total_points;
  if (stored != null && Math.round(stored * 10) !== Math.round(computed * 10)) {
    items.push({ key: 'stored_adjustment', label: t ? t('fantasy.scoring.adjustment') : 'Adjustment', count: null, unit: null, points: stored - computed });
  }
  return items;
}

// Aggregates per-match breakdowns by key across multiple stat rows.
export function aggregateBreakdown(rows, position, system, t) {
  const accum = {};
  for (const row of rows) {
    for (const item of breakdownPoints(row, position, system, t)) {
      if (!accum[item.key]) {
        accum[item.key] = { key: item.key, label: item.label, unit: item.unit, count: item.count, points: item.points };
      } else {
        accum[item.key].points += item.points;
        if (item.count != null && accum[item.key].count != null) {
          accum[item.key].count += item.count;
        }
      }
    }
  }
  return Object.values(accum);
}

export function calculatePlayerPoints(stats, position) {
  return basePointsBreakdown(stats, position).reduce((sum, item) => sum + item.points, 0);
}

export function applyCaptainMultiplier(points) {
  return points * scoringConfig.captain_multiplier;
}

export function calculateCompositePoints(stats, position) {
  return Math.round(compositeBreakdown(stats, position).reduce((sum, item) => sum + item.points, 0) * 10) / 10;
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
