import { useState, useEffect, useCallback } from 'react';
import { useTeam } from '../hooks/useTeam';
import { useLeague } from '../context/LeagueContext';
import { supabase } from '../lib/supabase';
import { parseFormation, validateLineup } from '../lib/formations';
import { getPositionColor, formatPrice } from '../lib/utils';
import { VALID_FORMATIONS } from '../config/constants';
import FormationPicker from '../components/team/FormationPicker';
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

// Build a default 4-3-3 lineup from the squad, most expensive starters
function buildDefault(squad) {
  const sorted = [...squad].sort((a, b) => b.price - a.price);
  const gks = sorted.filter((p) => p.position === 'GK');
  const defs = sorted.filter((p) => p.position === 'DEF');
  const mids = sorted.filter((p) => p.position === 'MID');
  const fwds = sorted.filter((p) => p.position === 'FWD');

  const starters = [
    ...gks.slice(0, 1),
    ...defs.slice(0, 4),
    ...mids.slice(0, 3),
    ...fwds.slice(0, 3),
  ].filter(Boolean);

  const starterIds = new Set(starters.map((p) => p.id));
  const bench = squad.filter((p) => !starterIds.has(p.id));

  const captainId =
    starters.length > 0
      ? starters.reduce((best, p) => (p.price > (best?.price ?? 0) ? p : best), null)?.id ?? null
      : null;

  return { formation: '4-3-3', starters, bench, captainId };
}

export default function MyTeam() {
  const { team, players, loading: teamLoading } = useTeam();
  const { activeMatchday } = useLeague();

  const [formation, setFormation] = useState('4-3-3');
  const [starters, setStarters] = useState([]);
  const [bench, setBench] = useState([]);
  const [captainId, setCaptainId] = useState(null);

  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [swapError, setSwapError] = useState(null);

  const [lineupLoading, setLineupLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const squad = normalizeSquad(players);

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

    const { data } = await query;

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

      // Infer formation from saved starters
      if (savedStarters.length === 11) {
        const def = savedStarters.filter((p) => p.position === 'DEF').length;
        const mid = savedStarters.filter((p) => p.position === 'MID').length;
        const fwd = savedStarters.filter((p) => p.position === 'FWD').length;
        const inferred = `${def}-${mid}-${fwd}`;
        if (VALID_FORMATIONS.includes(inferred)) setFormation(inferred);
      }
    } else {
      const defaults = buildDefault(squad);
      setFormation(defaults.formation);
      setStarters(defaults.starters);
      setBench(defaults.bench);
      setCaptainId(defaults.captainId);
    }

    setLineupLoading(false);
  }, [team?.id, players.length, activeMatchday?.id]); // eslint-disable-line

  useEffect(() => {
    loadLineup();
  }, [loadLineup]);

  // ── Formation change ─────────────────────────────────────────────────────
  function handleFormationChange(newFormation) {
    setFormation(newFormation);
    setSwapError(null);
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
    const p1IsStarter = starters.some((s) => s.id === p1.id);
    const p2IsStarter = starters.some((s) => s.id === p2.id);

    if (p1IsStarter && p2IsStarter) {
      // Starter ↔ Starter: only meaningful if they're different positions — allow freely
      const newStarters = starters.map((s) =>
        s.id === p1.id ? p2 : s.id === p2.id ? p1 : s
      );
      if (newStarters.length === 11 && !isLineupValidForFormation(newStarters)) {
        setSwapError(
          `Can't swap ${p1.name} (${p1.position}) with ${p2.name} (${p2.position}) — formation ${formation} would be broken.`
        );
        return;
      }
      setStarters(newStarters);
      setSwapError(null);
      return;
    }

    let newStarters, newBench;

    if (p1IsStarter && !p2IsStarter) {
      newStarters = starters.filter((s) => s.id !== p1.id).concat(p2);
      // Only enforce formation check when the lineup is complete (11 starters)
      if (newStarters.length === 11 && !isLineupValidForFormation(newStarters)) {
        setSwapError(
          `Can't swap ${p1.name} (${p1.position}) with ${p2.name} (${p2.position}) — formation ${formation} would be broken.`
        );
        return;
      }
      newBench = bench.filter((b) => b.id !== p2.id).concat(p1);
      if (captainId === p1.id) setCaptainId(null);
    } else if (!p1IsStarter && p2IsStarter) {
      newStarters = starters.filter((s) => s.id !== p2.id).concat(p1);
      // Only enforce formation check when the lineup is complete (11 starters)
      if (newStarters.length === 11 && !isLineupValidForFormation(newStarters)) {
        setSwapError(
          `Can't swap ${p1.name} (${p1.position}) with ${p2.name} (${p2.position}) — formation ${formation} would be broken.`
        );
        return;
      }
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

  function isLineupValidForFormation(proposedStarters) {
    if (proposedStarters.length !== 11) return false;
    const req = parseFormation(formation);
    const counts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    for (const p of proposedStarters) counts[p.position] = (counts[p.position] ?? 0) + 1;
    return (
      counts.GK === req.GK &&
      counts.DEF === req.DEF &&
      counts.MID === req.MID &&
      counts.FWD === req.FWD
    );
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
  const lineupValid = isLineupValidForFormation(starters);
  const hasCaptain = captainId !== null;
  const canSave = lineupValid && hasCaptain && starters.length === 11 && bench.length === 4;
  // Only warn about formation mismatch when the starting XI is fully populated
  const formationMismatch = starters.length === 11 && !lineupValid;

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

      {/* ── Formation picker ── */}
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 space-y-2">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Formation</p>
        <FormationPicker value={formation} onChange={handleFormationChange} />
      </div>

      {/* ── Lineup validity warning ── */}
      {formationMismatch && (
        <div className="bg-yellow-900/30 border border-yellow-700/50 rounded-xl p-3 text-sm text-yellow-300">
          Lineup doesn't match formation {formation}. Check your starting XI.
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
        formation={formation}
        captainId={captainId}
        selectedId={selectedPlayer?.id ?? null}
        onPlayerClick={handlePlayerClick}
      />

      {/* ── Bench ── */}
      <BenchList
        bench={bench}
        selectedId={selectedPlayer?.id ?? null}
        onPlayerClick={handlePlayerClick}
        onReorder={handleBenchReorder}
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
                  <span className="text-[10px] flex-shrink-0 w-16 text-right">
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
            {!lineupValid && 'Lineup must match formation. '}
            {!hasCaptain && 'Select a captain. '}
            {starters.length !== 11 && `Need 11 starters (${starters.length}/11). `}
            {bench.length !== 4 && `Need 4 bench players (${bench.length}/4).`}
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
