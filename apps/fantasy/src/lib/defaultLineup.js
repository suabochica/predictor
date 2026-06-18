// Reserve exactly one GK in the starting XI; fill the rest with the most
// expensive outfield players; captain = most expensive starter.
export function buildDefaultLineup(squad) {
  const gks = squad
    .filter((p) => p.position === 'GK')
    .sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
  const outfield = squad
    .filter((p) => p.position !== 'GK')
    .sort((a, b) => (b.price ?? 0) - (a.price ?? 0));

  const starters = [];
  if (gks[0]) starters.push(gks[0]);
  for (const p of outfield) {
    if (starters.length >= 11) break;
    starters.push(p);
  }

  const starterIds = new Set(starters.map((p) => p.id));
  const bench = squad
    .filter((p) => !starterIds.has(p.id))
    .sort((a, b) => (b.price ?? 0) - (a.price ?? 0));

  const captain = [...starters].sort((a, b) => (b.price ?? 0) - (a.price ?? 0))[0] ?? null;
  return { starters, bench, captainId: captain?.id ?? null };
}

// If the starting XI has no GK but the bench does, promote the bench GK and
// demote the cheapest outfield starter. Operates on arrays of
// { id, position, price }. Returns new { starters, bench } arrays.
export function ensureStartingGk(starters, bench) {
  if (starters.some((p) => p.position === 'GK')) return { starters, bench };
  const benchGk = [...bench]
    .filter((p) => p.position === 'GK')
    .sort((a, b) => (b.price ?? 0) - (a.price ?? 0))[0];
  if (!benchGk) return { starters, bench }; // nothing we can do
  const demote = [...starters]
    .filter((p) => p.position !== 'GK')
    .sort((a, b) => (a.price ?? 0) - (b.price ?? 0))[0];
  return {
    starters: [...starters.filter((p) => p.id !== demote?.id), benchGk],
    bench: [...bench.filter((p) => p.id !== benchGk.id), ...(demote ? [demote] : [])],
  };
}
