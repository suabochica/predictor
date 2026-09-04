import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AuctionProvider, useAuction } from '../context/AuctionContext';
import { usePlayers } from '../hooks/usePlayers';
import AuctionTimer from '../components/auction/AuctionTimer';
import { supabase } from '@predictor/supabase';
import {
  AUCTION_STATUSES,
  AUTO_BID_DELAY_SECONDS,
  DEFAULT_ROUND_DURATION_SECONDS,
  MAX_LEAGUE_PARTICIPANTS,
  MAX_SQUAD_SIZE,
  MIN_BID_INCREMENT,
  TOTAL_BUDGET,
  TRANSFER_CAP_KNOCKOUT,
  TRANSFER_CAP_ROUND_ROBIN,
} from '../config/constants';
import { calculatePlayerPoints, calculateCompositePoints } from '../lib/scoring';
import { buildDefaultLineup, ensureStartingGk } from '../lib/defaultLineup';
import { calculateTeamMatchdayPoints } from '../lib/matchday';
import { generateChampionshipBracket, generateGroupSchedule, resolveH2H } from '../lib/brackets';
import { useCompetition } from '../context/CompetitionContext';
import { createDb, unscopedFrom } from '../lib/db';

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

/**
 * The panel itself, bound to ONE competition — `adminCompetitionId`, chosen by the
 * selector in `Admin` below, which is deliberately independent of the sidebar
 * switcher (an admin has to be able to build a `status='setup'` competition while
 * still using the app as a player in another).
 *
 * `adb` is that binding: a scoped client for the *administered* competition, used
 * in place of the `db` every other page takes from `useCompetition()`. The parent
 * keys the wrapper on the same id, so a switch remounts this whole subtree and
 * every one of its ~40 useState hooks starts clean rather than showing the
 * previous competition's rows under the new competition's name.
 *
 * The auction sections follow the same binding: the parent wraps this component
 * in its own `AuctionProvider` scoped to `adminCompetitionId`, so `useAuction()`
 * here returns the administered competition's auction, not the sidebar's.
 */
