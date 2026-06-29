import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuction } from '../context/AuctionContext';
import { usePlayers } from '../hooks/usePlayers';
import AuctionTimer from '../components/auction/AuctionTimer';
import { supabase } from '@predictor/supabase';
import { AUCTION_STATUSES, AUTO_BID_DELAY_SECONDS } from '../config/constants';
import { calculatePlayerPoints, calculateCompositePoints } from '../lib/scoring';
import { buildDefaultLineup, ensureStartingGk } from '../lib/defaultLineup';
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
    runAutoBids,
    autoCompleteSquads,
  } = useAuction();

  // Completes the auction, auto-creates default lineups for full squads, then activates the first matchday.
  async function handleCompleteAuction() {
    await completeAuction();

    // Fill any squads under 15 with random affordable players (GK first).
    const { data: fillResult } = await autoCompleteSquads();
    const warnings = (fillResult?.warnings ?? []).map((w) => `${w.team}: ${w.reason}`);

    // Auto-create pre-tournament (matchday_id = null) lineups for every full squad.
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

  // ── Country Elimination ───────────────────────────────────────────────────
  const [countries, setCountries] = useState([]);
  const [togglingCountry, setTogglingCountry] = useState(null);

  useEffect(() => { fetchCountries(); }, []);

  async function fetchCountries() {
    // Paginate: a plain .select() is silently capped at 1000 rows, and the
    // roster exceeds that — ordering by country then dropped the alphabetical
    // tail (Spain…Uzbekistan), so the grid only showed 40 of 48 teams.
    const rows = await fetchAllPages((from, to) =>
      supabase
        .from('players')
        .select('country, country_code, is_eliminated')
        .order('country', { ascending: true })
        .range(from, to)
    );
    const seen = new Set();
    const unique = [];
    for (const p of rows) {
      const key = p.country_code ?? p.country;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push({ country: p.country, country_code: p.country_code, is_eliminated: p.is_eliminated });
      }
    }
    setCountries(unique);
  }

  async function handleToggleCountryEliminated(country_code, currentlyEliminated) {
    setTogglingCountry(country_code);
    const { error } = await supabase.rpc('set_country_eliminated', { p_country_code: country_code, p_eliminated: !currentlyEliminated });
    if (error) {
      alert(`No se pudo actualizar el país: ${error.message}`);
      setTogglingCountry(null);
      return;
    }
    // Re-read from the DB so the grid reflects what actually persisted (not an
    // optimistic guess) — and so a silently-rejected write can't show as applied.
    await fetchCountries();
    setTogglingCountry(null);
  }
  // ──────────────────────────────────────────────────────────────────────────
  const [resolving, setResolving]   = useState(false);
  const [resolveErrors, setResolveErrors] = useState([]);
  const [lineupWarnings, setLineupWarnings] = useState([]);

  // ── Auto-bid 90s trigger ──────────────────────────────────────────────────
  const [autoBidRunning, setAutoBidRunning] = useState(false);
  const [autoBidResult, setAutoBidResult]   = useState(null);
  const autoBidFiredRef = useRef({});

  async function handleRunAutoBids() {
    setAutoBidRunning(true);
    setAutoBidResult(null);
    const { data } = await runAutoBids();
    setAutoBidResult(data);
    setAutoBidRunning(false);
  }

  useEffect(() => {
    if (!auctionState) return;
    const { status, current_round, round_started_at } = auctionState;
    if (status !== AUCTION_STATUSES.ACTIVE || !round_started_at) return;

    const guardKey = `${current_round}-${round_started_at}`;

    const checkAndFire = () => {
      if (autoBidFiredRef.current[guardKey]) return;
      const elapsed = (Date.now() - new Date(round_started_at).getTime()) / 1000;
      if (elapsed >= AUTO_BID_DELAY_SECONDS) {
        autoBidFiredRef.current[guardKey] = true;
        handleRunAutoBids();
      }
    };

    checkAndFire();
    const interval = setInterval(() => {
      if (autoBidFiredRef.current[guardKey]) { clearInterval(interval); return; }
      checkAndFire();
    }, 1000);

    return () => clearInterval(interval);
  }, [auctionState?.status, auctionState?.current_round, auctionState?.round_started_at]);
  // ──────────────────────────────────────────────────────────────────────────

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
    if (!mdForm.name.trim()) { setMdError('El nombre es obligatorio.'); return; }
    if (!mdForm.deadline)    { setMdError('La fecha límite es obligatoria.'); return; }
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
    await supabase
      .from('matchdays')
      .update({ is_active: !md.is_active })
      .eq('id', md.id);
    await fetchMatchdays();
  }

  const [finalizingId, setFinalizingId] = useState(null);

  async function handleToggleCompleted(md) {
    const completing = !md.is_completed;
    setFinalizingId(md.id);
    try {
      if (completing) {
        // Re-run the standings calc so the final write reflects current stats,
        // not a stale provisional run. Skipped when no stats exist for this
        // matchday — finalizing must never overwrite standings with zeros.
        const computed = await computeStandingsForMatchday(md.id);
        if (computed?.hasStats) {
          await writeStandings(md.id, computed.rows, computed.toStamp);
        }
      }

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
          // Materialize the next MD's lineups from the just-finalized MD's final
          // XI (with any already-made next-window transfers applied) before it
          // goes active, so every team starts the new MD where it ended.
          await supabase.rpc('seed_matchday_lineups', { p_source_md: md.id, p_target_md: nextMd.id });
          await handleToggleActive(nextMd);
          return; // handleToggleActive calls fetchMatchdays()
        }
      }

      await fetchMatchdays();
    } finally {
      setFinalizingId(null);
    }
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

  // ── Stats CSV Upload ──────────────────────────────────────────────────────
  const [statsMatchdayId, setStatsMatchdayId] = useState('');
  const [statsFile, setStatsFile]             = useState(null);
  const [statsUploading, setStatsUploading]   = useState(false);
  const [statsResult, setStatsResult]         = useState(null);

  async function handleStatsUpload(e) {
    e.preventDefault();
    setStatsResult(null);
    if (!statsMatchdayId) { setStatsResult({ errors: ['Select a matchday.'] }); return; }
    if (!statsFile)        { setStatsResult({ errors: ['Select a CSV file.'] }); return; }

    setStatsUploading(true);
    const text = await statsFile.text();
    const rows = parseCsv(text);
    if (rows.length === 0) { setStatsResult({ errors: ['CSV is empty or has no data rows.'] }); setStatsUploading(false); return; }

    // Paginate: a plain .select() caps at 1000 rows, dropping players from the
    // lookup and causing false "Player not found" errors (roster exceeds 1000).
    const STATS_PAGE = 1000;
    let allPlayers = [];
    for (let from = 0; ; from += STATS_PAGE) {
      const { data, error } = await supabase
        .from('players')
        .select('id, name, position')
        .range(from, from + STATS_PAGE - 1);
      if (error || !data) break;
      allPlayers = allPlayers.concat(data);
      if (data.length < STATS_PAGE) break;
    }
    const normName = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    const playerMap = Object.fromEntries((allPlayers ?? []).map(p => [normName(p.name), p]));

    const matchdayId = parseInt(statsMatchdayId, 10);
    const toUpsert = [];
    const errors = [];

    for (const row of rows) {
      const player = playerMap[normName(row['player_name'] ?? '')];
      if (!player) { errors.push(`Player not found: "${row['player_name']}"`); continue; }

      const minutes_played = parseInt(row['minutes'] ?? row['game_time'] ?? 0, 10) || 0;
      const goals          = parseInt(row['goals']          ?? 0, 10) || 0;
      const assists        = parseInt(row['assists']        ?? 0, 10) || 0;
      const clean_sheet    = String(row['clean_sheet']).toLowerCase() === 'true' || row['clean_sheet'] === '1';
      const saves          = parseInt(row['saves']          ?? 0, 10) || 0;
      const penalty_saves  = parseInt(row['penalty_saves']  ?? 0, 10) || 0;
      const penalty_misses = parseInt(row['penalty_misses'] ?? 0, 10) || 0;
      const yellow_cards   = parseInt(row['yellow']         ?? 0, 10) || 0;
      const red_cards      = parseInt(row['red']            ?? 0, 10) || 0;
      const own_goals      = parseInt(row['own_goals']      ?? 0, 10) || 0;
      const goals_conceded = parseInt(row['goals_conceded'] ?? 0, 10) || 0;

      const stats = { minutes_played, goals, assists, clean_sheet, saves, penalty_saves, penalty_misses, yellow_cards, red_cards, own_goals, goals_conceded };
      const total_points = calculatePlayerPoints(stats, player.position);

      toUpsert.push({ player_id: player.id, matchday_id: matchdayId, ...stats, total_points });
    }

    let inserted = 0;
    if (toUpsert.length > 0) {
      const { error } = await supabase.from('player_stats').upsert(toUpsert, { onConflict: 'player_id,matchday_id' });
      if (error) errors.push(`DB error: ${error.message}`);
      else inserted = toUpsert.length;
    }

    const stdErrors = inserted > 0 ? await recomputeStandingsSilently(matchdayId) : [];
    setStatsResult({ inserted, errors: [...errors, ...stdErrors] });
    setStatsFile(null);
    setStatsUploading(false);
  }
  // ──────────────────────────────────────────────────────────────────────────

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

  // Pre-fill the round→jornada dropdown from the active round's existing link
  // (set by either "Calcular ronda" or "Guardar jornada provisional"). Only when
  // the admin hasn't already picked one, so this never fights a manual selection.
  useEffect(() => {
    if (knockoutCalcMatchdayId) return;
    const champ = knockoutMatches.filter(m => m.bracket === 'championship');
    const done = (round) => {
      const rows = champ.filter(m => m.round === round);
      return rows.length > 0 && rows.every(m => m.winner_id);
    };
    const active = !done(1) ? 1 : !done(2) ? 2 : !done(3) ? 3 : null;
    if (!active) return;
    const linked = champ.find(m => m.round === active && m.matchday_id != null);
    if (linked) setKnockoutCalcMatchdayId(String(linked.matchday_id));
  }, [knockoutMatches, knockoutCalcMatchdayId]);

  // ── Matchday Fixtures ─────────────────────────────────────────────────────
  const [fixtureMatches, setFixtureMatches] = useState([]);
  const [fixtureLoading, setFixtureLoading] = useState(false);
  const [fixtureSavingIds, setFixtureSavingIds] = useState(new Set());
  const [matchesWithStats, setMatchesWithStats] = useState(new Set());

  const matchSig = (mdId, a, b) => `${mdId}:${[a, b].sort().join('-')}`;
  const normName = (s) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

  const fetchFixtureMatches = useCallback(async () => {
    setFixtureLoading(true);
    const [{ data: matchData }, { data: metaData }, { data: playersData }] = await Promise.all([
      supabase
        .from('matches')
        .select('id, match_code, team_a, team_b, match_date, matchday_id')
        .order('match_date', { ascending: true }),
      supabase
        .from('match_metadata')
        .select('matchday_id, home_team, away_team'),
      supabase
        .from('players')
        .select('country, country_code'),
    ]);
    setFixtureMatches(matchData ?? []);

    const nameToCode = {};
    for (const p of playersData ?? []) {
      if (p.country && p.country_code) nameToCode[normName(p.country)] = p.country_code;
    }
    const statsSet = new Set();
    for (const m of metaData ?? []) {
      const a = nameToCode[normName(m.home_team)];
      const b = nameToCode[normName(m.away_team)];
      if (m.matchday_id && a && b) statsSet.add(matchSig(m.matchday_id, a, b));
    }
    setMatchesWithStats(statsSet);

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
    { window_number: 1, max_transfers: 5, label: 'Ventana 1 — Antes de R32 / CF fantasy (5 fichajes)' },
    { window_number: 2, max_transfers: 5, label: 'Ventana 2 — Antes de R16 / SF fantasy (5 fichajes)' },
    { window_number: 3, max_transfers: 5, label: 'Ventana 3 — Antes de CF Mundial / Final fantasy (5 fichajes)' },
  ];
  const EMPTY_TW_FORM = { window_number: '1', max_transfers: '5', opens_at: '', closes_at: '' };
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
    if (!num || num < 1 || num > 3) { setTwError('El número de ventana debe ser 1–3.'); setTwSaving(false); return; }
    if (!max || max < 1)            { setTwError('Máx. fichajes debe ser ≥ 1.'); setTwSaving(false); return; }
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

  // ── 5b. Standings computation — shared by preview flow and Finalize ──────

  // Paginated fetch helper — plain .select() is silently capped at 1000 rows.
  async function fetchAllPages(queryFn) {
    const PAGE = 1000;
    let from = 0, out = [];
    while (true) {
      const { data, error } = await queryFn(from, from + PAGE - 1);
      if (error || !data) break;
      out = out.concat(data);
      if (data.length < PAGE) break;
      from += PAGE;
    }
    return out;
  }

  // Returns { rows, toStamp, errors, hasStats } or null if no teams exist.
  async function computeStandingsForMatchday(matchdayIdInt) {
    const errors = [];

    // 1. Fetch all teams
    const { data: teams } = await supabase.from('teams').select('id, name');
    if (!teams?.length) return null;

    // 2. Fetch all player_stats — paginated so no starter's stats are ever dropped
    const allStats = await fetchAllPages((f, t) =>
      supabase
        .from('player_stats')
        .select('player_id, minutes_played, goals, assists, clean_sheet, saves, penalty_saves, penalty_misses, yellow_cards, red_cards, own_goals, goals_conceded, total_points, shots_on_target, shots_off_target, blocked_shots, tackles, interceptions, fouls_won, fouls_conceded, offsides, passes, crosses, penalties_won')
        .eq('matchday_id', matchdayIdInt)
        .range(f, t));
    const statsMap = Object.fromEntries(allStats.map(s => [s.player_id, s]));

    // 3. Fetch all players for position + price lookup — roster exceeds 1000 rows
    const allPlayers = await fetchAllPages((f, t) =>
      supabase.from('players').select('id, position, price').range(f, t));
    const positionMap = Object.fromEntries(allPlayers.map(p => [p.id, p.position]));
    const priceMap = Object.fromEntries(allPlayers.map(p => [p.id, p.price]));

    // 4. Fetch lineups — prefer matchday-specific; otherwise carry forward each
    //    team's most recent PRIOR matchday lineup (falling back to preseason null).
    const matchdayLineups = await fetchAllPages((f, t) =>
      supabase
        .from('lineups')
        .select('team_id, player_id, is_starting, is_captain, bench_order')
        .eq('matchday_id', matchdayIdInt)
        .range(f, t));

    const matchdayTeamIds = new Set(matchdayLineups.map(r => r.team_id));

    // Prior lineups: any matchday strictly before this one, plus preseason null.
    // Paginated: spans all prior matchdays and will exceed 1000 once several MDs exist.
    const priorLineups = await fetchAllPages((f, t) =>
      supabase
        .from('lineups')
        .select('team_id, player_id, is_starting, is_captain, bench_order, matchday_id')
        .or(`matchday_id.lt.${matchdayIdInt},matchday_id.is.null`)
        .range(f, t));

    // Per team lacking a matchday-specific lineup, keep rows from the highest
    // available matchday_id (null ranks lowest, used only when no prior MD exists).
    const carriedByTeam = {};
    for (const r of priorLineups) {
      if (matchdayTeamIds.has(r.team_id)) continue;
      const rank = r.matchday_id ?? -Infinity;
      const cur = carriedByTeam[r.team_id];
      if (!cur || rank > cur.rank) {
        carriedByTeam[r.team_id] = { rank, rows: [r] };
      } else if (rank === cur.rank) {
        cur.rows.push(r);
      }
    }
    const carriedRows = Object.values(carriedByTeam).flatMap(c => c.rows);

    const allLineups = [...matchdayLineups, ...carriedRows];

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

    const optaScorer = (stats, position) => calculateCompositePoints(stats, position);

    // 6. Compute both scoring systems for every team
    const previewRows = [];

    for (const team of teams) {
      const teamLineupRows = allLineups.filter(r => r.team_id === team.id);
      if (teamLineupRows.length === 0) {
        errors.push(`${team.name}: no lineup found for this matchday — skipped.`);
        continue;
      }

      const rawStarters = teamLineupRows
        .filter(r => r.is_starting)
        .map(r => ({ id: r.player_id, position: positionMap[r.player_id] ?? 'FWD', price: priceMap[r.player_id] ?? 0 }));
      const benchRows = teamLineupRows
        .filter(r => !r.is_starting)
        .sort((a, b) => (a.bench_order ?? 99) - (b.bench_order ?? 99));
      const rawBench = benchRows.map(r => ({ id: r.player_id, position: positionMap[r.player_id] ?? 'FWD', price: priceMap[r.player_id] ?? 0 }));

      // Safety net: a carried/null 0-GK XI auto-promotes a bench GK before scoring.
      const { starters, bench } = ensureStartingGk(rawStarters, rawBench);

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
        optaPts,        // float (Composite, with captain ×2)
        prevPts: prev.pts,
        prevGoals: prev.goals,
        goalsScored,
      });
    }

    // Lineup stamp rows — deferred to the write step. Carry each team's source
    // (prior-MD or null) lineup forward, re-pointed to this matchday.
    const toStamp = carriedRows.map(r => ({
      team_id: r.team_id,
      player_id: r.player_id,
      matchday_id: matchdayIdInt,
      is_starting: r.is_starting,
      is_captain: r.is_captain,
      bench_order: r.bench_order,
    }));

    return { rows: previewRows, toStamp, errors, hasStats: Object.keys(statsMap).length > 0 };
  }

  // Writes computed standings + lineup stamps. Shared by confirm flow and Finalize.
  async function writeStandings(matchdayId, rows, toStamp) {
    const errors = [];
    const isOpta = (auctionState.scoring_system ?? 'opta') === 'opta';

    const upsertRows = rows.map(r => {
      const rawPts = isOpta ? r.optaPts : r.currentPts;
      return {
        team_id: r.teamId,
        matchday_id: matchdayId,
        matchday_points: Math.round(rawPts * 10) / 10,
        total_points: Math.round((r.prevPts + rawPts) * 10) / 10,
        goals_scored: r.goalsScored,
      };
    });

    if (upsertRows.length > 0) {
      const { error } = await supabase
        .from('fantasy_standings')
        .upsert(upsertRows, { onConflict: 'team_id,matchday_id' });
      if (error) errors.push(`DB error: ${error.message}`);
    }

    // Stamp carried lineups as matchday-specific — permanent historical record
    if (toStamp.length > 0) {
      const { error: stampErr } = await supabase
        .from('lineups')
        .upsert(toStamp, { onConflict: 'team_id,matchday_id,player_id' });
      if (stampErr) errors.push(`Lineup stamp error: ${stampErr.message}`);
    }

    return { teamsScored: upsertRows.length, errors };
  }

  // Silently re-stamp standings for a matchday after stats land. Returns extra
  // error strings to merge into the upload result (empty array on success).
  async function recomputeStandingsSilently(matchdayId) {
    const computed = await computeStandingsForMatchday(matchdayId);
    if (!computed) return ['No se pudo recalcular: no se encontraron equipos.'];
    if (!computed.rows?.length) return computed.errors ?? [];
    const { errors: writeErrors } = await writeStandings(matchdayId, computed.rows, computed.toStamp);
    return [...(computed.errors ?? []), ...writeErrors];
  }

  // ── 5c. Calculate Standings — step 1: preview (no DB write) ──────────────
  async function handleCalculateStandings(e) {
    e.preventDefault();
    setCalcResult(null);
    setStandingsPreview(null);
    setPreviewReady(false);
    if (!calcMatchdayId) { setCalcResult({ errors: ['Selecciona una jornada.'] }); return; }
    setCalcRunning(true);

    const matchdayIdInt = parseInt(calcMatchdayId, 10);
    const computed = await computeStandingsForMatchday(matchdayIdInt);
    if (!computed) { setCalcResult({ errors: ['No se encontraron equipos.'] }); setCalcRunning(false); return; }

    setStandingsPreview({ matchdayId: matchdayIdInt, rows: computed.rows, toStamp: computed.toStamp, errors: computed.errors });
    setPreviewReady(true);
    setCalcRunning(false);
  }

  // ── 5c. Calculate Standings — step 2: confirm & write ────────────────────
  async function handleConfirmStandings() {
    if (!standingsPreview) return;
    setConfirmingSave(true);

    const { matchdayId, rows, toStamp, errors: previewErrors } = standingsPreview;
    const { teamsScored, errors: writeErrors } = await writeStandings(matchdayId, rows, toStamp);

    setCalcResult({ teamsScored, errors: [...previewErrors, ...writeErrors] });
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
        display_name: t.users?.display_name ?? t.name ?? 'Desconocido',
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
      setKnockoutCalcResult({ errors: ['Selecciona una jornada primero.'] });
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
      setKnockoutCalcResult({ errors: ['No hay partidos sin resolver para esta ronda.'] });
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
        placement = '1er Lugar';
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

  // Link a round to its jornada WITHOUT resolving winners — lets the Cuadro show
  // live provisional H2H points + working clickable lineups mid-round. Idempotent.
  async function handleSaveRoundMatchday(round) {
    if (!knockoutCalcMatchdayId) {
      setKnockoutCalcResult({ errors: ['Selecciona una jornada primero.'] });
      return;
    }
    setKnockoutCalcRunning(true);
    setKnockoutCalcResult(null);
    const matchdayIdInt = parseInt(knockoutCalcMatchdayId, 10);
    const { error } = await supabase
      .from('knockout_matches')
      .update({ matchday_id: matchdayIdInt })
      .eq('bracket', 'championship')
      .eq('round', round);
    if (error) {
      setKnockoutCalcResult({ errors: [`Error al guardar jornada: ${error.message}`] });
    } else {
      setKnockoutCalcResult({ saved: true });
    }
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
    if (!csvImportFile) { setCsvImportResult({ errors: ['Selecciona un archivo CSV.'] }); return; }

    setCsvImportRunning(true);
    const text = await csvImportFile.text();
    const rows = parseCsv(text);
    if (rows.length === 0) {
      setCsvImportResult({ errors: ['El CSV está vacío o no tiene filas de datos.'] });
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

  // ── Opta Stats Upload (JSON + ODS) ───────────────────────────────────────
  const [optaMatchdayId, setOptaMatchdayId] = useState('');
  const [optaFile, setOptaFile] = useState(null);
  const [optaUploading, setOptaUploading] = useState(false);
  const [optaResult, setOptaResult] = useState(null);

  const [odsMatchdayId, setOdsMatchdayId] = useState('');
  const [odsFile, setOdsFile] = useState(null);
  const [odsDate, setOdsDate] = useState('');
  const [odsUploading, setOdsUploading] = useState(false);
  const [odsResult, setOdsResult] = useState(null);

  // Shared core: upsert match_metadata + player_stats from a parsed json object.
  // Returns { inserted, errors } or { gcWarning: true, errors } without touching state.
  async function uploadResolvedStats(json, matchdayId, force) {
    if (!force && json.match.score) {
      const totalGoals = (json.match.score.home ?? 0) + (json.match.score.away ?? 0);
      if (totalGoals > 0 && json.players.every((p) => (p.GC ?? 0) === 0)) {
        const scoreStr = `${json.match.score.home}–${json.match.score.away}`;
        return {
          gcWarning: true,
          errors: [
            `Todos los jugadores tienen GC=0 pero el marcador es ${scoreStr}. ` +
            `Esto asignará portería imbatida incorrecta a porteros y defensas del equipo que encajó goles. ` +
            `Corrige los valores GC antes de subir, o usa "Subir de todos modos" para continuar.`,
          ],
        };
      }
    }

    const errors = [];

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

    // Paginate: plain .select() caps at 1000 rows, silently dropping players
    const PAGE = 1000;
    let allPlayers = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('players')
        .select('id, name, position, country')
        .range(from, from + PAGE - 1);
      if (error || !data) break;
      allPlayers = allPlayers.concat(data);
      if (data.length < PAGE) break;
    }
    const normName = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

    // Composite key: "name|country" — no cross-country collision possible
    const playerMapByNameCountry = {};
    for (const p of allPlayers) {
      playerMapByNameCountry[`${normName(p.name)}|${normName(p.country)}`] = p;
    }
    // Name-only fallback (first occurrence wins)
    const playerMapByName = {};
    for (const p of allPlayers) {
      const key = normName(p.name);
      if (!playerMapByName[key]) playerMapByName[key] = p;
    }

    const toUpsert = [];
    for (const p of json.players) {
      const normHome = normName(json.match.home_team ?? '');
      const normAway = normName(json.match.away_team ?? '');
      const normN = normName(p.name);
      const normT = normName(p.team ?? '');
      const player =
        (normT && playerMapByNameCountry[`${normN}|${normT}`]) ||
        playerMapByNameCountry[`${normN}|${normHome}`] ||
        playerMapByNameCountry[`${normN}|${normAway}`] ||
        playerMapByName[normN];
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
      // Derive clean sheet from GC + minutes (Opta has no explicit CS field)
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
        minutes_played, goals, assists, clean_sheet, saves,
        penalty_saves, penalty_misses: 0, yellow_cards, red_cards,
        own_goals, goals_conceded, shots_on_target, shots_off_target,
        blocked_shots, tackles, interceptions, fouls_won, fouls_conceded,
        offsides, passes, crosses, penalties_won, opta_points, total_points,
      });
    }

    let inserted = 0;
    if (toUpsert.length > 0) {
      const { error } = await supabase
        .from('player_stats')
        .upsert(toUpsert, { onConflict: 'player_id,matchday_id' });
      if (error) errors.push(`DB error: ${error.message}`);
      else inserted = toUpsert.length;
    }

    return { inserted, errors };
  }

  async function handleOptaUpload(e, force = false) {
    if (e?.preventDefault) e.preventDefault();
    setOptaResult(null);
    if (!optaMatchdayId) { setOptaResult({ errors: ['Selecciona una jornada primero.'] }); return; }
    if (!optaFile)        { setOptaResult({ errors: ['Selecciona un archivo JSON.'] }); return; }

    setOptaUploading(true);
    let json;
    try {
      const text = await optaFile.text();
      json = JSON.parse(text);
    } catch {
      setOptaResult({ errors: ['Archivo JSON inválido.'] });
      setOptaUploading(false);
      return;
    }

    if (!json.match || !Array.isArray(json.players) || json.players.length === 0) {
      setOptaResult({ errors: ['JSON no tiene los campos requeridos "match" o "players".'] });
      setOptaUploading(false);
      return;
    }

    const result = await uploadResolvedStats(json, parseInt(optaMatchdayId, 10), force);
    if (result.inserted > 0 && !result.gcWarning) {
      const stdErrors = await recomputeStandingsSilently(parseInt(optaMatchdayId, 10));
      result.errors = [...(result.errors ?? []), ...stdErrors];
    }
    setOptaResult(result);
    if (!result.gcWarning) setOptaFile(null);
    setOptaUploading(false);
  }

  async function handleOdsUpload(e, force = false) {
    if (e?.preventDefault) e.preventDefault();
    setOdsResult(null);
    if (!odsMatchdayId) { setOdsResult({ errors: ['Selecciona una jornada primero.'] }); return; }
    if (!odsFile)       { setOdsResult({ errors: ['Selecciona un archivo .ods.'] }); return; }

    setOdsUploading(true);
    const parseErrors = [];
    let json;

    try {
      const XLSX = await import('xlsx');
      const buf = await odsFile.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });

      if (!wb.SheetNames.includes('RES')) {
        setOdsResult({ errors: ['Archivo sin hoja RES — usa la ruta JSON para archivos no estándar.'] });
        setOdsUploading(false);
        return;
      }

      const resRows = XLSX.utils.sheet_to_json(wb.Sheets['RES'], { header: 1, raw: true, defval: '' });
      const resRow1 = resRows[1] ?? [];
      const home_team = String(resRow1[0] ?? '').trim();
      const away_team = String(resRow1[4] ?? '').trim();
      const score_home = parseInt(String(resRow1[1]), 10);
      const score_away = parseInt(String(resRow1[3]), 10);

      if (!home_team || !away_team || isNaN(score_home) || isNaN(score_away)) {
        setOdsResult({ errors: ['No se pudo leer el marcador de la hoja RES.'] });
        setOdsUploading(false);
        return;
      }

      const players = [];

      for (const [sheetName, teamName] of [['T1', home_team], ['T2', away_team]]) {
        if (!wb.SheetNames.includes(sheetName)) {
          parseErrors.push(`Hoja ${sheetName} no encontrada.`);
          continue;
        }

        const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true, defval: '' });
        if (rows.length < 2) { parseErrors.push(`Hoja ${sheetName} sin datos.`); continue; }

        // Header map: lowercase+trim → column index
        const hdr = {};
        for (let i = 0; i < rows[0].length; i++) {
          const h = String(rows[0][i] ?? '').trim().toLowerCase();
          if (h && !(h in hdr)) hdr[h] = i;
        }

        // Reject if DB Name column absent — file was not processed by add_db_name_col.py
        const dbIdx = hdr['db name'] ?? hdr['db_name'];
        if (dbIdx === undefined) {
          setOdsResult({ errors: [`Hoja ${sheetName} sin columna "DB Name" — ejecuta add_db_name_col.py antes de subir.`] });
          setOdsUploading(false);
          return;
        }

        const num = (row, key) => {
          const idx = hdr[key.toLowerCase()];
          if (idx === undefined) return 0;
          const n = parseFloat(row[idx]);
          return isNaN(n) ? 0 : n;
        };

        for (let ri = 1; ri < rows.length; ri++) {
          const row = rows[ri];
          const dbName = String(row[dbIdx] ?? '').trim();
          if (!dbName) continue;
          if (dbName.toUpperCase() === 'NOT FOUND') {
            parseErrors.push(`[${sheetName}] Sin resolución: "${String(row[0] ?? '').trim()}"`);
            continue;
          }
          const ptsRaw = parseFloat(row[hdr['pts']]);
          players.push({
            name: dbName, team: teamName,
            MP: num(row,'MP'), G: num(row,'G'), SOnT: num(row,'SOnT'), SOffT: num(row,'SOffT'),
            BS: num(row,'BS'), OG: num(row,'OG'), A: num(row,'A'), P: num(row,'P'),
            C: num(row,'C'), Tk: num(row,'Tk'), INT: num(row,'INT'), FW: num(row,'FW'),
            FC: num(row,'FC'), O: num(row,'O'), YC: num(row,'YC'), RC: num(row,'RC'),
            GC: num(row,'GC'), PW: num(row,'PW'), SAV: num(row,'SAV'), PSAV: num(row,'PSAV'),
            PTS: isNaN(ptsRaw) ? null : ptsRaw,
          });
        }
      }

      if (players.length === 0) {
        setOdsResult({ errors: ['No se encontraron jugadores en el archivo.', ...parseErrors] });
        setOdsUploading(false);
        return;
      }

      json = {
        match: {
          competition: 'FIFA World Cup',
          date: odsDate || null,
          home_team,
          away_team,
          score: { home: score_home, away: score_away },
        },
        players,
      };
    } catch (err) {
      setOdsResult({ errors: [`Error al procesar el archivo .ods: ${err.message}`] });
      setOdsUploading(false);
      return;
    }

    const result = await uploadResolvedStats(json, parseInt(odsMatchdayId, 10), force);
    if (parseErrors.length > 0) result.errors = [...(result.errors ?? []), ...parseErrors];
    if (result.inserted > 0 && !result.gcWarning) {
      const stdErrors = await recomputeStandingsSilently(parseInt(odsMatchdayId, 10));
      result.errors = [...(result.errors ?? []), ...stdErrors];
    }
    setOdsResult(result);
    if (!result.gcWarning) setOdsFile(null);
    setOdsUploading(false);
  }
  // ──────────────────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="text-secondary p-6">Cargando estado de subasta…</div>;
  }
  if (!auctionState) {
    return (
      <div className="text-error p-6">
        No se encontró estado de subasta. Ejecuta el seed SQL en Supabase.
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
        <h1 className="text-2xl font-bold text-primary">Panel de admin</h1>
        <span className={`px-3 py-1 rounded-full text-sm font-semibold capitalize ${STATUS_BADGE[status]}`}>
          {status}
        </span>
      </div>

      {/* ── League Participants ──────────────────────────────────────────── */}
      <section className="bg-surface rounded-xl p-6 space-y-4">
        <div className="flex items-baseline gap-3">
          <h2 className="text-lg font-semibold text-primary">Participantes de la liga</h2>
          {!participantsLoading && (
            <span className="text-sm text-muted">
              {participants.filter((u) => u.teams).length} de {participants.length} usuarios inscritos
            </span>
          )}
        </div>

        {isCompleted && (
          <p className="text-xs text-muted bg-surface-hover rounded-lg px-3 py-2">
            Subasta completada. Los nuevos inscritos accederán a jugadores no ganados vía el mercado libre.
          </p>
        )}

        {participantsLoading ? (
          <p className="text-muted text-sm">Cargando usuarios…</p>
        ) : participants.length === 0 ? (
          <p className="text-muted text-sm">No se encontraron usuarios registrados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted border-b border-border">
                  <th className="pb-3 pr-4 font-medium">Usuario</th>
                  <th className="pb-3 pr-4 font-medium">Correo</th>
                  <th className="pb-3 pr-4 font-medium">Estado</th>
                  <th className="pb-3 pr-4 font-medium">Presupuesto</th>
                  <th className="pb-3 font-medium">Acción</th>
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
                          Inscrito
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-xs font-semibold bg-border text-secondary">
                          Sin equipo
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
                          Eliminar
                        </button>
                      ) : (
                        <button
                          onClick={() => handleAddToLeague(u)}
                          disabled={addingTeamFor === u.id}
                          className="px-3 py-1 rounded bg-tertiary hover:bg-tertiary disabled:opacity-50 text-primary text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
                        >
                          {addingTeamFor === u.id ? 'Agregando…' : 'Agregar a la liga'}
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
        <h2 className="text-lg font-semibold text-primary">Control de subasta</h2>

        <div className="grid grid-cols-3 gap-6 text-sm">
          <div>
            <p className="text-muted mb-1">Ronda</p>
            <p className="text-primary text-2xl font-bold">{current_round || '—'}</p>
          </div>
          <div>
            <p className="text-muted mb-1">Duración de ronda</p>
            <p className="text-primary text-2xl font-bold">{round_duration_seconds}s</p>
          </div>
          <div>
            <p className="text-muted mb-1">{isActive ? 'Tiempo restante' : 'Ronda iniciada'}</p>
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
              Iniciar subasta
            </button>
          )}

          {isActive && (
            <>
              <button
                onClick={pauseAuction}
                className="px-5 py-2 rounded-lg bg-warning hover:bg-tertiary text-on-warning font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
              >
                Pausar
              </button>
              <button
                onClick={endRound}
                className="px-5 py-2 rounded-lg bg-surface-hover hover:brightness-95 text-primary font-semibold border border-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
                title="Termina la ronda anticipadamente (detiene las pujas ahora). Luego Resolver y siguiente ronda."
              >
                Terminar ronda
              </button>
              <button
                onClick={handleRunAutoBids}
                disabled={autoBidRunning}
                className="px-5 py-2 rounded-lg bg-surface-hover hover:brightness-95 disabled:opacity-50 text-secondary font-semibold border border-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
                title="Ejecutar manualmente el pase de pujas proxy para esta ronda (se activa automáticamente a 1:30)."
              >
                {autoBidRunning ? 'Auto-pujando…' : 'Ejecutar auto-pujas'}
              </button>
              <button
                onClick={() => { setConfirming(true); setResolveErrors([]); }}
                disabled={confirming}
                className="px-5 py-2 rounded-lg bg-tertiary hover:bg-tertiary disabled:opacity-50 text-on-tertiary font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
              >
                Resolver y siguiente ronda →
              </button>
              <button
                onClick={handleCompleteAuction}
                className="px-5 py-2 rounded-lg bg-error hover:brightness-90 text-on-error font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
              >
                Completar subasta
              </button>
            </>
          )}

          {isPaused && (
            <>
              <button
                onClick={resumeAuction}
                className="px-5 py-2 rounded-lg bg-tertiary hover:bg-tertiary text-on-tertiary font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
              >
                Reanudar
              </button>
              <button
                onClick={handleCompleteAuction}
                className="px-5 py-2 rounded-lg bg-error hover:brightness-90 text-on-error font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
              >
                Completar subasta
              </button>
            </>
          )}

          {isCompleted && (
            <p className="text-muted text-sm italic">Subasta completada. No hay más acciones disponibles.</p>
          )}
        </div>

        {autoBidResult && (
          <div className="bg-info/10 border border-info/30 rounded-lg px-4 py-3 text-xs text-info">
            Auto-pujas: <span className="font-semibold">{autoBidResult.bids_placed ?? 0} realizadas</span>
            {autoBidResult.note && <span className="ml-2 text-muted">({autoBidResult.note})</span>}
          </div>
        )}

        {lineupWarnings.length > 0 && (
          <div className="bg-warning/10 border border-warning/30 rounded-lg p-4 space-y-1">
            <p className="text-warning text-sm font-semibold">Advertencias de alineación predeterminada:</p>
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
              Resolver ronda {current_round} y avanzar
            </h2>
            <button
              onClick={() => { setConfirming(false); setResolveErrors([]); }}
              disabled={resolving}
              className="text-sm text-muted hover:text-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
            >
              Cancelar
            </button>
          </div>

          {winnersPreview.length === 0 && contestedPreview.length === 0 ? (
            <p className="text-muted text-sm">
              No se realizaron pujas esta ronda. Avanzar omitirá la resolución.
            </p>
          ) : (
            <div className="space-y-4">
              {/* Awarded — single bidder */}
              {winnersPreview.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-tertiary uppercase tracking-wider mb-2">
                    Adjudicados ({winnersPreview.length}) — un solo postor
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-muted border-b border-border">
                          <th className="pb-2 pr-4 font-medium">Jugador</th>
                          <th className="pb-2 pr-4 font-medium">Pos</th>
                          <th className="pb-2 pr-4 font-medium">Puja</th>
                          <th className="pb-2 font-medium">Ganador</th>
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
                    Disputados ({contestedPreview.length}) — múltiples postores, pasan a siguiente ronda
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-muted border-b border-border">
                          <th className="pb-2 pr-4 font-medium">Jugador</th>
                          <th className="pb-2 pr-4 font-medium">Pos</th>
                          <th className="pb-2 pr-4 font-medium">Mejor puja (piso)</th>
                          <th className="pb-2 font-medium">Liderando</th>
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
                            <td className="py-2 text-secondary text-xs">{row.winnerName} (supera para ganar)</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-muted mt-2">
                    Estos jugadores NO se adjudican aún. La siguiente ronda abre con piso de puja superior a £{Math.max(...contestedPreview.map(r => r.amount)).toFixed(1)}.
                  </p>
                </div>
              )}
            </div>
          )}

          {resolveErrors.length > 0 && (
                <div className="bg-error/10/40 border border-error/30/50 rounded-lg p-4 space-y-1" role="alert">
              <p className="text-error text-sm font-semibold">Errores de resolución — ronda no avanzada:</p>
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
              {resolving ? 'Resolviendo…' : `Confirmar y avanzar a ronda ${current_round + 1}`}
            </button>
            <button
              onClick={() => { setConfirming(false); setResolveErrors([]); }}
              disabled={resolving}
              className="px-5 py-2 rounded-lg bg-surface-hover hover:bg-border disabled:opacity-50 text-secondary font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
            >
              Cancelar
            </button>
          </div>
        </section>
      )}

      {/* ── Live Bids ────────────────────────────────────────────────────── */}
      {(isActive || isPaused) && (
        <section className="bg-surface rounded-xl p-6 space-y-4">
          <div className="flex items-baseline gap-3">
            <h2 className="text-lg font-semibold text-primary">
              Ronda {current_round} — Pujas en vivo
            </h2>
            <span className="text-sm text-muted">
              {currentRoundBids.length} puja{currentRoundBids.length !== 1 ? 's' : ''} en {biddedPlayerIds.length} jugador{biddedPlayerIds.length !== 1 ? 'es' : ''}
            </span>
          </div>

          {biddedPlayerIds.length === 0 ? (
            <p className="text-muted text-sm">Aún no hay pujas en esta ronda.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted border-b border-border">
                    <th className="pb-3 pr-4 font-medium">Jugador</th>
                    <th className="pb-3 pr-4 font-medium">Pos</th>
                    <th className="pb-3 pr-4 font-medium">Listado</th>
                    <th className="pb-3 pr-4 font-medium">Mejor puja</th>
                    <th className="pb-3 pr-4 font-medium">Liderando</th>
                    <th className="pb-3 pr-4 font-medium">Pujas</th>
                    <th className="pb-3 font-medium">Estado</th>
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
                              ⚡ Disputado
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
        <h2 className="text-lg font-semibold text-primary">Gestión de jornadas</h2>

        {/* Create form */}
        <form onSubmit={handleCreateMatchday} className="space-y-4">
          <h3 className="text-sm font-semibold text-secondary uppercase tracking-wide">Crear jornada</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-muted mb-1">Nombre</label>
              <input
                type="text"
                value={mdForm.name}
                onChange={e => setMdForm(f => ({ ...f, name: e.target.value }))}
                placeholder="ej. Jornada 1"
                className="w-full bg-surface-hover border border-border rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-tertiary"
              />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Fase del Mundial</label>
              <select
                value={mdForm.wc_stage}
                onChange={e => setMdForm(f => ({ ...f, wc_stage: e.target.value }))}
                className="w-full bg-surface-hover border border-border rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-tertiary"
              >
                {WC_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Fecha inicio (opcional)</label>
              <input
                type="date"
                value={mdForm.start_date}
                onChange={e => setMdForm(f => ({ ...f, start_date: e.target.value }))}
                className="w-full bg-surface-hover border border-border rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-tertiary"
              />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Fecha límite de alineación</label>
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
            {mdSaving ? 'Creando…' : 'Crear jornada'}
          </button>
        </form>

        {/* Matchday list */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-secondary uppercase tracking-wide">Todas las jornadas</h3>
          {matchdaysLoading ? (
            <p className="text-muted text-sm">Cargando…</p>
          ) : matchdays.length === 0 ? (
            <p className="text-muted text-sm">Aún no hay jornadas.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted border-b border-border">
                    <th className="pb-3 pr-4 font-medium">Nombre</th>
                    <th className="pb-3 pr-4 font-medium">Fase</th>
                    <th className="pb-3 pr-4 font-medium">Fecha límite</th>
                    <th className="pb-3 pr-4 font-medium">Activo</th>
                    <th className="pb-3 font-medium" title="Finalizar marca la puntuación como definitiva. No afecta bloqueos, ventanas de fichajes ni la jornada siguiente.">Finalizar</th>
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
                          {md.is_active ? 'Activo' : 'Inactivo'}
                        </button>
                      </td>
                      <td className="py-2.5">
                        <button
                          onClick={() => handleToggleCompleted(md)}
                          disabled={finalizingId !== null}
                          className={`px-3 py-1 rounded text-xs font-semibold transition-colors disabled:opacity-40 ${
                            md.is_completed
                              ? 'bg-info text-on-info hover:brightness-90'
                              : 'bg-border text-secondary hover:bg-border-strong'
                          }`}
                          title="Recalcula la puntuación con las estadísticas actuales y la marca como definitiva. No toca bloqueos ni ventanas de fichajes."
                        >
                          {finalizingId === md.id ? 'Finalizando…' : md.is_completed ? 'Final ✓' : 'Finalizar'}
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
          <h2 className="text-lg font-semibold text-primary">Partidos de la jornada</h2>
          <p className="text-xs text-muted mt-1">
            Asigna partidos de la polla a las jornadas fantasy. Los tiempos de bloqueo de jugadores se derivan de los horarios de inicio —
            los nombres de equipos deben coincidir exactamente con <code className="text-secondary">players.country</code>.
          </p>
        </div>

        {fixtureLoading ? (
          <p className="text-muted text-sm">Cargando partidos…</p>
        ) : fixtureMatches.length === 0 ? (
          <p className="text-muted text-sm">No se encontraron partidos. Agrega partidos primero desde la app polla.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted border-b border-border">
                  <th className="pb-3 pr-4 font-medium">Partido</th>
                  <th className="pb-3 pr-4 font-medium">Inicio</th>
                  <th className="pb-3 pr-4 font-medium">Jornada Fantasy</th>
                  <th className="pb-3 font-medium">Stats</th>
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
                    <td className="py-2.5 pr-4">
                      <select
                        value={match.matchday_id ?? ''}
                        onChange={e => handleFixtureMatchdayChange(match.id, e.target.value)}
                        disabled={fixtureSavingIds.has(match.id)}
                        className="bg-surface-hover border border-border rounded-lg px-2 py-1 text-primary text-xs focus:outline-none focus:border-tertiary disabled:opacity-50"
                      >
                        <option value="">— sin asignar —</option>
                        {matchdays.map(md => (
                          <option key={md.id} value={md.id}>{md.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2.5">
                      {match.matchday_id && matchesWithStats.has(matchSig(match.matchday_id, match.team_a, match.team_b)) ? (
                        <span className="text-label-caps font-semibold text-tertiary bg-tertiary/10 border border-tertiary/30 rounded px-1.5 py-0.5">
                          ✓ Stats subidas
                        </span>
                      ) : '—'}
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
        <h2 className="text-lg font-semibold text-primary">Carga de estadísticas CSV</h2>
        <p className="text-xs text-muted">
          CSV columns: <code className="text-secondary">player_name, minutes, goals, assists, clean_sheet, saves, penalty_saves, penalty_misses, yellow, red, own_goals, goals_conceded, game_time</code>
        </p>

        <form onSubmit={handleStatsUpload} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-muted mb-1">Jornada</label>
              <select
                value={statsMatchdayId}
                onChange={e => setStatsMatchdayId(e.target.value)}
                className="w-full bg-surface-hover border border-border rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-tertiary"
              >
                <option value="">Seleccionar jornada…</option>
                {matchdays.map(md => (
                  <option key={md.id} value={md.id}>{md.name} — {md.wc_stage}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Archivo CSV</label>
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
            {statsUploading ? 'Subiendo…' : 'Subir estadísticas'}
          </button>
        </form>

        {statsResult && (
          <div className={`rounded-lg p-4 space-y-1 ${statsResult.errors?.length > 0 && !statsResult.inserted ? 'bg-error/10/40 border border-error/30/50' : 'bg-surface-hover'}`}>
            {statsResult.inserted > 0 && (
              <p className="text-tertiary text-sm font-semibold">
                ✓ {statsResult.inserted} fila{statsResult.inserted !== 1 ? 's' : ''} de estadísticas guardada{statsResult.inserted !== 1 ? 's' : ''}.
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
          <h2 className="text-lg font-semibold text-primary">Carga de estadísticas Opta JSON</h2>
          <p className="text-xs text-muted mt-1">
            Sube un archivo JSON de puntos Opta para almacenar estadísticas por jugador (entradas, tiros, pases, etc.) y PTS Opta. Idempotente — volver a subir sobrescribe las filas existentes para la misma jornada.
          </p>
        </div>

        <form onSubmit={handleOptaUpload} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-muted mb-1">Jornada</label>
              <select
                value={optaMatchdayId}
                onChange={e => setOptaMatchdayId(e.target.value)}
                className="w-full bg-surface-hover border border-border rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-tertiary"
              >
                <option value="">Seleccionar jornada…</option>
                {matchdays.map(md => (
                  <option key={md.id} value={md.id}>{md.name} — {md.wc_stage}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Archivo JSON de puntos Opta</label>
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
            {optaUploading ? 'Subiendo…' : 'Subir estadísticas Opta'}
          </button>
        </form>

        {optaResult && (
          <div className={`rounded-lg p-4 space-y-2 ${
            optaResult.gcWarning
              ? 'bg-warning/10 border border-warning/40'
              : optaResult.errors?.length > 0 && !optaResult.inserted
              ? 'bg-error/10 border border-error/30'
              : 'bg-surface-hover'
          }`}>
            {optaResult.inserted > 0 && (
              <p className="text-tertiary text-sm font-semibold">
                ✓ {optaResult.inserted} fila{optaResult.inserted !== 1 ? 's' : ''} de estadísticas guardada{optaResult.inserted !== 1 ? 's' : ''}.
              </p>
            )}
            {optaResult.errors?.map((err, i) => (
              <p key={i} className={`text-xs ${optaResult.gcWarning ? 'text-warning' : 'text-error'}`}>{err}</p>
            ))}
            {optaResult.gcWarning && (
              <button
                onClick={() => handleOptaUpload(null, true)}
                className="mt-2 px-4 py-1.5 rounded-lg bg-warning/20 hover:bg-warning/30 text-warning border border-warning/40 font-semibold text-xs transition-colors"
              >
                Subir de todos modos
              </button>
            )}
          </div>
        )}
      </section>

      {/* ── Opta ODS Stats Upload ────────────────────────────────────────── */}
      <section className="bg-surface rounded-xl p-6 space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-primary">Carga de estadísticas Opta ODS</h2>
          <p className="text-xs text-muted mt-1">
            Sube el archivo <code>.ods</code> curado (después de ejecutar <code>add_db_name_col.py</code>). Idempotente — volver a subir sobrescribe las filas existentes.
          </p>
        </div>

        <form onSubmit={handleOdsUpload} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-muted mb-1">Jornada</label>
              <select
                value={odsMatchdayId}
                onChange={e => setOdsMatchdayId(e.target.value)}
                className="w-full bg-surface-hover border border-border rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-tertiary"
              >
                <option value="">Seleccionar jornada…</option>
                {matchdays.map(md => (
                  <option key={md.id} value={md.id}>{md.name} — {md.wc_stage}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Archivo .ods (con columna DB Name)</label>
              <input
                type="file"
                accept=".ods"
                onChange={e => { setOdsFile(e.target.files?.[0] ?? null); setOdsResult(null); }}
                className="w-full text-sm text-secondary file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-border file:text-secondary hover:file:bg-border-strong"
              />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Fecha del partido (opcional)</label>
              <input
                type="date"
                value={odsDate}
                onChange={e => setOdsDate(e.target.value)}
                className="w-full bg-surface-hover border border-border rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-tertiary"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={odsUploading}
            className="px-5 py-2 rounded-lg bg-tertiary hover:bg-tertiary disabled:opacity-50 text-on-tertiary font-semibold text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
          >
            {odsUploading ? 'Subiendo…' : 'Subir estadísticas ODS'}
          </button>
        </form>

        {odsResult && (
          <div className={`rounded-lg p-4 space-y-2 ${
            odsResult.gcWarning
              ? 'bg-warning/10 border border-warning/40'
              : odsResult.errors?.length > 0 && !odsResult.inserted
              ? 'bg-error/10 border border-error/30'
              : 'bg-surface-hover'
          }`}>
            {odsResult.inserted > 0 && (
              <p className="text-tertiary text-sm font-semibold">
                ✓ {odsResult.inserted} fila{odsResult.inserted !== 1 ? 's' : ''} de estadísticas guardada{odsResult.inserted !== 1 ? 's' : ''}.
              </p>
            )}
            {odsResult.errors?.map((err, i) => (
              <p key={i} className={`text-xs ${odsResult.gcWarning ? 'text-warning' : 'text-error'}`}>{err}</p>
            ))}
            {odsResult.gcWarning && (
              <button
                onClick={() => handleOdsUpload(null, true)}
                className="mt-2 px-4 py-1.5 rounded-lg bg-warning/20 hover:bg-warning/30 text-warning border border-warning/40 font-semibold text-xs transition-colors"
              >
                Subir de todos modos
              </button>
            )}
          </div>
        )}
      </section>

      {/* ── Standings Calculation ───────────────────────────────────────── */}
      <section className="bg-surface rounded-xl p-6 space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-primary">Calcular posiciones</h2>
          <p className="text-xs text-muted mt-1">
            Ejecuta después de subir estadísticas. Puntúa todos los equipos para la jornada (XI titulares guardados, sin sustituciones automáticas) y escribe en fantasy_standings. Provisional hasta marcar completado.
          </p>
        </div>

        {/* ── 5b. Scoring System Selector ─────────────────────────────── */}
        <div>
          <p className="text-xs font-semibold text-secondary uppercase tracking-wide mb-2">Sistema de puntuación</p>
          <div className="flex items-center gap-2">
            {['current', 'opta'].map((system) => {
              const isActive = (auctionState.scoring_system ?? 'opta') === system;
              const label = system === 'current' ? 'FPL' : 'Compuesto (FPL+)';
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
            {savingSystem && <span className="text-xs text-muted">Guardando…</span>}
          </div>
        </div>

          <form onSubmit={handleCalculateStandings} className="flex items-end gap-4 flex-wrap">
          <div className="flex-1 min-w-48">
            <label className="block text-xs text-muted mb-1">Jornada</label>
            <select
              value={calcMatchdayId}
              onChange={e => { setCalcMatchdayId(e.target.value); setStandingsPreview(null); setPreviewReady(false); setCalcResult(null); }}
              className="w-full bg-surface-hover border border-border rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-tertiary"
            >
              <option value="">Seleccionar jornada…</option>
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
            {calcRunning ? 'Calculando…' : 'Vista previa'}
          </button>
        </form>

        {/* ── Preview table (step 1 result) ────────────────────────────── */}
        {previewReady && standingsPreview && (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-secondary uppercase tracking-wide">
              Vista previa — Sistema activo:{' '}
              <span className={(auctionState.scoring_system ?? 'opta') === 'opta' ? 'text-tertiary' : 'text-info'}>
                {(auctionState.scoring_system ?? 'opta') === 'opta' ? 'Compuesto (FPL+)' : 'FPL'}
              </span>
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted border-b border-border">
                    <th className="pb-2 pr-4 font-medium">Equipo</th>
                    <th className="pb-2 pr-4 font-medium text-right">Puntos FPL</th>
                    <th className="pb-2 pr-4 font-medium text-right">Puntos Compuesto</th>
                    <th className="pb-2 font-medium text-right">Se guardará</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {standingsPreview.rows.map(r => {
                    const isOpta = (auctionState.scoring_system ?? 'opta') === 'opta';
                    const willSave = Math.round((isOpta ? r.optaPts : r.currentPts) * 10) / 10;
                    return (
                      <tr key={r.teamId} className="text-secondary">
                        <td className="py-2 pr-4 text-primary font-medium">{r.teamName}</td>
                        <td className="py-2 pr-4 text-right">{r.currentPts}</td>
                        <td className="py-2 pr-4 text-right">
                          {typeof r.optaPts === 'number' ? r.optaPts.toFixed(1) : '—'}
                        </td>
                        <td className="py-2 text-right font-bold text-tertiary">{willSave.toFixed(1)}</td>
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
                {confirmingSave ? 'Guardando…' : 'Confirmar y guardar'}
              </button>
              <button
                onClick={() => { setPreviewReady(false); setStandingsPreview(null); }}
                disabled={confirmingSave}
                className="px-5 py-2 rounded-lg bg-surface-hover hover:bg-border disabled:opacity-50 text-secondary font-semibold text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {calcResult && (
          <div className={`rounded-lg p-4 space-y-1 ${calcResult.errors?.length && !calcResult.teamsScored ? 'bg-error/10/40 border border-error/30/50' : 'bg-surface-hover'}`}>
            {calcResult.teamsScored > 0 && (
              <p className="text-tertiary text-sm font-semibold">
                ✓ Posiciones calculadas para {calcResult.teamsScored} equipo{calcResult.teamsScored !== 1 ? 's' : ''}.
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
            <h2 className="text-lg font-semibold text-primary">Cuadro eliminatorio</h2>
            <p className="text-xs text-muted mt-1">
              Configura después de completar la fase de liga (3 jornadas). Luego calcula cada ronda usando la jornada correspondiente.
            </p>
          </div>

          {knockoutLoading ? (
            <p className="text-muted text-sm">Cargando…</p>
          ) : knockoutMatches.length === 0 ? (
            // ── Not seeded ──
            (() => {
              const standings = computeKnockoutStandings();
              const champSeed = standings.length >= 8 ? generateChampionshipBracket(standings) : [];
              return (
                <div className="space-y-4">
                  {standings.length < 8 ? (
                    <p className="text-tertiary text-sm">
                      Se necesitan posiciones de al menos 8 equipos. Ejecuta Calcular posiciones primero.
                    </p>
                  ) : (
                    <div>
                      <p className="text-label-caps text-muted uppercase tracking-wide mb-2">Cuartos de final (Mejores 8)</p>
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
                      {bracketSeedResult.error ?? `✓ Cuadro configurado — ${bracketSeedResult.count} partidos creados.`}
                    </div>
                  )}

                  <button
                    onClick={handleSeedBracket}
                    disabled={bracketSeeding || standings.length < 8}
                    className="px-5 py-2 rounded-lg bg-tertiary hover:bg-tertiary disabled:opacity-50 text-on-tertiary font-semibold text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
                  >
                    {bracketSeeding ? 'Configurando…' : 'Configurar cuadro'}
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
                            {done ? 'Completado' : pending ? 'Pendiente' : 'No iniciado'}
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
                                <th className="pb-2 pr-4 font-medium text-xs">Partido</th>
                                <th className="pb-2 pr-4 font-medium text-xs">Equipo A</th>
                                <th className="pb-2 pr-4 font-medium text-xs">Equipo B</th>
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
                            <label className="block text-xs text-muted mb-1">Jornada para ronda {activeRound}</label>
                            <select
                              value={knockoutCalcMatchdayId}
                              onChange={e => { setKnockoutCalcMatchdayId(e.target.value); setKnockoutCalcResult(null); }}
                              className="w-full bg-surface-hover border border-border rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-tertiary"
                            >
                              <option value="">Seleccionar jornada…</option>
                              {matchdays.map(md => (
                                <option key={md.id} value={md.id}>{md.name} — {md.wc_stage}</option>
                              ))}
                            </select>
                          </div>
                          <button
                            onClick={() => handleSaveRoundMatchday(activeRound)}
                            disabled={knockoutCalcRunning || !knockoutCalcMatchdayId}
                            className="px-5 py-2 rounded-lg border border-tertiary text-tertiary hover:bg-tertiary/10 disabled:opacity-50 font-semibold text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
                          >
                            Guardar jornada (provisional)
                          </button>
                          <button
                            onClick={() => handleCalculateKnockoutRound(activeRound)}
                            disabled={knockoutCalcRunning || !knockoutCalcMatchdayId}
                            className="px-5 py-2 rounded-lg bg-tertiary hover:bg-tertiary disabled:opacity-50 text-on-tertiary font-semibold text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
                          >
                            {knockoutCalcRunning ? 'Calculando…' : `Calcular ronda ${activeRound}`}
                          </button>
                        </div>
                        <p className="text-xs text-muted">
                          <strong>Guardar jornada (provisional)</strong> vincula la ronda a su jornada para mostrar puntos H2H en vivo en el Cuadro sin cerrar la ronda. <strong>Calcular ronda</strong> bloquea los ganadores (definitivo).
                        </p>
                      </div>
                    );
                  })()}

                  {activeRound === null && (
                    <p className="text-tertiary text-sm font-semibold">
                      ✓ Todas las rondas completadas. Ve las posiciones finales en la página del Cuadro.
                    </p>
                  )}

                  {knockoutCalcResult && (
                    <div className={`rounded-lg p-4 space-y-1 ${knockoutCalcResult.errors?.length && !knockoutCalcResult.resolved ? 'bg-error/10/40 border border-error/30/50' : 'bg-surface-hover'}`}>
                      {knockoutCalcResult.resolved > 0 && (
                        <p className="text-tertiary text-sm font-semibold">
                          ✓ {knockoutCalcResult.resolved} partido{knockoutCalcResult.resolved !== 1 ? 's' : ''} resuelto{knockoutCalcResult.resolved !== 1 ? 's' : ''}.
                        </p>
                      )}
                      {knockoutCalcResult.saved && (
                        <p className="text-tertiary text-sm font-semibold">
                          ✓ Jornada vinculada — el Cuadro mostrará puntos provisionales en vivo.
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
        <h2 className="text-lg font-semibold text-primary">Ventanas de fichajes</h2>

        {/* Quick-create preset buttons */}
        <div>
          <p className="text-xs font-semibold text-secondary uppercase tracking-wide mb-2">
            Creación rápida
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
            Ventana personalizada
          </p>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs text-muted block mb-1">Ventana #</label>
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
              <label className="text-xs text-muted block mb-1">Máx. fichajes</label>
              <input
                type="number"
                min="1"
                value={twForm.max_transfers}
                onChange={(e) => setTwForm((f) => ({ ...f, max_transfers: e.target.value }))}
                className="w-20 bg-surface-hover border border-border rounded-lg px-3 py-1.5 text-sm text-primary focus:outline-none focus:border-info"
              />
            </div>
            <div>
              <label className="text-xs text-muted block mb-1">Abre (opcional)</label>
              <input
                type="datetime-local"
                value={twForm.opens_at}
                onChange={(e) => setTwForm((f) => ({ ...f, opens_at: e.target.value }))}
                className="bg-surface-hover border border-border rounded-lg px-3 py-1.5 text-sm text-primary focus:outline-none focus:border-info"
              />
            </div>
            <div>
              <label className="text-xs text-muted block mb-1">Cierra (opcional)</label>
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
              {twSaving ? 'Creando…' : 'Crear'}
            </button>
          </div>
          {twError && <p className="text-error text-sm mt-2">{twError}</p>}
        </div>

        {/* Windows list */}
        {twLoading ? (
          <p className="text-muted text-sm">Cargando ventanas…</p>
        ) : transferWindows.length === 0 ? (
          <p className="text-muted text-sm">Aún no hay ventanas de fichajes.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted border-b border-border">
                  <th className="pb-2 pr-4 font-medium">Ventana</th>
                  <th className="pb-2 pr-4 font-medium">Máx</th>
                  <th className="pb-2 pr-4 font-medium">Abre</th>
                  <th className="pb-2 pr-4 font-medium">Cierra</th>
                  <th className="pb-2 pr-4 font-medium">Estado</th>
                  <th className="pb-2 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {transferWindows.map((tw) => (
                  <tr key={tw.id} className="text-secondary">
                    <td className="py-2.5 pr-4 font-semibold text-primary">Ventana {tw.window_number}</td>
                    <td className="py-2.5 pr-4">{tw.max_transfers} fichajes</td>
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
                        {tw.is_active ? 'Abierta' : 'Cerrada'}
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
                          {tw.is_active ? 'Cerrar' : 'Abrir'}
                        </button>
                        {tw.is_active && (
                          <button
                            onClick={() => fetchWindowActivity(tw.window_number)}
                            disabled={activityLoading}
                            className="px-3 py-1 rounded text-xs font-semibold bg-info hover:brightness-90 text-on-info transition-colors"
                          >
                            {activityLoading ? 'Cargando…' : 'Ver actividad'}
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteTransferWindow(tw)}
                          className="px-3 py-1 rounded text-xs font-semibold bg-border hover:bg-border-strong text-secondary transition-colors"
                        >
                          Eliminar
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
              Actividad de fichajes — Ventana {windowActivity[0]?.window_number}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted border-b border-border">
                    <th className="pb-2 pr-4 font-medium">Manager</th>
                    <th className="pb-2 pr-4 font-medium">Sale</th>
                    <th className="pb-2 pr-4 font-medium">Entra</th>
                    <th className="pb-2 pr-4 font-medium">Δ Presupuesto</th>
                    <th className="pb-2 font-medium">Hora</th>
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
          <h2 className="text-lg font-semibold text-primary">Importar jugadores CSV</h2>
          <p className="text-xs text-muted mt-1">
            Sube un CSV para poblar la lista de jugadores antes de la subasta. Los jugadores se deduplican por nombre + país.
            Columnas requeridas: <code className="text-secondary">name, country, position, price</code>.
            Opcionales: <code className="text-secondary">country_code, photo_url</code>.
          </p>
        </div>

        <form onSubmit={handleCsvPlayerImport} className="space-y-4">
          <div>
            <label className="block text-xs text-muted mb-1">Archivo CSV</label>
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
            {csvImportRunning ? 'Importando…' : 'Importar jugadores'}
          </button>
        </form>

        {csvImportResult && (
          <div className={`rounded-lg p-4 space-y-2 ${csvImportResult.errors?.length && !csvImportResult.created ? 'bg-error/10/40 border border-error/30/50' : 'bg-surface-hover'}`}>
            {csvImportResult.created > 0 && (
              <p className="text-tertiary text-sm font-semibold">
                ✓ {csvImportResult.created} jugador{csvImportResult.created !== 1 ? 'es' : ''} creado{csvImportResult.created !== 1 ? 's' : ''}.
              </p>
            )}
            {csvImportResult.created === 0 && !csvImportResult.errors?.length && (
              <p className="text-secondary text-sm">No hay jugadores nuevos para importar (todos ya están en la BD o fueron omitidos).</p>
            )}
            {csvImportResult.errors?.map((err, i) => (
              <p key={i} className="text-error text-xs">{err}</p>
            ))}
            {csvImportResult.skipped?.length > 0 && (
              <details className="mt-1">
                <summary className="text-xs text-muted cursor-pointer hover:text-secondary">
                  {csvImportResult.skipped.length} omitidos (ya en la BD) — clic para expandir
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

      {/* ── Países eliminados ─────────────────────────────────────────────── */}
      <section className="bg-surface rounded-xl p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-primary">Países eliminados</h2>
          <p className="text-xs text-muted mt-1">
            Los jugadores de países eliminados seguirán en las plantillas pero no podrán sumar puntos. Se mostrará una advertencia al ficharlos.
          </p>
        </div>
        {countries.length === 0 ? (
          <p className="text-muted text-sm">Cargando países…</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {countries.map((c) => (
              <button
                key={c.country_code ?? c.country}
                onClick={() => handleToggleCountryEliminated(c.country_code, c.is_eliminated)}
                disabled={togglingCountry === c.country_code}
                className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2 ${
                  c.is_eliminated
                    ? 'bg-error/10 border-error/40 text-error'
                    : 'bg-surface-hover border-border text-secondary hover:bg-border'
                } disabled:opacity-50`}
              >
                <span className="truncate">{c.country_code ?? c.country}</span>
                {c.is_eliminated ? <span className="shrink-0">✕</span> : <span className="shrink-0 text-muted">○</span>}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="bg-surface rounded-xl p-6 space-y-4">
        <div className="flex items-baseline gap-3">
          <h2 className="text-lg font-semibold text-primary">Lista de jugadores</h2>
          {!playersLoading && (
            <span className="text-sm text-muted">{players.length} jugadores</span>
          )}
        </div>

        {playersLoading ? (
          <p className="text-muted text-sm">Cargando jugadores…</p>
        ) : players.length === 0 ? (
          <p className="text-muted text-sm">No se encontraron jugadores. Ejecuta el seed SQL.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted border-b border-border">
                  <th className="pb-3 pr-4 font-medium">Nombre</th>
                  <th className="pb-3 pr-4 font-medium">Pos</th>
                  <th className="pb-3 pr-4 font-medium">País</th>
                  <th className="pb-3 font-medium">Precio</th>
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
