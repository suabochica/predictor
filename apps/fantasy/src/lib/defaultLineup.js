// Sort squad by price desc; put 2nd GK on bench; captain = most expensive starter.
export function buildDefaultLineup(squad) {
  const sorted = [...squad].sort((a, b) => b.price - a.price);
  const starters = [];
  const bench = [];
  let hasGkInXI = false;

  for (const player of sorted) {
    if (starters.length >= 11) {
      bench.push(player);
      continue;
    }
    if (player.position === 'GK') {
      if (hasGkInXI) { bench.push(player); continue; }
      hasGkInXI = true;
    }
    starters.push(player);
  }

  const captain = starters[0] ?? null;
  return { starters, bench, captainId: captain?.id ?? null };
}
