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

// PostgREST returns naked `TIMESTAMP` columns (auction_state.round_started_at,
// 001:84) with no offset — "2026-09-06T20:06:16.833". `new Date()` reads that
// as LOCAL time, so at Europe/Vilnius (+03:00) it lands 10800s off, which is
// what stopped the UCL round-1 auto-bid pass from ever waiting for its 90s
// threshold. The values are UTC, so say so explicitly.
//
// Guarded so it stays correct if the column is ever widened to `timestamptz`:
// a string that already carries `Z` or a ±HH:MM offset is left alone.
export function parseDbTimestamp(value) {
  if (!value) return null;
  const s = String(value).trim().replace(' ', 'T');
  const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/.test(s);
  return new Date(hasOffset ? s : `${s}Z`);
}
