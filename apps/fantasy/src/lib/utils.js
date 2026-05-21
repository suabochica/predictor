export function formatPrice(price) {
  return `${Number(price).toFixed(1)}M`;
}

export function formatPoints(pts) {
  return pts >= 0 ? `+${pts}` : `${pts}`;
}

export function classNames(...classes) {
  return classes.filter(Boolean).join(' ');
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
