export const fmtPts = (n) => (n == null ? '—' : Number(n).toFixed(1));

export function formatPrice(price) {
  return `${Number(price).toFixed(1)}M`;
}

export function formatPoints(pts) {
  return pts >= 0 ? `+${pts}` : `${pts}`;
}

export function classNames(...classes) {
  return classes.filter(Boolean).join(' ');
}

// Knockout = H2H bracket round. Reads matchdays.phase (migration 060); the old
// `wc_stage` string match called UCL's 36-team Swiss league phase "knockout"
// because the label has no "group" in it.
export function isKnockout(matchday) {
  return matchday?.phase === 'knockout';
}

export function getPositionColor(position) {
  const colors = {
    GK: 'bg-tertiary text-on-tertiary',
    DEF: 'bg-success text-on-success',
    MID: 'bg-info text-on-info',
    FWD: 'bg-error text-on-error',
  };
  return colors[position] ?? 'bg-border-strong text-primary';
}

export function sortByTotalPoints(teams) {
  return [...teams].sort((a, b) => {
    if (b.total_points !== a.total_points) return b.total_points - a.total_points;
    return b.goals_scored - a.goals_scored;
  });
}