function AdminPanel({ adminCompetitionId, adminCompetition }) {
  const adb = useMemo(() => createDb(adminCompetitionId), [adminCompetitionId]);
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
      adb
        .from('teams')
        .select('id, name, team_players!team_players_team_id_fkey(player_id, acquisition_price, players(id, name, position, price))'),
      adb.from('lineups').select('team_id').is('matchday_id', null),
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
      const { error } = await adb.from('lineups').insert(toInsert);
      if (error) warnings.push(`Lineup insert error: ${error.message}`);
    }

    setLineupWarnings(warnings);

    const { data: fresh } = await adb
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

  // Override the hook's client so the roster listed at the bottom of the panel is
  // the administered competition's, not the sidebar's.
  const { players, loading: playersLoading } = usePlayers({}, adb);
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
      adb
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
    const { error } = await supabase.rpc('set_country_eliminated', {
      p_country_code: country_code,
      p_eliminated: !currentlyEliminated,
      p_competition_id: adminCompetitionId,
    });
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

  // Fires for the ADMINISTERED competition's auction — auctionState and
  // runAutoBids both come from the AuctionProvider the parent scopes to
  // `adminCompetitionId`, so the ticker follows the panel selector. Switching
  // the selector remounts the panel and re-points the ticker with it.
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
    // `teams` is a LEFT embed (no !inner) so users without a team still appear.
    // Since 062 dropped teams UNIQUE(user_id) for UNIQUE(user_id, competition_id),
    // PostgREST emits this embed as a to-many ARRAY instead of a to-one object —
    // hence the flatten below, which the rest of this section relies on.
    // The embed is rooted on `users` (unscoped), so adb.from() can't filter it —
    // the predicate has to name the embedded table explicitly.
    const { data } = await adb
      .from('users')
      .select('id, display_name, email, teams(id, name, budget_remaining)')
      .eq('teams.competition_id', adminCompetitionId)
      .order('created_at', { ascending: true });
    setParticipants(
      (data ?? []).map((u) => ({
        ...u,
        teams: Array.isArray(u.teams) ? (u.teams[0] ?? null) : (u.teams ?? null),
      })),
    );
    setParticipantsLoading(false);
  }

  async function handleAddToLeague(user) {
    setAddingTeamFor(user.id);
    await adb.from('teams').insert({
      user_id: user.id,
      name: user.display_name,
      // The starting budget is per-competition config (060), not a constant —
      // constants.js keeps TOTAL_BUDGET only as the create-form default.
      budget_remaining: Number(adminCompetition?.budget ?? TOTAL_BUDGET),
    });
    await fetchParticipants();
    setAddingTeamFor(null);
  }

  async function handleRemoveFromLeague(userId) {
    await adb.from('teams').delete().eq('user_id', userId);
    await fetchParticipants();
  }
  // ──────────────────────────────────────────────────────────────────────────

  // ── Matchday Management ───────────────────────────────────────────────────
  // Stage labels are per-competition (060). WC_STAGES survives only as the
  // fallback for a competition saved with an empty list.
  const stageLabels = adminCompetition?.stage_labels?.length ? adminCompetition.stage_labels : WC_STAGES;
  const EMPTY_FORM = { name: '', wc_stage: stageLabels[0], phase: 'league', start_date: '', deadline: '' };
  const [matchdays, setMatchdays] = useState([]);
  const [matchdaysLoading, setMatchdaysLoading] = useState(true);
  const [mdForm, setMdForm] = useState(EMPTY_FORM);
  const [mdSaving, setMdSaving] = useState(false);
  const [mdError, setMdError] = useState('');

  const fetchMatchdays = useCallback(async () => {
    setMatchdaysLoading(true);
    const { data } = await adb
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
      adb
        .from('knockout_matches')
        .select(`*,
          team_a:teams!knockout_matches_team_a_id_fkey(id, name, users(display_name)),
          team_b:teams!knockout_matches_team_b_id_fkey(id, name, users(display_name)),
          winner:teams!knockout_matches_winner_id_fkey(id, name, users(display_name))`)
        .order('round').order('id'),
      adb.from('fantasy_standings').select('team_id, matchday_id, matchday_points, total_points, goals_scored'),
      adb.from('teams').select('id, name, users(display_name)'),
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
    // `phase` is sent explicitly: 061's trigger only derives it for the World Cup
    // archive and RAISES for any other competition rather than guessing (a Swiss
    // league phase has no "group" in its name and would classify as knockout).
    // `sequence` is deliberately omitted — the same trigger assigns the next one
    // within this competition.
    const { error } = await adb.from('matchdays').insert({
      name:       mdForm.name.trim(),
      wc_stage:   mdForm.wc_stage,
      phase:      mdForm.phase,
      start_date: mdForm.start_date || null,
      deadline:   mdForm.deadline,
    });
    setMdSaving(false);
    if (error) { setMdError(error.message); return; }
    setMdForm(EMPTY_FORM);
    await fetchMatchdays();
  }

  async function handleToggleActive(md) {
    await adb
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

      await adb
        .from('matchdays')
        .update({ is_completed: completing, is_active: completing ? false : md.is_active })
        .eq('id', md.id);

      // When marking a matchday complete, auto-activate the next one (by ID).
      if (completing) {
        const { data: fresh } = await adb
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
      const { data, error } = await adb
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
      const { error } = await adb.from('player_stats').upsert(toUpsert, { onConflict: 'player_id,matchday_id' });
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

  // ── League-phase draw (H2H group stage) ──────────────────────────────────
  const [groupFixtures, setGroupFixtures] = useState([]);
  const [groupFixturesLoading, setGroupFixturesLoading] = useState(true);
  const [drawPreview, setDrawPreview] = useState(null); // rounds of [teamAId, teamBId] pairs, aligned to leagueMatchdays order
  const [drawError, setDrawError] = useState('');
  const [drawSaving, setDrawSaving] = useState(false);
  const [drawResult, setDrawResult] = useState(null);

  const fetchGroupFixtures = useCallback(async () => {
    setGroupFixturesLoading(true);
    const { data } = await adb
      .from('group_fixtures')
      .select('*')
      .order('matchday_id').order('slot');
    setGroupFixtures(data ?? []);
    setGroupFixturesLoading(false);
  }, []);

  useEffect(() => { fetchGroupFixtures(); }, [fetchGroupFixtures]);

  const leagueMatchdays = [...matchdays]
    .filter(m => m.phase === 'league')
    .sort((a, b) => a.sequence - b.sequence);

  function handleDrawSchedule() {
    setDrawError('');
    setDrawResult(null);
    try {
      const teamIds = knockoutTeams.map(t => t.id);
      const schedule = generateGroupSchedule(teamIds, leagueMatchdays.length);
      setDrawPreview(schedule);
    } catch (err) {
      setDrawPreview(null);
      setDrawError(err.message);
    }
  }

  async function handleConfirmDraw() {
    if (!drawPreview) return;
    setDrawSaving(true);
    const rows = leagueMatchdays.flatMap((md, mdIdx) =>
      drawPreview[mdIdx].map(([teamAId, teamBId], i) => ({
        matchday_id: md.id, team_a_id: teamAId, team_b_id: teamBId, slot: i + 1,
      }))
    );
    const { error } = await adb.from('group_fixtures').insert(rows);
    setDrawResult(error ? { error: error.message } : { ok: true, count: rows.length });
    if (!error) {
      setDrawPreview(null);
      await fetchGroupFixtures();
    }
    setDrawSaving(false);
  }

  async function handleRedrawSchedule() {
    setDrawSaving(true);
    setDrawResult(null);
    const { error } = await adb.from('group_fixtures').delete();
    if (error) {
      setDrawResult({ error: error.message });
      setDrawSaving(false);
      return;
    }
    setDrawPreview(null);
    await fetchGroupFixtures();
    setDrawSaving(false);
  }

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

  // ── Negotiation window (closed-door traspasos of eliminated squads) ────────
  const [negWindow, setNegWindow] = useState(null);
  const [negPool, setNegPool] = useState([]);
  const [negCounts, setNegCounts] = useState({});
  const [negMatchdayId, setNegMatchdayId] = useState('');
  const [negLoading, setNegLoading] = useState(true);
  const [negOpening, setNegOpening] = useState(false);
  const [negResolving, setNegResolving] = useState(false);
  const [negResult, setNegResult] = useState(null);

  const fetchNegotiationData = useCallback(async () => {
    setNegLoading(true);
    const { data: windows } = await adb
      .from('negotiation_windows')
      .select('*')
      .order('id', { ascending: false })
      .limit(1);
    const w = windows?.[0] ?? null;
    setNegWindow(w);

    if (w && w.status === 'open') {
      const [{ data: elimTeams }, { data: counts }] = await Promise.all([
        adb.from('teams').select('id, name').eq('status', 'eliminated'),
        supabase.rpc('get_negotiation_offer_counts', { p_window_id: w.id }),
      ]);
      const countsMap = {};
      for (const row of counts ?? []) countsMap[row.target_player_id] = Number(row.offer_count);
      setNegCounts(countsMap);

      const teamIds = (elimTeams ?? []).map(t => t.id);
      if (teamIds.length > 0) {
        const { data: rows } = await adb
          .from('team_players')
          .select('team_id, player_id, players(*)')
          .in('team_id', teamIds);
        const byTeam = new Map((elimTeams ?? []).map(t => [t.id, { teamId: t.id, teamName: t.name, players: [] }]));
        for (const row of rows ?? []) {
          if (!row.players || row.players.is_eliminated) continue;
          byTeam.get(row.team_id)?.players.push(row.players);
        }
        setNegPool([...byTeam.values()].filter(g => g.players.length > 0));
      } else {
        setNegPool([]);
      }
    } else {
      setNegPool([]);
      setNegCounts({});
    }
    setNegLoading(false);
  }, []);

  useEffect(() => { fetchNegotiationData(); }, [fetchNegotiationData]);

  async function handleOpenNegotiationWindow(fantasyRound) {
    if (!negMatchdayId) {
      setNegResult({ errors: ['Selecciona una jornada primero.'] });
      return;
    }
    setNegOpening(true);
    setNegResult(null);
    const { data, error } = await supabase.rpc('open_negotiation_window', {
      p_fantasy_round: fantasyRound,
      p_matchday_id: parseInt(negMatchdayId, 10),
    });
    const rpcError = error?.message ?? data?.error;
    setNegResult(rpcError ? { errors: [rpcError] } : { opened: true });
    await fetchNegotiationData();
    setNegOpening(false);
  }

  async function handleResolveNegotiationWindow() {
    if (!negWindow) return;
    const early = new Date(negWindow.closes_at) > new Date();
    if (early && !window.confirm('La ventana todavía no cierra. ¿Resolver de todas formas?')) return;
    setNegResolving(true);
    setNegResult(null);
    const { data, error } = await supabase.rpc('resolve_negotiation_window', { p_window_id: negWindow.id });
    const rpcError = error?.message ?? data?.error;
    setNegResult(rpcError ? { errors: [rpcError] } : { summary: data });
    await fetchNegotiationData();
    setNegResolving(false);
  }

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
      adb
        .from('matches')
        .select('id, match_code, team_a, team_b, match_date, matchday_id')
        .order('match_date', { ascending: true }),
      adb
        .from('match_metadata')
        .select('matchday_id, home_team, away_team'),
      adb
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
    await adb
      .from('matches')
      .update({ matchday_id: newMatchdayId === '' ? null : Number(newMatchdayId) })
      .eq('id', matchId);
    setFixtureSavingIds(prev => { const s = new Set(prev); s.delete(matchId); return s; });
    await fetchFixtureMatches();
  }
  // ──────────────────────────────────────────────────────────────────────────

  // ── Transfer Windows ──────────────────────────────────────────────────────
  // The knockout cap is per-competition config; the labels no longer name World
  // Cup rounds, since the windows exist in every competition.
  const knockoutCap = Number(adminCompetition?.transfer_cap_knockout ?? TRANSFER_CAP_KNOCKOUT);
  const WINDOW_DEFAULTS = [1, 2, 3].map((n) => ({
    window_number: n,
    max_transfers: knockoutCap,
    label: `Ventana ${n} — ${knockoutCap} fichajes`,
  }));
  const EMPTY_TW_FORM = { window_number: '1', max_transfers: String(knockoutCap), opens_at: '', closes_at: '' };
  const [transferWindows, setTransferWindows] = useState([]);
  const [twLoading, setTwLoading] = useState(true);
  const [twForm, setTwForm] = useState(EMPTY_TW_FORM);
  const [twSaving, setTwSaving] = useState(false);
  const [twError, setTwError] = useState('');
  const [windowActivity, setWindowActivity] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);

  async function fetchTransferWindows() {
    const { data } = await adb
      .from('transfer_windows')
      .select('*')
      .order('window_number');
    setTransferWindows(data ?? []);
    setTwLoading(false);
  }

  useEffect(() => {
    adb.from('transfer_windows').select('*').order('window_number').then(({ data }) => {
      setTransferWindows(data ?? []);
      setTwLoading(false);
    });
  }, []);

  async function fetchWindowActivity(windowNumber) {
    setActivityLoading(true);
    const { data } = await adb
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
    const { error } = await adb.from('transfer_windows').insert({
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
      await adb.from('transfer_windows').update({ is_active: false }).neq('id', tw.id);
    }
    await adb.from('transfer_windows').update({ is_active: activating }).eq('id', tw.id);
    setTwLoading(true);
    await fetchTransferWindows();
    if (activating) await fetchWindowActivity(tw.window_number);
  }

  async function handleDeleteTransferWindow(tw) {
    await adb.from('transfer_windows').delete().eq('id', tw.id);
    setTwLoading(true);
    await fetchTransferWindows();
  }
  // ──────────────────────────────────────────────────────────────────────────

  // ── 5a. Scoring system toggle ─────────────────────────────────────────────
  async function handleSaveScoringSystem(system) {
    setSavingSystem(true);
    await adb
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
    const { data: teams } = await adb.from('teams').select('id, name');
    if (!teams?.length) return null;

    // 2. Fetch all player_stats — paginated so no starter's stats are ever dropped
    const allStats = await fetchAllPages((f, t) =>
      adb
        .from('player_stats')
        .select('player_id, minutes_played, goals, assists, clean_sheet, saves, penalty_saves, penalty_misses, yellow_cards, red_cards, own_goals, goals_conceded, total_points, shots_on_target, shots_off_target, blocked_shots, tackles, interceptions, fouls_won, fouls_conceded, offsides, passes, crosses, penalties_won')
        .eq('matchday_id', matchdayIdInt)
        .range(f, t));
    const statsMap = Object.fromEntries(allStats.map(s => [s.player_id, s]));

    // 3. Fetch all players for position + price lookup — roster exceeds 1000 rows
    const allPlayers = await fetchAllPages((f, t) =>
      adb.from('players').select('id, position, price').range(f, t));
    const positionMap = Object.fromEntries(allPlayers.map(p => [p.id, p.position]));
    const priceMap = Object.fromEntries(allPlayers.map(p => [p.id, p.price]));

    // 4. Fetch lineups — prefer matchday-specific; otherwise carry forward each
    //    team's most recent PRIOR matchday lineup (falling back to preseason null).
    const matchdayLineups = await fetchAllPages((f, t) =>
      adb
        .from('lineups')
        .select('team_id, player_id, is_starting, is_captain, bench_order')
        .eq('matchday_id', matchdayIdInt)
        .range(f, t));

    const matchdayTeamIds = new Set(matchdayLineups.map(r => r.team_id));

    // Prior lineups: any matchday strictly before this one, plus preseason null.
    // Paginated: spans all prior matchdays and will exceed 1000 once several MDs exist.
    const priorLineups = await fetchAllPages((f, t) =>
      adb
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
    const { data: otherStandings } = await adb
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

      const { totalPoints: currentPts, goalsScored, breakdown: currentBreakdown } = calculateTeamMatchdayPoints(lineupArgs, statsMap, positionMap, calculatePlayerPoints);
      const { totalPoints: optaPts, breakdown: optaBreakdown } = calculateTeamMatchdayPoints(lineupArgs, statsMap, positionMap, optaScorer);

      const prev = prevByTeam[team.id] ?? { pts: 0, goals: 0 };

      previewRows.push({
        teamId: team.id,
        teamName: team.name,
        currentPts,     // integer (FPL)
        optaPts,        // float (Composite, with captain ×2)
        currentCaptainPts: currentBreakdown.find(b => b.isCaptain)?.finalPoints ?? 0,
        optaCaptainPts: optaBreakdown.find(b => b.isCaptain)?.finalPoints ?? 0,
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
      const captainPts = isOpta ? r.optaCaptainPts : r.currentCaptainPts;
      return {
        team_id: r.teamId,
        matchday_id: matchdayId,
        matchday_points: Math.round(rawPts * 10) / 10,
        total_points: Math.round((r.prevPts + rawPts) * 10) / 10,
        goals_scored: r.goalsScored,
        captain_points: Math.round((captainPts ?? 0) * 10) / 10,
      };
    });

    if (upsertRows.length > 0) {
      const { error } = await adb
        .from('fantasy_standings')
        .upsert(upsertRows, { onConflict: 'team_id,matchday_id' });
      if (error) errors.push(`DB error: ${error.message}`);
    }

    // Stamp carried lineups as matchday-specific — permanent historical record
    if (toStamp.length > 0) {
      const { error: stampErr } = await adb
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
    const { error } = await adb.from('knockout_matches').insert(rows);
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

    const { data: standingsRows } = await adb
      .from('fantasy_standings')
      .select('team_id, matchday_points, goals_scored')
      .eq('matchday_id', matchdayIdInt)
      .in('team_id', allTeamIds);
    const mdStandings = Object.fromEntries((standingsRows ?? []).map(s => [s.team_id, s]));

    const [{ data: mdCaptains }, { data: nullCaptains }] = await Promise.all([
      adb.from('lineups').select('team_id, player_id').eq('matchday_id', matchdayIdInt).eq('is_captain', true).in('team_id', allTeamIds),
      adb.from('lineups').select('team_id, player_id').is('matchday_id', null).eq('is_captain', true).in('team_id', allTeamIds),
    ]);
    const captainMap = {};
    for (const r of nullCaptains ?? []) captainMap[r.team_id] = r.player_id;
    for (const r of mdCaptains ?? []) captainMap[r.team_id] = r.player_id;

    const captainPlayerIds = [...new Set(Object.values(captainMap))].filter(Boolean);
    const captainStatsMap = {};
    if (captainPlayerIds.length > 0) {
      const { data: cStats } = await adb
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

    let resolvedCount = 0;
    for (const { id, ...data } of updates) {
      const { error } = await adb.from('knockout_matches').update(data).eq('id', id);
      if (error) errors.push(`Match update error: ${error.message}`);
      else resolvedCount++;
    }

    const nextRows = buildNextRoundRows(round, matchResults, knockoutMatches);
    if (nextRows.length > 0) {
      const { error } = await adb.from('knockout_matches').insert(nextRows);
      if (error) errors.push(`Next round creation error: ${error.message}`);
    }

    const loserIds = [...new Set(Object.values(matchResults).map(r => r.l).filter(Boolean))];
    if (loserIds.length > 0) {
      const { error } = await supabase.rpc('set_teams_eliminated', { p_team_ids: loserIds, p_eliminated: true });
      if (error) errors.push(`Elimination marking error: ${error.message}`);
    }

    setKnockoutCalcResult({ resolved: resolvedCount, errors });
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
    const { error } = await adb
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

    // Fetch existing players for dedup by normName(name)|normName(country).
    // Paginated: a plain .select() is capped at 1000 rows, and a roster past that
    // would silently lose its tail from the dedup set and re-import duplicates.
    const existing = await fetchAllPages((f, t) =>
      adb.from('players').select('id, name, country').range(f, t));
    const normName = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const existingSet = new Set(
      existing.map(p => `${normName(p.name)}|${normName(p.country)}`)
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
      const { error, data: inserted } = await adb
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

    const { error: metaError } = await adb
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
      const { data, error } = await adb
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
      const { error } = await adb
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
          // Stored in match_metadata, so it must name the administered
          // competition — not the World Cup this panel started life in.
          competition: adminCompetition?.name ?? 'FIFA World Cup',
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

  // Past these two gates `auctionState` is guaranteed non-null, which is what
  // lets the scoring-system reads below dereference it directly. Blacking out
  // the panel is safe: the selector, the banners and the Competencias section
  // all live in the parent and survive this return, so a competition with no
  // auction_state row can still be fixed from here.
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

  const { status, current_round, round_duration_seconds, round_started_at } = auctionState ?? {};
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
    <div className="space-y-6">
      {/* Panel header — names the competition every section below is bound to */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-xl font-bold text-primary">
          {adminCompetition?.name ?? `Competencia #${adminCompetitionId}`}
        </h2>
        {status && (
          <span className={`px-3 py-1 rounded-full text-sm font-semibold capitalize ${STATUS_BADGE[status]}`}>
            {status}
          </span>
        )}
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
              <label className="block text-xs text-muted mb-1">Etapa de la competencia</label>
              <select
                value={mdForm.wc_stage}
                onChange={e => setMdForm(f => ({ ...f, wc_stage: e.target.value }))}
                className="w-full bg-surface-hover border border-border rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-tertiary"
              >
                {stageLabels.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Tipo de jornada</label>
              <select
                value={mdForm.phase}
                onChange={e => setMdForm(f => ({ ...f, phase: e.target.value }))}
                className="w-full bg-surface-hover border border-border rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-tertiary"
              >
                <option value="league">Liga (cuenta para la tabla)</option>
                <option value="knockout">Eliminatoria (H2H)</option>
              </select>
              <p className="text-xs text-muted mt-1">
                Decide el límite de fichajes y qué jornadas suman en la tabla de posiciones.
              </p>
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
                    <th className="pb-3 pr-4 font-medium">Etapa</th>
                    <th className="pb-3 pr-4 font-medium">Tipo</th>
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
                        {md.phase === 'knockout' ? 'Eliminatoria' : 'Liga'}
                      </td>
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
              {matchdays
                .filter(md => md.phase === 'league')
                .map(md => (
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

      {/* ── League-phase draw (H2H group stage) ─────────────────────────────── */}
      {adminCompetition?.group_format === 'h2h' && (() => {
        const teamNameById = Object.fromEntries(
          knockoutTeams.map(t => [t.id, t.users?.display_name ?? t.name ?? 'Desconocido'])
        );
        const leagueMdIds = new Set(leagueMatchdays.map(m => m.id));
        const lockRedraw =
          leagueMatchdays.some(m => m.is_completed) ||
          knockoutStandingsData.some(s => leagueMdIds.has(s.matchday_id));
        const canDraw = knockoutTeams.length >= 4 && knockoutTeams.length % 2 === 0
          && leagueMatchdays.length > 0 && leagueMatchdays.length <= knockoutTeams.length - 1;

        return (
          <section className="bg-surface rounded-xl p-6 space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-primary">Calendario de la fase de liga</h2>
              <p className="text-xs text-muted mt-1">
                Sortea los enfrentamientos H2H de las {leagueMatchdays.length} jornadas de liga. Ningún
                rival se repite en toda la fase.
              </p>
            </div>

            {groupFixturesLoading ? (
              <p className="text-muted text-sm">Cargando…</p>
            ) : groupFixtures.length === 0 ? (
              <div className="space-y-4">
                {!canDraw && (
                  <p className="text-tertiary text-sm">
                    Se necesita un número par de equipos (mínimo 4) y al menos una jornada de liga, con
                    como máximo {Math.max(knockoutTeams.length - 1, 0)} jornadas para {knockoutTeams.length} equipos.
                  </p>
                )}

                {drawPreview && (
                  <div className="space-y-3">
                    {leagueMatchdays.map((md, mdIdx) => (
                      <div key={md.id}>
                        <p className="text-label-caps text-muted uppercase tracking-wide mb-2">{md.name}</p>
                        <div className="grid grid-cols-2 gap-2">
                          {drawPreview[mdIdx].map(([a, b], i) => (
                            <div key={i} className="bg-surface-hover rounded-lg px-3 py-2 text-xs">
                              <span className="text-primary">{teamNameById[a]}</span>
                              <span className="text-muted"> vs </span>
                              <span className="text-primary">{teamNameById[b]}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {drawError && (
                  <div className="rounded-lg px-3 py-2 text-sm bg-error/10/40 text-error">{drawError}</div>
                )}
                {drawResult && (
                  <div className={`rounded-lg px-3 py-2 text-sm ${drawResult.error ? 'bg-error/10/40 text-error' : 'bg-tertiary/10 text-tertiary'}`}>
                    {drawResult.error ?? `✓ Calendario guardado — ${drawResult.count} partidos creados.`}
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={handleDrawSchedule}
                    disabled={!canDraw || drawSaving}
                    className="px-5 py-2 rounded-lg bg-tertiary hover:bg-tertiary disabled:opacity-50 text-on-tertiary font-semibold text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
                  >
                    Sortear calendario
                  </button>
                  {drawPreview && (
                    <button
                      onClick={handleConfirmDraw}
                      disabled={drawSaving}
                      className="px-5 py-2 rounded-lg bg-surface-hover hover:bg-surface-hover disabled:opacity-50 text-primary font-semibold text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
                    >
                      {drawSaving ? 'Guardando…' : 'Confirmar sorteo'}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-3">
                  {leagueMatchdays.map(md => {
                    const fixtures = groupFixtures.filter(f => f.matchday_id === md.id);
                    if (fixtures.length === 0) return null;
                    return (
                      <div key={md.id}>
                        <p className="text-label-caps text-muted uppercase tracking-wide mb-2">{md.name}</p>
                        <div className="grid grid-cols-2 gap-2">
                          {fixtures.map(f => (
                            <div key={f.id} className="bg-surface-hover rounded-lg px-3 py-2 text-xs">
                              <span className="text-primary">{teamNameById[f.team_a_id]}</span>
                              <span className="text-muted"> vs </span>
                              <span className="text-primary">{teamNameById[f.team_b_id]}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {lockRedraw ? (
                  <p className="text-xs text-muted">
                    Re-sorteo bloqueado: ya hay jornadas de liga completadas o con posiciones calculadas.
                  </p>
                ) : (
                  <p className="text-xs text-muted">
                    Si añadiste participantes después del sorteo, no tendrán enfrentamientos — vuelve a
                    sortear antes de que empiece la fase de liga.
                  </p>
                )}

                {drawResult && (
                  <div className={`rounded-lg px-3 py-2 text-sm ${drawResult.error ? 'bg-error/10/40 text-error' : 'bg-tertiary/10 text-tertiary'}`}>
                    {drawResult.error}
                  </div>
                )}

                <button
                  onClick={handleRedrawSchedule}
                  disabled={lockRedraw || drawSaving}
                  className="px-5 py-2 rounded-lg bg-surface-hover hover:bg-surface-hover disabled:opacity-50 text-primary font-semibold text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
                >
                  {drawSaving ? 'Sorteando…' : 'Re-sortear calendario'}
                </button>
              </div>
            )}
          </section>
        );
      })()}

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

      {/* ── Negociación de traspasos ─────────────────────────────────────── */}
      {isCompleted && (
        <section className="bg-surface rounded-xl p-6 space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-primary">Negociación de traspasos</h2>
            <p className="text-xs text-muted mt-1">
              Ventana cerrada para repartir las plantillas de los equipos eliminados. Ábrela después de calcular una ronda.
            </p>
          </div>

          {negLoading ? (
            <p className="text-muted text-sm">Cargando…</p>
          ) : !negWindow || negWindow.status !== 'open' ? (
            (() => {
              const champ = knockoutMatches.filter(m => m.bracket === 'championship');
              const roundDone = (r) => {
                const rows = champ.filter(m => m.round === r);
                return rows.length > 0 && rows.every(m => m.winner_id);
              };
              const lastCompletedRound = roundDone(3) ? 3 : roundDone(2) ? 2 : roundDone(1) ? 1 : null;
              return (
                <div className="space-y-3">
                  {!lastCompletedRound ? (
                    <p className="text-muted text-sm">Calcula una ronda primero para tener equipos eliminados.</p>
                  ) : (
                    <div className="flex items-end gap-4 flex-wrap">
                      <div className="flex-1 min-w-48">
                        <label className="block text-xs text-muted mb-1">Jornada de cierre (próxima ronda)</label>
                        <select
                          value={negMatchdayId}
                          onChange={e => { setNegMatchdayId(e.target.value); setNegResult(null); }}
                          className="w-full bg-surface-hover border border-border rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-tertiary"
                        >
                          <option value="">Seleccionar jornada…</option>
                          {matchdays.map(md => (
                            <option key={md.id} value={md.id}>{md.name} — {md.wc_stage}</option>
                          ))}
                        </select>
                      </div>
                      <button
                        onClick={() => handleOpenNegotiationWindow(lastCompletedRound)}
                        disabled={negOpening || !negMatchdayId}
                        className="px-5 py-2 rounded-lg bg-tertiary hover:bg-tertiary disabled:opacity-50 text-on-tertiary font-semibold text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
                      >
                        {negOpening ? 'Abriendo…' : 'Abrir ventana'}
                      </button>
                    </div>
                  )}
                  <p className="text-xs text-muted">
                    Cierra 1 hora antes del primer partido de la jornada elegida. Solo puede haber una ventana abierta a la vez.
                  </p>
                </div>
              );
            })()
          ) : (
            <div className="space-y-4">
              <NegotiationWindowCountdown closesAt={negWindow.closes_at} />

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted border-b border-border">
                      <th className="pb-2 pr-4 font-medium text-xs">Equipo eliminado</th>
                      <th className="pb-2 pr-4 font-medium text-xs">Jugador</th>
                      <th className="pb-2 font-medium text-xs">Ofertas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {negPool.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="py-4 text-center text-muted text-xs">No hay jugadores disponibles.</td>
                      </tr>
                    ) : (
                      negPool.flatMap(group => group.players.map(p => (
                        <tr key={p.id} className="text-secondary">
                          <td className="py-2 pr-4 text-xs">{group.teamName}</td>
                          <td className="py-2 pr-4 text-xs text-primary">{p.name}</td>
                          <td className="py-2 text-xs font-semibold text-tertiary">{negCounts[p.id] ?? 0}</td>
                        </tr>
                      )))
                    )}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted">Los montos y los postores están sellados — solo se muestra el conteo de ofertas.</p>

              <button
                onClick={handleResolveNegotiationWindow}
                disabled={negResolving}
                className="px-5 py-2 rounded-lg bg-tertiary hover:bg-tertiary disabled:opacity-50 text-on-tertiary font-semibold text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
              >
                {negResolving ? 'Resolviendo…' : 'Resolver ventana'}
              </button>
            </div>
          )}

          {negResult?.errors?.length > 0 && (
            <div className="rounded-lg p-4 space-y-1 bg-error/10/40 border border-error/30/50">
              {negResult.errors.map((err, i) => (
                <p key={i} className="text-tertiary text-xs">{err}</p>
              ))}
            </div>
          )}
          {negResult?.opened && (
            <p className="text-tertiary text-sm font-semibold">✓ Ventana abierta.</p>
          )}
          {negResult?.summary && (
            <div className="rounded-lg p-4 space-y-1 bg-surface-hover">
              <p className="text-tertiary text-sm font-semibold">
                ✓ Ventana resuelta — {negResult.summary.sales?.length ?? 0} traspaso{(negResult.summary.sales?.length ?? 0) !== 1 ? 's' : ''}, {negResult.summary.released_count ?? 0} jugador{(negResult.summary.released_count ?? 0) !== 1 ? 'es' : ''} liberado{(negResult.summary.released_count ?? 0) !== 1 ? 's' : ''}.
              </p>
            </div>
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

const COMPETITION_STATUSES = [
  { value: 'setup',    label: 'En preparación' },
  { value: 'active',   label: 'Activa' },
  { value: 'archived', label: 'Archivada' },
];

const COMPETITION_STATUS_BADGE = {
  setup:    'bg-warning/15 text-warning',
  active:   'bg-tertiary/15 text-tertiary',
  archived: 'bg-border text-secondary',
};

const EMPTY_COMPETITION_FORM = {
  slug: '',
  name: '',
  short_label: '',
  // Prefilled from the World Cup list so a new competition is an edit, not a retype.
  stage_labels: WC_STAGES.join('\n'),
  budget: String(TOTAL_BUDGET),
  max_squad_size: String(MAX_SQUAD_SIZE),
  max_participants: String(MAX_LEAGUE_PARTICIPANTS),
  transfer_cap_league: String(TRANSFER_CAP_ROUND_ROBIN),
  transfer_cap_knockout: String(TRANSFER_CAP_KNOCKOUT),
  min_bid_increment: String(MIN_BID_INCREMENT),
  round_duration_seconds: String(DEFAULT_ROUND_DURATION_SECONDS),
};

const inputClass =
  'w-full bg-surface-hover border border-border rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-tertiary';

/**
 * Section 17 — create a competition, then manage the status and default flag of
 * every existing one.
 *
 * Creation goes through the `create_competition` RPC rather than an insert,
 * because the competitions row and its `auction_state` row have to appear in the
 * same transaction: a competition without an auction state is one the panel and
 * AuctionContext both refuse to render. Every competition starts as 'setup',
 * which keeps it out of non-admin switchers until it has players and matchdays.
 */
function CreateCompetitionSection({ competitions, onChanged, onAdminister }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_COMPETITION_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [created, setCreated] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Slug is what the ?competition= deep link uses, so keep it URL-shaped.
  function suggestSlug(name) {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError(null);
    setCreated(null);
    setSaving(true);

    const { data, error: rpcError } = await supabase.rpc('create_competition', {
      p_slug: form.slug.trim() || suggestSlug(form.name),
      p_name: form.name.trim(),
      p_short_label: form.short_label.trim(),
      p_stage_labels: form.stage_labels
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      p_budget: Number(form.budget),
      p_max_squad_size: parseInt(form.max_squad_size, 10),
      p_max_participants: parseInt(form.max_participants, 10),
      p_transfer_cap_league: parseInt(form.transfer_cap_league, 10),
      p_transfer_cap_knockout: parseInt(form.transfer_cap_knockout, 10),
      p_min_bid_increment: Number(form.min_bid_increment),
      p_round_duration_seconds: parseInt(form.round_duration_seconds, 10),
    });

    if (rpcError) {
      setError(rpcError.message);
      setSaving(false);
      return;
    }

    setCreated(data);
    setForm(EMPTY_COMPETITION_FORM);
    await onChanged();
    setSaving(false);
  }

  async function handleStatusChange(competition, status) {
    setBusyId(competition.id);
    setError(null);
    const { error: updErr } = await unscopedFrom('competitions')
      .update({ status })
      .eq('id', competition.id);
    if (updErr) setError(updErr.message);
    await onChanged();
    setBusyId(null);
  }

  async function handleMakeDefault(competition) {
    setBusyId(competition.id);
    setError(null);
    // One RPC, not two updates: `one_default_competition` is a partial unique
    // index, so the old default has to be cleared inside the same transaction.
    const { error: rpcError } = await supabase.rpc('set_default_competition', {
      p_competition_id: competition.id,
    });
    if (rpcError) setError(rpcError.message);
    await onChanged();
    setBusyId(null);
  }

  return (
    <section className="bg-surface rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-primary">Competencias</h2>
        <button
          onClick={() => setOpen((o) => !o)}
          className="px-3 py-1.5 rounded-lg bg-surface-hover hover:bg-border text-secondary text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
        >
          {open ? 'Ocultar formulario' : 'Crear competencia'}
        </button>
      </div>

      {/* Existing competitions: status transitions + the default flag */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted border-b border-border">
              <th className="pb-3 pr-4 font-medium">Competencia</th>
              <th className="pb-3 pr-4 font-medium">Identificador</th>
              <th className="pb-3 pr-4 font-medium">Estado</th>
              <th className="pb-3 pr-4 font-medium">Por defecto</th>
              <th className="pb-3 font-medium">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {competitions.map((c) => (
              <tr key={c.id} className="text-secondary hover:bg-surface-hover/40">
                <td className="py-2.5 pr-4">
                  <span className="text-primary font-medium">{c.name}</span>
                  <span className="text-muted text-xs ml-2">{c.short_label}</span>
                </td>
                <td className="py-2.5 pr-4 text-xs font-mono">{c.slug}</td>
                <td className="py-2.5 pr-4">
                  <select
                    value={c.status}
                    disabled={busyId === c.id}
                    onChange={(e) => handleStatusChange(c, e.target.value)}
                    className={`rounded px-2 py-1 text-xs font-semibold disabled:opacity-50 ${COMPETITION_STATUS_BADGE[c.status] ?? ''}`}
                  >
                    {COMPETITION_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </td>
                <td className="py-2.5 pr-4">
                  {c.is_default ? (
                    <span className="px-2 py-0.5 rounded text-xs font-semibold bg-info/15 text-info">
                      Por defecto
                    </span>
                  ) : (
                    <button
                      onClick={() => handleMakeDefault(c)}
                      disabled={busyId === c.id}
                      className="text-xs text-tertiary hover:underline disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
                    >
                      Marcar
                    </button>
                  )}
                </td>
                <td className="py-2.5">
                  <button
                    onClick={() => onAdminister(c.id)}
                    className="text-xs text-secondary hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
                  >
                    Administrar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {created && (
        <p className="text-sm text-tertiary bg-tertiary/10 rounded-lg px-3 py-2">
          Competencia «{created.name}» creada en preparación. Cárgale jugadores, jornadas y
          participantes antes de activarla.
        </p>
      )}
      {error && <p className="text-error text-sm">{error}</p>}

      {open && (
        <form onSubmit={handleCreate} className="space-y-4 border-t border-border pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-muted mb-1">Nombre</label>
              <input
                type="text"
                value={form.name}
                onChange={set('name')}
                placeholder="ej. UEFA Champions League 2026/27"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Etiqueta corta</label>
              <input
                type="text"
                value={form.short_label}
                onChange={set('short_label')}
                placeholder="ej. Champions 26/27"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">
                Identificador (se genera del nombre si lo dejas vacío)
              </label>
              <input
                type="text"
                value={form.slug}
                onChange={set('slug')}
                placeholder={form.name ? suggestSlug(form.name) : 'ucl-2026-27'}
                className={`${inputClass} font-mono`}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-muted mb-1">
              Fases (una por línea — solo etiquetas para los formularios de jornadas)
            </label>
            <textarea
              rows={5}
              value={form.stage_labels}
              onChange={set('stage_labels')}
              className={`${inputClass} font-mono`}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs text-muted mb-1">Presupuesto</label>
              <input type="number" step="0.1" value={form.budget} onChange={set('budget')} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Plantilla</label>
              <input type="number" value={form.max_squad_size} onChange={set('max_squad_size')} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Participantes</label>
              <input type="number" value={form.max_participants} onChange={set('max_participants')} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Incremento de puja</label>
              <input type="number" step="0.1" value={form.min_bid_increment} onChange={set('min_bid_increment')} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Fichajes por jornada de liga</label>
              <input type="number" value={form.transfer_cap_league} onChange={set('transfer_cap_league')} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Fichajes por eliminatoria</label>
              <input type="number" value={form.transfer_cap_knockout} onChange={set('transfer_cap_knockout')} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Duración de ronda (s)</label>
              <input type="number" value={form.round_duration_seconds} onChange={set('round_duration_seconds')} className={inputClass} />
            </div>
          </div>

          <button
            type="submit"
            disabled={saving || !form.name.trim() || !form.short_label.trim()}
            className="px-5 py-2 rounded-lg bg-tertiary hover:bg-tertiary disabled:opacity-50 text-on-tertiary font-semibold text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
          >
            {saving ? 'Creando…' : 'Crear competencia'}
          </button>
        </form>
      )}
    </section>
  );
}

/**
 * The admin page: a competition selector, the banners that keep it honest, the
 * create/manage-competitions section, and the panel itself.
 *
 * The selector is deliberately NOT the sidebar switcher. An admin has to be able
 * to build a `status='setup'` competition — one no user can select — while still
 * using the app as a player in another, so the two are independent and the
 * divergence is called out loudly instead of being hidden.
 */
export default function Admin() {
  const { competitions, competitionId, setCompetition, refreshCompetitions } = useCompetition();
  const [pickedCompetitionId, setAdminCompetitionId] = useState(null);

  // Derived, not stored: the list can change under us (a competition was just
  // created, or archived out of view), and an explicit pick that no longer
  // resolves falls back to the active competition rather than leaving the panel
  // bound to an id with no name.
  const adminCompetitionId =
    pickedCompetitionId != null && competitions.some((c) => c.id === pickedCompetitionId)
      ? pickedCompetitionId
      : competitionId;

  const adminCompetition = competitions.find((c) => c.id === adminCompetitionId) ?? null;

  const diverged = adminCompetitionId !== competitionId;
  const isArchived = adminCompetition?.status === 'archived';
  const activeCompetition = competitions.find((c) => c.id === competitionId) ?? null;

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="sticky top-0 z-20 -mx-4 px-4 md:-mx-6 md:px-6 py-3 bg-neutral/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-primary">Panel de admin</h1>
          <div className="flex items-center gap-2">
            <label htmlFor="admin-competition" className="text-xs text-muted uppercase tracking-wider">
              Administrando
            </label>
            <select
              id="admin-competition"
              value={adminCompetitionId ?? ''}
              onChange={(e) => setAdminCompetitionId(Number(e.target.value))}
              className="bg-surface-hover border border-border rounded-lg px-2 py-1.5 text-primary text-sm focus:outline-none focus:border-tertiary"
            >
              {competitions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.short_label}
                  {c.status !== 'active' ? ` (${c.status})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {diverged && (
        <div className="bg-warning/15 border border-warning/40 rounded-xl px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
          <p className="text-sm text-warning">
            <span className="font-semibold">Ojo:</span> estás administrando{' '}
            <span className="font-semibold">{adminCompetition?.short_label ?? `#${adminCompetitionId}`}</span>,
            pero la app está mostrando{' '}
            <span className="font-semibold">{activeCompetition?.short_label ?? `#${competitionId}`}</span>.
            Todo lo que hagas aquí abajo —subasta incluida— afecta a la primera.
          </p>
          <button
            onClick={() => setCompetition(adminCompetitionId)}
            className="px-3 py-1.5 rounded-lg bg-warning/20 hover:bg-warning/30 text-warning text-xs font-semibold whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
          >
            Cambiar la app también
          </button>
        </div>
      )}

      {isArchived && (
        <div className="bg-border/60 border border-border rounded-xl px-4 py-3">
          <p className="text-sm text-secondary">
            <span className="font-semibold text-primary">Competencia archivada.</span> Es un archivo
            de solo lectura: las escrituras se rechazan del lado del servidor. Cámbiale el estado si
            de verdad necesitas modificarla.
          </p>
        </div>
      )}

      <CreateCompetitionSection
        competitions={competitions}
        onChanged={refreshCompetitions}
        onAdminister={setAdminCompetitionId}
      />

      {/* The panel's auction sections read useAuction(); this second, scoped
          provider is what makes them act on the administered competition rather
          than the sidebar's. Keyed so a switch remounts both. */}
      {adminCompetitionId != null && (
        <AuctionProvider key={adminCompetitionId} competitionId={adminCompetitionId} scope="admin">
          <AdminPanel
            adminCompetitionId={adminCompetitionId}
            adminCompetition={adminCompetition}
          />
        </AuctionProvider>
      )}
    </div>
  );
}

function NegotiationWindowCountdown({ closesAt }) {
  const [remaining, setRemaining] = useState(() => new Date(closesAt).getTime() - Date.now());

  useEffect(() => {
    const id = setInterval(() => setRemaining(new Date(closesAt).getTime() - Date.now()), 1000);
    return () => clearInterval(id);
  }, [closesAt]);

  const clamped = Math.max(0, remaining);
  const hours = Math.floor(clamped / 3600000);
  const minutes = Math.floor((clamped % 3600000) / 60000);
  const seconds = Math.floor((clamped % 60000) / 1000);

  return (
    <div className="bg-info/10 border border-info/30 rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap">
      <div>
        <p className="text-info font-semibold">Ventana de negociación abierta</p>
        <p className="text-secondary text-sm mt-0.5">Cierra {new Date(closesAt).toLocaleString()}</p>
      </div>
      <span className="text-2xl font-mono font-bold tabular-nums text-info">
        {String(hours).padStart(2, '0')}:{String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
      </span>
    </div>
  );
}
