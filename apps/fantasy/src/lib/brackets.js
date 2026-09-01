function shuffle(items, rng) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Draws the H2H league-phase schedule (UCL group-stage format): `roundCount`
 * matchdays, each a perfect matching over `teamIds`, with no rival repeated
 * across the whole phase.
 *
 * Uses the circle method: fix one team, rotate the rest through n-1 seats to
 * produce all n-1 possible round-robin rounds (each internally pair-distinct
 * and, taken together, rival-distinct), then shuffles the round order and
 * takes the first `roundCount`. This is what guarantees "no repeated rival"
 * without rejection sampling.
 *
 * Returns `[[ [a,b], [a,b], … ], …]` — rounds of pairs, side (a vs b) randomised.
 */
export function generateGroupSchedule(teamIds, roundCount, rng = Math.random) {
  const n = teamIds.length;
  if (n % 2 !== 0) {
    throw new Error('generateGroupSchedule: se necesita un número par de equipos.');
  }
  if (n < 4) {
    throw new Error('generateGroupSchedule: se necesitan al menos 4 equipos.');
  }
  if (roundCount > n - 1) {
    throw new Error(`generateGroupSchedule: como máximo hay ${n - 1} jornadas posibles para ${n} equipos.`);
  }

  const shuffled = shuffle(teamIds, rng);
  const fixed = shuffled[0];
  let rotating = shuffled.slice(1);

  const allRounds = [];
  for (let r = 0; r < n - 1; r++) {
    const seats = [fixed, ...rotating];
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      const a = seats[i];
      const b = seats[n - 1 - i];
      pairs.push(rng() < 0.5 ? [a, b] : [b, a]);
    }
    allRounds.push(pairs);
    rotating = [rotating[rotating.length - 1], ...rotating.slice(0, -1)];
  }

  return shuffle(allRounds, rng).slice(0, roundCount);
}

/**
 * Generates the QF seeding for the 8-team single-elimination bracket.
 * standings: array of team objects sorted by total_points desc (rank 1..8)
 */
export function generateChampionshipBracket(standings) {
  const top8 = standings.slice(0, 8);
  return [
    { label: 'Match A', teamA: top8[0], teamB: top8[7] },
    { label: 'Match B', teamA: top8[3], teamB: top8[4] },
    { label: 'Match C', teamA: top8[1], teamB: top8[6] },
    { label: 'Match D', teamA: top8[2], teamB: top8[5] },
  ];
}

/**
 * Determine H2H winner:
 * 1. Higher matchday points
 * 2. Higher captain points
 * 3. More goals scored
 * 4. Higher league seed (lower rank number wins)
 */
export function resolveH2H(matchup) {
  const { teamA, teamB } = matchup;

  if (teamA.matchday_points !== teamB.matchday_points) {
    return teamA.matchday_points > teamB.matchday_points ? teamA : teamB;
  }
  if (teamA.captain_points !== teamB.captain_points) {
    return teamA.captain_points > teamB.captain_points ? teamA : teamB;
  }
  if (teamA.goals_scored !== teamB.goals_scored) {
    return teamA.goals_scored > teamB.goals_scored ? teamA : teamB;
  }
  return teamA.league_rank < teamB.league_rank ? teamA : teamB;
}
