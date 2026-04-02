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
    GK: 'bg-yellow-400 text-yellow-900',
    DEF: 'bg-green-500 text-white',
    MID: 'bg-blue-500 text-white',
    FWD: 'bg-red-500 text-white',
  };
  return colors[position] ?? 'bg-gray-400 text-white';
}

export function sortByTotalPoints(teams) {
  return [...teams].sort((a, b) => {
    if (b.total_points !== a.total_points) return b.total_points - a.total_points;
    return b.goals_scored - a.goals_scored;
  });
}
