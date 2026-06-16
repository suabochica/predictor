import scoringConfig from '../config/scoring.json';
import compositeScoringConfig from '../config/composite_scoring.json';

const BASE_LABELS = {
  minutes: 'Minutos jugados',
  goals: 'Goles',
  assists: 'Asistencias',
  clean_sheet: 'Portería a cero',
  saves: 'Atajadas (c/3)',
  penalty_saves: 'Penaltis atajados',
  yellow_cards: 'Tarjeta amarilla',
  red_cards: 'Tarjeta roja',
  own_goals: 'Autogol',
  penalty_misses: 'Penaltis fallados',
  goals_conceded: 'Goles en contra (c/2)',
};

const BONUS_LABELS = {
  shots_on_target: 'Tiros a portería',
  shots_off_target: 'Tiros fuera',
  blocked_shots: 'Tiros bloqueados',
  tackles: 'Entradas',
  interceptions: 'Intercepciones',
  passes: 'Pases',
  crosses: 'Centros',
  fouls_won: 'Faltas a favor',
  fouls_conceded: 'Faltas cometidas',
  offsides: 'Fuera de juego',
  penalties_won: 'Penaltis ganados',
};

// Returns { key, label, count, unit, points } per scoring rule.
// unit=null means the rule is tiered/boolean (saves÷3, GC÷2, minutes tiers, clean sheet).
// Callers should filter out zero-points items for display, but always sum the full list.
// The minutes item is always included so a "no minutes" row is visible.
export function basePointsBreakdown(stats, position) {
  const items = [];
  const mins = stats.minutes_played ?? 0;

  let minPts = 0;
  if (mins >= 60) minPts = scoringConfig.minutes['60+'];
  else if (mins >= 1) minPts = scoringConfig.minutes['1-59'];
  items.push({ key: 'minutes', label: BASE_LABELS.minutes, count: mins, unit: null, points: minPts });

  const goals = stats.goals ?? 0;
  if (goals > 0) {
    const unit = scoringConfig.goals[position];
    items.push({ key: 'goals', label: BASE_LABELS.goals, count: goals, unit, points: goals * unit });
  }

  const assists = stats.assists ?? 0;
  if (assists > 0) {
    items.push({ key: 'assists', label: BASE_LABELS.assists, count: assists, unit: scoringConfig.assists, points: assists * scoringConfig.assists });
  }

  if (stats.clean_sheet && mins >= 60) {
    const csPoints = scoringConfig.clean_sheet[position] ?? 0;
    if (csPoints > 0) {
      items.push({ key: 'clean_sheet', label: BASE_LABELS.clean_sheet, count: 1, unit: null, points: csPoints });
    }
  }

  const saves = stats.saves ?? 0;
  if (saves > 0) {
    items.push({ key: 'saves', label: BASE_LABELS.saves, count: saves, unit: null, points: Math.floor(saves / 3) * scoringConfig.saves_per_3 });
  }

  const penSaves = stats.penalty_saves ?? 0;
  if (penSaves > 0) {
    items.push({ key: 'penalty_saves', label: BASE_LABELS.penalty_saves, count: penSaves, unit: scoringConfig.penalty_save, points: penSaves * scoringConfig.penalty_save });
  }

  const yellow = stats.yellow_cards ?? 0;
  if (yellow > 0) {
    items.push({ key: 'yellow_cards', label: BASE_LABELS.yellow_cards, count: yellow, unit: scoringConfig.yellow_card, points: yellow * scoringConfig.yellow_card });
  }

  const red = stats.red_cards ?? 0;
  if (red > 0) {
    items.push({ key: 'red_cards', label: BASE_LABELS.red_cards, count: red, unit: scoringConfig.red_card, points: red * scoringConfig.red_card });
  }

  const ownGoals = stats.own_goals ?? 0;
  if (ownGoals > 0) {
    items.push({ key: 'own_goals', label: BASE_LABELS.own_goals, count: ownGoals, unit: scoringConfig.own_goal, points: ownGoals * scoringConfig.own_goal });
  }

  const penMisses = stats.penalty_misses ?? 0;
  if (penMisses > 0) {
    items.push({ key: 'penalty_misses', label: BASE_LABELS.penalty_misses, count: penMisses, unit: scoringConfig.penalty_miss, points: penMisses * scoringConfig.penalty_miss });
  }

  if (['GK', 'DEF'].includes(position)) {
    const gc = stats.goals_conceded ?? 0;
    if (gc > 0) {
      items.push({ key: 'goals_conceded', label: BASE_LABELS.goals_conceded, count: gc, unit: null, points: Math.floor(gc / 2) * scoringConfig.goals_conceded_per_2 });
    }
  }

  return items;
}

export function compositeBreakdown(stats, position) {
  const items = basePointsBreakdown(stats, position);
  for (const [col, weights] of Object.entries(compositeScoringConfig.bonuses)) {
    const count = stats[col] ?? 0;
    const unit = weights[position] ?? 0;
    items.push({ key: col, label: BONUS_LABELS[col] ?? col, count, unit, points: count * unit });
  }
  return items;
}

// Returns the canonical breakdown for display. For 'current' system, appends a
// reconciliation item if stored total_points diverges from computed base sum.
export function breakdownPoints(stats, position, system) {
  if (system === 'opta') return compositeBreakdown(stats, position);
  const items = basePointsBreakdown(stats, position);
  const computed = items.reduce((sum, item) => sum + item.points, 0);
  const stored = stats.total_points;
  if (stored != null && Math.round(stored * 10) !== Math.round(computed * 10)) {
    items.push({ key: 'stored_adjustment', label: 'Ajuste', count: null, unit: null, points: stored - computed });
  }
  return items;
}

// Aggregates per-match breakdowns by key across multiple stat rows.
export function aggregateBreakdown(rows, position, system) {
  const accum = {};
  for (const row of rows) {
    for (const item of breakdownPoints(row, position, system)) {
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
