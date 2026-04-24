import { useState, useEffect, useCallback } from 'react';
import { useAuction } from '../context/AuctionContext';
import { usePlayers } from '../hooks/usePlayers';
import { supabase } from '@predictor/supabase';
import { AUCTION_STATUSES } from '../config/constants';
import { calculatePlayerPoints } from '../lib/scoring';
import { calculateTeamMatchdayPoints } from '../lib/matchday';
import { generateChampionshipBracket, generateRelegationBracket, resolveH2H } from '../lib/brackets';

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

  // Completes the auction and auto-activates the first available matchday.
  async function handleCompleteAuction() {
    await completeAuction();
    const { data: fresh } = await supabase
      .from('matchdays')
      .select('*')
      .order('id', { ascending: true });
    const firstInactive = (fresh ?? []).find((md) => !md.is_active && !md.is_completed);
    if (firstInactive) {
      await handleToggleActive(firstInactive);
    } else {
      await fetchMatchdays();
    }
  }

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

  const fetchKnockoutData = useCallback(async () => {
    setKnockoutLoading(true);
    const [{ data: km }, { data: sd }, { data: teams }] = await Promise.all([
      supabase
        .from('knockout_matches')
        .select(`*,
          team_a:teams!knockout_matches_team_a_id_fkey(id, name, users(display_name)),
          team_b:teams!knockout_matches_team_b_id_fkey(id, name, users(display_name)),
          winner:teams!knockout_matches_winner_id_fkey(id, name, users(display_name))`)
        .order('round').order('id'),
      supabase.from('fantasy_standings').select('team_id, matchday_id, matchday_points, total_points, goals_scored'),
      supabase.from('teams').select('id, name, users(display_name)'),
    ]);
    setKnockoutMatches(km ?? []);
    setKnockoutStandingsData(sd ?? []);
    setKnockoutTeams(teams ?? []);
    setKnockoutLoading(false);
  }, []);

  useEffect(() => { fetchKnockoutData(); }, [fetchKnockoutData]);

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
    const completing = !md.is_completed;
    await supabase
      .from('matchdays')
      .update({ is_completed: completing, is_active: completing ? false : md.is_active })
      .eq('id', md.id);

    // When marking a matchday complete, auto-activate the next one (by ID).
    if (completing) {
      const { data: fresh } = await supabase
        .from('matchdays')
        .select('*')
        .order('id', { ascending: true });
      const nextMd = (fresh ?? []).find((m) => m.id > md.id && !m.is_completed && !m.is_active);
      if (nextMd) {
        await handleToggleActive(nextMd);
        return; // handleToggleActive calls fetchMatchdays()
      }
    }

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

  // ── Knockout Bracket ──────────────────────────────────────────────────────
  const [knockoutMatches, setKnockoutMatches] = useState([]);
  const [knockoutTeams, setKnockoutTeams] = useState([]);
  const [knockoutStandingsData, setKnockoutStandingsData] = useState([]);
  const [knockoutLoading, setKnockoutLoading] = useState(true);
  const [bracketSeeding, setBracketSeeding] = useState(false);
  const [bracketSeedResult, setBracketSeedResult] = useState(null);
  const [knockoutCalcMatchdayId, setKnockoutCalcMatchdayId] = useState('');
  const [knockoutCalcRunning, setKnockoutCalcRunning] = useState(false);
  const [knockoutCalcResult, setKnockoutCalcResult] = useState(null);

  // ── Transfer Windows ──────────────────────────────────────────────────────
  const WINDOW_DEFAULTS = [
    { window_number: 1, max_transfers: 7, label: 'Window 1 — After R32 (7 transfers)' },
    { window_number: 2, max_transfers: 3, label: 'Window 2 — After R16 (3 transfers)' },
    { window_number: 3, max_transfers: 3, label: 'Window 3 — After QF (3 transfers)' },
  ];
  const EMPTY_TW_FORM = { window_number: '1', max_transfers: '7', opens_at: '', closes_at: '' };
  const [transferWindows, setTransferWindows] = useState([]);
  const [twLoading, setTwLoading] = useState(true);
  const [twForm, setTwForm] = useState(EMPTY_TW_FORM);
  const [twSaving, setTwSaving] = useState(false);
  const [twError, setTwError] = useState('');
  const [windowActivity, setWindowActivity] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);

  const fetchTransferWindows = useCallback(async () => {
    setTwLoading(true);
    const { data } = await supabase
      .from('transfer_windows')
      .select('*')
      .order('window_number');
    setTransferWindows(data ?? []);
    setTwLoading(false);
  }, []);

  useEffect(() => { fetchTransferWindows(); }, [fetchTransferWindows]);

  async function fetchWindowActivity(windowNumber) {
    setActivityLoading(true);
    const { data } = await supabase
      .from('transfers')
      .select(`
        id, window_number, transfer_type, price_difference, created_at,
        team:teams(name, users(display_name)),
        player_out:players!transfers_player_out_id_fkey(name, position),
        player_in:players!transfers_player_in_id_fkey(name, position)
      `)
      .eq('window_number', windowNumber)
      .order('created_at', { ascending: false });
    setWindowActivity(data ?? []);
    setActivityLoading(false);
  }

  async function handleCreateTransferWindow(preset) {
    setTwError('');
    setTwSaving(true);
    const num = preset ? preset.window_number : parseInt(twForm.window_number, 10);
    const max = preset ? preset.max_transfers : parseInt(twForm.max_transfers, 10);
    if (!num || num < 1 || num > 3) { setTwError('Window number must be 1–3.'); setTwSaving(false); return; }
    if (!max || max < 1)            { setTwError('Max transfers must be ≥ 1.'); setTwSaving(false); return; }
    const { error } = await supabase.from('transfer_windows').insert({
      window_number: num,
      max_transfers: max,
      is_active: false,
      opens_at: twForm.opens_at || null,
      closes_at: twForm.closes_at || null,
    });
    setTwSaving(false);
    if (error) { setTwError(error.message); return; }
    setTwForm(EMPTY_TW_FORM);
    await fetchTransferWindows();
  }

  async function handleToggleTransferWindow(tw) {
    const activating = !tw.is_active;
    // Only one window active at a time — deactivate others first
    if (activating) {
      await supabase.from('transfer_windows').update({ is_active: false }).neq('id', tw.id);
    }
    await supabase.from('transfer_windows').update({ is_active: activating }).eq('id', tw.id);
    await fetchTransferWindows();
    if (activating) await fetchWindowActivity(tw.window_number);
  }

  async function handleDeleteTransferWindow(tw) {
    await supabase.from('transfer_windows').delete().eq('id', tw.id);
    await fetchTransferWindows();
  }
  // ──────────────────────────────────────────────────────────────────────────

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

  // ── Knockout helpers ──────────────────────────────────────────────────────

  function computeKnockoutStandings() {
    const byTeam = {};
    for (const t of knockoutTeams) {
      byTeam[t.id] = {
        team_id: t.id,
        display_name: t.users?.display_name ?? t.name ?? 'Unknown',
        total_points: 0,
        goals_scored: 0,
      };
    }
    for (const row of knockoutStandingsData) {
      if (!byTeam[row.team_id]) continue;
      byTeam[row.team_id].goals_scored += row.goals_scored ?? 0;
      if (row.total_points > byTeam[row.team_id].total_points) {
        byTeam[row.team_id].total_points = row.total_points;
      }
    }
    return Object.values(byTeam).sort((a, b) =>
      b.total_points !== a.total_points ? b.total_points - a.total_points : b.goals_scored - a.goals_scored
    );
  }

  async function handleSeedBracket() {
    setBracketSeeding(true);
    setBracketSeedResult(null);
    const standings = computeKnockoutStandings();
    const champSeed = generateChampionshipBracket(standings);
    const rows = champSeed.map(s => ({
      round: 1, bracket: 'championship', match_label: s.label,
      team_a_id: s.teamA.team_id, team_b_id: s.teamB.team_id,
    }));
    if (standings.length >= 12) {
      const relSeed = generateRelegationBracket(standings);
      relSeed.forEach(s => rows.push({
        round: 1, bracket: 'relegation', match_label: s.label,
        team_a_id: s.teamA.team_id, team_b_id: s.teamB.team_id,
      }));
    }
    const { error } = await supabase.from('knockout_matches').insert(rows);
    setBracketSeedResult(error ? { error: error.message } : { ok: true, count: rows.length });
    if (!error) await fetchKnockoutData();
    setBracketSeeding(false);
  }

  function buildNextRoundRows(round, results, existingKoMatches) {
    const exists = (bracket, r, label) =>
      existingKoMatches.some(m => m.bracket === bracket && m.round === r && m.match_label === label);
    const rows = [];

    if (round === 1) {
      const add = (bracket, label, aId, bId) => {
        if (aId && bId && !exists(bracket, 2, label))
          rows.push({ round: 2, bracket, match_label: label, team_a_id: aId, team_b_id: bId });
      };
      add('championship', 'Semi A',    results['Match A']?.w, results['Match B']?.w);
      add('championship', 'Semi B',    results['Match C']?.w, results['Match D']?.w);
      add('losers',       '5/6 Match', results['Match A']?.l, results['Match B']?.l);
      add('losers',       '7/8 Match', results['Match C']?.l, results['Match D']?.l);
      add('relegation',   '9th Place',  results['Match X']?.w, results['Match Y']?.w);
      add('relegation',   '11th Place', results['Match X']?.l, results['Match Y']?.l);
    }

    if (round === 2) {
      const wSA = results['Semi A']?.w, lSA = results['Semi A']?.l;
      const wSB = results['Semi B']?.w, lSB = results['Semi B']?.l;
      const w56 = results['5/6 Match']?.w, l56 = results['5/6 Match']?.l;
      const w78 = results['7/8 Match']?.w, l78 = results['7/8 Match']?.l;
      if (wSA && wSB && !exists('championship', 3, 'Final'))
        rows.push({ round: 3, bracket: 'championship', match_label: 'Final',     team_a_id: wSA, team_b_id: wSB });
      if (lSA && lSB && !exists('championship', 3, '3rd Place'))
        rows.push({ round: 3, bracket: 'championship', match_label: '3rd Place', team_a_id: lSA, team_b_id: lSB });
      if (w56 && l56 && !exists('losers', 3, '5th Place'))
        rows.push({ round: 3, bracket: 'losers', match_label: '5th Place', team_a_id: w56, team_b_id: l56, winner_id: w56, placement: '5th Place' });
      if (w78 && l78 && !exists('losers', 3, '7th Place'))
        rows.push({ round: 3, bracket: 'losers', match_label: '7th Place', team_a_id: w78, team_b_id: l78, winner_id: w78, placement: '7th Place' });
    }

    return rows;
  }

  async function handleCalculateKnockoutRound(round) {
    if (!knockoutCalcMatchdayId) {
      setKnockoutCalcResult({ errors: ['Select a matchday first.'] });
      return;
    }
    setKnockoutCalcRunning(true);
    setKnockoutCalcResult(null);
    const errors = [];
    const matchdayIdInt = parseInt(knockoutCalcMatchdayId, 10);

    const toResolve = knockoutMatches.filter(m => {
      if (m.winner_id) return false;
      if (m.round !== round) return false;
      if (round === 3 && m.bracket === 'losers') return false; // pre-set placement rows
      return true;
    });

    if (toResolve.length === 0) {
      setKnockoutCalcResult({ errors: ['No unresolved matches for this round.'] });
      setKnockoutCalcRunning(false);
      return;
    }

    const allTeamIds = [...new Set(toResolve.flatMap(m => [m.team_a_id, m.team_b_id]).filter(Boolean))];

    const { data: standingsRows } = await supabase
      .from('fantasy_standings')
      .select('team_id, matchday_points, goals_scored')
      .eq('matchday_id', matchdayIdInt)
      .in('team_id', allTeamIds);
    const mdStandings = Object.fromEntries((standingsRows ?? []).map(s => [s.team_id, s]));

    const [{ data: mdCaptains }, { data: nullCaptains }] = await Promise.all([
      supabase.from('lineups').select('team_id, player_id').eq('matchday_id', matchdayIdInt).eq('is_captain', true).in('team_id', allTeamIds),
      supabase.from('lineups').select('team_id, player_id').is('matchday_id', null).eq('is_captain', true).in('team_id', allTeamIds),
    ]);
    const captainMap = {};
    for (const r of nullCaptains ?? []) captainMap[r.team_id] = r.player_id;
    for (const r of mdCaptains ?? []) captainMap[r.team_id] = r.player_id;

    const captainPlayerIds = [...new Set(Object.values(captainMap))].filter(Boolean);
    const captainStatsMap = {};
    if (captainPlayerIds.length > 0) {
      const { data: cStats } = await supabase
        .from('player_stats')
        .select('player_id, total_points')
        .eq('matchday_id', matchdayIdInt)
        .in('player_id', captainPlayerIds);
      for (const s of cStats ?? []) captainStatsMap[s.player_id] = s.total_points ?? 0;
    }
    const getCaptainPts = (teamId) => {
      const pid = captainMap[teamId];
      return pid ? (captainStatsMap[pid] ?? 0) * 2 : 0;
    };

    const overallStandings = computeKnockoutStandings();
    const getRank = (teamId) => {
      const idx = overallStandings.findIndex(s => s.team_id === teamId);
      return idx >= 0 ? idx + 1 : 999;
    };

    const matchResults = {};
    const updates = [];

    for (const match of toResolve) {
      const aId = match.team_a_id;
      const bId = match.team_b_id;

      const aPoints  = mdStandings[aId]?.matchday_points ?? 0;
      const bPoints  = mdStandings[bId]?.matchday_points ?? 0;
      const aGoals   = mdStandings[aId]?.goals_scored ?? 0;
      const bGoals   = mdStandings[bId]?.goals_scored ?? 0;
      const aCaptain = getCaptainPts(aId);
      const bCaptain = getCaptainPts(bId);

      const winnerObj = resolveH2H({
        teamA: { team_id: aId, matchday_points: aPoints, captain_points: aCaptain, goals_scored: aGoals, league_rank: getRank(aId) },
        teamB: { team_id: bId, matchday_points: bPoints, captain_points: bCaptain, goals_scored: bGoals, league_rank: getRank(bId) },
      });
      const winnerId = winnerObj.team_id;
      const loserId  = winnerId === aId ? bId : aId;
      matchResults[match.match_label] = { w: winnerId, l: loserId };

      let placement;
      if (match.bracket === 'relegation') placement = match.match_label;
      else if (round === 3 && match.bracket === 'championship') {
        placement = match.match_label === 'Final' ? '1st Place' : '3rd Place';
      }

      updates.push({
        id: match.id,
        team_a_points: aPoints,  team_b_points: bPoints,
        team_a_captain_points: aCaptain, team_b_captain_points: bCaptain,
        team_a_goals: aGoals,    team_b_goals: bGoals,
        winner_id: winnerId,
        matchday_id: matchdayIdInt,
        ...(placement ? { placement } : {}),
      });
    }

    for (const { id, ...data } of updates) {
      const { error } = await supabase.from('knockout_matches').update(data).eq('id', id);
      if (error) errors.push(`Match update error: ${error.message}`);
    }

    const nextRows = buildNextRoundRows(round, matchResults, knockoutMatches);
    if (nextRows.length > 0) {
      const { error } = await supabase.from('knockout_matches').insert(nextRows);
      if (error) errors.push(`Next round creation error: ${error.message}`);
    }

    setKnockoutCalcResult({ resolved: updates.length, errors });
    await fetchKnockoutData();
    setKnockoutCalcRunning(false);
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

  // Split this round's players into single-bidder (awarded) vs multi-bidder (contested).
  const winnersPreview  = [];
  const contestedPreview = [];
  for (const playerId of biddedPlayerIds) {
    const highBid      = getHighestBid(playerId);
    const playerBids   = currentRoundBids.filter((b) => b.player_id === playerId);
    const uniqueBidders = new Set(playerBids.map((b) => b.user_id));
    const row = {
      playerId,
      playerName: highBid?.players?.name ?? `Player #${playerId}`,
      position:   highBid?.players?.position ?? '—',
      winnerName: highBid?.users?.display_name ?? '?',
      amount:     highBid?.bid_amount ?? 0,
      bidCount:   playerBids.length,
    };
    if (uniqueBidders.size > 1) {
      contestedPreview.push(row);
    } else {
      winnersPreview.push(row);
    }
  }

  async function handleResolveAndAdvance() {
    setResolving(true);
    setResolveErrors([]);
    const { errors } = await resolveRound();
    if (errors.length > 0) {
      setResolveErrors(errors);
      setResolving(false);
      return;
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
                onClick={handleCompleteAuction}
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
                onClick={handleCompleteAuction}
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

          {winnersPreview.length === 0 && contestedPreview.length === 0 ? (
            <p className="text-gray-500 text-sm">
              No bids were placed this round. Advancing will skip resolution.
            </p>
          ) : (
            <div className="space-y-4">
              {/* Awarded — single bidder */}
              {winnersPreview.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2">
                    Awarded ({winnersPreview.length}) — only one bidder
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-500 border-b border-gray-800">
                          <th className="pb-2 pr-4 font-medium">Player</th>
                          <th className="pb-2 pr-4 font-medium">Pos</th>
                          <th className="pb-2 pr-4 font-medium">Bid</th>
                          <th className="pb-2 font-medium">Winner</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800">
                        {winnersPreview.map((row) => (
                          <tr key={row.playerId} className="text-gray-300">
                            <td className="py-2 pr-4 text-white font-medium">{row.playerName}</td>
                            <td className="py-2 pr-4">
                              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${POSITION_BADGE[row.position] ?? 'bg-gray-800 text-gray-400'}`}>
                                {row.position}
                              </span>
                            </td>
                            <td className="py-2 pr-4 font-bold text-emerald-400">£{row.amount.toFixed(1)}</td>
                            <td className="py-2 text-white">{row.winnerName}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Contested — multiple bidders, carry over */}
              {contestedPreview.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-yellow-400 uppercase tracking-wider mb-2">
                    Contested ({contestedPreview.length}) — multiple bidders, carry to next round
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-500 border-b border-gray-800">
                          <th className="pb-2 pr-4 font-medium">Player</th>
                          <th className="pb-2 pr-4 font-medium">Pos</th>
                          <th className="pb-2 pr-4 font-medium">High Bid (floor)</th>
                          <th className="pb-2 font-medium">Leading</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800">
                        {contestedPreview.map((row) => (
                          <tr key={row.playerId} className="text-gray-300">
                            <td className="py-2 pr-4 text-white font-medium">{row.playerName}</td>
                            <td className="py-2 pr-4">
                              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${POSITION_BADGE[row.position] ?? 'bg-gray-800 text-gray-400'}`}>
                                {row.position}
                              </span>
                            </td>
                            <td className="py-2 pr-4 font-bold text-yellow-400">£{row.amount.toFixed(1)}</td>
                            <td className="py-2 text-gray-400 text-xs">{row.winnerName} (outbid to win)</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    These players are NOT awarded yet. Next round opens with a bid floor above £{Math.max(...contestedPreview.map(r => r.amount)).toFixed(1)}.
                  </p>
                </div>
              )}
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

      {/* ── Knockout Bracket ─────────────────────────────────────────────── */}
      {isCompleted && (
        <section className="bg-gray-900 rounded-xl p-6 space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-white">Knockout Bracket</h2>
            <p className="text-xs text-gray-500 mt-1">
              Seed after league stage (4 matchdays) is complete. Then calculate each round using that round's matchday.
            </p>
          </div>

          {knockoutLoading ? (
            <p className="text-gray-500 text-sm">Loading…</p>
          ) : knockoutMatches.length === 0 ? (
            // ── Not seeded ──
            (() => {
              const standings = computeKnockoutStandings();
              const champSeed = standings.length >= 8 ? generateChampionshipBracket(standings) : [];
              const relSeed   = standings.length >= 12 ? generateRelegationBracket(standings) : [];
              return (
                <div className="space-y-4">
                  {standings.length < 8 ? (
                    <p className="text-yellow-400 text-sm">
                      Need standings for at least 8 teams. Run Calculate Standings first.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-2">Championship (Top 8)</p>
                        <div className="grid grid-cols-2 gap-2">
                          {champSeed.map(m => (
                            <div key={m.label} className="bg-gray-800 rounded-lg px-3 py-2 text-xs">
                              <span className="text-gray-500">{m.label}: </span>
                              <span className="text-white">{m.teamA.display_name}</span>
                              <span className="text-gray-500"> vs </span>
                              <span className="text-white">{m.teamB.display_name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      {relSeed.length > 0 && (
                        <div>
                          <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-2">Relegation (Bottom 4)</p>
                          <div className="grid grid-cols-2 gap-2">
                            {relSeed.map(m => (
                              <div key={m.label} className="bg-gray-800 rounded-lg px-3 py-2 text-xs">
                                <span className="text-gray-500">{m.label}: </span>
                                <span className="text-white">{m.teamA.display_name}</span>
                                <span className="text-gray-500"> vs </span>
                                <span className="text-white">{m.teamB.display_name}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {bracketSeedResult && (
                    <div className={`rounded-lg px-3 py-2 text-sm ${bracketSeedResult.error ? 'bg-red-900/40 text-red-400' : 'bg-emerald-900/40 text-emerald-400'}`}>
                      {bracketSeedResult.error ?? `✓ Bracket seeded — ${bracketSeedResult.count} matches created.`}
                    </div>
                  )}

                  <button
                    onClick={handleSeedBracket}
                    disabled={bracketSeeding || standings.length < 8}
                    className="px-5 py-2 rounded-lg bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white font-semibold text-sm transition-colors"
                  >
                    {bracketSeeding ? 'Seeding…' : 'Seed Bracket'}
                  </button>
                </div>
              );
            })()
          ) : (
            // ── Bracket exists ──
            (() => {
              const champR1 = knockoutMatches.filter(m => m.bracket === 'championship' && m.round === 1);
              const champR2 = knockoutMatches.filter(m => m.bracket === 'championship' && m.round === 2);
              const champR3 = knockoutMatches.filter(m => m.bracket === 'championship' && m.round === 3);
              const r1Done  = champR1.length > 0 && champR1.every(m => m.winner_id);
              const r2Done  = champR2.length > 0 && champR2.every(m => m.winner_id);
              const r3Done  = champR3.length > 0 && champR3.every(m => m.winner_id);
              const activeRound = !r1Done ? 1 : !r2Done ? 2 : !r3Done ? 3 : null;

              return (
                <div className="space-y-4">
                  {/* Round status pills */}
                  <div className="grid grid-cols-3 gap-3">
                    {[1, 2, 3].map(r => {
                      const champMatches = knockoutMatches.filter(m => m.bracket === 'championship' && m.round === r);
                      const done = champMatches.length > 0 && champMatches.every(m => m.winner_id);
                      const pending = champMatches.length > 0 && !done;
                      return (
                        <div key={r} className={`rounded-lg px-3 py-2 text-center ${done ? 'bg-emerald-900/40 border border-emerald-700/40' : pending ? 'bg-yellow-900/20 border border-yellow-700/30' : 'bg-gray-800 border border-gray-700'}`}>
                          <p className={`text-xs font-semibold ${done ? 'text-emerald-400' : pending ? 'text-yellow-400' : 'text-gray-500'}`}>
                            Round {r}
                          </p>
                          <p className="text-[10px] text-gray-500 mt-0.5">
                            {done ? 'Complete' : pending ? 'Pending' : 'Not started'}
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  {/* Unresolved matches for the active round */}
                  {activeRound && (() => {
                    const pending = knockoutMatches.filter(m => m.round === activeRound && !m.winner_id && !(m.round === 3 && m.bracket === 'losers'));
                    return (
                      <div className="space-y-3">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-gray-500 border-b border-gray-800">
                                <th className="pb-2 pr-4 font-medium text-xs">Match</th>
                                <th className="pb-2 pr-4 font-medium text-xs">Team A</th>
                                <th className="pb-2 pr-4 font-medium text-xs">Team B</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800">
                              {pending.map(m => (
                                <tr key={m.id} className="text-gray-300">
                                  <td className="py-2 pr-4">
                                    <span className="text-[10px] text-gray-500 capitalize">{m.bracket}</span>
                                    <span className="ml-1.5 text-white text-xs font-medium">{m.match_label}</span>
                                  </td>
                                  <td className="py-2 pr-4 text-xs">{m.team_a?.users?.display_name ?? m.team_a?.name ?? 'TBD'}</td>
                                  <td className="py-2 text-xs">{m.team_b?.users?.display_name ?? m.team_b?.name ?? 'TBD'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <div className="flex items-end gap-4 flex-wrap pt-1">
                          <div className="flex-1 min-w-48">
                            <label className="block text-xs text-gray-500 mb-1">Matchday for Round {activeRound}</label>
                            <select
                              value={knockoutCalcMatchdayId}
                              onChange={e => { setKnockoutCalcMatchdayId(e.target.value); setKnockoutCalcResult(null); }}
                              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-600"
                            >
                              <option value="">Select matchday…</option>
                              {matchdays.map(md => (
                                <option key={md.id} value={md.id}>{md.name} — {md.wc_stage}</option>
                              ))}
                            </select>
                          </div>
                          <button
                            onClick={() => handleCalculateKnockoutRound(activeRound)}
                            disabled={knockoutCalcRunning || !knockoutCalcMatchdayId}
                            className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-sm transition-colors"
                          >
                            {knockoutCalcRunning ? 'Calculating…' : `Calculate Round ${activeRound}`}
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  {activeRound === null && (
                    <p className="text-emerald-400 text-sm font-semibold">
                      ✓ All rounds complete. View final standings on the Bracket page.
                    </p>
                  )}

                  {knockoutCalcResult && (
                    <div className={`rounded-lg p-4 space-y-1 ${knockoutCalcResult.errors?.length && !knockoutCalcResult.resolved ? 'bg-red-900/40 border border-red-800/50' : 'bg-gray-800'}`}>
                      {knockoutCalcResult.resolved > 0 && (
                        <p className="text-emerald-400 text-sm font-semibold">
                          ✓ {knockoutCalcResult.resolved} match{knockoutCalcResult.resolved !== 1 ? 'es' : ''} resolved.
                        </p>
                      )}
                      {knockoutCalcResult.errors?.map((err, i) => (
                        <p key={i} className="text-yellow-400 text-xs">{err}</p>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()
          )}
        </section>
      )}

      {/* ── Player Pool ──────────────────────────────────────────────────── */}
      {/* ── Transfer Windows ─────────────────────────────────────────────── */}
      <section className="bg-gray-900 rounded-xl p-6 space-y-5">
        <h2 className="text-lg font-semibold text-white">Transfer Windows</h2>

        {/* Quick-create preset buttons */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Quick Create
          </p>
          <div className="flex flex-wrap gap-2">
            {WINDOW_DEFAULTS.map((preset) => (
              <button
                key={preset.window_number}
                onClick={() => handleCreateTransferWindow(preset)}
                disabled={twSaving}
                className="px-3 py-1.5 rounded-lg text-sm bg-blue-800 hover:bg-blue-700 text-blue-100 transition-colors disabled:opacity-50"
              >
                + {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom create form */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Custom Window
          </p>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Window #</label>
              <select
                value={twForm.window_number}
                onChange={(e) => setTwForm((f) => ({ ...f, window_number: e.target.value }))}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-600"
              >
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Max Transfers</label>
              <input
                type="number"
                min="1"
                value={twForm.max_transfers}
                onChange={(e) => setTwForm((f) => ({ ...f, max_transfers: e.target.value }))}
                className="w-20 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-600"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Opens At (optional)</label>
              <input
                type="datetime-local"
                value={twForm.opens_at}
                onChange={(e) => setTwForm((f) => ({ ...f, opens_at: e.target.value }))}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-600"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Closes At (optional)</label>
              <input
                type="datetime-local"
                value={twForm.closes_at}
                onChange={(e) => setTwForm((f) => ({ ...f, closes_at: e.target.value }))}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-600"
              />
            </div>
            <button
              onClick={() => handleCreateTransferWindow(null)}
              disabled={twSaving}
              className="px-4 py-1.5 rounded-lg text-sm bg-blue-700 hover:bg-blue-600 text-white transition-colors disabled:opacity-50"
            >
              {twSaving ? 'Creating…' : 'Create'}
            </button>
          </div>
          {twError && <p className="text-red-400 text-sm mt-2">{twError}</p>}
        </div>

        {/* Windows list */}
        {twLoading ? (
          <p className="text-gray-500 text-sm">Loading windows…</p>
        ) : transferWindows.length === 0 ? (
          <p className="text-gray-500 text-sm">No transfer windows created yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-800">
                  <th className="pb-2 pr-4 font-medium">Window</th>
                  <th className="pb-2 pr-4 font-medium">Max</th>
                  <th className="pb-2 pr-4 font-medium">Opens</th>
                  <th className="pb-2 pr-4 font-medium">Closes</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {transferWindows.map((tw) => (
                  <tr key={tw.id} className="text-gray-300">
                    <td className="py-2.5 pr-4 font-semibold text-white">Window {tw.window_number}</td>
                    <td className="py-2.5 pr-4">{tw.max_transfers} transfers</td>
                    <td className="py-2.5 pr-4 text-gray-500 text-xs">
                      {tw.opens_at ? new Date(tw.opens_at).toLocaleString() : '—'}
                    </td>
                    <td className="py-2.5 pr-4 text-gray-500 text-xs">
                      {tw.closes_at ? new Date(tw.closes_at).toLocaleString() : '—'}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                        tw.is_active
                          ? 'bg-emerald-800 text-emerald-200'
                          : 'bg-gray-700 text-gray-400'
                      }`}>
                        {tw.is_active ? 'Open' : 'Closed'}
                      </span>
                    </td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggleTransferWindow(tw)}
                          className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                            tw.is_active
                              ? 'bg-red-800 hover:bg-red-700 text-red-200'
                              : 'bg-emerald-800 hover:bg-emerald-700 text-emerald-200'
                          }`}
                        >
                          {tw.is_active ? 'Close' : 'Open'}
                        </button>
                        {tw.is_active && (
                          <button
                            onClick={() => fetchWindowActivity(tw.window_number)}
                            disabled={activityLoading}
                            className="px-3 py-1 rounded text-xs font-semibold bg-blue-800 hover:bg-blue-700 text-blue-200 transition-colors"
                          >
                            {activityLoading ? 'Loading…' : 'View Activity'}
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteTransferWindow(tw)}
                          className="px-3 py-1 rounded text-xs font-semibold bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Transfer activity for active window */}
        {windowActivity.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Transfer Activity — Window {windowActivity[0]?.window_number}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-800">
                    <th className="pb-2 pr-4 font-medium">Manager</th>
                    <th className="pb-2 pr-4 font-medium">Out</th>
                    <th className="pb-2 pr-4 font-medium">In</th>
                    <th className="pb-2 pr-4 font-medium">Type</th>
                    <th className="pb-2 pr-4 font-medium">Δ Budget</th>
                    <th className="pb-2 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {windowActivity.map((t) => (
                    <tr key={t.id} className="text-gray-300">
                      <td className="py-2 pr-4 font-medium text-white">
                        {t.team?.users?.display_name ?? t.team?.name ?? '—'}
                      </td>
                      <td className="py-2 pr-4 text-red-300">
                        {t.player_out?.name ?? '—'}
                        {t.player_out?.position && (
                          <span className={`ml-1.5 text-[9px] px-1 py-0.5 rounded font-semibold ${POSITION_BADGE[t.player_out.position]}`}>
                            {t.player_out.position}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-emerald-300">
                        {t.player_in?.name ?? '—'}
                        {t.player_in?.position && (
                          <span className={`ml-1.5 text-[9px] px-1 py-0.5 rounded font-semibold ${POSITION_BADGE[t.player_in.position]}`}>
                            {t.player_in.position}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                          t.transfer_type === 'locked_swap'
                            ? 'bg-purple-800/60 text-purple-300'
                            : 'bg-blue-800/60 text-blue-300'
                        }`}>
                          {t.transfer_type === 'locked_swap' ? 'Locked' : 'Free'}
                        </span>
                      </td>
                      <td className={`py-2 pr-4 text-xs font-semibold ${
                        (t.price_difference ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
                      }`}>
                        {t.price_difference != null
                          ? `${(t.price_difference >= 0 ? '+' : '')}${Number(t.price_difference).toFixed(1)}M`
                          : '—'}
                      </td>
                      <td className="py-2 text-gray-500 text-xs">
                        {new Date(t.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

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
