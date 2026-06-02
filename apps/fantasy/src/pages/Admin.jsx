import { useState, useEffect, useCallback } from 'react';
import { useAuction } from '../context/AuctionContext';
import { usePlayers } from '../hooks/usePlayers';
import AuctionTimer from '../components/auction/AuctionTimer';
import { supabase } from '@predictor/supabase';
import { AUCTION_STATUSES } from '../config/constants';
import { calculatePlayerPoints, calculateOptaPoints } from '../lib/scoring';
import { buildDefaultLineup } from '../lib/defaultLineup';
import { calculateTeamMatchdayPoints } from '../lib/matchday';
import { generateChampionshipBracket, resolveH2H } from '../lib/brackets';

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
  pending:   'bg-border text-secondary',
  active:    'bg-tertiary text-on-tertiary',
  paused:    'bg-warning text-on-warning',
  completed: 'bg-info text-on-info',
};

const POSITION_BADGE = {
  GK:  'bg-warning/15 text-warning',
  DEF: 'bg-info/15 text-info',
  MID: 'bg-tertiary/15 text-tertiary',
  FWD: 'bg-error/10 text-error',
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
    endRound,
    resolveRound,
  } = useAuction();

  // Completes the auction, auto-creates default lineups for full squads, then activates the first matchday.
  async function handleCompleteAuction() {
    await completeAuction();

    // Auto-create pre-tournament (matchday_id = null) lineups for every full squad.
    const warnings = [];
    const [{ data: teams }, { data: existingLineups }] = await Promise.all([
      supabase
        .from('teams')
        .select('id, name, team_players(player_id, acquisition_price, players(id, name, position, price))'),
      supabase.from('lineups').select('team_id').is('matchday_id', null),
    ]);

    const teamsWithLineup = new Set((existingLineups ?? []).map(r => r.team_id));
    const toInsert = [];

    for (const team of teams ?? []) {
      if (teamsWithLineup.has(team.id)) continue; // idempotent — lineup already exists
      const squad = (team.team_players ?? []).map(tp => ({
        id: tp.player_id,
        position: tp.players?.position ?? 'FWD',
        price: tp.players?.price ?? 0,
      }));
      if (squad.length < 15) {
        warnings.push(`${team.name}: only ${squad.length}/15 players — no default lineup created.`);
        continue;
      }
      if (!squad.some((p) => p.position === 'GK')) {
        warnings.push(`${team.name}: no goalkeeper in squad!`);
      }
      const { starters, bench, captainId } = buildDefaultLineup(squad);
      for (const p of starters) {
        toInsert.push({ team_id: team.id, player_id: p.id, matchday_id: null, is_starting: true, is_captain: p.id === captainId, bench_order: null });
      }
      bench.forEach((p, i) => {
        toInsert.push({ team_id: team.id, player_id: p.id, matchday_id: null, is_starting: false, is_captain: false, bench_order: i + 1 });
      });
    }

    if (toInsert.length > 0) {
      const { error } = await supabase.from('lineups').insert(toInsert);
      if (error) warnings.push(`Lineup insert error: ${error.message}`);
    }

    setLineupWarnings(warnings);

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
  const [lineupWarnings, setLineupWarnings] = useState([]);

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

  function parseCsv(text) {
    const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    return lines.slice(1).map(line => {
      const vals = line.split(',').map(v => v.trim());
      return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']));
    });
  }

  // ── Standings Calculation ─────────────────────────────────────────────────
  const [calcMatchdayId, setCalcMatchdayId] = useState('');
  const [calcRunning, setCalcRunning] = useState(false);
  const [calcResult, setCalcResult] = useState(null);
  const [savingSystem, setSavingSystem] = useState(false);
  const [standingsPreview, setStandingsPreview] = useState(null); // { matchdayId, rows, toStamp, errors }
  const [previewReady, setPreviewReady] = useState(false);
  const [confirmingSave, setConfirmingSave] = useState(false);

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

  // ── Matchday Fixtures ─────────────────────────────────────────────────────
  const [fixtureMatches, setFixtureMatches] = useState([]);
  const [fixtureLoading, setFixtureLoading] = useState(false);
  const [fixtureSavingIds, setFixtureSavingIds] = useState(new Set());

  const fetchFixtureMatches = useCallback(async () => {
    setFixtureLoading(true);
    const { data } = await supabase
      .from('matches')
      .select('id, match_code, team_a, team_b, match_date, matchday_id')
      .order('match_date', { ascending: true });
    setFixtureMatches(data ?? []);
    setFixtureLoading(false);
  }, []);

  useEffect(() => { fetchFixtureMatches(); }, [fetchFixtureMatches]);

  async function handleFixtureMatchdayChange(matchId, newMatchdayId) {
    setFixtureSavingIds(prev => new Set(prev).add(matchId));
    await supabase
      .from('matches')
      .update({ matchday_id: newMatchdayId === '' ? null : Number(newMatchdayId) })
      .eq('id', matchId);
    setFixtureSavingIds(prev => { const s = new Set(prev); s.delete(matchId); return s; });
    await fetchFixtureMatches();
  }
  // ──────────────────────────────────────────────────────────────────────────

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

  async function fetchTransferWindows() {
    const { data } = await supabase
      .from('transfer_windows')
      .select('*')
      .order('window_number');
    setTransferWindows(data ?? []);
    setTwLoading(false);
  }

  useEffect(() => {
    supabase.from('transfer_windows').select('*').order('window_number').then(({ data }) => {
      setTransferWindows(data ?? []);
      setTwLoading(false);
    });
  }, []);

  async function fetchWindowActivity(windowNumber) {
    setActivityLoading(true);
    const { data } = await supabase
      .from('transfers')
      .select(`
        id, window_number, price_difference, created_at,
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
    setTwLoading(true);
    await fetchTransferWindows();
  }

  async function handleToggleTransferWindow(tw) {
    const activating = !tw.is_active;
    // Only one window active at a time — deactivate others first
    if (activating) {
      await supabase.from('transfer_windows').update({ is_active: false }).neq('id', tw.id);
    }
    await supabase.from('transfer_windows').update({ is_active: activating }).eq('id', tw.id);
    setTwLoading(true);
    await fetchTransferWindows();
    if (activating) await fetchWindowActivity(tw.window_number);
  }

  async function handleDeleteTransferWindow(tw) {
    await supabase.from('transfer_windows').delete().eq('id', tw.id);
    setTwLoading(true);
    await fetchTransferWindows();
  }
  // ──────────────────────────────────────────────────────────────────────────

  // ── 5a. Scoring system toggle ─────────────────────────────────────────────
  async function handleSaveScoringSystem(system) {
    setSavingSystem(true);
    await supabase
      .from('auction_state')
      .update({ scoring_system: system })
      .eq('id', auctionState.id);
    setSavingSystem(false);
  }

  // ── 5c. Calculate Standings — step 1: preview (no DB write) ──────────────
  async function handleCalculateStandings(e) {
    e.preventDefault();
    setCalcResult(null);
    setStandingsPreview(null);
    setPreviewReady(false);
    if (!calcMatchdayId) { setCalcResult({ errors: ['Select a matchday.'] }); return; }
    setCalcRunning(true);

    const matchdayIdInt = parseInt(calcMatchdayId, 10);
    const errors = [];

    // 1. Fetch all teams
    const { data: teams } = await supabase.from('teams').select('id, name');
    if (!teams?.length) { setCalcResult({ errors: ['No teams found.'] }); setCalcRunning(false); return; }

    // 2. Fetch all player_stats — include all Opta columns so both scorers work
    const { data: allStats } = await supabase
      .from('player_stats')
      .select('player_id, minutes_played, goals, assists, clean_sheet, saves, penalty_saves, penalty_misses, yellow_cards, red_cards, own_goals, goals_conceded, total_points, shots_on_target, shots_off_target, blocked_shots, tackles, interceptions, fouls_won, fouls_conceded, offsides, passes, crosses, penalties_won, opta_points')
      .eq('matchday_id', matchdayIdInt);
    const statsMap = Object.fromEntries((allStats ?? []).map(s => [s.player_id, s]));

    // 3. Fetch all players for position lookup
    const { data: allPlayers } = await supabase.from('players').select('id, position');
    const positionMap = Object.fromEntries((allPlayers ?? []).map(p => [p.id, p.position]));

    // 4. Fetch lineups — prefer matchday-specific, fall back to pre-tournament (null)
    const { data: matchdayLineups } = await supabase
      .from('lineups')
      .select('team_id, player_id, is_starting, is_captain, bench_order')
      .eq('matchday_id', matchdayIdInt);

    const { data: nullLineups } = await supabase
      .from('lineups')
      .select('team_id, player_id, is_starting, is_captain, bench_order')
      .is('matchday_id', null);

    const matchdayTeamIds = new Set((matchdayLineups ?? []).map(r => r.team_id));
    const allLineups = [
      ...(matchdayLineups ?? []),
      ...(nullLineups ?? []).filter(r => !matchdayTeamIds.has(r.team_id)),
    ];

    // 5. Fetch matchday_points from OTHER matchdays — idempotent on re-runs
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

    // Opta scorer: prefers stored opta_points, falls back to computed
    const optaScorer = (stats, position) =>
      stats.opta_points != null ? stats.opta_points : calculateOptaPoints(stats, position);

    // 6. Compute both scoring systems for every team
    const previewRows = [];

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

      const defCount = starters.filter(p => p.position === 'DEF').length;
      const midCount = starters.filter(p => p.position === 'MID').length;
      const fwdCount = starters.filter(p => p.position === 'FWD').length;
      const formation = `${defCount}-${midCount}-${fwdCount}`;

      const lineupArgs = { starters, bench, captainId, formation };

      const { totalPoints: currentPts, goalsScored } = calculateTeamMatchdayPoints(lineupArgs, statsMap, positionMap, calculatePlayerPoints);
      const { totalPoints: optaPts } = calculateTeamMatchdayPoints(lineupArgs, statsMap, positionMap, optaScorer);

      const prev = prevByTeam[team.id] ?? { pts: 0, goals: 0 };

      previewRows.push({
        teamId: team.id,
        teamName: team.name,
        currentPts,     // integer (FPL)
        optaPts,        // float (Opta, with captain ×2)
        prevPts: prev.pts,
        prevGoals: prev.goals,
        goalsScored,
      });
    }

    // Lineup stamp rows — deferred to confirm step
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

    setStandingsPreview({ matchdayId: matchdayIdInt, rows: previewRows, toStamp, errors });
    setPreviewReady(true);
    setCalcRunning(false);
  }

  // ── 5c. Calculate Standings — step 2: confirm & write ────────────────────
  async function handleConfirmStandings() {
    if (!standingsPreview) return;
    setConfirmingSave(true);

    const { matchdayId, rows, toStamp, errors: previewErrors } = standingsPreview;
    const errors = [...previewErrors];
    const isOpta = (auctionState.scoring_system ?? 'current') === 'opta';

    const upsertRows = rows.map(r => {
      const rawPts = isOpta ? r.optaPts : r.currentPts;
      return {
        team_id: r.teamId,
        matchday_id: matchdayId,
        matchday_points: Math.round(rawPts),
        total_points: Math.round(r.prevPts + rawPts),
        goals_scored: r.goalsScored,
      };
    });

    if (upsertRows.length > 0) {
      const { error } = await supabase
        .from('fantasy_standings')
        .upsert(upsertRows, { onConflict: 'team_id,matchday_id' });
      if (error) errors.push(`DB error: ${error.message}`);
    }

    // Stamp null-matchday lineups as matchday-specific — permanent historical record
    if (toStamp.length > 0) {
      const { error: stampErr } = await supabase
        .from('lineups')
        .upsert(toStamp, { onConflict: 'team_id,matchday_id,player_id' });
      if (stampErr) errors.push(`Lineup stamp error: ${stampErr.message}`);
    }

    setCalcResult({ teamsScored: upsertRows.length, errors });
    setPreviewReady(false);
    setStandingsPreview(null);
    setConfirmingSave(false);
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
      const wA = results['Match A']?.w, wB = results['Match B']?.w;
      const wC = results['Match C']?.w, wD = results['Match D']?.w;
      if (wA && wB && !exists('championship', 2, 'Semi A'))
        rows.push({ round: 2, bracket: 'championship', match_label: 'Semi A', team_a_id: wA, team_b_id: wB });
      if (wC && wD && !exists('championship', 2, 'Semi B'))
        rows.push({ round: 2, bracket: 'championship', match_label: 'Semi B', team_a_id: wC, team_b_id: wD });
    }

    if (round === 2) {
      const wSA = results['Semi A']?.w, wSB = results['Semi B']?.w;
      if (wSA && wSB && !exists('championship', 3, 'Final'))
        rows.push({ round: 3, bracket: 'championship', match_label: 'Final', team_a_id: wSA, team_b_id: wSB });
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
      if (round === 3 && match.match_label === 'Final') {
        placement = '1st Place';
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

  // ── CSV Player Import ───────────────────────────────────────────
  const [csvImportFile, setCsvImportFile] = useState(null);
  const [csvImportRunning, setCsvImportRunning] = useState(false);
  const [csvImportResult, setCsvImportResult] = useState(null);

  async function handleCsvPlayerImport(e) {
    e.preventDefault();
    setCsvImportResult(null);
    if (!csvImportFile) { setCsvImportResult({ errors: ['Select a CSV file.'] }); return; }

    setCsvImportRunning(true);
    const text = await csvImportFile.text();
    const rows = parseCsv(text);
    if (rows.length === 0) {
      setCsvImportResult({ errors: ['CSV is empty or has no data rows.'] });
      setCsvImportRunning(false);
      return;
    }

    // Fetch existing players for ded up by normName(name)|normName(country)
    const { data: existing } = await supabase.from('players').select('id, name, country');
    const normName = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const existingSet = new Set(
      (existing ?? []).map(p => `${normName(p.name)}|${normName(p.country)}`)
    );

    const VALID_POSITIONS = new Set(['GK', 'DEF', 'MID', 'FWD']);
    const toInsert = [];
    const skipped = [];
    const errors = [];

    for (const row of rows) {
      const name         = (row['name'] ?? '').trim();
      const country      = (row['country'] ?? '').trim();
      const country_code = (row['country_code'] ?? '').trim() || null;
      const position     = (row['position'] ?? '').trim().toUpperCase();
      const photo_url    = (row['photo_url'] ?? '').trim() || null;
      const priceRaw     = (row['price'] ?? '').trim();
      const price        = parseFloat(priceRaw);

      if (!name)                          { errors.push(`Row missing name: ${JSON.stringify(row)}`); continue; }
      if (!country)                       { errors.push(`"${name}": missing country`); continue; }
      if (!VALID_POSITIONS.has(position)) { errors.push(`"${name}": invalid position "${row['position']}" — must be GK, DEF, MID, or FWD`); continue; }
      if (isNaN(price) || price <= 0)     { errors.push(`"${name}": invalid price "${priceRaw}"`); continue; }

      const key = `${normName(name)}|${normName(country)}`;
      if (existingSet.has(key)) { skipped.push(name); continue; }

      // current_price = price at import time (no auction run yet)
      toInsert.push({ name, country, country_code, position, price, current_price: price, photo_url });
      existingSet.add(key); // prevent duplicates within the same CSV
    }

    let created = 0;
    if (toInsert.length > 0) {
      const { error, data: inserted } = await supabase
        .from('players')
        .insert(toInsert)
        .select('id');
      if (error) {
        errors.push(`DB error: ${error.message}`);
      } else {
        created = inserted?.length ?? toInsert.length;
      }
    }

    setCsvImportResult({ created, skipped, errors });
    setCsvImportFile(null);
    setCsvImportRunning(false);
  }
  // ────────────────────────────────────────────────────────────────────────────

  // ── Opta JSON Stats Upload ────────────────────────────────────────────────
  const [optaMatchdayId, setOptaMatchdayId] = useState('');
  const [optaFile, setOptaFile] = useState(null);
  const [optaUploading, setOptaUploading] = useState(false);
  const [optaResult, setOptaResult] = useState(null);

  async function handleOptaUpload(e) {
    e.preventDefault();
    setOptaResult(null);
    if (!optaMatchdayId) { setOptaResult({ errors: ['Select a matchday first.'] }); return; }
    if (!optaFile)        { setOptaResult({ errors: ['Select a JSON file.'] }); return; }

    setOptaUploading(true);
    let json;
    try {
      const text = await optaFile.text();
      json = JSON.parse(text);
    } catch {
      setOptaResult({ errors: ['Invalid JSON file.'] });
      setOptaUploading(false);
      return;
    }

    if (!json.match || !Array.isArray(json.players) || json.players.length === 0) {
      setOptaResult({ errors: ['JSON missing required "match" or "players" fields.'] });
      setOptaUploading(false);
      return;
    }

    const matchdayId = parseInt(optaMatchdayId, 10);
    const errors = [];

    // Upsert match_metadata row
    const { error: metaError } = await supabase
      .from('match_metadata')
      .upsert({
        matchday_id: matchdayId,
        competition: json.match.competition ?? null,
        match_date:  json.match.date ?? null,
        home_team:   json.match.home_team,
        away_team:   json.match.away_team,
        score_home:  json.match.score?.home ?? null,
        score_away:  json.match.score?.away ?? null,
      }, { onConflict: 'matchday_id,home_team,away_team' });

    if (metaError) errors.push(`match_metadata error: ${metaError.message}`);

    // Fetch all players for name-normalization lookup
    const { data: allPlayers } = await supabase.from('players').select('id, name, position');
    const normName = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    const playerMap = Object.fromEntries((allPlayers ?? []).map(p => [normName(p.name), p]));

    const toUpsert = [];

    for (const p of json.players) {
      const player = playerMap[normName(p.name)];
      if (!player) { errors.push(`Player not found: "${p.name}"`); continue; }

      const minutes_played   = p.MP    ?? 0;
      const goals            = p.G     ?? 0;
      const assists          = p.A     ?? 0;
      const yellow_cards     = p.YC    ?? 0;
      const red_cards        = p.RC    ?? 0;
      const own_goals        = p.OG    ?? 0;
      const goals_conceded   = p.GC    ?? 0;
      const saves            = p.SAV   ?? 0;
      const penalty_saves    = p.PSAV  ?? 0;
      const shots_on_target  = p.SOnT  ?? 0;
      const shots_off_target = p.SOffT ?? 0;
      const blocked_shots    = p.BS    ?? 0;
      const tackles          = p.Tk    ?? 0;
      const interceptions    = p.INT   ?? 0;
      const fouls_won        = p.FW    ?? 0;
      const fouls_conceded   = p.FC    ?? 0;
      const offsides         = p.O     ?? 0;
      const passes           = p.P     ?? 0;
      const crosses          = p.C     ?? 0;
      const penalties_won    = p.PW    ?? 0;
      const opta_points      = p.PTS   ?? null;
      // Opta has no clean-sheet field — derive from GC + minutes
      const clean_sheet = goals_conceded === 0 && minutes_played >= 60;

      const stats = {
        minutes_played, goals, assists, clean_sheet, saves,
        penalty_saves, penalty_misses: 0, yellow_cards, red_cards,
        own_goals, goals_conceded,
      };
      const total_points = calculatePlayerPoints(stats, player.position);

      toUpsert.push({
        player_id: player.id,
        matchday_id: matchdayId,
        minutes_played,
        goals,
        assists,
        clean_sheet,
        saves,
        penalty_saves,
        penalty_misses: 0,
        yellow_cards,
        red_cards,
        own_goals,
        goals_conceded,
        shots_on_target,
        shots_off_target,
        blocked_shots,
        tackles,
        interceptions,
        fouls_won,
        fouls_conceded,
        offsides,
        passes,
        crosses,
        penalties_won,
        opta_points,
        total_points,
      });
    }

    let inserted = 0;
    if (toUpsert.length > 0) {
      const { error } = await supabase
        .from('player_stats')
        .upsert(toUpsert, { onConflict: 'player_id,matchday_id' });
      if (error) {
        errors.push(`DB error: ${error.message}`);
      } else {
        inserted = toUpsert.length;
      }
    }

    setOptaResult({ inserted, errors });
    setOptaFile(null);
    setOptaUploading(false);
  }
  // ──────────────────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="text-secondary p-6">Loading auction state…</div>;
  }
  if (!auctionState) {
    return (
      <div className="text-error p-6">
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
    await fetchParticipants();
    setResolving(false);
    setConfirming(false);
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-primary">Admin Panel</h1>
        <span className={`px-3 py-1 rounded-full text-sm font-semibold capitalize ${STATUS_BADGE[status]}`}>
          {status}
        </span>
      </div>

      {/* ── League Participants ──────────────────────────────────────────── */}
      <section className="bg-surface rounded-xl p-6 space-y-4">
        <div className="flex items-baseline gap-3">
          <h2 className="text-lg font-semibold text-primary">League Participants</h2>
          {!participantsLoading && (
            <span className="text-sm text-muted">
              {participants.filter((u) => u.teams).length} of {participants.length} users enrolled
            </span>
          )}
        </div>

        {isCompleted && (
          <p className="text-xs text-muted bg-surface-hover rounded-lg px-3 py-2">
            Auction complete. New enrollments will access unwon players via the free market.
          </p>
        )}

        {participantsLoading ? (
          <p className="text-muted text-sm">Loading users…</p>
        ) : participants.length === 0 ? (
          <p className="text-muted text-sm">No registered users found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted border-b border-border">
                  <th className="pb-3 pr-4 font-medium">User</th>
                  <th className="pb-3 pr-4 font-medium">Email</th>
                  <th className="pb-3 pr-4 font-medium">Status</th>
                  <th className="pb-3 pr-4 font-medium">Budget</th>
                  <th className="pb-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {participants.map((u) => (
                  <tr key={u.id} className="text-secondary hover:bg-surface-hover/40">
                    <td className="py-2.5 pr-4 text-primary font-medium">{u.display_name}</td>
                    <td className="py-2.5 pr-4 text-secondary text-xs">{u.email}</td>
                    <td className="py-2.5 pr-4">
                      {u.teams ? (
                        <span className="px-2 py-0.5 rounded text-xs font-semibold bg-tertiary/15 text-tertiary">
                          Enrolled
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-xs font-semibold bg-border text-secondary">
                          No team
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 text-secondary">
                      {u.teams ? `£${Number(u.teams.budget_remaining).toFixed(1)}` : '—'}
                    </td>
                    <td className="py-2.5">
                      {u.teams ? (
                        <button
                          onClick={() => handleRemoveFromLeague(u.id)}
                          className="text-xs text-error hover:text-error transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
                        >
                          Remove
                        </button>
                      ) : (
                        <button
                          onClick={() => handleAddToLeague(u)}
                          disabled={addingTeamFor === u.id}
                          className="px-3 py-1 rounded bg-tertiary hover:bg-tertiary disabled:opacity-50 text-primary text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
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
      <section className="bg-surface rounded-xl p-6 space-y-5">
        <h2 className="text-lg font-semibold text-primary">Auction Controls</h2>

        <div className="grid grid-cols-3 gap-6 text-sm">
          <div>
            <p className="text-muted mb-1">Round</p>
            <p className="text-primary text-2xl font-bold">{current_round || '—'}</p>
          </div>
          <div>
            <p className="text-muted mb-1">Round Duration</p>
            <p className="text-primary text-2xl font-bold">{round_duration_seconds}s</p>
          </div>
          <div>
            <p className="text-muted mb-1">{isActive ? 'Time Remaining' : 'Round Started'}</p>
            {isActive ? (
              <AuctionTimer
                roundStartedAt={round_started_at}
                roundDurationSeconds={round_duration_seconds}
              />
            ) : (
              <p className="text-primary font-medium">
                {round_started_at
                  ? new Date(round_started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                  : '—'}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-3 pt-1">
          {isPending && (
            <button
              onClick={startAuction}
              className="px-5 py-2 rounded-lg bg-tertiary hover:bg-tertiary text-on-tertiary font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
            >
              Start Auction
            </button>
          )}

          {isActive && (
            <>
              <button
                onClick={pauseAuction}
                className="px-5 py-2 rounded-lg bg-warning hover:bg-tertiary text-on-warning font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
              >
                Pause
              </button>
              <button
                onClick={endRound}
                className="px-5 py-2 rounded-lg bg-surface-hover hover:brightness-95 text-primary font-semibold border border-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
                title="End the round early (stops bidding now). Then Resolve & Next Round."
              >
                End Round
              </button>
              <button
                onClick={() => { setConfirming(true); setResolveErrors([]); }}
                disabled={confirming}
                className="px-5 py-2 rounded-lg bg-tertiary hover:bg-tertiary disabled:opacity-50 text-on-tertiary font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
              >
                Resolve & Next Round →
              </button>
              <button
                onClick={handleCompleteAuction}
                className="px-5 py-2 rounded-lg bg-error hover:brightness-90 text-on-error font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
              >
                Complete Auction
              </button>
            </>
          )}

          {isPaused && (
            <>
              <button
                onClick={resumeAuction}
                className="px-5 py-2 rounded-lg bg-tertiary hover:bg-tertiary text-on-tertiary font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
              >
                Resume
              </button>
              <button
                onClick={handleCompleteAuction}
                className="px-5 py-2 rounded-lg bg-error hover:brightness-90 text-on-error font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
              >
                Complete Auction
              </button>
            </>
          )}

          {isCompleted && (
            <p className="text-muted text-sm italic">Auction is complete. No further actions available.</p>
          )}
        </div>

        {lineupWarnings.length > 0 && (
          <div className="bg-warning/10 border border-warning/30 rounded-lg p-4 space-y-1">
            <p className="text-warning text-sm font-semibold">Default lineup warnings:</p>
            {lineupWarnings.map((w, i) => (
              <p key={i} className="text-warning text-xs">{w}</p>
            ))}
          </div>
        )}
      </section>

      {/* ── Round Resolution Confirmation ───────────────────────────────── */}
      {confirming && (
        <section className="bg-surface rounded-xl p-6 space-y-4 border border-tertiary/40/50">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold text-primary">
              Resolve Round {current_round} &amp; Advance
            </h2>
            <button
              onClick={() => { setConfirming(false); setResolveErrors([]); }}
              disabled={resolving}
              className="text-sm text-muted hover:text-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
            >
              Cancel
            </button>
          </div>

          {winnersPreview.length === 0 && contestedPreview.length === 0 ? (
            <p className="text-muted text-sm">
              No bids were placed this round. Advancing will skip resolution.
            </p>
          ) : (
            <div className="space-y-4">
              {/* Awarded — single bidder */}
              {winnersPreview.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-tertiary uppercase tracking-wider mb-2">
                    Awarded ({winnersPreview.length}) — only one bidder
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-muted border-b border-border">
                          <th className="pb-2 pr-4 font-medium">Player</th>
                          <th className="pb-2 pr-4 font-medium">Pos</th>
                          <th className="pb-2 pr-4 font-medium">Bid</th>
                          <th className="pb-2 font-medium">Winner</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {winnersPreview.map((row) => (
                          <tr key={row.playerId} className="text-secondary">
                            <td className="py-2 pr-4 text-primary font-medium">{row.playerName}</td>
                            <td className="py-2 pr-4">
                              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${POSITION_BADGE[row.position] ?? 'bg-surface-hover text-secondary'}`}>
                                {row.position}
                              </span>
                            </td>
                            <td className="py-2 pr-4 font-bold text-tertiary">£{row.amount.toFixed(1)}</td>
                            <td className="py-2 text-primary">{row.winnerName}</td>
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
                  <p className="text-xs font-semibold text-tertiary uppercase tracking-wider mb-2">
                    Contested ({contestedPreview.length}) — multiple bidders, carry to next round
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-muted border-b border-border">
                          <th className="pb-2 pr-4 font-medium">Player</th>
                          <th className="pb-2 pr-4 font-medium">Pos</th>
                          <th className="pb-2 pr-4 font-medium">High Bid (floor)</th>
                          <th className="pb-2 font-medium">Leading</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {contestedPreview.map((row) => (
                          <tr key={row.playerId} className="text-secondary">
                            <td className="py-2 pr-4 text-primary font-medium">{row.playerName}</td>
                            <td className="py-2 pr-4">
                              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${POSITION_BADGE[row.position] ?? 'bg-surface-hover text-secondary'}`}>
                                {row.position}
                              </span>
                            </td>
                            <td className="py-2 pr-4 font-bold text-tertiary">£{row.amount.toFixed(1)}</td>
                            <td className="py-2 text-secondary text-xs">{row.winnerName} (outbid to win)</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-muted mt-2">
                    These players are NOT awarded yet. Next round opens with a bid floor above £{Math.max(...contestedPreview.map(r => r.amount)).toFixed(1)}.
                  </p>
                </div>
              )}
            </div>
          )}

          {resolveErrors.length > 0 && (
                <div className="bg-error/10/40 border border-error/30/50 rounded-lg p-4 space-y-1" role="alert">
              <p className="text-error text-sm font-semibold">Resolution errors — round not advanced:</p>
              {resolveErrors.map((e, i) => (
                <p key={i} className="text-error text-xs">
                  Player #{e.playerId}: {e.reason}
                </p>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleResolveAndAdvance}
              disabled={resolving}
              className="px-5 py-2 rounded-lg bg-tertiary hover:bg-tertiary disabled:opacity-60 text-on-tertiary font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
            >
              {resolving ? 'Resolving…' : `Confirm & Advance to Round ${current_round + 1}`}
            </button>
            <button
              onClick={() => { setConfirming(false); setResolveErrors([]); }}
              disabled={resolving}
              className="px-5 py-2 rounded-lg bg-surface-hover hover:bg-border disabled:opacity-50 text-secondary font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
            >
              Cancel
            </button>
          </div>
        </section>
      )}

      {/* ── Live Bids ────────────────────────────────────────────────────── */}
      {(isActive || isPaused) && (
        <section className="bg-surface rounded-xl p-6 space-y-4">
          <div className="flex items-baseline gap-3">
            <h2 className="text-lg font-semibold text-primary">
              Round {current_round} — Live Bids
            </h2>
            <span className="text-sm text-muted">
              {currentRoundBids.length} bid{currentRoundBids.length !== 1 ? 's' : ''} across {biddedPlayerIds.length} player{biddedPlayerIds.length !== 1 ? 's' : ''}
            </span>
          </div>

          {biddedPlayerIds.length === 0 ? (
            <p className="text-muted text-sm">No bids placed yet this round.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted border-b border-border">
                    <th className="pb-3 pr-4 font-medium">Player</th>
                    <th className="pb-3 pr-4 font-medium">Pos</th>
                    <th className="pb-3 pr-4 font-medium">Listed</th>
                    <th className="pb-3 pr-4 font-medium">Top Bid</th>
                    <th className="pb-3 pr-4 font-medium">Leading</th>
                    <th className="pb-3 pr-4 font-medium">Bids</th>
                    <th className="pb-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {biddedPlayerIds.map((playerId) => {
                    const highBid       = getHighestBid(playerId);
                    const player        = highBid?.players;
                    const position      = player?.position ?? '—';
                    const playerBids    = currentRoundBids.filter((b) => b.player_id === playerId);
                    const uniqueBidders = new Set(playerBids.map((b) => b.user_id)).size;

                    return (
                      <tr key={playerId} className="text-secondary hover:bg-surface-hover/40">
                        <td className="py-3 pr-4 font-medium text-primary">
                          {player?.name ?? `Player #${playerId}`}
                        </td>
                        <td className="py-3 pr-4">
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${POSITION_BADGE[position] ?? 'bg-surface-hover text-secondary'}`}>
                            {position}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-secondary">
                          £{player?.price?.toFixed(1) ?? '—'}
                        </td>
                        <td className="py-3 pr-4 font-bold text-tertiary">
                          £{highBid?.bid_amount?.toFixed(1)}
                        </td>
                        <td className="py-3 pr-4 text-primary">
                          {highBid?.users?.display_name ?? '—'}
                        </td>
                        <td className="py-3 pr-4 text-muted">{playerBids.length}</td>
                        <td className="py-3">
                          {uniqueBidders > 1 && (
                            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-warning/15 text-warning">
                              ⚡ Contested
                            </span>
                          )}
                        </td>
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
      <section className="bg-surface rounded-xl p-6 space-y-6">
        <h2 className="text-lg font-semibold text-primary">Matchday Management</h2>

        {/* Create form */}
        <form onSubmit={handleCreateMatchday} className="space-y-4">
          <h3 className="text-sm font-semibold text-secondary uppercase tracking-wide">Create Matchday</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-muted mb-1">Name</label>
              <input
                type="text"
                value={mdForm.name}
                onChange={e => setMdForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Matchday 1"
                className="w-full bg-surface-hover border border-border rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-tertiary"
              />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">WC Stage</label>
              <select
                value={mdForm.wc_stage}
                onChange={e => setMdForm(f => ({ ...f, wc_stage: e.target.value }))}
                className="w-full bg-surface-hover border border-border rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-tertiary"
              >
                {WC_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Start Date (optional)</label>
              <input
                type="date"
                value={mdForm.start_date}
                onChange={e => setMdForm(f => ({ ...f, start_date: e.target.value }))}
                className="w-full bg-surface-hover border border-border rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-tertiary"
              />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Lineup Deadline</label>
              <input
                type="datetime-local"
                value={mdForm.deadline}
                onChange={e => setMdForm(f => ({ ...f, deadline: e.target.value }))}
                className="w-full bg-surface-hover border border-border rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-tertiary"
              />
            </div>
          </div>
          {mdError && <p className="text-error text-sm">{mdError}</p>}
          <button
            type="submit"
            disabled={mdSaving}
            className="px-5 py-2 rounded-lg bg-tertiary hover:bg-tertiary disabled:opacity-50 text-on-tertiary font-semibold text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
          >
            {mdSaving ? 'Creating…' : 'Create Matchday'}
          </button>
        </form>

        {/* Matchday list */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-secondary uppercase tracking-wide">All Matchdays</h3>
          {matchdaysLoading ? (
            <p className="text-muted text-sm">Loading…</p>
          ) : matchdays.length === 0 ? (
            <p className="text-muted text-sm">No matchdays yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted border-b border-border">
                    <th className="pb-3 pr-4 font-medium">Name</th>
                    <th className="pb-3 pr-4 font-medium">Stage</th>
                    <th className="pb-3 pr-4 font-medium">Deadline</th>
                    <th className="pb-3 pr-4 font-medium">Active</th>
                    <th className="pb-3 font-medium">Completed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {matchdays.map(md => (
                    <tr key={md.id} className="text-secondary hover:bg-surface-hover/40">
                      <td className="py-2.5 pr-4 text-primary font-medium">{md.name}</td>
                      <td className="py-2.5 pr-4 text-secondary text-xs">{md.wc_stage}</td>
                      <td className="py-2.5 pr-4 text-secondary text-xs">
                        {md.deadline ? new Date(md.deadline).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                      </td>
                      <td className="py-2.5 pr-4">
                        <button
                          onClick={() => handleToggleActive(md)}
                          disabled={md.is_completed}
                          className={`px-3 py-1 rounded text-xs font-semibold transition-colors disabled:opacity-40 ${
                            md.is_active
                              ? 'bg-tertiary text-on-tertiary hover:bg-tertiary'
                              : 'bg-border text-secondary hover:bg-border-strong'
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
                              ? 'bg-info text-on-info hover:brightness-90'
                              : 'bg-border text-secondary hover:bg-border-strong'
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

      {/* ── Matchday Fixtures ────────────────────────────────────────────── */}
      <section className="bg-surface rounded-xl p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-primary">Matchday Fixtures</h2>
          <p className="text-xs text-muted mt-1">
            Assign polla matches to fantasy matchdays. Player lock times are derived from kickoff times —
            team names must exactly match <code className="text-secondary">players.country</code>.
          </p>
        </div>

        {fixtureLoading ? (
          <p className="text-muted text-sm">Loading matches…</p>
        ) : fixtureMatches.length === 0 ? (
          <p className="text-muted text-sm">No matches found. Add matches via the polla app first.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted border-b border-border">
                  <th className="pb-3 pr-4 font-medium">Match</th>
                  <th className="pb-3 pr-4 font-medium">Kickoff</th>
                  <th className="pb-3 font-medium">Fantasy Matchday</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {fixtureMatches.map(match => (
                  <tr key={match.id} className="text-secondary hover:bg-surface-hover/40">
                    <td className="py-2.5 pr-4 text-primary font-medium">
                      {match.team_a} vs {match.team_b}
                    </td>
                    <td className="py-2.5 pr-4 text-xs text-secondary">
                      {new Date(match.match_date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="py-2.5">
                      <select
                        value={match.matchday_id ?? ''}
                        onChange={e => handleFixtureMatchdayChange(match.id, e.target.value)}
                        disabled={fixtureSavingIds.has(match.id)}
                        className="bg-surface-hover border border-border rounded-lg px-2 py-1 text-primary text-xs focus:outline-none focus:border-tertiary disabled:opacity-50"
                      >
                        <option value="">— unassigned —</option>
                        {matchdays.map(md => (
                          <option key={md.id} value={md.id}>{md.name}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Stats CSV Upload ─────────────────────────────────────────────── */}
      <section className="bg-surface rounded-xl p-6 space-y-5">
        <h2 className="text-lg font-semibold text-primary">Stats CSV Upload</h2>
        <p className="text-xs text-muted">
          CSV columns: <code className="text-secondary">player_name, minutes, goals, assists, clean_sheet, saves, penalty_saves, penalty_misses, yellow, red, own_goals, goals_conceded, game_time</code>
        </p>

        <form onSubmit={handleStatsUpload} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-muted mb-1">Matchday</label>
              <select
                value={statsMatchdayId}
                onChange={e => setStatsMatchdayId(e.target.value)}
                className="w-full bg-surface-hover border border-border rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-tertiary"
              >
                <option value="">Select matchday…</option>
                {matchdays.map(md => (
                  <option key={md.id} value={md.id}>{md.name} — {md.wc_stage}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">CSV File</label>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={e => setStatsFile(e.target.files?.[0] ?? null)}
                className="w-full text-sm text-secondary file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-border file:text-secondary hover:file:bg-border-strong"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={statsUploading}
            className="px-5 py-2 rounded-lg bg-tertiary hover:bg-tertiary disabled:opacity-50 text-primary font-semibold text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
          >
            {statsUploading ? 'Uploading…' : 'Upload Stats'}
          </button>
        </form>

        {statsResult && (
          <div className={`rounded-lg p-4 space-y-1 ${statsResult.errors?.length > 0 && !statsResult.inserted ? 'bg-error/10/40 border border-error/30/50' : 'bg-surface-hover'}`}>
            {statsResult.inserted > 0 && (
              <p className="text-tertiary text-sm font-semibold">
                ✓ {statsResult.inserted} player stat row{statsResult.inserted !== 1 ? 's' : ''} saved.
              </p>
            )}
            {statsResult.errors?.map((err, i) => (
              <p key={i} className="text-error text-xs">{err}</p>
            ))}
          </div>
        )}
      </section>

      {/* ── Opta JSON Stats Upload ───────────────────────────────────────── */}
      <section className="bg-surface rounded-xl p-6 space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-primary">Opta JSON Stats Upload</h2>
          <p className="text-xs text-muted mt-1">
            Upload an Opta Points JSON file to store per-player stats (tackles, shots, passes, etc.) and Opta PTS. Idempotent — re-uploading overwrites existing rows for the same matchday.
          </p>
        </div>

        <form onSubmit={handleOptaUpload} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-muted mb-1">Matchday</label>
              <select
                value={optaMatchdayId}
                onChange={e => setOptaMatchdayId(e.target.value)}
                className="w-full bg-surface-hover border border-border rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-tertiary"
              >
                <option value="">Select matchday…</option>
                {matchdays.map(md => (
                  <option key={md.id} value={md.id}>{md.name} — {md.wc_stage}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Opta Points JSON File</label>
              <input
                type="file"
                accept=".json,application/json"
                onChange={e => { setOptaFile(e.target.files?.[0] ?? null); setOptaResult(null); }}
                className="w-full text-sm text-secondary file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-border file:text-secondary hover:file:bg-border-strong"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={optaUploading}
            className="px-5 py-2 rounded-lg bg-tertiary hover:bg-tertiary disabled:opacity-50 text-on-tertiary font-semibold text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
          >
            {optaUploading ? 'Uploading…' : 'Upload Opta Stats'}
          </button>
        </form>

        {optaResult && (
          <div className={`rounded-lg p-4 space-y-1 ${optaResult.errors?.length > 0 && !optaResult.inserted ? 'bg-error/10/40 border border-error/30/50' : 'bg-surface-hover'}`}>
            {optaResult.inserted > 0 && (
              <p className="text-tertiary text-sm font-semibold">
                ✓ {optaResult.inserted} stat row{optaResult.inserted !== 1 ? 's' : ''} saved.
              </p>
            )}
            {optaResult.errors?.map((err, i) => (
              <p key={i} className="text-error text-xs">{err}</p>
            ))}
          </div>
        )}
      </section>

      {/* ── Standings Calculation ───────────────────────────────────────── */}
      <section className="bg-surface rounded-xl p-6 space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-primary">Calculate Standings</h2>
          <p className="text-xs text-muted mt-1">
            Run after uploading stats. Scores all teams for the matchday (with auto-subs) and writes to fantasy_standings.
          </p>
        </div>

        {/* ── 5b. Scoring System Selector ─────────────────────────────── */}
        <div>
          <p className="text-xs font-semibold text-secondary uppercase tracking-wide mb-2">Scoring System</p>
          <div className="flex items-center gap-2">
            {['current', 'opta'].map((system) => {
              const isActive = (auctionState.scoring_system ?? 'current') === system;
              const label = system === 'current' ? 'Current (FPL-style)' : 'Opta';
              return (
                <button
                  key={system}
                  onClick={() => handleSaveScoringSystem(system)}
                  disabled={savingSystem || isActive}
                  className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2 ${
                    isActive
                      ? 'bg-tertiary text-on-tertiary cursor-default'
                      : 'bg-surface-hover hover:bg-border text-secondary disabled:opacity-50'
                  }`}
                >
                  {label}
                </button>
              );
            })}
            {savingSystem && <span className="text-xs text-muted">Saving…</span>}
          </div>
        </div>

        <form onSubmit={handleCalculateStandings} className="flex items-end gap-4 flex-wrap">
          <div className="flex-1 min-w-48">
            <label className="block text-xs text-muted mb-1">Matchday</label>
            <select
              value={calcMatchdayId}
              onChange={e => { setCalcMatchdayId(e.target.value); setStandingsPreview(null); setPreviewReady(false); setCalcResult(null); }}
              className="w-full bg-surface-hover border border-border rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-tertiary"
            >
              <option value="">Select matchday…</option>
              {matchdays.map(md => (
                <option key={md.id} value={md.id}>{md.name} — {md.wc_stage}</option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={calcRunning || previewReady}
            className="px-5 py-2 rounded-lg bg-tertiary hover:bg-tertiary disabled:opacity-50 text-on-tertiary font-semibold text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
          >
            {calcRunning ? 'Calculating…' : 'Preview Standings'}
          </button>
        </form>

        {/* ── Preview table (step 1 result) ────────────────────────────── */}
        {previewReady && standingsPreview && (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-secondary uppercase tracking-wide">
              Preview — Active system:{' '}
              <span className={(auctionState.scoring_system ?? 'current') === 'opta' ? 'text-tertiary' : 'text-info'}>
                {(auctionState.scoring_system ?? 'current') === 'opta' ? 'Opta' : 'Current (FPL-style)'}
              </span>
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted border-b border-border">
                    <th className="pb-2 pr-4 font-medium">Team</th>
                    <th className="pb-2 pr-4 font-medium text-right">Current pts</th>
                    <th className="pb-2 pr-4 font-medium text-right">Opta pts</th>
                    <th className="pb-2 font-medium text-right">Will save</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {standingsPreview.rows.map(r => {
                    const isOpta = (auctionState.scoring_system ?? 'current') === 'opta';
                    const willSave = Math.round(isOpta ? r.optaPts : r.currentPts);
                    return (
                      <tr key={r.teamId} className="text-secondary">
                        <td className="py-2 pr-4 text-primary font-medium">{r.teamName}</td>
                        <td className="py-2 pr-4 text-right">{r.currentPts}</td>
                        <td className="py-2 pr-4 text-right">
                          {typeof r.optaPts === 'number' ? r.optaPts.toFixed(1) : '—'}
                        </td>
                        <td className="py-2 text-right font-bold text-tertiary">{willSave}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {standingsPreview.errors?.length > 0 && (
              <div className="space-y-0.5">
                {standingsPreview.errors.map((err, i) => (
                  <p key={i} className="text-secondary text-xs">{err}</p>
                ))}
              </div>
            )}
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={handleConfirmStandings}
                disabled={confirmingSave}
                className="px-5 py-2 rounded-lg bg-tertiary hover:bg-tertiary disabled:opacity-60 text-on-tertiary font-semibold text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
              >
                {confirmingSave ? 'Saving…' : 'Confirm & Save'}
              </button>
              <button
                onClick={() => { setPreviewReady(false); setStandingsPreview(null); }}
                disabled={confirmingSave}
                className="px-5 py-2 rounded-lg bg-surface-hover hover:bg-border disabled:opacity-50 text-secondary font-semibold text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {calcResult && (
          <div className={`rounded-lg p-4 space-y-1 ${calcResult.errors?.length && !calcResult.teamsScored ? 'bg-error/10/40 border border-error/30/50' : 'bg-surface-hover'}`}>
            {calcResult.teamsScored > 0 && (
              <p className="text-tertiary text-sm font-semibold">
                ✓ Standings calculated for {calcResult.teamsScored} team{calcResult.teamsScored !== 1 ? 's' : ''}.
              </p>
            )}
            {calcResult.errors?.map((err, i) => (
              <p key={i} className="text-tertiary text-xs">{err}</p>
            ))}
          </div>
        )}
      </section>

      {/* ── Knockout Bracket ─────────────────────────────────────────────── */}
      {isCompleted && (
        <section className="bg-surface rounded-xl p-6 space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-primary">Knockout Bracket</h2>
            <p className="text-xs text-muted mt-1">
              Seed after league stage (4 matchdays) is complete. Then calculate each round using that round's matchday.
            </p>
          </div>

          {knockoutLoading ? (
            <p className="text-muted text-sm">Loading…</p>
          ) : knockoutMatches.length === 0 ? (
            // ── Not seeded ──
            (() => {
              const standings = computeKnockoutStandings();
              const champSeed = standings.length >= 8 ? generateChampionshipBracket(standings) : [];
              return (
                <div className="space-y-4">
                  {standings.length < 8 ? (
                    <p className="text-tertiary text-sm">
                      Need standings for at least 8 teams. Run Calculate Standings first.
                    </p>
                  ) : (
                    <div>
                      <p className="text-label-caps text-muted uppercase tracking-wide mb-2">Quarter-finals (Top 8)</p>
                      <div className="grid grid-cols-2 gap-2">
                        {champSeed.map(m => (
                          <div key={m.label} className="bg-surface-hover rounded-lg px-3 py-2 text-xs">
                            <span className="text-muted">{m.label}: </span>
                            <span className="text-primary">{m.teamA.display_name}</span>
                            <span className="text-muted"> vs </span>
                            <span className="text-primary">{m.teamB.display_name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {bracketSeedResult && (
                    <div className={`rounded-lg px-3 py-2 text-sm ${bracketSeedResult.error ? 'bg-error/10/40 text-error' : 'bg-tertiary/10 text-tertiary'}`}>
                      {bracketSeedResult.error ?? `✓ Bracket seeded — ${bracketSeedResult.count} matches created.`}
                    </div>
                  )}

                  <button
                    onClick={handleSeedBracket}
                    disabled={bracketSeeding || standings.length < 8}
                    className="px-5 py-2 rounded-lg bg-tertiary hover:bg-tertiary disabled:opacity-50 text-on-tertiary font-semibold text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
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
                        <div key={r} className={`rounded-lg px-3 py-2 text-center ${done ? 'bg-tertiary/10 border border-tertiary/40' : pending ? 'bg-warning/5 border border-warning/30' : 'bg-surface-hover border border-border'}`}>
                          <p className={`text-xs font-semibold ${done ? 'text-tertiary' : pending ? 'text-tertiary' : 'text-muted'}`}>
                            Round {r}
                          </p>
                          <p className="text-label-caps text-muted mt-0.5">
                            {done ? 'Complete' : pending ? 'Pending' : 'Not started'}
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  {/* Unresolved matches for the active round */}
                  {activeRound && (() => {
                    const pending = knockoutMatches.filter(m => m.round === activeRound && !m.winner_id);
                    return (
                      <div className="space-y-3">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-muted border-b border-border">
                                <th className="pb-2 pr-4 font-medium text-xs">Match</th>
                                <th className="pb-2 pr-4 font-medium text-xs">Team A</th>
                                <th className="pb-2 pr-4 font-medium text-xs">Team B</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {pending.map(m => (
                                <tr key={m.id} className="text-secondary">
                                  <td className="py-2 pr-4">
                                    <span className="text-label-caps text-muted capitalize">{m.bracket}</span>
                                    <span className="ml-1.5 text-primary text-xs font-medium">{m.match_label}</span>
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
                            <label className="block text-xs text-muted mb-1">Matchday for Round {activeRound}</label>
                            <select
                              value={knockoutCalcMatchdayId}
                              onChange={e => { setKnockoutCalcMatchdayId(e.target.value); setKnockoutCalcResult(null); }}
                              className="w-full bg-surface-hover border border-border rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-tertiary"
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
                            className="px-5 py-2 rounded-lg bg-tertiary hover:bg-tertiary disabled:opacity-50 text-on-tertiary font-semibold text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
                          >
                            {knockoutCalcRunning ? 'Calculating…' : `Calculate Round ${activeRound}`}
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  {activeRound === null && (
                    <p className="text-tertiary text-sm font-semibold">
                      ✓ All rounds complete. View final standings on the Bracket page.
                    </p>
                  )}

                  {knockoutCalcResult && (
                    <div className={`rounded-lg p-4 space-y-1 ${knockoutCalcResult.errors?.length && !knockoutCalcResult.resolved ? 'bg-error/10/40 border border-error/30/50' : 'bg-surface-hover'}`}>
                      {knockoutCalcResult.resolved > 0 && (
                        <p className="text-tertiary text-sm font-semibold">
                          ✓ {knockoutCalcResult.resolved} match{knockoutCalcResult.resolved !== 1 ? 'es' : ''} resolved.
                        </p>
                      )}
                      {knockoutCalcResult.errors?.map((err, i) => (
                        <p key={i} className="text-tertiary text-xs">{err}</p>
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
      <section className="bg-surface rounded-xl p-6 space-y-5">
        <h2 className="text-lg font-semibold text-primary">Transfer Windows</h2>

        {/* Quick-create preset buttons */}
        <div>
          <p className="text-xs font-semibold text-secondary uppercase tracking-wide mb-2">
            Quick Create
          </p>
          <div className="flex flex-wrap gap-2">
            {WINDOW_DEFAULTS.map((preset) => (
              <button
                key={preset.window_number}
                onClick={() => handleCreateTransferWindow(preset)}
                disabled={twSaving}
                className="px-3 py-1.5 rounded-lg text-sm bg-tertiary hover:bg-tertiary text-on-tertiary transition-colors disabled:opacity-50"
              >
                + {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom create form */}
        <div>
          <p className="text-xs font-semibold text-secondary uppercase tracking-wide mb-2">
            Custom Window
          </p>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs text-muted block mb-1">Window #</label>
              <select
                value={twForm.window_number}
                onChange={(e) => setTwForm((f) => ({ ...f, window_number: e.target.value }))}
                className="bg-surface-hover border border-border rounded-lg px-3 py-1.5 text-sm text-primary focus:outline-none focus:border-info"
              >
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted block mb-1">Max Transfers</label>
              <input
                type="number"
                min="1"
                value={twForm.max_transfers}
                onChange={(e) => setTwForm((f) => ({ ...f, max_transfers: e.target.value }))}
                className="w-20 bg-surface-hover border border-border rounded-lg px-3 py-1.5 text-sm text-primary focus:outline-none focus:border-info"
              />
            </div>
            <div>
              <label className="text-xs text-muted block mb-1">Opens At (optional)</label>
              <input
                type="datetime-local"
                value={twForm.opens_at}
                onChange={(e) => setTwForm((f) => ({ ...f, opens_at: e.target.value }))}
                className="bg-surface-hover border border-border rounded-lg px-3 py-1.5 text-sm text-primary focus:outline-none focus:border-info"
              />
            </div>
            <div>
              <label className="text-xs text-muted block mb-1">Closes At (optional)</label>
              <input
                type="datetime-local"
                value={twForm.closes_at}
                onChange={(e) => setTwForm((f) => ({ ...f, closes_at: e.target.value }))}
                className="bg-surface-hover border border-border rounded-lg px-3 py-1.5 text-sm text-primary focus:outline-none focus:border-info"
              />
            </div>
            <button
              onClick={() => handleCreateTransferWindow(null)}
              disabled={twSaving}
              className="px-4 py-1.5 rounded-lg text-sm bg-tertiary hover:bg-tertiary text-on-tertiary transition-colors disabled:opacity-50"
            >
              {twSaving ? 'Creating…' : 'Create'}
            </button>
          </div>
          {twError && <p className="text-error text-sm mt-2">{twError}</p>}
        </div>

        {/* Windows list */}
        {twLoading ? (
          <p className="text-muted text-sm">Loading windows…</p>
        ) : transferWindows.length === 0 ? (
          <p className="text-muted text-sm">No transfer windows created yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted border-b border-border">
                  <th className="pb-2 pr-4 font-medium">Window</th>
                  <th className="pb-2 pr-4 font-medium">Max</th>
                  <th className="pb-2 pr-4 font-medium">Opens</th>
                  <th className="pb-2 pr-4 font-medium">Closes</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {transferWindows.map((tw) => (
                  <tr key={tw.id} className="text-secondary">
                    <td className="py-2.5 pr-4 font-semibold text-primary">Window {tw.window_number}</td>
                    <td className="py-2.5 pr-4">{tw.max_transfers} transfers</td>
                    <td className="py-2.5 pr-4 text-muted text-xs">
                      {tw.opens_at ? new Date(tw.opens_at).toLocaleString() : '—'}
                    </td>
                    <td className="py-2.5 pr-4 text-muted text-xs">
                      {tw.closes_at ? new Date(tw.closes_at).toLocaleString() : '—'}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                        tw.is_active
                          ? 'bg-tertiary/15 text-tertiary'
                          : 'bg-border text-secondary'
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
                              ? 'bg-error hover:brightness-90 text-on-error'
                              : 'bg-tertiary/15 hover:brightness-90 text-tertiary'
                          }`}
                        >
                          {tw.is_active ? 'Close' : 'Open'}
                        </button>
                        {tw.is_active && (
                          <button
                            onClick={() => fetchWindowActivity(tw.window_number)}
                            disabled={activityLoading}
                            className="px-3 py-1 rounded text-xs font-semibold bg-info hover:brightness-90 text-on-info transition-colors"
                          >
                            {activityLoading ? 'Loading…' : 'View Activity'}
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteTransferWindow(tw)}
                          className="px-3 py-1 rounded text-xs font-semibold bg-border hover:bg-border-strong text-secondary transition-colors"
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
            <p className="text-xs font-semibold text-secondary uppercase tracking-wide mb-2">
              Transfer Activity — Window {windowActivity[0]?.window_number}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted border-b border-border">
                    <th className="pb-2 pr-4 font-medium">Manager</th>
                    <th className="pb-2 pr-4 font-medium">Out</th>
                    <th className="pb-2 pr-4 font-medium">In</th>
                    <th className="pb-2 pr-4 font-medium">Δ Budget</th>
                    <th className="pb-2 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {windowActivity.map((t) => (
                    <tr key={t.id} className="text-secondary">
                      <td className="py-2 pr-4 font-medium text-primary">
                        {t.team?.users?.display_name ?? t.team?.name ?? '—'}
                      </td>
                      <td className="py-2 pr-4 text-error">
                        {t.player_out?.name ?? '—'}
                        {t.player_out?.position && (
                          <span className={`ml-1.5 text-label-caps px-1 py-0.5 rounded font-semibold ${POSITION_BADGE[t.player_out.position]}`}>
                            {t.player_out.position}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-tertiary">
                        {t.player_in?.name ?? '—'}
                        {t.player_in?.position && (
                          <span className={`ml-1.5 text-label-caps px-1 py-0.5 rounded font-semibold ${POSITION_BADGE[t.player_in.position]}`}>
                            {t.player_in.position}
                          </span>
                        )}
                      </td>
                      <td className={`py-2 pr-4 text-xs font-semibold ${
                        (t.price_difference ?? 0) >= 0 ? 'text-tertiary' : 'text-error'
                      }`}>
                        {t.price_difference != null
                          ? `${(t.price_difference >= 0 ? '+' : '')}${Number(t.price_difference).toFixed(1)}M`
                          : '—'}
                      </td>
                      <td className="py-2 text-muted text-xs">
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

      {/* ── CSV Player Import ───────────────────────────────────────────── */}
      <section className="bg-surface rounded-xl p-6 space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-primary">CSV Player Import</h2>
          <p className="text-xs text-muted mt-1">
            Upload a CSV to populate the player pool before the auction. Players are deduplicated by name + country.
            Required columns: <code className="text-secondary">name, country, position, price</code>.
            Optional: <code className="text-secondary">country_code, photo_url</code>.
          </p>
        </div>

        <form onSubmit={handleCsvPlayerImport} className="space-y-4">
          <div>
            <label className="block text-xs text-muted mb-1">CSV File</label>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={e => { setCsvImportFile(e.target.files?.[0] ?? null); setCsvImportResult(null); }}
              className="w-full text-sm text-secondary file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-border file:text-secondary hover:file:bg-border-strong"
            />
          </div>

          <button
            type="submit"
            disabled={csvImportRunning}
            className="px-5 py-2 rounded-lg bg-tertiary hover:bg-tertiary disabled:opacity-50 text-on-tertiary font-semibold text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
          >
            {csvImportRunning ? 'Importing…' : 'Import Players'}
          </button>
        </form>

        {csvImportResult && (
          <div className={`rounded-lg p-4 space-y-2 ${csvImportResult.errors?.length && !csvImportResult.created ? 'bg-error/10/40 border border-error/30/50' : 'bg-surface-hover'}`}>
            {csvImportResult.created > 0 && (
              <p className="text-tertiary text-sm font-semibold">
                ✓ {csvImportResult.created} player{csvImportResult.created !== 1 ? 's' : ''} created.
              </p>
            )}
            {csvImportResult.created === 0 && !csvImportResult.errors?.length && (
              <p className="text-secondary text-sm">No new players to import (all already in DB or all skipped).</p>
            )}
            {csvImportResult.errors?.map((err, i) => (
              <p key={i} className="text-error text-xs">{err}</p>
            ))}
            {csvImportResult.skipped?.length > 0 && (
              <details className="mt-1">
                <summary className="text-xs text-muted cursor-pointer hover:text-secondary">
                  {csvImportResult.skipped.length} skipped (already in DB) — click to expand
                </summary>
                <ul className="mt-2 space-y-0.5 pl-3">
                  {csvImportResult.skipped.map((name, i) => (
                    <li key={i} className="text-xs text-secondary">{name}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </section>

      <section className="bg-surface rounded-xl p-6 space-y-4">
        <div className="flex items-baseline gap-3">
          <h2 className="text-lg font-semibold text-primary">Player Pool</h2>
          {!playersLoading && (
            <span className="text-sm text-muted">{players.length} players</span>
          )}
        </div>

        {playersLoading ? (
          <p className="text-muted text-sm">Loading players…</p>
        ) : players.length === 0 ? (
          <p className="text-muted text-sm">No players found. Run the seed SQL.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted border-b border-border">
                  <th className="pb-3 pr-4 font-medium">Name</th>
                  <th className="pb-3 pr-4 font-medium">Pos</th>
                  <th className="pb-3 pr-4 font-medium">Country</th>
                  <th className="pb-3 font-medium">Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {players.map((p) => (
                  <tr key={p.id} className="text-secondary hover:bg-surface-hover/40">
                    <td className="py-2 pr-4 text-primary font-medium">{p.name}</td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${POSITION_BADGE[p.position] ?? 'bg-surface-hover text-secondary'}`}>
                        {p.position}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-secondary">{p.country ?? '—'}</td>
                    <td className="py-2 font-semibold text-primary">£{p.price?.toFixed(1)}</td>
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
