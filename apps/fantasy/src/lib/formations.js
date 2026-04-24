import { VALID_FORMATIONS } from '../config/constants';

// Parse '4-3-3' -> { DEF: 4, MID: 3, FWD: 3 }
export function parseFormation(formation) {
  const [def, mid, fwd] = formation.split('-').map(Number);
  return { GK: 1, DEF: def, MID: mid, FWD: fwd };
}

export function isValidFormation(formation) {
  return VALID_FORMATIONS.includes(formation);
}

// Returns true if the given starters satisfy formation requirements
export function validateLineup(starters, formation) {
  const counts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const player of starters) {
    counts[player.position] = (counts[player.position] ?? 0) + 1;
  }
  const required = parseFormation(formation);
  return (
    starters.length === 11 &&
    counts.GK === required.GK &&
    counts.DEF === required.DEF &&
    counts.MID === required.MID &&
    counts.FWD === required.FWD
  );
}

// Check if swapping a bench player in maintains valid formation
export function canSubstitute(starters, benchPlayer, playerOut, formation) {
  const newStarters = starters
    .filter((p) => p.id !== playerOut.id)
    .concat(benchPlayer);
  return validateLineup(newStarters, formation);
}
