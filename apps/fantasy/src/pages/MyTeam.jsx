import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTeam } from '../hooks/useTeam';
import { useLeague } from '../context/LeagueContext';
import { supabase } from '@predictor/supabase';
import { getPositionColor, formatPrice } from '../lib/utils';
import { MAX_LOCKED_PLAYERS, LOCK_PRICE_THRESHOLD } from '../config/constants';
import { lockPlayer, unlockPlayer } from '../lib/lockActions';
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
  const { team, players, loading: teamLoading, refresh: refreshSquad } = useTeam();
  const { activeMatchday, refreshTeam } = useLeague();

  const [starters, setStarters] = useState([]);
  const [bench, setBench] = useState([]);
  const [captainId, setCaptainId] = useState(null);

  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [swapError, setSwapError] = useState(null);

  const [lineupLoading, setLineupLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Lock/Unlock flow state
  const [lockModalPlayer, setLockModalPlayer] = useState(null); // free/lockable player awaiting lock decision
  const [unlockConfirmPlayer, setUnlockConfirmPlayer] = useState(null); // locked player awaiting unlock confirm
  const [swapTarget, setSwapTarget] = useState(null); // locked row to swap out when at MAX
  const [locking, setLocking] = useState(false);
  const [lockToast, setLockToast] = useState(null); // { type: 'success'|'info'|'error', message }
  const [nudgeDismissed, setNudgeDismissed] = useState(false);

  // player_id → game_started_at (ISO string) for active matchday
  const [playerGameTimes, setPlayerGameTimes] = useState({});
  // player_id → { total_points, minutes_played } for active matchday
  const [playerMatchdayStats, setPlayerMatchdayStats] = useState({});
  // Historical: completed matchdays + per-player stats across them
  const [completedMatchdays, setCompletedMatchdays] = useState([]);
  // { [matchday_id]: { [player_id]: { total_points, minutes_played, goals, assists } } }
  const [historicalStats, setHistoricalStats] = useState({});

  const squad = normalizeSquad(players);

  // Lock-related derived values (uses raw team_players rows for the swap picker)
  const lockedSquadRows = useMemo(
    () => players.filter((tp) => tp.slot_type === 'locked'),
    [players]
  );
  const lockedCount = lockedSquadRows.length;
  const atMaxLocked = lockedCount >= MAX_LOCKED_PLAYERS;
  const showNudge = !nudgeDismissed && squad.length > 0 && lockedCount < 8;

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

  // ── Lock toast auto-clear ─────────────────────────────────────────────────
  useEffect(() => {
    if (!lockToast) return;
    const id = setTimeout(() => setLockToast(null), 5000);
    return () => clearTimeout(id);
  }, [lockToast]);

  // ── Realtime: refresh squad when team_players changes (others locking free players) ──
  useEffect(() => {
    if (!team) return;
    const channel = supabase
      .channel('myteam-team-players-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_players' }, () => {
        refreshSquad();
        refreshTeam();
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [team?.id]); // eslint-disable-line

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

  // ── Lock / Unlock handlers ────────────────────────────────────────────────
  async function handleLockConfirm() {
    if (!lockModalPlayer || !team) return;
    setLocking(true);
    try {
      const result = await lockPlayer(
        team.id,
        lockModalPlayer.id,
        swapTarget?.player_id ?? null
      );
      if (result.success) {
        await refreshSquad();
        await refreshTeam();
        setLockToast({ type: 'success', message: `${lockModalPlayer.name} locked.` });
        setLockModalPlayer(null);
        setSwapTarget(null);
      } else if (result.reason === 'already_locked') {
        setLockToast({
          type: 'info',
          message: `Another team locked ${lockModalPlayer.name} first — you still hold them as free.`,
        });
        setLockModalPlayer(null);
        setSwapTarget(null);
      } else if (result.reason === 'max_locked_no_unlock') {
        setLockToast({ type: 'error', message: 'Pick a player to unlock first.' });
      }
    } catch (err) {
      setLockToast({ type: 'error', message: err.message });
    }
    setLocking(false);
  }

  async function handleUnlockConfirm() {
    if (!unlockConfirmPlayer || !team) return;
    setLocking(true);
    try {
      await unlockPlayer(team.id, unlockConfirmPlayer.id);
      await refreshSquad();
      await refreshTeam();
      setLockToast({ type: 'success', message: `${unlockConfirmPlayer.name} unlocked — now free.` });
    } catch (err) {
      setLockToast({ type: 'error', message: err.message });
    }
    setUnlockConfirmPlayer(null);
    setLocking(false);
  }

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
      <div className="flex items-center justify-center py-20 text-secondary">
        Loading squad…
      </div>
    );
  }

  if (!team) {
    return (
      <div className="space-y-4 max-w-2xl">
        <h1 className="text-2xl font-bold text-primary">My Team</h1>
        <div className="bg-surface border border-border rounded-xl p-6 text-center">
          <p className="text-secondary">
            You're not enrolled in the league yet. Ask an admin to add you.
          </p>
        </div>
      </div>
    );
  }

  if (squad.length === 0) {
    return (
      <div className="space-y-4 max-w-2xl">
        <h1 className="text-2xl font-bold text-primary">My Team</h1>
        <div className="bg-surface border border-border rounded-xl p-6 text-center">
          <p className="text-secondary font-medium mb-1">No players yet</p>
          <p className="text-muted text-sm">
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
          <h1 className="text-2xl font-bold text-primary">My Team</h1>
          <p className="text-secondary text-sm mt-0.5">
            {activeMatchday ? `Lineup for: ${activeMatchday.name}` : 'Pre-tournament lineup'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted uppercase tracking-wider">Budget Remaining</p>
          <p className="text-lg font-bold text-tertiary">{formatPrice(team.budget_remaining)}</p>
          <p className="text-xs text-muted">{squad.length} / 15 players</p>
        </div>
      </div>

      {/* ── Formation label ── */}
      <div className="bg-surface border border-border rounded-xl p-4 flex items-center gap-4">
        <div>
          <p className="text-xs font-semibold text-secondary uppercase tracking-wider">Formation</p>
          <p className="text-lg font-bold text-tertiary mt-0.5">
            {starters.length > 0 ? derivedFormation : '—'}
          </p>
        </div>
        <p className="text-xs text-muted ml-auto">{starters.length} / 11 starters</p>
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
          <div className="bg-surface border border-border rounded-xl p-4 flex items-center gap-6 flex-wrap">
            <div>
              <p className="text-label-caps text-muted uppercase tracking-wider">Live Pts</p>
              <p className="text-xl font-bold text-tertiary">{livePts}</p>
            </div>
            <div>
              <p className="text-label-caps text-muted uppercase tracking-wider">Played</p>
              <p className="text-sm font-semibold text-primary">{played.length} / {starters.length}</p>
            </div>
            <div>
              <p className="text-label-caps text-muted uppercase tracking-wider">Yet to Play</p>
              <p className={`text-sm font-semibold ${notPlayed.length > 0 ? 'text-tertiary' : 'text-muted'}`}>
                {notPlayed.length}
              </p>
            </div>
            <p className="text-label-caps text-muted ml-auto hidden sm:block">
              C ×2 applied · auto-subs at end
            </p>
          </div>
        );
      })()}

      {/* ── Captain warning ── */}
      {captainGameLocked && (
        <div className="bg-warning/10 border border-warning/30 rounded-xl p-3 text-sm text-warning" role="alert">
          Your captain's game has already kicked off. If they don't play, you'll score 0 × 2 = 0 pts — captains are not auto-subbed.
        </div>
      )}

      {/* ── Rolling lockout notice ── */}
      {activeMatchday && Object.keys(playerGameTimes).length > 0 && (
        <div className="bg-surface-hover/60 border border-border rounded-xl p-3 text-xs text-secondary" role="alert">
          Rolling lockout active — players whose game has kicked off cannot be moved.
        </div>
      )}

      {/* ── Soft nudge: fewer than 8 locked players ── */}
      {showNudge && (
        <div className="bg-info/10 border border-info/30 rounded-xl p-3 text-sm text-info flex items-center justify-between gap-3">
          <span>
            You have <strong>{lockedCount}</strong> locked player{lockedCount !== 1 ? 's' : ''} — consider locking more to protect them from being claimed by other teams.
          </span>
          <button
            onClick={() => setNudgeDismissed(true)}
            className="flex-shrink-0 text-info hover:text-primary text-xs px-2 py-1 rounded hover:bg-info/15 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── Lock result toast ── */}
      {lockToast && !lockModalPlayer && !unlockConfirmPlayer && (
        <div
          className={`rounded-xl p-3 text-sm flex items-center gap-2 border ${
            lockToast.type === 'success'
              ? 'bg-info/10 border-info/30 text-info'
              : lockToast.type === 'info'
              ? 'bg-surface-hover/60 border-border-strong/50 text-secondary'
              : 'bg-error/10/40 border-error/30/50 text-error'
          }`}
        >
          <span>{lockToast.message}</span>
        </div>
      )}

      {/* ── Swap error ── */}
      {swapError && (
        <div className="bg-error/10/30 border border-error/30/50 rounded-xl p-3 text-sm text-error" role="alert">
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
        <div className="bg-surface border border-tertiary/40 rounded-xl p-4 flex items-center gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-primary truncate">{selectedPlayer.name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span
                className={`text-label-caps font-bold px-1.5 py-0.5 rounded ${getPositionColor(selectedPlayer.position)}`}
              >
                {selectedPlayer.position}
              </span>
              <span className="text-xs text-secondary">{selectedPlayer.country}</span>
              <span className="text-xs text-tertiary font-medium">
                {formatPrice(selectedPlayer.acquisition_price)}
              </span>
              {selectedIsStarter && (
                <span className="text-label-caps text-muted">Starting</span>
              )}
              {!selectedIsStarter && (
                <span className="text-label-caps text-muted">On bench</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Captain toggle — only for starters */}
            {selectedIsStarter && (
              <button
                onClick={() => handleSetCaptain(selectedPlayer)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2 ${
                  selectedIsCaptain
                    ? 'bg-tertiary text-primary'
                    : 'bg-border text-tertiary hover:bg-warning/15 border border-warning/30'
                }`}
              >
                {selectedIsCaptain ? 'Captain ✓' : 'Make Captain'}
              </button>
            )}

            {/* Swap hint */}
            <span className="text-xs text-muted italic">
              Click another player to swap
            </span>

            {/* Deselect */}
            <button
              onClick={() => setSelectedPlayer(null)}
              className="px-2 py-1.5 rounded-lg text-xs text-secondary hover:text-primary hover:bg-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
              aria-label="Deselect player"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ── Unassigned players (squad overflow) ── */}
      {unassigned.length > 0 && (
        <div className="bg-surface border border-warning/30 rounded-xl p-4">
          <p className="text-xs font-semibold text-warning uppercase tracking-wider mb-2">
            Not in lineup ({unassigned.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {unassigned.map((p) => (
              <button
                key={p.id}
                onClick={() => handlePlayerClick(p)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2 ${
                  selectedPlayer?.id === p.id
                    ? 'border-tertiary bg-tertiary/10 text-primary'
                    : 'border-border bg-surface-hover text-secondary hover:border-border-strong'
                }`}
              >
                <span
                  className={`text-label-caps font-bold px-1 py-0.5 rounded ${getPositionColor(p.position)}`}
                >
                  {p.position}
                </span>
                {p.name.split(' ').slice(-1)[0]}
              </button>
            ))}
          </div>
          <p className="text-body-sm text-muted mt-2">
            Select one of these, then click a bench/starter to swap them in.
          </p>
        </div>
      )}

      {/* ── Squad overview table ── */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-secondary">Full Squad</h3>
          <span className="text-xs text-muted">{lockedCount} / {MAX_LOCKED_PLAYERS} locked</span>
        </div>
        <div className="divide-y divide-border">
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
              const isLockable = p.price >= LOCK_PRICE_THRESHOLD;
              return (
                <div
                  key={p.id}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-hover cursor-pointer ${
                    selectedPlayer?.id === p.id ? 'bg-tertiary/5' : ''
                  }`}
                  onClick={() => handlePlayerClick(p)}
                >
                  <span
                    className={`text-label-caps font-bold px-1.5 py-0.5 rounded w-8 text-center flex-shrink-0 ${getPositionColor(pos)}`}
                  >
                    {pos}
                  </span>
                  <span className="text-sm text-primary flex-1 min-w-0 truncate">{p.name}</span>
                  <span className="text-xs text-muted flex-shrink-0">{p.country_code}</span>
                  <span className="text-xs text-secondary flex-shrink-0 w-12 text-right">
                    {formatPrice(p.price)}
                  </span>
                  {activeMatchday && (
                    <span className={`text-xs flex-shrink-0 w-12 text-right font-semibold ${
                      liveCapPts === null
                        ? 'text-secondary'
                        : mdStats.minutes_played > 0
                        ? 'text-tertiary'
                        : 'text-muted'
                    }`}>
                      {liveCapPts === null
                        ? '—'
                        : mdStats.minutes_played > 0
                        ? `${liveCapPts > 0 ? '+' : ''}${liveCapPts} pts`
                        : '0 pts'}
                    </span>
                  )}
                  <span className="text-label-caps flex-shrink-0 w-16 text-right flex items-center justify-end gap-1">
                    {activeMatchday && (playerMatchdayStats[p.id]?.minutes_played ?? 0) > 0 && (
                      <span title="Has played — locked">🔒</span>
                    )}
                    {isCaptain ? (
                      <span className="text-tertiary font-semibold">Captain</span>
                    ) : isStarter ? (
                      <span className="text-tertiary">Starting</span>
                    ) : benchIdx >= 0 ? (
                      <span className="text-info">Bench {benchIdx + 1}</span>
                    ) : (
                      <span className="text-warning">—</span>
                    )}
                  </span>
                  {/* Lock / Unlock button */}
                  <span className="flex-shrink-0 w-16 flex justify-end" onClick={(e) => e.stopPropagation()}>
                    {p.slot_type === 'locked' ? (
                      <button
                        onClick={() => setUnlockConfirmPlayer(p)}
                        className="text-label-caps px-2 py-1 rounded bg-info/10 border border-info/30 text-info hover:bg-info/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
                      >
                        Unlock
                      </button>
                    ) : isLockable ? (
                      <button
                        onClick={() => setLockModalPlayer(p)}
                        className="text-label-caps px-2 py-1 rounded bg-border border border-border-strong text-secondary hover:bg-border-strong transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
                      >
                        Lock
                      </button>
                    ) : null}
                  </span>
                </div>
              );
            });
          })}
        </div>
      </div>

      {/* ── Per-matchday player history ── */}
      {completedMatchdays.length > 0 && (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold text-secondary">Player History</h3>
            <p className="text-xs text-muted mt-0.5">Points scored per matchday by your squad players</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-border">
                  <th className="px-4 py-2.5 text-xs font-medium text-muted min-w-[140px]">Player</th>
                  {completedMatchdays.map(md => (
                    <th key={md.id} className="px-3 py-2.5 text-xs font-medium text-muted text-center whitespace-nowrap">
                      {md.name.replace(/matchday\s*/i, 'MD').replace(/group stage /i, '')}
                    </th>
                  ))}
                  <th className="px-3 py-2.5 text-xs font-medium text-muted text-center">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {['GK', 'DEF', 'MID', 'FWD'].flatMap(pos =>
                  squad
                    .filter(p => p.position === pos)
                    .map(p => {
                      let total = 0;
                      return (
                        <tr key={p.id} className="hover:bg-surface-hover/40">
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`text-label-caps font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${getPositionColor(pos)}`}>
                                {pos}
                              </span>
                              <span className="text-primary text-xs truncate">{p.name}</span>
                            </div>
                          </td>
                          {completedMatchdays.map(md => {
                            const s = historicalStats[md.id]?.[p.id];
                            const pts = s?.total_points ?? null;
                            if (pts !== null) total += pts;
                            return (
                              <td key={md.id} className="px-3 py-2.5 text-center">
                                {pts === null ? (
                                  <span className="text-secondary">—</span>
                                ) : s.minutes_played === 0 ? (
                                  <span className="text-muted text-xs" title="Did not play">0</span>
                                ) : (
                                  <span className={`font-semibold text-xs ${pts > 0 ? 'text-tertiary' : 'text-error'}`}>
                                    {pts}
                                  </span>
                                )}
                              </td>
                            );
                          })}
                          <td className="px-3 py-2.5 text-center">
                            <span className={`font-bold text-xs ${total > 0 ? 'text-primary' : 'text-muted'}`}>
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
          <p className="px-4 py-2 text-label-caps text-muted border-t border-border">
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
          className="px-6 py-2.5 rounded-xl font-semibold text-sm transition-colors bg-tertiary hover:bg-tertiary text-primary disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
        >
          {saving ? 'Saving…' : 'Save Lineup'}
        </button>

        {!canSave && !saving && (
          <p className="text-xs text-muted">
            {gkCount !== 1 && 'Need exactly 1 GK in starting XI. '}
            {!captainIsStarter && 'Select a captain from your starters. '}
          </p>
        )}

        {saveError && (
          <p className="text-xs text-error" role="alert">{saveError}</p>
        )}

        {saveSuccess && (
          <p className="text-xs text-tertiary font-medium" role="status">Lineup saved!</p>
        )}
      </div>

      {/* ── Lock decision modal ── */}
      {lockModalPlayer && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={(e) => e.target === e.currentTarget && (setLockModalPlayer(null), setSwapTarget(null))}
        >
          <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-2xl">
            <div>
              <h2 className="text-lg font-bold text-primary">Lock this player?</h2>
              <p className="text-sm text-secondary mt-1">
                Locking <strong className="text-primary">{lockModalPlayer.name}</strong> claims
                them exclusively — other teams holding them as free will be refunded and lose
                access. You can unlock at any time.
              </p>
            </div>

            {atMaxLocked && (
              <div className="space-y-2">
                <p className="text-xs text-tertiary font-medium">
                  You have {MAX_LOCKED_PLAYERS} locked players (max). Choose one to unlock:
                </p>
                <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                  {lockedSquadRows.map((tp) => (
                    <button
                      key={tp.player_id}
                      onClick={() =>
                        setSwapTarget(swapTarget?.player_id === tp.player_id ? null : tp)
                      }
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                        swapTarget?.player_id === tp.player_id
                          ? 'bg-warning/15 border border-warning/40 text-primary'
                          : 'bg-surface-hover text-secondary hover:bg-border'
                      }`}
                    >
                      <span
                        className={`text-xs font-bold mr-2 px-1.5 py-0.5 rounded ${getPositionColor(tp.players?.position)}`}
                      >
                        {tp.players?.position}
                      </span>
                      {tp.players?.name}
                      <span className="text-muted ml-1.5 text-xs">
                        {formatPrice(tp.players?.current_price ?? tp.players?.price)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {lockToast?.type === 'error' && (
              <p className="text-xs text-error" role="alert">{lockToast.message}</p>
            )}

            {/* Gate message — explains why Lock button is disabled */}
            {atMaxLocked && !swapTarget && (
              <p className="text-xs text-warning">At max locks — pick one to unlock first.</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setLockModalPlayer(null); setSwapTarget(null); }}
                disabled={locking}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-surface-hover text-secondary hover:bg-border transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
              >
                Cancel
              </button>
              <button
                onClick={handleLockConfirm}
                disabled={locking || (atMaxLocked && !swapTarget)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-info hover:brightness-90 text-primary transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
              >
                {locking ? 'Locking…' : atMaxLocked ? 'Lock (swap)' : 'Lock'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Unlock confirm modal ── */}
      {unlockConfirmPlayer && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={(e) => e.target === e.currentTarget && setUnlockConfirmPlayer(null)}
        >
          <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-2xl">
            <div>
              <h2 className="text-lg font-bold text-primary">Unlock this player?</h2>
              <p className="text-sm text-secondary mt-1">
                <strong className="text-primary">{unlockConfirmPlayer.name}</strong> will stay in
                your squad as a free player and become available for others to lock.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setUnlockConfirmPlayer(null)}
                disabled={locking}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-surface-hover text-secondary hover:bg-border transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
              >
                Cancel
              </button>
              <button
                onClick={handleUnlockConfirm}
                disabled={locking}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-warning hover:bg-warning text-primary transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
              >
                {locking ? 'Unlocking…' : 'Unlock'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
