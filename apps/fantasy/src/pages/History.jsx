import { useState, useEffect } from 'react';
import { supabase } from '@predictor/supabase';
import { useTeam } from '../hooks/useTeam';
import { calculatePlayerPoints } from '../lib/scoring';
import PointsBreakdownModal from '../components/team/PointsBreakdownModal';

const POSITION_COLOR = {
  GK:  'bg-warning/15 text-warning',
  DEF: 'bg-info/15 text-info',
  MID: 'bg-tertiary/15 text-tertiary',
  FWD: 'bg-error/10 text-error',
};

export default function History() {
  const { team } = useTeam();

  const [matchdays, setMatchdays] = useState([]);
  const [standings, setStandings] = useState([]); // fantasy_standings rows
  const [loading, setLoading] = useState(true);

  // Breakdown modal state
  const [modal, setModal] = useState(null); // { matchday, teamId, teamName }
  const [breakdown, setBreakdown] = useState(null);
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [playerBreakdown, setPlayerBreakdown] = useState(null); // { player, isCaptain }

  useEffect(() => {
    async function load() {
      const [{ data: mds }, { data: st }] = await Promise.all([
        supabase.from('matchdays').select('*').order('id', { ascending: true }),
        supabase.from('fantasy_standings').select('*, teams(name)'),
      ]);
      setMatchdays(mds ?? []);
      setStandings(st ?? []);
      setLoading(false);
    }
    load();
  }, []);

  async function openBreakdown(matchday, teamId, teamName) {
    setModal({ matchday, teamId, teamName });
    setBreakdown(null);
    setBreakdownLoading(true);
    setPlayerBreakdown(null);

    // Fetch lineup for this team + matchday; fall back to pre-tournament (null) lineup
    let { data: lineupRows } = await supabase
      .from('lineups')
      .select('player_id, is_starting, is_captain, bench_order')
      .eq('team_id', teamId)
      .eq('matchday_id', matchday.id);

    if (!lineupRows?.length) {
      const { data: nullRows } = await supabase
        .from('lineups')
        .select('player_id, is_starting, is_captain, bench_order')
        .eq('team_id', teamId)
        .is('matchday_id', null);
      lineupRows = nullRows;
    }

    // Fetch player_stats for this matchday
    const { data: statsRows } = await supabase
      .from('player_stats')
      .select('player_id, minutes_played, goals, assists, clean_sheet, saves, penalty_saves, penalty_misses, yellow_cards, red_cards, own_goals, goals_conceded')
      .eq('matchday_id', matchday.id);

    // Fetch player names/positions
    const playerIds = [...new Set((lineupRows ?? []).map(r => r.player_id))];
    const { data: playerRows } = await supabase
      .from('players')
      .select('id, name, position, country_code')
      .in('id', playerIds.length > 0 ? playerIds : [-1]);

    const statsMap = Object.fromEntries((statsRows ?? []).map(s => [s.player_id, s]));
    const playerMap = Object.fromEntries((playerRows ?? []).map(p => [p.id, p]));

    if (!lineupRows?.length) {
      setBreakdown({ error: 'No se encontró alineación para esta jornada.' });
      setBreakdownLoading(false);
      return;
    }

    const starters = (lineupRows ?? [])
      .filter(r => r.is_starting)
      .map(r => ({ id: r.player_id, position: playerMap[r.player_id]?.position ?? 'FWD' }));
    const benchRows = (lineupRows ?? [])
      .filter(r => !r.is_starting)
      .sort((a, b) => (a.bench_order ?? 99) - (b.bench_order ?? 99));
    const bench = benchRows.map(r => ({ id: r.player_id, position: playerMap[r.player_id]?.position ?? 'FWD' }));
    const captainId = lineupRows.find(r => r.is_captain)?.player_id ?? null;

    // Manual subs only — score the saved starting XI directly; bench is never promoted
    const rows = [];
    let total = 0;

    for (const p of starters) {
      const player = playerMap[p.id];
      const stats  = statsMap[p.id] ?? {};
      const base   = calculatePlayerPoints(stats, p.position);
      const isCap  = p.id === captainId;
      const final  = isCap ? base * 2 : base;
      total += final;
      rows.push({ player, stats, base, final, isCap, subbedIn: false, subbedOut: false });
    }

    for (const bp of bench) {
      const player = playerMap[bp.id];
      rows.push({ player, stats: {}, base: 0, final: 0, isCap: false, subbedIn: false, subbedOut: false, onBench: true });
    }

    setBreakdown({ rows, total, captainId });
    setBreakdownLoading(false);
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="text-secondary p-6">Cargando…</div>;
  }

  // Build a lookup: matchday_id → team_id → standing row
  const standingsByMatchday = {};
  for (const s of standings) {
    if (!standingsByMatchday[s.matchday_id]) standingsByMatchday[s.matchday_id] = {};
    standingsByMatchday[s.matchday_id][s.team_id] = s;
  }

  // All unique teams across standings
  const teamsInStandings = [...new Map(standings.map(s => [s.team_id, s.teams?.name ?? `Team ${s.team_id}`])).entries()];

  const completedMatchdays = matchdays.filter(md => md.is_completed || md.is_active);

  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-2xl font-bold text-primary">Historial de jornadas</h1>

      {completedMatchdays.length === 0 ? (
        <div className="bg-surface rounded-xl p-6 text-center text-secondary">
          Aún no hay jornadas completadas.
        </div>
      ) : (
        <div className="space-y-6">
          {completedMatchdays.map(md => {
            const mdStandings = standingsByMatchday[md.id] ?? {};
            const hasScores = Object.keys(mdStandings).length > 0;

            return (
              <section key={md.id} className="bg-surface rounded-xl p-6 space-y-4">
                <div className="flex items-baseline gap-3 flex-wrap">
                  <h2 className="text-lg font-semibold text-primary">{md.name}</h2>
                  <span className="text-xs text-muted">{md.wc_stage}</span>
                  {md.is_completed ? (
                    <span className="text-label-caps font-semibold px-1.5 py-0.5 rounded bg-info/15 text-info border border-info/40">
                      Final
                    </span>
                  ) : (
                    <span className="text-label-caps font-semibold px-1.5 py-0.5 rounded bg-warning/15 text-warning border border-warning/40">
                      Provisional
                    </span>
                  )}
                </div>

                {!hasScores ? (
                  <p className="text-muted text-sm">Posiciones aún no calculadas para esta jornada.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-muted border-b border-border">
                          <th className="pb-3 pr-4 font-medium">Equipo</th>
                          <th className="pb-3 pr-4 font-medium text-right">Pts jornada</th>
                          <th className="pb-3 pr-4 font-medium text-right">Pts totales</th>
                          <th className="pb-3 font-medium text-right">Goles</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {teamsInStandings
                          .filter(([tid]) => mdStandings[tid])
                          .sort((a, b) => (mdStandings[b[0]]?.matchday_points ?? 0) - (mdStandings[a[0]]?.matchday_points ?? 0))
                          .map(([teamId, teamName]) => {
                            const s = mdStandings[teamId];
                            const isMyTeam = team?.id === teamId;
                            return (
                              <tr
                                key={teamId}
                                className={`hover:bg-surface-hover/40 ${isMyTeam ? 'bg-tertiary/5/30' : ''}`}
                              >
                                <td className={`py-2.5 pr-4 font-medium ${isMyTeam ? 'text-tertiary' : 'text-primary'}`}>
                                  {teamName}{isMyTeam && ' (tú)'}
                                </td>
                                <td className="py-2.5 pr-4 text-right">
                                  <button
                                    onClick={() => openBreakdown(md, teamId, teamName)}
                                    className="text-tertiary font-bold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
                                  >
                                    {s.matchday_points ?? 0}
                                  </button>
                                </td>
                                <td className="py-2.5 pr-4 text-right text-primary font-semibold">
                                  {s.total_points ?? 0}
                                </td>
                                <td className="py-2.5 text-right text-secondary">
                                  {s.goals_scored ?? 0}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {/* ── Points Breakdown Modal ──────────────────────────────────────── */}
      {modal && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={(e) => e.target === e.currentTarget && (setModal(null), setPlayerBreakdown(null))}
        >
          <div className="bg-surface rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
            {/* Header */}
            <div className="flex items-baseline justify-between p-6 border-b border-border">
              <div>
                <h3 className="text-lg font-semibold text-primary">{modal.teamName}</h3>
                <p className="text-xs text-secondary mt-0.5">{modal.matchday.name} — {modal.matchday.wc_stage}</p>
              </div>
              <button
                onClick={() => { setModal(null); setPlayerBreakdown(null); }}
                className="text-muted hover:text-primary text-xl transition-colors ml-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto p-6 space-y-3">
              {breakdownLoading ? (
                <p className="text-secondary text-sm">Cargando desglose…</p>
              ) : breakdown?.error ? (
                <p className="text-error text-sm" role="alert">{breakdown.error}</p>
              ) : breakdown ? (
                <>
                  {breakdown.rows.map((row, i) => (
                    <BreakdownRow
                      key={i}
                      row={row}
                      captainId={breakdown.captainId}
                      onInfoClick={(player, isCaptain) => setPlayerBreakdown({ player, isCaptain })}
                    />
                  ))}

                  <div className="border-t border-border pt-3 flex items-center justify-between">
                    <span className="text-secondary text-sm font-medium">Total</span>
                    <span className="text-tertiary text-xl font-bold">{breakdown.total} pts</span>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {playerBreakdown && modal && (
        <PointsBreakdownModal
          player={playerBreakdown.player}
          activeMatchdayId={modal.matchday.id}
          isCaptain={playerBreakdown.isCaptain}
          onClose={() => setPlayerBreakdown(null)}
        />
      )}
    </div>
  );
}

function BreakdownRow({ row, onInfoClick }) {
  const { player, stats, base, final, isCap, onBench } = row;
  const name = player?.name ?? `Player #${row.player?.id}`;
  const pos  = player?.position ?? '?';

  if (onBench) {
    return (
      <div
        className="flex items-center gap-3 py-2 opacity-40 cursor-pointer hover:opacity-60 transition-opacity rounded-lg px-1 -mx-1"
        onClick={() => player && onInfoClick?.(player, false)}
        title="Ver desglose de puntos"
      >
        <span className={`text-label-caps font-bold px-1.5 py-0.5 rounded w-8 text-center ${POSITION_COLOR[pos] ?? 'bg-surface-hover text-secondary'}`}>{pos}</span>
        <span className="flex-1 text-secondary text-sm">{name}</span>
        <span className="text-xs text-muted">Banca</span>
        <span className="w-10 text-right text-muted text-sm">—</span>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-3 py-2 cursor-pointer hover:bg-surface-hover/40 rounded-lg px-1 -mx-1 transition-colors"
      onClick={() => player && onInfoClick?.(player, isCap)}
      title="Ver desglose de puntos"
    >
      <span className={`text-label-caps font-bold px-1.5 py-0.5 rounded w-8 text-center flex-shrink-0 ${POSITION_COLOR[pos] ?? 'bg-surface-hover text-secondary'}`}>{pos}</span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-primary text-sm truncate">{name}</span>
          {isCap && <span className="text-label-caps bg-tertiary text-primary font-bold px-1.5 py-0.5 rounded">C</span>}
        </div>
        <StatLine stats={stats} />
      </div>

      <div className="text-right flex-shrink-0 w-16">
        {isCap && base !== final && (
          <span className="text-xs text-muted block">{base}×2</span>
        )}
        <span className={`text-sm font-bold ${final > 0 ? 'text-tertiary' : final < 0 ? 'text-error' : 'text-muted'}`}>
          {final > 0 ? '+' : ''}{final}
        </span>
      </div>
    </div>
  );
}

function StatLine({ stats }) {
  if (!stats || Object.keys(stats).length === 0) {
    return <span className="text-body-sm text-muted">Sin estadísticas</span>;
  }
  const parts = [];
  if (stats.minutes_played != null) parts.push(`${stats.minutes_played}'`);
  if (stats.goals)          parts.push(`${stats.goals}G`);
  if (stats.assists)        parts.push(`${stats.assists}A`);
  if (stats.clean_sheet)    parts.push('CS');
  if (stats.saves)          parts.push(`${stats.saves} atajadas`);
  if (stats.yellow_cards)   parts.push('TA');
  if (stats.red_cards)      parts.push('TR');
  if (stats.own_goals)      parts.push(`${stats.own_goals} OG`);
  return (
    <span className="text-body-sm text-muted">{parts.join(' · ') || '—'}</span>
  );
}
