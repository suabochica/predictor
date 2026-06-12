import { useState, useEffect, useCallback } from 'react';
import { useTeam } from '../hooks/useTeam';
import { useLeague } from '../context/LeagueContext';
import { useMatchdayLocks } from '../hooks/useMatchdayLocks';
import { supabase } from '@predictor/supabase';
import { getPositionColor, formatPrice, fmtPts } from '../lib/utils';
import { statColumns } from '../lib/statColumns';
import { usePlayerTotals } from '../hooks/usePlayerTotals';
import { buildDefaultLineup } from '../lib/defaultLineup';
import { getActivePoints } from '../lib/scoring.js';
import LineupGrid from '../components/team/LineupGrid';
import BenchList from '../components/team/BenchList';

// Flatten team_players rows into usable player objects
function normalizeSquad(teamPlayers) {
  return teamPlayers.map((tp) => ({
    id: tp.player_id,
    teamPlayerId: tp.id,
    name: tp.players?.name ?? 'Desconocido',
    country: tp.players?.country ?? '',
    country_code: tp.players?.country_code ?? null,
    position: tp.players?.position ?? 'FWD',
    price: tp.players?.current_price ?? tp.players?.price ?? 0,
    acquisition_price: tp.acquisition_price,
  }));
}


export default function MyTeam() {
  const { team, players, loading: teamLoading, refresh: refreshSquad } = useTeam();
  const { totals: totalsById } = usePlayerTotals();
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

  // Matchday selector: which matchday the user is currently editing
  const [selectedMatchday, setSelectedMatchday] = useState(null);
  const [allMatchdays, setAllMatchdays] = useState([]);

  const [scoringSystem, setScoringSystem] = useState('opta');

  // Live stats for the active matchday (display only, not used for locking)
  const [playerMatchdayStats, setPlayerMatchdayStats] = useState({});
  // Historical: completed matchdays + per-player stats across them
  const [completedMatchdays, setCompletedMatchdays] = useState([]);
  const [historicalStats, setHistoricalStats] = useState({});

  const squad = normalizeSquad(players);

  // Per-country kickoff times for the selected matchday — drives player locks
  const { lockTimeFor, kickoffByCode } = useMatchdayLocks(selectedMatchday?.id ?? null);

  // Ticks every 30s so isGameLocked re-evaluates as matches kick off
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Lock = kickoff time (from polla matches) minus 10 min lead
  function isGameLocked(player) {
    const lockMs = lockTimeFor(player.country_code);
    return lockMs !== null ? now >= lockMs : false;
  }

  // ── Load matchdays for selector — time-driven: active matchday and forward ─
  useEffect(() => {
    supabase
      .from('matchdays')
      .select('id, name, wc_stage, is_active, is_completed')
      .order('id', { ascending: true })
      .then(({ data }) => {
        const all = data ?? [];
        // Show active matchday onwards — play-clock driven, not is_completed-driven
        const fromActive = activeMatchday
          ? all.filter(md => md.id >= activeMatchday.id && !md.is_completed)
          : all.filter(md => !md.is_completed);
        setAllMatchdays(fromActive);
      });
  }, [activeMatchday?.id]); // eslint-disable-line

  // ── Initialize selectedMatchday to the active matchday once it loads ───
  useEffect(() => {
    if (activeMatchday && !selectedMatchday) {
      setSelectedMatchday(activeMatchday);
    }
  }, [activeMatchday?.id]); // eslint-disable-line

  // ── Fetch active scoring system ──────────────────────────────────────────
  useEffect(() => {
    supabase
      .from('auction_state')
      .select('scoring_system')
      .single()
      .then(({ data }) => setScoringSystem(data?.scoring_system ?? 'opta'));
  }, []);

  // ── Load live stats for the active matchday (display only) ─────────────
  useEffect(() => {
    if (!activeMatchday) { setPlayerMatchdayStats({}); return; }
    supabase
      .from('player_stats')
      .select('*')
      .eq('matchday_id', activeMatchday.id)
      .then(({ data }) => {
        const stats = {};
        for (const row of data ?? []) {
          stats[row.player_id] = row;
        }
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
          .select('*')
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

  // ── Realtime: refresh squad when team_players changes ───────────────────
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

  // ── Load lineup from DB, seeding from most recent saved if none exists ──
  const loadLineup = useCallback(async () => {
    if (!team || squad.length === 0) return;
    setLineupLoading(true);

    const matchdayId = selectedMatchday?.id ?? null;
    let query = supabase.from('lineups').select('*').eq('team_id', team.id);
    query = matchdayId !== null
      ? query.eq('matchday_id', matchdayId)
      : query.is('matchday_id', null);
    let { data } = await query;

    // Seed from most recent saved lineup if none found for this matchday
    if ((!data || data.length === 0) && matchdayId !== null) {
      const { data: recentCheck } = await supabase
        .from('lineups')
        .select('matchday_id')
        .eq('team_id', team.id)
        .not('matchday_id', 'is', null)
        .order('matchday_id', { ascending: false })
        .limit(1);

      if (recentCheck && recentCheck.length > 0) {
        const recentId = recentCheck[0].matchday_id;
        const { data: recentRows } = await supabase
          .from('lineups')
          .select('*')
          .eq('team_id', team.id)
          .eq('matchday_id', recentId);
        data = recentRows;
      } else {
        // Fall back to null default
        const { data: nullData } = await supabase
          .from('lineups')
          .select('*')
          .eq('team_id', team.id)
          .is('matchday_id', null);
        data = nullData;
      }
    }

    if (data && data.length > 0) {
      const starterIds = new Set(
        data.filter((r) => r.is_starting).map((r) => r.player_id)
      );
      const benchRows = data
        .filter((r) => !r.is_starting)
        .sort((a, b) => (a.bench_order ?? 99) - (b.bench_order ?? 99));
      const captainRow = data.find((r) => r.is_captain);

      // Re-validate against current squad (handles post-transfer seeding)
      const savedStarters = squad.filter((p) => starterIds.has(p.id));
      const savedBench = benchRows
        .map((r) => squad.find((p) => p.id === r.player_id))
        .filter(Boolean);

      setStarters(savedStarters);
      setBench(savedBench);
      setCaptainId(captainRow?.player_id ?? null);
    } else {
      const defaults = buildDefaultLineup(squad);
      setStarters(defaults.starters);
      setBench(defaults.bench);
      setCaptainId(defaults.captainId);
    }

    setLineupLoading(false);
  }, [team?.id, players.length, selectedMatchday?.id]); // eslint-disable-line

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
    // Invariant: a locked player may never ENTER the XI; any player may LEAVE the XI.
    const p1IsStarter = starters.some((s) => s.id === p1.id);
    const p2IsStarter = starters.some((s) => s.id === p2.id);

    if (p1IsStarter && p2IsStarter) {
      // Starter ↔ Starter: no one enters/leaves the XI — no lock check needed
      const newStarters = starters.map((s) =>
        s.id === p1.id ? p2 : s.id === p2.id ? p1 : s
      );
      setStarters(newStarters);
      setSwapError(null);
      return;
    }

    let newStarters, newBench;

    if (p1IsStarter && !p2IsStarter) {
      // p2 (bench) enters the XI — block if locked
      if (isGameLocked(p2)) {
        setSwapError(`El partido de ${p2.name} ya inició — no puede entrar al XI.`);
        return;
      }
      const remainingStarters = starters.filter((s) => s.id !== p1.id);
      if (p2.position === 'GK' && remainingStarters.some((s) => s.position === 'GK')) {
        setSwapError(`No se puede mover a ${p2.name} al XI — solo 1 POR permitido en el XI titular.`);
        return;
      }
      if (p1.position === 'GK' && p2.position !== 'GK') {
        setSwapError(`No se puede mover al POR a la banca — intercambia con un POR de la banca.`);
        return;
      }
      newStarters = remainingStarters.concat(p2);
      newBench = bench.filter((b) => b.id !== p2.id).concat(p1);
      if (captainId === p1.id) setCaptainId(null);
    } else if (!p1IsStarter && p2IsStarter) {
      // p1 (bench) enters the XI — block if locked
      if (isGameLocked(p1)) {
        setSwapError(`El partido de ${p1.name} ya inició — no puede entrar al XI.`);
        return;
      }
      const remainingStarters = starters.filter((s) => s.id !== p2.id);
      if (p1.position === 'GK' && remainingStarters.some((s) => s.position === 'GK')) {
        setSwapError(`No se puede mover a ${p1.name} al XI — solo 1 POR permitido en el XI titular.`);
        return;
      }
      if (p2.position === 'GK' && p1.position !== 'GK') {
        setSwapError(`No se puede mover al POR a la banca — intercambia con un POR de la banca.`);
        return;
      }
      newStarters = remainingStarters.concat(p1);
      newBench = bench.filter((b) => b.id !== p1.id).concat(p2);
      if (captainId === p2.id) setCaptainId(null);
    } else {
      // Bench ↔ Bench: swap order — no lock check needed
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
    if (isGameLocked(selectedPlayer)) {
      setSwapError(`El partido de ${selectedPlayer.name} ya inició — no se puede mover.`);
      return;
    }
    if (starters.some((s) => s.id === selectedPlayer.id)) {
      setSelectedPlayer(null);
      return;
    }
    if (selectedPlayer.position === 'GK' && starters.some((s) => s.position === 'GK')) {
      setSwapError(`No se puede agregar a ${selectedPlayer.name} al XI — solo 1 POR permitido en el XI titular.`);
      return;
    }
    setStarters([...starters, selectedPlayer]);
    setBench(bench.filter((b) => b.id !== selectedPlayer.id));
    setSelectedPlayer(null);
    setSwapError(null);
  }

  function handleEmptyBenchSlotClick() {
    if (!selectedPlayer) return;
    if (bench.some((b) => b.id === selectedPlayer.id)) {
      setSelectedPlayer(null);
      return;
    }
    if (starters.some((s) => s.id === selectedPlayer.id)) {
      // Leaving the XI is always allowed — even if the player is locked
      if (selectedPlayer.position === 'GK') {
        setSwapError(`No se puede mover al POR a la banca — intercambia con un POR de la banca.`);
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

    const matchdayId = selectedMatchday?.id ?? null;

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
  const canSave = starters.length === 11 && gkCount === 1 && captainIsStarter;

  const captainPlayer = captainId ? starters.find((s) => s.id === captainId) ?? null : null;
  const captainGameLocked = captainPlayer ? isGameLocked(captainPlayer) : false;

  const selectedIsStarter =
    selectedPlayer && starters.some((s) => s.id === selectedPlayer.id);
  const selectedIsCaptain = selectedPlayer && captainId === selectedPlayer.id;

  const unassigned = squad.filter(
    (p) => !starters.some((s) => s.id === p.id) && !bench.some((b) => b.id === p.id)
  );

  const ptsFor = (statsRow, position) => getActivePoints(statsRow, position, scoringSystem);

  const pointsById = {};
  for (const p of squad) {
    const stats = playerMatchdayStats[p.id];
    if (!stats) continue;
    const raw = ptsFor(stats, p.position);
    pointsById[p.id] = p.id === captainId ? Math.round(raw * 2 * 10) / 10 : raw;
  }

  // Cumulative tournament total points (base, no captain ×2)
  const totalPointsById = {};
  for (const p of squad) {
    let total = 0;
    let hasStat = false;
    for (const md of completedMatchdays) {
      const s = historicalStats[md.id]?.[p.id];
      if (s) { total += ptsFor(s, p.position); hasStat = true; }
    }
    const liveS = playerMatchdayStats[p.id];
    if (liveS) { total += ptsFor(liveS, p.position); hasStat = true; }
    if (hasStat) totalPointsById[p.id] = Math.round(total * 10) / 10;
  }

  // ── Render ───────────────────────────────────────────────────────────────
  if (teamLoading || lineupLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-secondary">
        Cargando plantilla…
      </div>
    );
  }

  if (!team) {
    return (
      <div className="space-y-4 max-w-2xl">
        <h1 className="text-2xl font-bold text-primary">Mi equipo</h1>
        <div className="bg-surface border border-border rounded-xl p-6 text-center">
          <p className="text-secondary">
            Aún no estás inscrito en la liga. Pide a un admin que te agregue.
          </p>
        </div>
      </div>
    );
  }

  if (squad.length === 0) {
    return (
      <div className="space-y-4 max-w-2xl">
        <h1 className="text-2xl font-bold text-primary">Mi equipo</h1>
        <div className="bg-surface border border-border rounded-xl p-6 text-center">
          <p className="text-secondary font-medium mb-1">Aún sin jugadores</p>
          <p className="text-muted text-sm">
            Gana jugadores en la subasta o ficha en el mercado libre para construir tu plantilla.
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
          <h1 className="text-2xl font-bold text-primary">Mi equipo</h1>
          <p className="text-secondary text-sm mt-0.5">
            {selectedMatchday ? `Alineación para: ${selectedMatchday.name}` : 'Alineación de pretemporada'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted uppercase tracking-wider">Presupuesto restante</p>
          <p className="text-lg font-bold text-tertiary">{formatPrice(team.budget_remaining)}</p>
          <p className="text-xs text-muted">{squad.length} / 15 jugadores</p>
        </div>
      </div>

      {/* ── Matchday selector ── */}
      {allMatchdays.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted uppercase tracking-wider font-semibold">Jornada:</span>
          {allMatchdays.map((md) => (
            <button
              key={md.id}
              onClick={() => setSelectedMatchday(md)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2 ${
                selectedMatchday?.id === md.id
                  ? 'bg-tertiary text-primary'
                  : 'bg-border text-secondary hover:bg-border-strong'
              }`}
            >
              {md.name}
              {md.is_active && <span className="ml-1 text-tertiary">●</span>}
            </button>
          ))}
        </div>
      )}

      {/* ── Formation label ── */}
      <div className="bg-surface border border-border rounded-xl p-4 flex items-center gap-4">
        <div>
          <p className="text-xs font-semibold text-secondary uppercase tracking-wider">Formación</p>
          <p className="text-lg font-bold text-tertiary mt-0.5">
            {starters.length > 0 ? derivedFormation : '—'}
          </p>
        </div>
        <p className="text-xs text-muted ml-auto">{starters.length} / 11 titulares</p>
      </div>

      {/* ── Live matchday stats panel (always shows active matchday) ── */}
      {activeMatchday && Object.keys(playerMatchdayStats).length > 0 && (() => {
        const livePts = starters.reduce((sum, p) => sum + (pointsById[p.id] ?? 0), 0);
        const played    = starters.filter(p => (playerMatchdayStats[p.id]?.minutes_played ?? 0) > 0);
        const notPlayed = starters.filter(p => !playerMatchdayStats[p.id] || playerMatchdayStats[p.id].minutes_played === 0);
        return (
          <div className="bg-surface border border-border rounded-xl p-4 flex items-center gap-6 flex-wrap">
            <div>
              <p className="text-label-caps text-muted uppercase tracking-wider">Pts en vivo</p>
              <p className="text-xl font-bold text-tertiary">{fmtPts(livePts)}</p>
            </div>
            <div>
              <p className="text-label-caps text-muted uppercase tracking-wider">Jugaron</p>
              <p className="text-sm font-semibold text-primary">{played.length} / {starters.length}</p>
            </div>
            <div>
              <p className="text-label-caps text-muted uppercase tracking-wider">Por jugar</p>
              <p className={`text-sm font-semibold ${notPlayed.length > 0 ? 'text-tertiary' : 'text-muted'}`}>
                {notPlayed.length}
              </p>
            </div>
            <p className="text-label-caps text-muted ml-auto hidden sm:block">
              C ×2 aplicado · titulares definitivos
            </p>
          </div>
        );
      })()}

      {/* ── Captain warning ── */}
      {captainGameLocked && (
        <div className="bg-warning/10 border border-warning/30 rounded-xl p-3 text-sm text-warning" role="alert">
          El partido de tu capitán ya inició. Si no juega, sumarás 0 × 2 = 0 pts — el XI es definitivo, sin promoción de banca.
        </div>
      )}

      {/* ── Rolling lockout notice ── */}
      {selectedMatchday && Object.keys(kickoffByCode).length > 0 && (
        <div className="bg-surface-hover/60 border border-border rounded-xl p-3 text-xs text-secondary" role="alert">
          Bloqueo progresivo activo — los jugadores se bloquean 10 min antes de su partido. Un titular bloqueado puede salir al banquillo (un jugador desbloqueado entra en su lugar); los bloqueados no pueden entrar al XI.
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
        pointsById={pointsById}
        totalPointsById={totalPointsById}
      />

      {/* ── Bench ── */}
      <BenchList
        bench={bench}
        selectedId={selectedPlayer?.id ?? null}
        onPlayerClick={handlePlayerClick}
        onReorder={handleBenchReorder}
        onEmptyBenchSlotClick={handleEmptyBenchSlotClick}
        hasSelected={!!selectedPlayer}
        pointsById={pointsById}
        totalPointsById={totalPointsById}
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
                <span className="text-label-caps text-muted">Titular</span>
              )}
              {!selectedIsStarter && (
                <span className="text-label-caps text-muted">En banca</span>
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
                {selectedIsCaptain ? 'Capitán ✓' : 'Hacer capitán'}
              </button>
            )}

            {/* Swap hint */}
            <span className="text-xs text-muted italic">
              Haz clic en otro jugador para intercambiar
            </span>

            {/* Deselect */}
            <button
              onClick={() => setSelectedPlayer(null)}
              className="px-2 py-1.5 rounded-lg text-xs text-secondary hover:text-primary hover:bg-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
              aria-label="Deseleccionar jugador"
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
            Fuera de alineación ({unassigned.length})
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
            Selecciona uno de estos, luego haz clic en banca/titular para intercambiarlo.
          </p>
        </div>
      )}

      {/* ── Squad overview table ── */}
      <div className="bg-surface border border-border rounded-xl overflow-x-auto">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between min-w-max">
          <h3 className="text-sm font-semibold text-secondary">Plantilla completa</h3>
          <span className="text-xs text-muted">{squad.length} jugadores</span>
        </div>
        {/* Stat header row */}
        <div className="flex items-center gap-3 px-4 py-1.5 border-b border-border/50 min-w-max">
          <span className="w-8 flex-shrink-0" />
          <span className="text-xs text-muted flex-shrink-0 w-[140px]">Jugador</span>
          <span className="text-xs text-muted flex-shrink-0 w-8">País</span>
          <span className="text-xs text-muted flex-shrink-0 w-12 text-right">Precio</span>
          {activeMatchday && <span className="text-xs text-muted flex-shrink-0 w-14 text-right">En vivo</span>}
          <span className="text-xs text-muted flex-shrink-0 w-16 text-right">Estado</span>
          {statColumns.map((col) => (
            <span key={col.field} className="text-xs text-muted flex-shrink-0 w-10 text-right" title={col.label}>
              {col.abbrev}
            </span>
          ))}
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
              const liveCapPts = mdStats ? (pointsById[p.id] ?? 0) : null;
              const pTotals = totalsById[p.id];
              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-hover cursor-pointer min-w-max ${
                    selectedPlayer?.id === p.id ? 'bg-tertiary/5' : ''
                  }`}
                  onClick={() => handlePlayerClick(p)}
                >
                  <span
                    className={`text-label-caps font-bold px-1.5 py-0.5 rounded w-8 text-center flex-shrink-0 ${getPositionColor(pos)}`}
                  >
                    {pos}
                  </span>
                  <span className="text-sm text-primary flex-shrink-0 w-[140px] truncate">{p.name}</span>
                  <span className="text-xs text-muted flex-shrink-0 w-8">{p.country_code}</span>
                  <span className="text-xs text-secondary flex-shrink-0 w-12 text-right">
                    {formatPrice(p.price)}
                  </span>
                  {activeMatchday && (
                    <span className={`text-xs flex-shrink-0 w-14 text-right font-semibold ${
                      liveCapPts === null
                        ? 'text-secondary'
                        : mdStats.minutes_played > 0
                        ? 'text-tertiary'
                        : 'text-muted'
                    }`}>
                      {liveCapPts === null
                        ? '—'
                        : mdStats.minutes_played > 0
                        ? `${fmtPts(liveCapPts)} pts`
                        : '0.0 pts'}
                    </span>
                  )}
                  <span className="text-label-caps flex-shrink-0 w-16 text-right flex items-center justify-end gap-1">
                    {isGameLocked(p) && (
                      <span title="Bloqueado — partido iniciado">🔒</span>
                    )}
                    {isCaptain ? (
                      <span className="text-tertiary font-semibold">Capitán</span>
                    ) : isStarter ? (
                      <span className="text-tertiary">Titular</span>
                    ) : benchIdx >= 0 ? (
                      <span className="text-info">Banca {benchIdx + 1}</span>
                    ) : (
                      <span className="text-warning">—</span>
                    )}
                  </span>
                  {statColumns.map((col) => (
                    <span key={col.field} className="text-xs tabular-nums text-secondary flex-shrink-0 w-10 text-right">
                      {pTotals?.[col.field] ?? '—'}
                    </span>
                  ))}
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
            <h3 className="text-sm font-semibold text-secondary">Historial del jugador</h3>
            <p className="text-xs text-muted mt-0.5">Puntos por jornada de los jugadores de tu plantilla</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-border">
                  <th className="px-4 py-2.5 text-xs font-medium text-muted min-w-[140px]">Jugador</th>
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
                            const pts = s ? ptsFor(s, p.position) : null;
                            if (pts !== null) total += pts;
                            return (
                              <td key={md.id} className="px-3 py-2.5 text-center">
                                {pts === null ? (
                                  <span className="text-secondary">—</span>
                                ) : s.minutes_played === 0 ? (
                                  <span className="text-muted text-xs" title="No jugó">0</span>
                                ) : (
                                  <span className={`font-semibold text-xs ${pts > 0 ? 'text-tertiary' : 'text-error'}`}>
                                    {fmtPts(pts)}
                                  </span>
                                )}
                              </td>
                            );
                          })}
                          <td className="px-3 py-2.5 text-center">
                            <span className={`font-bold text-xs ${total > 0 ? 'text-primary' : 'text-muted'}`}>
                              {total > 0 ? fmtPts(total) : '—'}
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
            Los puntos mostrados son puntos base del jugador — el ×2 del capitán se aplica a nivel de equipo durante la puntuación.
            "—" significa que no hay estadísticas cargadas para esa jornada de este jugador.
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
          {saving ? 'Guardando…' : 'Guardar alineación'}
        </button>

        {!canSave && !saving && (
          <p className="text-xs text-muted">
            {starters.length !== 11 && `Se necesitan exactamente 11 titulares (hay ${starters.length}). `}
            {starters.length === 11 && gkCount !== 1 && 'Se necesita exactamente 1 POR en el XI titular. '}
            {!captainIsStarter && 'Selecciona un capitán entre tus titulares. '}
          </p>
        )}

        {saveError && (
          <p className="text-xs text-error" role="alert">{saveError}</p>
        )}

        {saveSuccess && (
          <p className="text-xs text-tertiary font-medium" role="status">¡Alineación guardada!</p>
        )}
      </div>

    </div>
  );
}
