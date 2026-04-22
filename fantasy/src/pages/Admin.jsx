import { useState, useEffect, useCallback } from 'react';
import { useAuction } from '../context/AuctionContext';
import { usePlayers } from '../hooks/usePlayers';
import { supabase } from '../lib/supabase';
import { AUCTION_STATUSES } from '../config/constants';
import { calculatePlayerPoints } from '../lib/scoring';
import { calculateTeamMatchdayPoints } from '../lib/matchday';

const WC_STAGES = [
  'Group Stage MD1',
  'Group Stage MD2',
  'Group Stage MD3',
  'Round of 32',
  'Round of 16',
  'Quarter-finals',
  'Semi-finals',
  'Third Place',
  'Final',
];

const STATUS_BADGE = {
  pending:   'bg-gray-700 text-gray-300',
  active:    'bg-emerald-700 text-emerald-100',
  paused:    'bg-yellow-600 text-yellow-100',
  completed: 'bg-blue-700 text-blue-200',
};

const POSITION_BADGE = {
  GK:  'bg-yellow-900 text-yellow-300',
  DEF: 'bg-blue-900 text-blue-300',
  MID: 'bg-emerald-900 text-emerald-300',
  FWD: 'bg-red-900 text-red-300',
};

export default function Admin() {
  const {
    auctionState,
    bids,
    loading,
    getHighestBid,
    startAuction,
    pauseAuction,
    resumeAuction,
    completeAuction,
    nextRound,
    resolveRound,
  } = useAuction();

  const { players, loading: playersLoading } = usePlayers();
  const [confirming, setConfirming] = useState(false);
  const [resolving, setResolving]   = useState(false);
  const [resolveErrors, setResolveErrors] = useState([]);

  // ── League Participants ────────────────────────────────────────────────────
  const [participants, setParticipants] = useState([]);
  const [participantsLoading, setParticipantsLoading] = useState(true);
  const [addingTeamFor, setAddingTeamFor] = useState(null);

  useEffect(() => { fetchParticipants(); }, []);

  async function fetchParticipants() {
    setParticipantsLoading(true);
    const { data } = await supabase
      .from('users')
      .select('id, display_name, email, teams(id, name, budget_remaining)')
      .order('created_at', { ascending: true });
    setParticipants(data ?? []);
    setParticipantsLoading(false);
  }

  async function handleAddToLeague(user) {
    setAddingTeamFor(user.id);
    await supabase.from('teams').insert({
      user_id: user.id,
      name: user.display_name,
      budget_remaining: 105.0,
    });
    await fetchParticipants();
    setAddingTeamFor(null);
  }

  async function handleRemoveFromLeague(userId) {
    await supabase.from('teams').delete().eq('user_id', userId);
    await fetchParticipants();
  }
  // ──────────────────────────────────────────────────────────────────────────

  // ── Matchday Management ───────────────────────────────────────────────────
  const EMPTY_FORM = { name: '', wc_stage: WC_STAGES[0], start_date: '', deadline: '' };
  const [matchdays, setMatchdays] = useState([]);
  const [matchdaysLoading, setMatchdaysLoading] = useState(true);
  const [mdForm, setMdForm] = useState(EMPTY_FORM);
  const [mdSaving, setMdSaving] = useState(false);
  const [mdError, setMdError] = useState('');

  const fetchMatchdays = useCallback(async () => {
    setMatchdaysLoading(true);
    const { data } = await supabase
      .from('matchdays')
      .select('*')
      .order('id', { ascending: true });
    setMatchdays(data ?? []);
    setMatchdaysLoading(false);
  }, []);

  useEffect(() => { fetchMatchdays(); }, [fetchMatchdays]);

  async function handleCreateMatchday(e) {
    e.preventDefault();
    setMdError('');
    if (!mdForm.name.trim()) { setMdError('Name is required.'); return; }
    if (!mdForm.deadline)    { setMdError('Deadline is required.'); return; }
    setMdSaving(true);
    const { error } = await supabase.from('matchdays').insert({
      name:       mdForm.name.trim(),
      wc_stage:   mdForm.wc_stage,
      start_date: mdForm.start_date || null,
      deadline:   mdForm.deadline,
    });
    setMdSaving(false);
    if (error) { setMdError(error.message); return; }
    setMdForm(EMPTY_FORM);
    await fetchMatchdays();
  }

  async function handleToggleActive(md) {
    const activating = !md.is_active;
    await supabase
      .from('matchdays')
      .update({ is_active: activating })
      .eq('id', md.id);

    // On activation: stamp every team's current pre-tournament (null) lineup
    // with this matchday_id. This ensures every team has a matchday-specific
    // record from the moment the matchday goes live, even if they set their
    // lineup before the matchday existed. Teams that already saved a lineup
    // specifically for this matchday are left untouched.
    if (activating) {
      const [{ data: existing }, { data: nullLineups }] = await Promise.all([
        supabase.from('lineups').select('team_id').eq('matchday_id', md.id),
        supabase.from('lineups')
          .select('team_id, player_id, is_starting, is_captain, bench_order')
          .is('matchday_id', null),
      ]);

      const alreadyStamped = new Set((existing ?? []).map(r => r.team_id));
      const toStamp = (nullLineups ?? [])
        .filter(r => !alreadyStamped.has(r.team_id))
        .map(r => ({
          team_id:    r.team_id,
          player_id:  r.player_id,
          matchday_id: md.id,
          is_starting: r.is_starting,
          is_captain:  r.is_captain,
          bench_order: r.bench_order,
        }));

      if (toStamp.length > 0) {
        await supabase
          .from('lineups')
          .upsert(toStamp, { onConflict: 'team_id,matchday_id,player_id' });
      }
    }

    await fetchMatchdays();
  }

  async function handleToggleCompleted(md) {
    await supabase
      .from('matchdays')
      .update({ is_completed: !md.is_completed, is_active: md.is_completed ? md.is_active : false })
      .eq('id', md.id);
    await fetchMatchdays();
  }
  // ──────────────────────────────────────────────────────────────────────────

  // ── Stats CSV Upload ──────────────────────────────────────────────────────
  const [statsMatchdayId, setStatsMatchdayId] = useState('');
  const [statsFile, setStatsFile] = useState(null);
  const [statsUploading, setStatsUploading] = useState(false);
  const [statsResult, setStatsResult] = useState(null); // { inserted, errors }

  function parseCsv(text) {
    const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    return lines.slice(1).map(line => {
      const vals = line.split(',').map(v => v.trim());
      return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']));
    });
  }

  async function handleStatsUpload(e) {
    e.preventDefault();
    setStatsResult(null);
    if (!statsMatchdayId) { setStatsResult({ errors: ['Select a matchday first.'] }); return; }
    if (!statsFile)        { setStatsResult({ errors: ['Select a CSV file.'] }); return; }

    setStatsUploading(true);
    const text = await statsFile.text();
    const rows = parseCsv(text);
    if (rows.length === 0) {
      setStatsResult({ errors: ['CSV is empty or has no data rows.'] });
      setStatsUploading(false);
      return;
    }

    // Fetch all players to resolve names → id + position
    const { data: allPlayers } = await supabase.from('players').select('id, name, position');
    const normName = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const playerMap = Object.fromEntries((allPlayers ?? []).map(p => [normName(p.name), p]));

    const toUpsert = [];
    const errors   = [];

    for (const row of rows) {
      const name   = (row['player_name'] ?? '').trim();
      const player = playerMap[normName(name)];
      if (!player) { errors.push(`Player not found: "${name}"`); continue; }

      const minutes        = parseInt(row['minutes'] ?? '0', 10) || 0;
      const goals          = parseInt(row['goals'] ?? '0', 10) || 0;
      const assists        = parseInt(row['assists'] ?? '0', 10) || 0;
      const clean_sheet    = row['clean_sheet'] === '1' || row['clean_sheet'] === 'true';
      const saves          = parseInt(row['saves'] ?? '0', 10) || 0;
      const penalty_saves  = parseInt(row['penalty_saves'] ?? '0', 10) || 0;
      const penalty_misses = parseInt(row['penalty_misses'] ?? '0', 10) || 0;
      const yellow_cards   = parseInt(row['yellow'] ?? '0', 10) || 0;
      const red_cards      = parseInt(row['red'] ?? '0', 10) || 0;
      const own_goals      = parseInt(row['own_goals'] ?? '0', 10) || 0;
      const goals_conceded = parseInt(row['goals_conceded'] ?? '0', 10) || 0;
      const game_time      = row['game_time'] ?? null;

      const stats = { minutes_played: minutes, goals, assists, clean_sheet, saves,
                      penalty_saves, penalty_misses, yellow_cards, red_cards, own_goals, goals_conceded };
      const total_points = calculatePlayerPoints(stats, player.position);

      toUpsert.push({
        player_id: player.id,
        matchday_id: parseInt(statsMatchdayId, 10),
        ...stats,
        total_points,
        game_started_at: game_time || null,
      });
    }

    if (toUpsert.length > 0) {
      const { error } = await supabase
        .from('player_stats')
        .upsert(toUpsert, { onConflict: 'player_id,matchday_id' });
      if (error) errors.push(`DB error: ${error.message}`);
    }

    setStatsResult({ inserted: toUpsert.length, errors });
    setStatsFile(null);
    setStatsUploading(false);
  }
  // ──────────────────────────────────────────────────────────────────────────

  // ── Standings Calculation ─────────────────────────────────────────────────
  const [calcMatchdayId, setCalcMatchdayId] = useState('');
  const [calcRunning, setCalcRunning] = useState(false);
  const [calcResult, setCalcResult] = useState(null);

  async function handleCalculateStandings(e) {
    e.preventDefault();
    setCalcResult(null);
    if (!calcMatchdayId) { setCalcResult({ errors: ['Select a matchday.'] }); return; }
    setCalcRunning(true);

    const matchdayIdInt = parseInt(calcMatchdayId, 10);
    const errors = [];

    // 1. Fetch all teams
    const { data: teams } = await supabase.from('teams').select('id, name');
    if (!teams?.length) { setCalcResult({ errors: ['No teams found.'] }); setCalcRunning(false); return; }

    // 2. Fetch all player_stats for this matchday
    const { data: allStats } = await supabase
      .from('player_stats')
      .select('player_id, minutes_played, goals, assists, clean_sheet, saves, penalty_saves, penalty_misses, yellow_cards, red_cards, own_goals, goals_conceded, total_points')
      .eq('matchday_id', matchdayIdInt);
    const statsMap = Object.fromEntries((allStats ?? []).map(s => [s.player_id, s]));

    // 3. Fetch all players for position lookup
    const { data: allPlayers } = await supabase.from('players').select('id, position');
    const positionMap = Object.fromEntries((allPlayers ?? []).map(p => [p.id, p.position]));

    // 4. Fetch lineups for this matchday, then fall back to pre-tournament (null) lineups
    const { data: matchdayLineups } = await supabase
      .from('lineups')
      .select('team_id, player_id, is_starting, is_captain, bench_order')
      .eq('matchday_id', matchdayIdInt);

    const { data: nullLineups } = await supabase
      .from('lineups')
      .select('team_id, player_id, is_starting, is_captain, bench_order')
      .is('matchday_id', null);

    // Build a map of team_id → rows, preferring matchday-specific over pre-tournament
    const matchdayTeamIds = new Set((matchdayLineups ?? []).map(r => r.team_id));
    const allLineups = [
      ...(matchdayLineups ?? []),
      ...(nullLineups ?? []).filter(r => !matchdayTeamIds.has(r.team_id)),
    ];

    // 5. Fetch matchday_points from OTHER matchdays so recalculating the same
    //    matchday is idempotent — we never read the cumulative total_points column.
    const { data: otherStandings } = await supabase
      .from('fantasy_standings')
      .select('team_id, matchday_points, goals_scored')
      .neq('matchday_id', matchdayIdInt);

    const prevByTeam = {};
    for (const s of otherStandings ?? []) {
      if (!prevByTeam[s.team_id]) prevByTeam[s.team_id] = { pts: 0, goals: 0 };
      prevByTeam[s.team_id].pts   += s.matchday_points ?? 0;
      prevByTeam[s.team_id].goals += s.goals_scored    ?? 0;
    }

    const upsertRows = [];
    let teamsScored = 0;

    for (const team of teams) {
      const teamLineupRows = (allLineups ?? []).filter(r => r.team_id === team.id);
      if (teamLineupRows.length === 0) {
        errors.push(`${team.name}: no lineup found for this matchday — skipped.`);
        continue;
      }

      const starters = teamLineupRows
        .filter(r => r.is_starting)
        .map(r => ({ id: r.player_id, position: positionMap[r.player_id] ?? 'FWD' }));
      const benchRows = teamLineupRows
        .filter(r => !r.is_starting)
        .sort((a, b) => (a.bench_order ?? 99) - (b.bench_order ?? 99));
      const bench = benchRows.map(r => ({ id: r.player_id, position: positionMap[r.player_id] ?? 'FWD' }));
      const captainRow = teamLineupRows.find(r => r.is_captain);
      const captainId = captainRow?.player_id ?? null;

      // Infer formation from starters
      const defCount = starters.filter(p => p.position === 'DEF').length;
      const midCount = starters.filter(p => p.position === 'MID').length;
      const fwdCount = starters.filter(p => p.position === 'FWD').length;
      const formation = `${defCount}-${midCount}-${fwdCount}`;

      const { totalPoints, goalsScored } = calculateTeamMatchdayPoints(
        { starters, bench, captainId, formation },
        statsMap,
        positionMap,
      );

      const prev = prevByTeam[team.id] ?? { pts: 0, goals: 0 };

      upsertRows.push({
        team_id: team.id,
        matchday_id: matchdayIdInt,
        matchday_points: totalPoints,
        total_points: prev.pts + totalPoints,
        goals_scored: goalsScored,
      });
      teamsScored++;
    }

    if (upsertRows.length > 0) {
      const { error } = await supabase
        .from('fantasy_standings')
        .upsert(upsertRows, { onConflict: 'team_id,matchday_id' });
      if (error) errors.push(`DB error: ${error.message}`);
    }

    // Stamp null-matchday lineups as matchday-specific — creates the permanent
    // historical record so History and per-matchday breakdowns always find a lineup.
    // Only runs for teams that used the null fallback; idempotent on re-runs.
    const toStamp = (nullLineups ?? [])
      .filter(r => !matchdayTeamIds.has(r.team_id))
      .map(r => ({
        team_id: r.team_id,
        player_id: r.player_id,
        matchday_id: matchdayIdInt,
        is_starting: r.is_starting,
        is_captain: r.is_captain,
        bench_order: r.bench_order,
      }));
    if (toStamp.length > 0) {
      const { error: stampErr } = await supabase
        .from('lineups')
        .upsert(toStamp, { onConflict: 'team_id,matchday_id,player_id' });
      if (stampErr) errors.push(`Lineup stamp error: ${stampErr.message}`);
    }

    setCalcResult({ teamsScored, errors });
    setCalcRunning(false);
  }
  // ──────────────────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="text-gray-400 p-6">Loading auction state…</div>;
  }
  if (!auctionState) {
    return (
      <div className="text-red-400 p-6">
        No auction state found. Run the seed SQL in Supabase.
      </div>
    );
  }

  const { status, current_round, round_duration_seconds, round_started_at } = auctionState;
  const isPending   = status === AUCTION_STATUSES.PENDING;
  const isActive    = status === AUCTION_STATUSES.ACTIVE;
  const isPaused    = status === AUCTION_STATUSES.PAUSED;
  const isCompleted = status === AUCTION_STATUSES.COMPLETED;

  const currentRoundBids = bids.filter((b) => b.round_number === current_round);
  const biddedPlayerIds  = [...new Set(currentRoundBids.map((b) => b.player_id))];

  // Build winner summary for the confirmation panel
  const winnersPreview = biddedPlayerIds.map((playerId) => {
    const highBid = getHighestBid(playerId);
    return {
      playerId,
      playerName: highBid?.players?.name ?? `Player #${playerId}`,
      position:   highBid?.players?.position ?? '—',
      winnerName: highBid?.users?.display_name ?? '?',
      amount:     highBid?.bid_amount ?? 0,
      bidCount:   currentRoundBids.filter((b) => b.player_id === playerId).length,
    };
  });

  async function handleResolveAndAdvance() {
    setResolving(true);
    setResolveErrors([]);
    const { errors } = await resolveRound();
    if (errors.length > 0) {
      setResolveErrors(errors);
      setResolving(false);
      return; // stay on confirmation panel so admin can see errors
    }
    await nextRound();
    setResolving(false);
    setConfirming(false);
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Admin Panel</h1>
        <span className={`px-3 py-1 rounded-full text-sm font-semibold capitalize ${STATUS_BADGE[status]}`}>
          {status}
        </span>
      </div>

      {/* ── League Participants ──────────────────────────────────────────── */}
      <section className="bg-gray-900 rounded-xl p-6 space-y-4">
        <div className="flex items-baseline gap-3">
          <h2 className="text-lg font-semibold text-white">League Participants</h2>
          {!participantsLoading && (
            <span className="text-sm text-gray-500">
              {participants.filter((u) => u.teams).length} of {participants.length} users enrolled
            </span>
          )}
        </div>

        {isCompleted && (
          <p className="text-xs text-gray-500 bg-gray-800 rounded-lg px-3 py-2">
            Auction complete. New enrollments will access unwon players via the free market.
          </p>
        )}

        {participantsLoading ? (
          <p className="text-gray-500 text-sm">Loading users…</p>
        ) : participants.length === 0 ? (
          <p className="text-gray-500 text-sm">No registered users found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-800">
                  <th className="pb-3 pr-4 font-medium">User</th>
                  <th className="pb-3 pr-4 font-medium">Email</th>
                  <th className="pb-3 pr-4 font-medium">Status</th>
                  <th className="pb-3 pr-4 font-medium">Budget</th>
                  <th className="pb-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {participants.map((u) => (
                  <tr key={u.id} className="text-gray-300 hover:bg-gray-800/40">
                    <td className="py-2.5 pr-4 text-white font-medium">{u.display_name}</td>
                    <td className="py-2.5 pr-4 text-gray-400 text-xs">{u.email}</td>
                    <td className="py-2.5 pr-4">
                      {u.teams ? (
                        <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-900 text-emerald-300">
                          Enrolled
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-xs font-semibold bg-gray-700 text-gray-400">
                          No team
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 text-gray-400">
                      {u.teams ? `£${Number(u.teams.budget_remaining).toFixed(1)}` : '—'}
                    </td>
                    <td className="py-2.5">
                      {u.teams ? (
                        <button
                          onClick={() => handleRemoveFromLeague(u.id)}
                          className="text-xs text-red-400 hover:text-red-300 transition-colors"
                        >
                          Remove
                        </button>
                      ) : (
                        <button
                          onClick={() => handleAddToLeague(u)}
                          disabled={addingTeamFor === u.id}
                          className="px-3 py-1 rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs font-semibold transition-colors"
                        >
                          {addingTeamFor === u.id ? 'Adding…' : 'Add to League'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Auction Controls ─────────────────────────────────────────────── */}
      <section className="bg-gray-900 rounded-xl p-6 space-y-5">
        <h2 className="text-lg font-semibold text-white">Auction Controls</h2>

        <div className="grid grid-cols-3 gap-6 text-sm">
          <div>
            <p className="text-gray-500 mb-1">Round</p>
            <p className="text-white text-2xl font-bold">{current_round || '—'}</p>
          </div>
          <div>
            <p className="text-gray-500 mb-1">Round Duration</p>
            <p className="text-white text-2xl font-bold">{round_duration_seconds}s</p>
          </div>
          <div>
            <p className="text-gray-500 mb-1">Round Started</p>
            <p className="text-white font-medium">
              {round_started_at
                ? new Date(round_started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                : '—'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 pt-1">
          {isPending && (
            <button
              onClick={startAuction}
              className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors"
            >
              Start Auction
            </button>
          )}

          {isActive && (
            <>
              <button
                onClick={pauseAuction}
                className="px-5 py-2 rounded-lg bg-yellow-600 hover:bg-yellow-500 text-white font-semibold transition-colors"
              >
                Pause
              </button>
              <button
                onClick={() => { setConfirming(true); setResolveErrors([]); }}
                disabled={confirming}
                className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold transition-colors"
              >
                Resolve & Next Round →
              </button>
              <button
                onClick={completeAuction}
                className="px-5 py-2 rounded-lg bg-red-700 hover:bg-red-600 text-white font-semibold transition-colors"
              >
                Complete Auction
              </button>
            </>
          )}

          {isPaused && (
            <>
              <button
                onClick={resumeAuction}
                className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors"
              >
                Resume
              </button>
              <button
                onClick={completeAuction}
                className="px-5 py-2 rounded-lg bg-red-700 hover:bg-red-600 text-white font-semibold transition-colors"
              >
                Complete Auction
              </button>
            </>
          )}

          {isCompleted && (
            <p className="text-gray-500 text-sm italic">Auction is complete. No further actions available.</p>
          )}
        </div>
      </section>

      {/* ── Round Resolution Confirmation ───────────────────────────────── */}
      {confirming && (
        <section className="bg-gray-900 rounded-xl p-6 space-y-4 border border-emerald-800/50">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold text-white">
              Resolve Round {current_round} &amp; Advance
            </h2>
            <button
              onClick={() => { setConfirming(false); setResolveErrors([]); }}
              disabled={resolving}
              className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
            >
              Cancel
            </button>
          </div>

          {winnersPreview.length === 0 ? (
            <p className="text-gray-500 text-sm">
              No bids were placed this round. Advancing will skip resolution.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-800">
                    <th className="pb-3 pr-4 font-medium">Player</th>
                    <th className="pb-3 pr-4 font-medium">Pos</th>
                    <th className="pb-3 pr-4 font-medium">Winning Bid</th>
                    <th className="pb-3 pr-4 font-medium">Winner</th>
                    <th className="pb-3 font-medium">Bids</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {winnersPreview.map((row) => (
                    <tr key={row.playerId} className="text-gray-300">
                      <td className="py-2.5 pr-4 text-white font-medium">{row.playerName}</td>
                      <td className="py-2.5 pr-4">
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${POSITION_BADGE[row.position] ?? 'bg-gray-800 text-gray-400'}`}>
                          {row.position}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 font-bold text-emerald-400">
                        £{row.amount.toFixed(1)}
                      </td>
                      <td className="py-2.5 pr-4 text-white">{row.winnerName}</td>
                      <td className="py-2.5 text-gray-500">{row.bidCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {resolveErrors.length > 0 && (
            <div className="bg-red-900/40 border border-red-800/50 rounded-lg p-4 space-y-1">
              <p className="text-red-300 text-sm font-semibold">Resolution errors — round not advanced:</p>
              {resolveErrors.map((e, i) => (
                <p key={i} className="text-red-400 text-xs">
                  Player #{e.playerId}: {e.reason}
                </p>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleResolveAndAdvance}
              disabled={resolving}
              className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-semibold transition-colors"
            >
              {resolving ? 'Resolving…' : `Confirm & Advance to Round ${current_round + 1}`}
            </button>
            <button
              onClick={() => { setConfirming(false); setResolveErrors([]); }}
              disabled={resolving}
              className="px-5 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 font-semibold transition-colors"
            >
              Cancel
            </button>
          </div>
        </section>
      )}

      {/* ── Live Bids ────────────────────────────────────────────────────── */}
      {(isActive || isPaused) && (
        <section className="bg-gray-900 rounded-xl p-6 space-y-4">
          <div className="flex items-baseline gap-3">
            <h2 className="text-lg font-semibold text-white">
              Round {current_round} — Live Bids
            </h2>
            <span className="text-sm text-gray-500">
              {currentRoundBids.length} bid{currentRoundBids.length !== 1 ? 's' : ''} across {biddedPlayerIds.length} player{biddedPlayerIds.length !== 1 ? 's' : ''}
            </span>
          </div>

          {biddedPlayerIds.length === 0 ? (
            <p className="text-gray-500 text-sm">No bids placed yet this round.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-800">
                    <th className="pb-3 pr-4 font-medium">Player</th>
                    <th className="pb-3 pr-4 font-medium">Pos</th>
                    <th className="pb-3 pr-4 font-medium">Listed</th>
                    <th className="pb-3 pr-4 font-medium">Top Bid</th>
                    <th className="pb-3 pr-4 font-medium">Leading</th>
                    <th className="pb-3 font-medium">Bids</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {biddedPlayerIds.map((playerId) => {
                    const highBid    = getHighestBid(playerId);
                    const player     = highBid?.players;
                    const position   = player?.position ?? '—';
                    const playerBids = currentRoundBids.filter((b) => b.player_id === playerId);

                    return (
                      <tr key={playerId} className="text-gray-300 hover:bg-gray-800/40">
                        <td className="py-3 pr-4 font-medium text-white">
                          {player?.name ?? `Player #${playerId}`}
                        </td>
                        <td className="py-3 pr-4">
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${POSITION_BADGE[position] ?? 'bg-gray-800 text-gray-400'}`}>
                            {position}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-gray-400">
                          £{player?.price?.toFixed(1) ?? '—'}
                        </td>
                        <td className="py-3 pr-4 font-bold text-emerald-400">
                          £{highBid?.bid_amount?.toFixed(1)}
                        </td>
                        <td className="py-3 pr-4 text-white">
                          {highBid?.users?.display_name ?? '—'}
                        </td>
                        <td className="py-3 text-gray-500">{playerBids.length}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ── Matchday Management ─────────────────────────────────────────── */}
      <section className="bg-gray-900 rounded-xl p-6 space-y-6">
        <h2 className="text-lg font-semibold text-white">Matchday Management</h2>

        {/* Create form */}
        <form onSubmit={handleCreateMatchday} className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Create Matchday</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Name</label>
              <input
                type="text"
                value={mdForm.name}
                onChange={e => setMdForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Matchday 1"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-600"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">WC Stage</label>
              <select
                value={mdForm.wc_stage}
                onChange={e => setMdForm(f => ({ ...f, wc_stage: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-600"
              >
                {WC_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Start Date (optional)</label>
              <input
                type="date"
                value={mdForm.start_date}
                onChange={e => setMdForm(f => ({ ...f, start_date: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-600"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Lineup Deadline</label>
              <input
                type="datetime-local"
                value={mdForm.deadline}
                onChange={e => setMdForm(f => ({ ...f, deadline: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-600"
              />
            </div>
          </div>
          {mdError && <p className="text-red-400 text-sm">{mdError}</p>}
          <button
            type="submit"
            disabled={mdSaving}
            className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-sm transition-colors"
          >
            {mdSaving ? 'Creating…' : 'Create Matchday'}
          </button>
        </form>

        {/* Matchday list */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">All Matchdays</h3>
          {matchdaysLoading ? (
            <p className="text-gray-500 text-sm">Loading…</p>
          ) : matchdays.length === 0 ? (
            <p className="text-gray-500 text-sm">No matchdays yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-800">
                    <th className="pb-3 pr-4 font-medium">Name</th>
                    <th className="pb-3 pr-4 font-medium">Stage</th>
                    <th className="pb-3 pr-4 font-medium">Deadline</th>
                    <th className="pb-3 pr-4 font-medium">Active</th>
                    <th className="pb-3 font-medium">Completed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {matchdays.map(md => (
                    <tr key={md.id} className="text-gray-300 hover:bg-gray-800/40">
                      <td className="py-2.5 pr-4 text-white font-medium">{md.name}</td>
                      <td className="py-2.5 pr-4 text-gray-400 text-xs">{md.wc_stage}</td>
                      <td className="py-2.5 pr-4 text-gray-400 text-xs">
                        {md.deadline ? new Date(md.deadline).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                      </td>
                      <td className="py-2.5 pr-4">
                        <button
                          onClick={() => handleToggleActive(md)}
                          disabled={md.is_completed}
                          className={`px-3 py-1 rounded text-xs font-semibold transition-colors disabled:opacity-40 ${
                            md.is_active
                              ? 'bg-emerald-700 text-emerald-100 hover:bg-emerald-600'
                              : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                          }`}
                        >
                          {md.is_active ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td className="py-2.5">
                        <button
                          onClick={() => handleToggleCompleted(md)}
                          className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                            md.is_completed
                              ? 'bg-blue-700 text-blue-100 hover:bg-blue-600'
                              : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                          }`}
                        >
                          {md.is_completed ? 'Completed' : 'Mark Complete'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* ── Stats CSV Upload ─────────────────────────────────────────────── */}
      <section className="bg-gray-900 rounded-xl p-6 space-y-5">
        <h2 className="text-lg font-semibold text-white">Stats CSV Upload</h2>
        <p className="text-xs text-gray-500">
          CSV columns: <code className="text-gray-300">player_name, minutes, goals, assists, clean_sheet, saves, penalty_saves, penalty_misses, yellow, red, own_goals, goals_conceded, game_time</code>
        </p>

        <form onSubmit={handleStatsUpload} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Matchday</label>
              <select
                value={statsMatchdayId}
                onChange={e => setStatsMatchdayId(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-600"
              >
                <option value="">Select matchday…</option>
                {matchdays.map(md => (
                  <option key={md.id} value={md.id}>{md.name} — {md.wc_stage}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">CSV File</label>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={e => setStatsFile(e.target.files?.[0] ?? null)}
                className="w-full text-sm text-gray-300 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-gray-700 file:text-gray-300 hover:file:bg-gray-600"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={statsUploading}
            className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-sm transition-colors"
          >
            {statsUploading ? 'Uploading…' : 'Upload Stats'}
          </button>
        </form>

        {statsResult && (
          <div className={`rounded-lg p-4 space-y-1 ${statsResult.errors?.length > 0 && !statsResult.inserted ? 'bg-red-900/40 border border-red-800/50' : 'bg-gray-800'}`}>
            {statsResult.inserted > 0 && (
              <p className="text-emerald-400 text-sm font-semibold">
                ✓ {statsResult.inserted} player stat row{statsResult.inserted !== 1 ? 's' : ''} saved.
              </p>
            )}
            {statsResult.errors?.map((err, i) => (
              <p key={i} className="text-red-400 text-xs">{err}</p>
            ))}
          </div>
        )}
      </section>

      {/* ── Standings Calculation ───────────────────────────────────────── */}
      <section className="bg-gray-900 rounded-xl p-6 space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-white">Calculate Standings</h2>
          <p className="text-xs text-gray-500 mt-1">
            Run after uploading stats. Scores all teams for the matchday (with auto-subs) and writes to fantasy_standings.
          </p>
        </div>

        <form onSubmit={handleCalculateStandings} className="flex items-end gap-4 flex-wrap">
          <div className="flex-1 min-w-48">
            <label className="block text-xs text-gray-500 mb-1">Matchday</label>
            <select
              value={calcMatchdayId}
              onChange={e => setCalcMatchdayId(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-600"
            >
              <option value="">Select matchday…</option>
              {matchdays.map(md => (
                <option key={md.id} value={md.id}>{md.name} — {md.wc_stage}</option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={calcRunning}
            className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-sm transition-colors"
          >
            {calcRunning ? 'Calculating…' : 'Calculate Standings'}
          </button>
        </form>

        {calcResult && (
          <div className={`rounded-lg p-4 space-y-1 ${calcResult.errors?.length && !calcResult.teamsScored ? 'bg-red-900/40 border border-red-800/50' : 'bg-gray-800'}`}>
            {calcResult.teamsScored > 0 && (
              <p className="text-emerald-400 text-sm font-semibold">
                ✓ Standings calculated for {calcResult.teamsScored} team{calcResult.teamsScored !== 1 ? 's' : ''}.
              </p>
            )}
            {calcResult.errors?.map((err, i) => (
              <p key={i} className="text-yellow-400 text-xs">{err}</p>
            ))}
          </div>
        )}
      </section>

      {/* ── Player Pool ──────────────────────────────────────────────────── */}
      <section className="bg-gray-900 rounded-xl p-6 space-y-4">
        <div className="flex items-baseline gap-3">
          <h2 className="text-lg font-semibold text-white">Player Pool</h2>
          {!playersLoading && (
            <span className="text-sm text-gray-500">{players.length} players</span>
          )}
        </div>

        {playersLoading ? (
          <p className="text-gray-500 text-sm">Loading players…</p>
        ) : players.length === 0 ? (
          <p className="text-gray-500 text-sm">No players found. Run the seed SQL.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-800">
                  <th className="pb-3 pr-4 font-medium">Name</th>
                  <th className="pb-3 pr-4 font-medium">Pos</th>
                  <th className="pb-3 pr-4 font-medium">Country</th>
                  <th className="pb-3 font-medium">Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {players.map((p) => (
                  <tr key={p.id} className="text-gray-300 hover:bg-gray-800/40">
                    <td className="py-2 pr-4 text-white font-medium">{p.name}</td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${POSITION_BADGE[p.position] ?? 'bg-gray-800 text-gray-400'}`}>
                        {p.position}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-gray-400">{p.country ?? '—'}</td>
                    <td className="py-2 font-semibold text-white">£{p.price?.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
