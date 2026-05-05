import { useState, useEffect } from 'react';
import { supabase } from '@predictor/supabase';
import { useTeam } from '../hooks/useTeam';
import { calculatePlayerPoints } from '../lib/scoring';
import { applyAutoSubs } from '../lib/matchday';

const POSITION_COLOR = {
  GK:  'bg-yellow-900 text-yellow-300',
  DEF: 'bg-blue-900 text-blue-300',
  MID: 'bg-emerald-900 text-emerald-300',
  FWD: 'bg-red-900 text-red-300',
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
      setBreakdown({ error: 'No lineup found for this matchday.' });
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

    const defCount = starters.filter(p => p.position === 'DEF').length;
    const midCount = starters.filter(p => p.position === 'MID').length;
    const fwdCount = starters.filter(p => p.position === 'FWD').length;
    const formation = `${defCount}-${midCount}-${fwdCount}`;

    const { starters: finalStarters, subsApplied } = applyAutoSubs(
      { starters, bench, captainId, formation },
      statsMap,
    );

    const subbedInIds  = new Set(subsApplied.map(s => s.playerIn.id));
    const subbedOutIds = new Set(subsApplied.map(s => s.playerOut.id));

    const rows = [];
    let total = 0;

    for (const p of finalStarters) {
      const player  = playerMap[p.id];
      const stats   = statsMap[p.id] ?? {};
      const base    = calculatePlayerPoints(stats, p.position);
      const isCap   = p.id === captainId;
      const final   = isCap ? base * 2 : base;
      total += final;
      rows.push({ player, stats, base, final, isCap, subbedIn: subbedInIds.has(p.id), subbedOut: false });
    }

    for (const { playerOut } of subsApplied) {
      const player = playerMap[playerOut.id];
      rows.push({ player, stats: statsMap[playerOut.id] ?? {}, base: 0, final: 0, isCap: false, subbedIn: false, subbedOut: true });
    }

    // Put bench players not involved in subs at the end
    const involvedIds = new Set([...subbedInIds, ...subbedOutIds, ...finalStarters.map(p => p.id)]);
    for (const bp of bench) {
      if (!involvedIds.has(bp.id)) {
        const player = playerMap[bp.id];
        rows.push({ player, stats: {}, base: 0, final: 0, isCap: false, subbedIn: false, subbedOut: false, onBench: true });
      }
    }

    const namedSubs = subsApplied.map((s) => ({
      playerOut: { ...s.playerOut, name: playerMap[s.playerOut.id]?.name ?? `#${s.playerOut.id}` },
      playerIn:  { ...s.playerIn,  name: playerMap[s.playerIn.id]?.name  ?? `#${s.playerIn.id}` },
    }));
    setBreakdown({ rows, total, subsApplied: namedSubs, captainId });
    setBreakdownLoading(false);
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="text-gray-400 p-6">Loading…</div>;
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
      <h1 className="text-2xl font-bold text-white">Matchday History</h1>

      {completedMatchdays.length === 0 ? (
        <div className="bg-gray-900 rounded-xl p-6 text-center text-gray-400">
          No completed matchdays yet.
        </div>
      ) : (
        <div className="space-y-6">
          {completedMatchdays.map(md => {
            const mdStandings = standingsByMatchday[md.id] ?? {};
            const hasScores = Object.keys(mdStandings).length > 0;

            return (
              <section key={md.id} className="bg-gray-900 rounded-xl p-6 space-y-4">
                <div className="flex items-baseline gap-3 flex-wrap">
                  <h2 className="text-lg font-semibold text-white">{md.name}</h2>
                  <span className="text-xs text-gray-500">{md.wc_stage}</span>
                  {md.is_active && !md.is_completed && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-900/60 text-emerald-400 border border-emerald-700/40">
                      Live
                    </span>
                  )}
                </div>

                {!hasScores ? (
                  <p className="text-gray-500 text-sm">Standings not yet calculated for this matchday.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-500 border-b border-gray-800">
                          <th className="pb-3 pr-4 font-medium">Team</th>
                          <th className="pb-3 pr-4 font-medium text-right">Matchday Pts</th>
                          <th className="pb-3 pr-4 font-medium text-right">Total Pts</th>
                          <th className="pb-3 font-medium text-right">Goals</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800">
                        {teamsInStandings
                          .filter(([tid]) => mdStandings[tid])
                          .sort((a, b) => (mdStandings[b[0]]?.matchday_points ?? 0) - (mdStandings[a[0]]?.matchday_points ?? 0))
                          .map(([teamId, teamName]) => {
                            const s = mdStandings[teamId];
                            const isMyTeam = team?.id === teamId;
                            return (
                              <tr
                                key={teamId}
                                className={`hover:bg-gray-800/40 ${isMyTeam ? 'bg-emerald-950/30' : ''}`}
                              >
                                <td className={`py-2.5 pr-4 font-medium ${isMyTeam ? 'text-emerald-400' : 'text-white'}`}>
                                  {teamName}{isMyTeam && ' (you)'}
                                </td>
                                <td className="py-2.5 pr-4 text-right">
                                  <button
                                    onClick={() => openBreakdown(md, teamId, teamName)}
                                    className="text-emerald-400 font-bold hover:underline"
                                  >
                                    {s.matchday_points ?? 0}
                                  </button>
                                </td>
                                <td className="py-2.5 pr-4 text-right text-white font-semibold">
                                  {s.total_points ?? 0}
                                </td>
                                <td className="py-2.5 text-right text-gray-400">
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
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
            {/* Header */}
            <div className="flex items-baseline justify-between p-6 border-b border-gray-800">
              <div>
                <h3 className="text-lg font-semibold text-white">{modal.teamName}</h3>
                <p className="text-xs text-gray-400 mt-0.5">{modal.matchday.name} — {modal.matchday.wc_stage}</p>
              </div>
              <button
                onClick={() => setModal(null)}
                className="text-gray-500 hover:text-white text-xl transition-colors ml-4"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto p-6 space-y-3">
              {breakdownLoading ? (
                <p className="text-gray-400 text-sm">Loading breakdown…</p>
              ) : breakdown?.error ? (
                <p className="text-red-400 text-sm">{breakdown.error}</p>
              ) : breakdown ? (
                <>
                  {breakdown.rows.map((row, i) => (
                    <BreakdownRow key={i} row={row} captainId={breakdown.captainId} />
                  ))}

                  <div className="border-t border-gray-700 pt-3 flex items-center justify-between">
                    <span className="text-gray-400 text-sm font-medium">Total</span>
                    <span className="text-emerald-400 text-xl font-bold">{breakdown.total} pts</span>
                  </div>

                  {breakdown.subsApplied.length > 0 && (
                    <div className="bg-blue-950/40 border border-blue-800/40 rounded-lg px-4 py-3 text-xs text-blue-300 space-y-1">
                      <p className="font-semibold">Auto-substitutions</p>
                      {breakdown.subsApplied.map((s, i) => (
                        <p key={i}>
                          {s.playerOut.name} → {s.playerIn.name} (didn't play)
                        </p>
                      ))}
                    </div>
                  )}
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BreakdownRow({ row }) {
  const { player, stats, base, final, isCap, subbedIn, subbedOut, onBench } = row;
  const name = player?.name ?? `Player #${row.player?.id}`;
  const pos  = player?.position ?? '?';

  if (onBench) {
    return (
      <div className="flex items-center gap-3 py-2 opacity-40">
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded w-8 text-center ${POSITION_COLOR[pos] ?? 'bg-gray-800 text-gray-400'}`}>{pos}</span>
        <span className="flex-1 text-gray-400 text-sm">{name}</span>
        <span className="text-xs text-gray-600">Bench (unused)</span>
        <span className="w-10 text-right text-gray-600 text-sm">—</span>
      </div>
    );
  }

  if (subbedOut) {
    return (
      <div className="flex items-center gap-3 py-2 opacity-50">
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded w-8 text-center ${POSITION_COLOR[pos] ?? 'bg-gray-800 text-gray-400'}`}>{pos}</span>
        <span className="flex-1 text-gray-400 text-sm line-through">{name}</span>
        <span className="text-xs text-gray-500 italic">Subbed out (0 min)</span>
        <span className="w-10 text-right text-gray-500 text-sm font-bold">0</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 py-2">
      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded w-8 text-center flex-shrink-0 ${POSITION_COLOR[pos] ?? 'bg-gray-800 text-gray-400'}`}>{pos}</span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-white text-sm truncate">{name}</span>
          {isCap && <span className="text-[10px] bg-yellow-500 text-gray-900 font-bold px-1.5 py-0.5 rounded">C</span>}
          {subbedIn && <span className="text-[10px] bg-blue-700 text-blue-100 px-1.5 py-0.5 rounded">Sub</span>}
        </div>
        <StatLine stats={stats} />
      </div>

      <div className="text-right flex-shrink-0 w-16">
        {isCap && base !== final && (
          <span className="text-xs text-gray-500 block">{base}×2</span>
        )}
        <span className={`text-sm font-bold ${final > 0 ? 'text-emerald-400' : final < 0 ? 'text-red-400' : 'text-gray-500'}`}>
          {final > 0 ? '+' : ''}{final}
        </span>
      </div>
    </div>
  );
}

function StatLine({ stats }) {
  if (!stats || Object.keys(stats).length === 0) {
    return <span className="text-[11px] text-gray-600">No stats</span>;
  }
  const parts = [];
  if (stats.minutes_played != null) parts.push(`${stats.minutes_played}'`);
  if (stats.goals)          parts.push(`${stats.goals}G`);
  if (stats.assists)        parts.push(`${stats.assists}A`);
  if (stats.clean_sheet)    parts.push('CS');
  if (stats.saves)          parts.push(`${stats.saves} saves`);
  if (stats.yellow_cards)   parts.push('YC');
  if (stats.red_cards)      parts.push('RC');
  if (stats.own_goals)      parts.push(`${stats.own_goals} OG`);
  return (
    <span className="text-[11px] text-gray-500">{parts.join(' · ') || '—'}</span>
  );
}
