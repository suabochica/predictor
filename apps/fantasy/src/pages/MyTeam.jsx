import { useState, useEffect, useCallback } from 'react';
import { useTeam } from '../hooks/useTeam';
import { useLeague } from '../context/LeagueContext';
import { supabase } from '@predictor/supabase';
import { getPositionColor, formatPrice } from '../lib/utils';
import LineupGrid from '../components/team/LineupGrid';
import BenchList from '../components/team/BenchList';

// Flatten team_players rows into usable player objects
function normalizeSquad(teamPlayers) {
  return teamPlayers.map((tp) => ({
    id: tp.player_id,
    teamPlayerId: tp.id,
    name: tp.players?.name ?? 'Unknown',
    country: tp.players?.country ?? '',
    country_code: tp.players?.country_code ?? null,
    position: tp.players?.position ?? 'FWD',
    price: tp.players?.price ?? 0,
    is_locked: tp.is_locked,
    slot_type: tp.slot_type,
    acquisition_price: tp.acquisition_price,
  }));
}

// Build a default lineup from the squad — most expensive players fill starters first
// GK exception: 2nd GK goes to bench regardless of price
function buildDefault(squad) {
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

export default function MyTeam() {
  const { team, players, loading: teamLoading } = useTeam();
  const { activeMatchday } = useLeague();

  const [starters, setStarters] = useState([]);
  const [bench, setBench] = useState([]);
  const [captainId, setCaptainId] = useState(null);

  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [swapError, setSwapError] = useState(null);

  const [lineupLoading, setLineupLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // player_id → game_started_at (ISO string) for active matchday
  const [playerGameTimes, setPlayerGameTimes] = useState({});
  // player_id → { total_points, minutes_played } for active matchday
  const [playerMatchdayStats, setPlayerMatchdayStats] = useState({});
  // Historical: completed matchdays + per-player stats across them
  const [completedMatchdays, setCompletedMatchdays] = useState([]);
  // { [matchday_id]: { [player_id]: { total_points, minutes_played, goals, assists } } }
  const [historicalStats, setHistoricalStats] = useState({});

  const squad = normalizeSquad(players);

  // A player is rolling-locked if their game_started_at is in the past
  const now = Date.now();
  function isGameLocked(playerId) {
    const gt = playerGameTimes[playerId];
    return gt ? new Date(gt).getTime() <= now : false;
  }

  // ── Load game start times + per-player stats for active matchday ─────────
  useEffect(() => {
    if (!activeMatchday) {
      setPlayerGameTimes({});
      setPlayerMatchdayStats({});
      return;
    }
    supabase
      .from('player_stats')
      .select('player_id, game_started_at, total_points, minutes_played')
      .eq('matchday_id', activeMatchday.id)
      .then(({ data }) => {
        const times = {};
        const stats = {};
        for (const row of data ?? []) {
          if (row.game_started_at) times[row.player_id] = row.game_started_at;
          stats[row.player_id] = {
            total_points: row.total_points ?? 0,
            minutes_played: row.minutes_played ?? 0,
          };
        }
        setPlayerGameTimes(times);
        setPlayerMatchdayStats(stats);
      });
  }, [activeMatchday?.id]); // eslint-disable-line

  // ── Load historical matchday stats for current squad players ────────────
  useEffect(() => {
    if (squad.length === 0) return;
    const playerIds = squad.map(p => p.id);

    supabase
      .from('matchdays')
      .select('id, name, wc_stage')
      .eq('is_completed', true)
      .order('id', { ascending: true })
      .then(async ({ data: mds }) => {
        if (!mds?.length) return;
        setCompletedMatchdays(mds);

        const { data: stats } = await supabase
          .from('player_stats')
          .select('player_id, matchday_id, total_points, minutes_played, goals, assists')
          .in('player_id', playerIds)
          .in('matchday_id', mds.map(m => m.id));

        const byMatchday = {};
        for (const s of stats ?? []) {
          if (!byMatchday[s.matchday_id]) byMatchday[s.matchday_id] = {};
          byMatchday[s.matchday_id][s.player_id] = s;
        }
        setHistoricalStats(byMatchday);
      });
  }, [squad.length]); // eslint-disable-line

  // ── Load lineup from DB (or build default) ──────────────────────────────
  const loadLineup = useCallback(async () => {
    if (!team || squad.length === 0) return;
    setLineupLoading(true);

    const matchdayId = activeMatchday?.id ?? null;
    let query = supabase
      .from('lineups')
      .select('*')
      .eq('team_id', team.id);

    query = matchdayId
      ? query.eq('matchday_id', matchdayId)
      : query.is('matchday_id', null);

    let { data } = await query;

    // If the active matchday has no saved lineup yet, fall back to the
    // pre-tournament (null) lineup so the user sees what they actually set up
    // rather than a system-generated default.
    if ((!data || data.length === 0) && matchdayId !== null) {
      const { data: nullData } = await supabase
        .from('lineups')
        .select('*')
        .eq('team_id', team.id)
        .is('matchday_id', null);
      data = nullData;
    }

    if (data && data.length > 0) {
      const starterIds = new Set(
        data.filter((r) => r.is_starting).map((r) => r.player_id)
      );
      const benchRows = data
        .filter((r) => !r.is_starting)
        .sort((a, b) => (a.bench_order ?? 99) - (b.bench_order ?? 99));
      const captainRow = data.find((r) => r.is_captain);

      const savedStarters = squad.filter((p) => starterIds.has(p.id));
      const savedBench = benchRows
        .map((r) => squad.find((p) => p.id === r.player_id))
        .filter(Boolean);

      setStarters(savedStarters);
      setBench(savedBench);
      setCaptainId(captainRow?.player_id ?? null);
    } else {
      const defaults = buildDefault(squad);
      setStarters(defaults.starters);
      setBench(defaults.bench);
      setCaptainId(defaults.captainId);
    }

    setLineupLoading(false);
  }, [team?.id, players.length, activeMatchday?.id]); // eslint-disable-line

  useEffect(() => {
    loadLineup();
  }, [loadLineup]);

  // ── Player selection & swapping ──────────────────────────────────────────
  function handlePlayerClick(player) {
    if (!selectedPlayer) {
      setSelectedPlayer(player);
      setSwapError(null);
      return;
    }
    if (selectedPlayer.id === player.id) {
      setSelectedPlayer(null);
      return;
    }
    doSwap(selectedPlayer, player);
    setSelectedPlayer(null);
  }

  function doSwap(p1, p2) {
    if (isGameLocked(p1.id)) {
      setSwapError(`${p1.name}'s game has already started — they cannot be moved.`);
      return;
    }
    if (isGameLocked(p2.id)) {
      setSwapError(`${p2.name}'s game has already started — they cannot be moved.`);
      return;
    }
    const p1IsStarter = starters.some((s) => s.id === p1.id);
    const p2IsStarter = starters.some((s) => s.id === p2.id);

    if (p1IsStarter && p2IsStarter) {
      const newStarters = starters.map((s) =>
        s.id === p1.id ? p2 : s.id === p2.id ? p1 : s
      );
      setStarters(newStarters);
      setSwapError(null);
      return;
    }

    let newStarters, newBench;

    if (p1IsStarter && !p2IsStarter) {
      const remainingStarters = starters.filter((s) => s.id !== p1.id);
      if (p2.position === 'GK' && remainingStarters.some((s) => s.position === 'GK')) {
        setSwapError(`Can't move ${p2.name} to XI — only 1 GK allowed in starting XI.`);
        return;
      }
      if (p1.position === 'GK' && p2.position !== 'GK') {
        setSwapError(`Can't move the GK to bench — swap with a bench GK instead.`);
        return;
      }
      newStarters = remainingStarters.concat(p2);
      newBench = bench.filter((b) => b.id !== p2.id).concat(p1);
      if (captainId === p1.id) setCaptainId(null);
    } else if (!p1IsStarter && p2IsStarter) {
      const remainingStarters = starters.filter((s) => s.id !== p2.id);
      if (p1.position === 'GK' && remainingStarters.some((s) => s.position === 'GK')) {
        setSwapError(`Can't move ${p1.name} to XI — only 1 GK allowed in starting XI.`);
        return;
      }
      if (p2.position === 'GK' && p1.position !== 'GK') {
        setSwapError(`Can't move the GK to bench — swap with a bench GK instead.`);
        return;
      }
      newStarters = remainingStarters.concat(p1);
      newBench = bench.filter((b) => b.id !== p1.id).concat(p2);
      if (captainId === p2.id) setCaptainId(null);
    } else {
      // Bench ↔ Bench: swap order
      const i1 = bench.findIndex((b) => b.id === p1.id);
      const i2 = bench.findIndex((b) => b.id === p2.id);
      if (i1 < 0 || i2 < 0) return;
      const nb = [...bench];
      [nb[i1], nb[i2]] = [nb[i2], nb[i1]];
      setBench(nb);
      return;
    }

    setStarters(newStarters);
    setBench(newBench);
    setSwapError(null);
  }

  // ── Empty slot handlers ──────────────────────────────────────────────────
  function handleEmptySlotClick() {
    if (!selectedPlayer) return;
    if (isGameLocked(selectedPlayer.id)) {
      setSwapError(`${selectedPlayer.name}'s game has already started — they cannot be moved.`);
      return;
    }
    if (starters.some((s) => s.id === selectedPlayer.id)) {
      setSelectedPlayer(null);
      return;
    }
    if (selectedPlayer.position === 'GK' && starters.some((s) => s.position === 'GK')) {
      setSwapError(`Can't add ${selectedPlayer.name} to XI — only 1 GK allowed in starting XI.`);
      return;
    }
    setStarters([...starters, selectedPlayer]);
    setBench(bench.filter((b) => b.id !== selectedPlayer.id));
    setSelectedPlayer(null);
    setSwapError(null);
  }

  function handleEmptyBenchSlotClick() {
    if (!selectedPlayer) return;
    if (isGameLocked(selectedPlayer.id)) {
      setSwapError(`${selectedPlayer.name}'s game has already started — they cannot be moved.`);
      return;
    }
    if (bench.some((b) => b.id === selectedPlayer.id)) {
      setSelectedPlayer(null);
      return;
    }
    if (starters.some((s) => s.id === selectedPlayer.id)) {
      if (selectedPlayer.position === 'GK') {
        setSwapError(`Can't move the GK to bench — swap with a bench GK instead.`);
        setSelectedPlayer(null);
        return;
      }
      setStarters(starters.filter((s) => s.id !== selectedPlayer.id));
      if (captainId === selectedPlayer.id) setCaptainId(null);
    }
    setBench([...bench, selectedPlayer]);
    setSelectedPlayer(null);
    setSwapError(null);
  }

  // ── Captain selection ────────────────────────────────────────────────────
  function handleSetCaptain(player) {
    if (starters.some((s) => s.id === player.id)) {
      setCaptainId(player.id);
    }
    setSelectedPlayer(null);
  }

  // ── Bench reorder ────────────────────────────────────────────────────────
  function handleBenchReorder(fromIdx, toIdx) {
    if (toIdx < 0 || toIdx >= bench.length) return;
    const nb = [...bench];
    const [moved] = nb.splice(fromIdx, 1);
    nb.splice(toIdx, 0, moved);
    setBench(nb);
  }

  // ── Save lineup ──────────────────────────────────────────────────────────
  async function saveLineup() {
    if (!team) return;
    setSaving(true);
    setSaveError(null);

    const matchdayId = activeMatchday?.id ?? null;

    // Delete existing rows for this team+matchday
    let delQuery = supabase.from('lineups').delete().eq('team_id', team.id);
    delQuery = matchdayId
      ? delQuery.eq('matchday_id', matchdayId)
      : delQuery.is('matchday_id', null);
    await delQuery;

    const rows = [
      ...starters.map((p) => ({
        team_id: team.id,
        matchday_id: matchdayId,
        player_id: p.id,
        is_starting: true,
        is_captain: p.id === captainId,
        bench_order: null,
      })),
      ...bench.map((p, i) => ({
        team_id: team.id,
        matchday_id: matchdayId,
        player_id: p.id,
        is_starting: false,
        is_captain: false,
        bench_order: i + 1,
      })),
    ];

    const { error } = await supabase.from('lineups').insert(rows);
    setSaving(false);

    if (error) {
      setSaveError(error.message);
    } else {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }
  }

  // ── Derived state ────────────────────────────────────────────────────────
  const derivedFormation = (() => {
    const def = starters.filter((p) => p.position === 'DEF').length;
    const mid = starters.filter((p) => p.position === 'MID').length;
    const fwd = starters.filter((p) => p.position === 'FWD').length;
    return `${def}-${mid}-${fwd}`;
  })();

  const gkCount = starters.filter((p) => p.position === 'GK').length;
  const captainIsStarter = captainId !== null && starters.some((s) => s.id === captainId);
  const canSave = gkCount === 1 && captainIsStarter;
  // Captain warning: captain's game has already kicked off
  const captainGameLocked = captainId ? isGameLocked(captainId) : false;

  const selectedIsStarter =
    selectedPlayer && starters.some((s) => s.id === selectedPlayer.id);
  const selectedIsCaptain = selectedPlayer && captainId === selectedPlayer.id;

  const unassigned = squad.filter(
    (p) => !starters.some((s) => s.id === p.id) && !bench.some((b) => b.id === p.id)
  );

  // ── Render ───────────────────────────────────────────────────────────────
  if (teamLoading || lineupLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        Loading squad…
      </div>
    );
  }

  if (!team) {
    return (
      <div className="space-y-4 max-w-2xl">
        <h1 className="text-2xl font-bold text-white">My Team</h1>
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 text-center">
          <p className="text-gray-400">
            You're not enrolled in the league yet. Ask an admin to add you.
          </p>
        </div>
      </div>
    );
  }

  if (squad.length === 0) {
    return (
      <div className="space-y-4 max-w-2xl">
        <h1 className="text-2xl font-bold text-white">My Team</h1>
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 text-center">
          <p className="text-gray-300 font-medium mb-1">No players yet</p>
          <p className="text-gray-500 text-sm">
            Win players at the auction or shop on the free market to build your squad.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-2xl">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">My Team</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            {activeMatchday ? `Lineup for: ${activeMatchday.name}` : 'Pre-tournament lineup'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Budget Remaining</p>
          <p className="text-lg font-bold text-emerald-400">{formatPrice(team.budget_remaining)}</p>
          <p className="text-xs text-gray-500">{squad.length} / 15 players</p>
        </div>
      </div>

      {/* ── Formation label ── */}
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 flex items-center gap-4">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Formation</p>
          <p className="text-lg font-bold text-emerald-400 mt-0.5">
            {starters.length > 0 ? derivedFormation : '—'}
          </p>
        </div>
        <p className="text-xs text-gray-500 ml-auto">{starters.length} / 11 starters</p>
      </div>

      {/* ── Live matchday stats panel ── */}
      {activeMatchday && Object.keys(playerMatchdayStats).length > 0 && (() => {
        const livePts = starters.reduce((sum, p) => {
          const pts = playerMatchdayStats[p.id]?.total_points ?? 0;
          return sum + (p.id === captainId ? pts * 2 : pts);
        }, 0);
        const played    = starters.filter(p => (playerMatchdayStats[p.id]?.minutes_played ?? 0) > 0);
        const notPlayed = starters.filter(p => !playerMatchdayStats[p.id] || playerMatchdayStats[p.id].minutes_played === 0);
        return (
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 flex items-center gap-6 flex-wrap">
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">Live Pts</p>
              <p className="text-xl font-bold text-emerald-400">{livePts}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">Played</p>
              <p className="text-sm font-semibold text-white">{played.length} / {starters.length}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">Yet to Play</p>
              <p className={`text-sm font-semibold ${notPlayed.length > 0 ? 'text-yellow-400' : 'text-gray-500'}`}>
                {notPlayed.length}
              </p>
            </div>
            <p className="text-[10px] text-gray-500 ml-auto hidden sm:block">
              C ×2 applied · auto-subs at end
            </p>
          </div>
        );
      })()}

      {/* ── Captain warning ── */}
      {captainGameLocked && (
        <div className="bg-orange-900/30 border border-orange-700/50 rounded-xl p-3 text-sm text-orange-300">
          Your captain's game has already kicked off. If they don't play, you'll score 0 × 2 = 0 pts — captains are not auto-subbed.
        </div>
      )}

      {/* ── Rolling lockout notice ── */}
      {activeMatchday && Object.keys(playerGameTimes).length > 0 && (
        <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-3 text-xs text-gray-400">
          Rolling lockout active — players whose game has kicked off cannot be moved.
        </div>
      )}

      {/* ── Swap error ── */}
      {swapError && (
        <div className="bg-red-900/30 border border-red-700/50 rounded-xl p-3 text-sm text-red-300">
          {swapError}
        </div>
      )}

      {/* ── Pitch ── */}
      <LineupGrid
        starters={starters}
        captainId={captainId}
        selectedId={selectedPlayer?.id ?? null}
        onPlayerClick={handlePlayerClick}
        onEmptySlotClick={handleEmptySlotClick}
        hasSelected={!!selectedPlayer}
      />

      {/* ── Bench ── */}
      <BenchList
        bench={bench}
        selectedId={selectedPlayer?.id ?? null}
        onPlayerClick={handlePlayerClick}
        onReorder={handleBenchReorder}
        onEmptyBenchSlotClick={handleEmptyBenchSlotClick}
        hasSelected={!!selectedPlayer}
      />

      {/* ── Action panel (shown when a player is selected) ── */}
      {selectedPlayer && (
        <div className="bg-gray-900 border border-emerald-700 rounded-xl p-4 flex items-center gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{selectedPlayer.name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${getPositionColor(selectedPlayer.position)}`}
              >
                {selectedPlayer.position}
              </span>
              <span className="text-xs text-gray-400">{selectedPlayer.country}</span>
              <span className="text-xs text-emerald-400 font-medium">
                {formatPrice(selectedPlayer.acquisition_price)}
              </span>
              {selectedIsStarter && (
                <span className="text-[10px] text-gray-500">Starting</span>
              )}
              {!selectedIsStarter && (
                <span className="text-[10px] text-gray-500">On bench</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Captain toggle — only for starters */}
            {selectedIsStarter && (
              <button
                onClick={() => handleSetCaptain(selectedPlayer)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  selectedIsCaptain
                    ? 'bg-yellow-500 text-gray-900'
                    : 'bg-gray-700 text-yellow-400 hover:bg-yellow-900/50 border border-yellow-700/50'
                }`}
              >
                {selectedIsCaptain ? 'Captain ✓' : 'Make Captain'}
              </button>
            )}

            {/* Swap hint */}
            <span className="text-xs text-gray-500 italic">
              Click another player to swap
            </span>

            {/* Deselect */}
            <button
              onClick={() => setSelectedPlayer(null)}
              className="px-2 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ── Unassigned players (squad overflow) ── */}
      {unassigned.length > 0 && (
        <div className="bg-gray-900 border border-orange-700/50 rounded-xl p-4">
          <p className="text-xs font-semibold text-orange-400 uppercase tracking-wider mb-2">
            Not in lineup ({unassigned.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {unassigned.map((p) => (
              <button
                key={p.id}
                onClick={() => handlePlayerClick(p)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border transition-colors ${
                  selectedPlayer?.id === p.id
                    ? 'border-emerald-500 bg-emerald-900/40 text-white'
                    : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-500'
                }`}
              >
                <span
                  className={`text-[9px] font-bold px-1 py-0.5 rounded ${getPositionColor(p.position)}`}
                >
                  {p.position}
                </span>
                {p.name.split(' ').slice(-1)[0]}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-gray-500 mt-2">
            Select one of these, then click a bench/starter to swap them in.
          </p>
        </div>
      )}

      {/* ── Squad overview table ── */}
      <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-700">
          <h3 className="text-sm font-semibold text-gray-300">Full Squad</h3>
        </div>
        <div className="divide-y divide-gray-800">
          {['GK', 'DEF', 'MID', 'FWD'].map((pos) => {
            const posPlayers = squad.filter((p) => p.position === pos);
            if (posPlayers.length === 0) return null;
            return posPlayers.map((p) => {
              const isStarter = starters.some((s) => s.id === p.id);
              const benchIdx = bench.findIndex((b) => b.id === p.id);
              const isCaptain = p.id === captainId;
              const mdStats = playerMatchdayStats[p.id];
              const liveCapPts = mdStats
                ? (p.id === captainId ? mdStats.total_points * 2 : mdStats.total_points)
                : null;
              return (
                <button
                  key={p.id}
                  onClick={() => handlePlayerClick(p)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-gray-800 ${
                    selectedPlayer?.id === p.id ? 'bg-emerald-900/20' : ''
                  }`}
                >
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded w-8 text-center flex-shrink-0 ${getPositionColor(pos)}`}
                  >
                    {pos}
                  </span>
                  <span className="text-sm text-white flex-1 min-w-0 truncate">{p.name}</span>
                  <span className="text-xs text-gray-500 flex-shrink-0">{p.country_code}</span>
                  <span className="text-xs text-gray-400 flex-shrink-0 w-12 text-right">
                    {formatPrice(p.price)}
                  </span>
                  {activeMatchday && (
                    <span className={`text-xs flex-shrink-0 w-12 text-right font-semibold ${
                      liveCapPts === null
                        ? 'text-gray-700'
                        : mdStats.minutes_played > 0
                        ? 'text-emerald-400'
                        : 'text-gray-500'
                    }`}>
                      {liveCapPts === null
                        ? '—'
                        : mdStats.minutes_played > 0
                        ? `${liveCapPts > 0 ? '+' : ''}${liveCapPts} pts`
                        : '0 pts'}
                    </span>
                  )}
                  <span className="text-[10px] flex-shrink-0 w-20 text-right flex items-center justify-end gap-1">
                    {activeMatchday && (playerMatchdayStats[p.id]?.minutes_played ?? 0) > 0 && (
                      <span title="Has played — locked">🔒</span>
                    )}
                    {isCaptain ? (
                      <span className="text-yellow-400 font-semibold">Captain</span>
                    ) : isStarter ? (
                      <span className="text-emerald-400">Starting</span>
                    ) : benchIdx >= 0 ? (
                      <span className="text-blue-400">Bench {benchIdx + 1}</span>
                    ) : (
                      <span className="text-orange-400">—</span>
                    )}
                  </span>
                </button>
              );
            });
          })}
        </div>
      </div>

      {/* ── Per-matchday player history ── */}
      {completedMatchdays.length > 0 && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-700">
            <h3 className="text-sm font-semibold text-gray-300">Player History</h3>
            <p className="text-xs text-gray-500 mt-0.5">Points scored per matchday by your squad players</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-gray-800">
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-500 min-w-[140px]">Player</th>
                  {completedMatchdays.map(md => (
                    <th key={md.id} className="px-3 py-2.5 text-xs font-medium text-gray-500 text-center whitespace-nowrap">
                      {md.name.replace(/matchday\s*/i, 'MD').replace(/group stage /i, '')}
                    </th>
                  ))}
                  <th className="px-3 py-2.5 text-xs font-medium text-gray-500 text-center">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {['GK', 'DEF', 'MID', 'FWD'].flatMap(pos =>
                  squad
                    .filter(p => p.position === pos)
                    .map(p => {
                      let total = 0;
                      return (
                        <tr key={p.id} className="hover:bg-gray-800/40">
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${getPositionColor(pos)}`}>
                                {pos}
                              </span>
                              <span className="text-white text-xs truncate">{p.name}</span>
                            </div>
                          </td>
                          {completedMatchdays.map(md => {
                            const s = historicalStats[md.id]?.[p.id];
                            const pts = s?.total_points ?? null;
                            if (pts !== null) total += pts;
                            return (
                              <td key={md.id} className="px-3 py-2.5 text-center">
                                {pts === null ? (
                                  <span className="text-gray-700">—</span>
                                ) : s.minutes_played === 0 ? (
                                  <span className="text-gray-600 text-xs" title="Did not play">0</span>
                                ) : (
                                  <span className={`font-semibold text-xs ${pts > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {pts}
                                  </span>
                                )}
                              </td>
                            );
                          })}
                          <td className="px-3 py-2.5 text-center">
                            <span className={`font-bold text-xs ${total > 0 ? 'text-white' : 'text-gray-600'}`}>
                              {total > 0 ? total : '—'}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                )}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-2 text-[10px] text-gray-600 border-t border-gray-800">
            Points shown are base player points — captain ×2 is applied at team level during scoring.
            "—" means no stats uploaded for that matchday for this player.
          </p>
        </div>
      )}

      {/* ── Save button ── */}
      <div className="flex items-center gap-4 flex-wrap">
        <button
          onClick={saveLineup}
          disabled={saving || !canSave}
          className="px-6 py-2.5 rounded-xl font-semibold text-sm transition-colors bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : 'Save Lineup'}
        </button>

        {!canSave && !saving && (
          <p className="text-xs text-gray-500">
            {gkCount !== 1 && 'Need exactly 1 GK in starting XI. '}
            {!captainIsStarter && 'Select a captain from your starters. '}
          </p>
        )}

        {saveError && (
          <p className="text-xs text-red-400">{saveError}</p>
        )}

        {saveSuccess && (
          <p className="text-xs text-emerald-400 font-medium">Lineup saved!</p>
        )}
      </div>
    </div>
  );
}
