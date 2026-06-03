#!/usr/bin/env node

/**
 * Sync FIFA World Cup 2026 schedule from the curated CSV into Supabase.
 *
 * The matches table already contains all 104 fixtures (group + knockout). This
 * script only:
 *   1. attaches each match to its fantasy matchday (matches.matchday_id), and
 *   2. overwrites match_date from the CSV (Time_ET interpreted as US Eastern).
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=xxx pnpm sync-schedule
 *
 * SUPABASE_URL is read from apps/polla/.env (PUBLIC_SUPABASE_URL) if not set.
 * The service role key is required because RLS on matches restricts writes to admins.
 *
 * Join strategy (match_code does NOT line up with the CSV Match_Number):
 *   - Group rows: pair to DB by (group, unordered team-code pair). This is
 *     time-independent — some DB kickoff times are wrong (that's what we fix here), so a
 *     time-based key would silently drop those rows. Each pairing occurs exactly once in
 *     the group stage, so the pair is a unique key. Requires the NAME_TO_CODE map below.
 *   - Knockout rows: teams are 'TBD', so pair per stage by sorted chronological order
 *     (a zip). Only the *set* of kickoff times per matchday matters for the windows,
 *     and all rows of a stage share one fantasy matchday, so identity is irrelevant.
 *
 * Idempotent: re-running writes identical values.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  try {
    const envPath = resolve(__dirname, '../.env');
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) process.env[m[1]] = m[2];
    }
  } catch {
    // .env not found, that's ok
  }
}
loadEnv();

const supabaseUrl = process.env.SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  console.error('ERROR: SUPABASE_URL not found. Set it in env or apps/polla/.env.');
  process.exit(1);
}
if (!supabaseKey) {
  console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY env var is required (bypasses RLS).');
  console.error('Find it in Supabase Dashboard → Project Settings → API → service_role key.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// CSV lives in the fantasy app; resolve from this script's location.
const CSV_PATH = resolve(__dirname, '../../fantasy/data/csv/fifa_world_cup_2026_schedule.csv');

// US Eastern in June/July 2026 = EDT = UTC-04:00 (no DST boundary in range). The CSV's
// Time_ET column normalizes every venue to Eastern, so a single offset is correct.
const ET_OFFSET = '-04:00';

// CSV `matchday` value (lowercased/trimmed) → matchdays.wc_stage label.
// 'off season' intentionally absent → matchday_id stays NULL.
const MATCHDAY_TO_WC_STAGE = {
  '1': 'Group Stage MD1',
  '2': 'Group Stage MD2',
  '3': 'Group Stage MD3',
  'fantasy quarterfinals': 'Round of 32',
  'fantasy semifinals': 'Round of 16',
  'fantasy final': 'Quarter-finals',
};

// CSV `Stage` value → matches.stage enum (per migration 017 CHECK constraint).
const CSV_STAGE_TO_DB_STAGE = {
  'Group Stage': 'group',
  'Round of 32': 'round_of_32',
  'Round of 16': 'round_of_16',
  'Quarterfinal': 'quarterfinal',
  'Semifinal': 'semifinal',
  'Third-Place Match': 'third_place',
  'Final': 'final',
};

// CSV full team name → DB 3-letter code. Codes for groups A/B/E/F/H/J/K/L are taken
// verbatim from the DB export (apps/fantasy/data/csv/matches_rows.csv); C/D/G/I use
// standard FIFA codes. Any pair that fails to match a DB row is reported loudly, so a
// wrong code surfaces immediately instead of silently dropping the match.
const NAME_TO_CODE = {
  // Group A
  Mexico: 'MEX', 'South Africa': 'RSA', 'South Korea': 'KOR', 'Czech Republic': 'CZE',
  // Group B
  Canada: 'CAN', 'Bosnia and Herzegovina': 'BIH', Qatar: 'QAT', Switzerland: 'SUI',
  // Group C
  Brazil: 'BRA', Haiti: 'HAI', Morocco: 'MAR', Scotland: 'SCO',
  // Group D
  'United States': 'USA', Paraguay: 'PAR', Australia: 'AUS', Turkey: 'TUR',
  // Group E
  Germany: 'GER', 'Ivory Coast': 'CIV', Ecuador: 'ECU', Curacao: 'CUW',
  // Group F
  Netherlands: 'NED', Japan: 'JPN', Sweden: 'SWE', Tunisia: 'TUN',
  // Group G
  Belgium: 'BEL', Egypt: 'EGY', Iran: 'IRN', 'New Zealand': 'NZL',
  // Group H
  Spain: 'ESP', Uruguay: 'URU', 'Saudi Arabia': 'KSA', 'Cape Verde': 'CPV',
  // Group I
  France: 'FRA', Senegal: 'SEN', Iraq: 'IRQ', Norway: 'NOR',
  // Group J
  Argentina: 'ARG', Algeria: 'ALG', Austria: 'AUT', Jordan: 'JOR',
  // Group K
  Colombia: 'COL', 'DR Congo': 'COD', Portugal: 'POR', Uzbekistan: 'UZB',
  // Group L
  England: 'ENG', Croatia: 'CRO', Ghana: 'GHA', Panama: 'PAN',
};

// Unordered (group, team pair) key — order-independent so home/away swaps still match.
function pairKey(group, a, b) {
  return `${group}|${[a, b].sort().join('-')}`;
}

// Knockout stages processed by sorted-zip, in DB-stage form. Maps to the wc_stage
// label whose matchday_id is assigned (null = off-season, no fantasy matchday).
const KNOCKOUT_STAGES = [
  { dbStage: 'round_of_32', wcStage: 'Round of 32' },
  { dbStage: 'round_of_16', wcStage: 'Round of 16' },
  { dbStage: 'quarterfinal', wcStage: 'Quarter-finals' },
  { dbStage: 'semifinal', wcStage: null },
  { dbStage: 'third_place', wcStage: null },
  { dbStage: 'final', wcStage: null },
];

// ── Minimal quote-aware CSV parse ───────────────────────────────────────────
function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === ',' && !inQ) {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

function parseCsv(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter((l) => l.length > 0);
  const header = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row = {};
    header.forEach((h, i) => { row[h] = (cells[i] ?? '').trim(); });
    return row;
  });
}

function csvInstant(dateStr, timeEt) {
  const t = timeEt && timeEt.length === 5 ? timeEt : '00:00';
  return `${dateStr}T${t}:00${ET_OFFSET}`;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('FIFA WC 2026 Schedule Sync\n');
  console.log(`Supabase: ${supabaseUrl.replace(/\/\/.*@/, '//***@')}`);
  console.log(`CSV: ${CSV_PATH}\n`);

  const rows = parseCsv(readFileSync(CSV_PATH, 'utf-8'));
  console.log(`Parsed ${rows.length} CSV rows.`);

  // Build wc_stage(lower/trim) → matchday_id.
  const { data: matchdays, error: mdErr } = await supabase.from('matchdays').select('id, wc_stage');
  if (mdErr) { console.error('ERROR fetching matchdays:', mdErr); process.exit(1); }
  const wcStageToId = {};
  for (const md of matchdays ?? []) {
    if (md.wc_stage) wcStageToId[md.wc_stage.toLowerCase().trim()] = md.id;
  }
  const requiredStages = [...new Set(Object.values(MATCHDAY_TO_WC_STAGE))];
  const missing = requiredStages.filter((s) => wcStageToId[s.toLowerCase().trim()] == null);
  if (missing.length) {
    console.error('ERROR: matchdays table is missing wc_stage label(s):', missing);
    console.error('Apply migration 031 / seed the matchdays before running.');
    process.exit(1);
  }
  const mdId = (wcStage) => (wcStage ? wcStageToId[wcStage.toLowerCase().trim()] : null);

  // Fetch all DB matches.
  const { data: dbMatches, error: matchErr } = await supabase
    .from('matches')
    .select('id, match_code, match_date, group_name, stage, team_a, team_b');
  if (matchErr) { console.error('ERROR fetching matches:', matchErr); process.exit(1); }

  const updates = []; // { id, matchday_id, match_date }

  // ── Group: pair by (group, unordered team-code pair) — time-independent ──
  const dbGroupByPair = new Map();
  for (const m of dbMatches) {
    if (m.stage !== 'group') continue;
    dbGroupByPair.set(pairKey(m.group_name, m.team_a, m.team_b), m);
  }
  const csvGroup = rows.filter((r) => r.Stage === 'Group Stage');
  let groupMatched = 0;
  const unmatchedGroup = [];
  const unmappedNames = new Set();
  for (const r of csvGroup) {
    const homeCode = NAME_TO_CODE[r.Home_Team];
    const awayCode = NAME_TO_CODE[r.Away_Team];
    if (!homeCode) unmappedNames.add(r.Home_Team);
    if (!awayCode) unmappedNames.add(r.Away_Team);
    if (!homeCode || !awayCode) continue;
    const m = dbGroupByPair.get(pairKey(r.Group, homeCode, awayCode));
    if (!m) {
      unmatchedGroup.push(`${r.Group} ${r.Home_Team} (${homeCode}) v ${r.Away_Team} (${awayCode})`);
      continue;
    }
    const mdKey = r.matchday.toLowerCase().trim();
    updates.push({ id: m.id, matchday_id: mdId(MATCHDAY_TO_WC_STAGE[mdKey]), match_date: csvInstant(r.Date, r.Time_ET) });
    groupMatched++;
  }
  if (unmappedNames.size) {
    console.error('\nERROR: CSV team names missing from NAME_TO_CODE map:', [...unmappedNames]);
    console.error('Add each as "CSV full name": "DB 3-letter code" and re-run.');
    process.exit(1);
  }

  // ── Knockout: per stage, sorted-zip CSV instants onto DB rows ──
  const knockoutSummary = [];
  for (const { dbStage, wcStage } of KNOCKOUT_STAGES) {
    const dbRows = dbMatches
      .filter((m) => m.stage === dbStage)
      .sort((a, b) => Date.parse(a.match_date) - Date.parse(b.match_date));
    const csvRows = rows
      .filter((r) => CSV_STAGE_TO_DB_STAGE[r.Stage] === dbStage)
      .map((r) => csvInstant(r.Date, r.Time_ET))
      .sort((a, b) => Date.parse(a) - Date.parse(b));
    if (dbRows.length !== csvRows.length) {
      console.warn(`  WARN ${dbStage}: DB has ${dbRows.length} rows but CSV has ${csvRows.length}; skipping stage.`);
      knockoutSummary.push(`${dbStage}: skipped (count mismatch)`);
      continue;
    }
    dbRows.forEach((m, i) => {
      updates.push({ id: m.id, matchday_id: mdId(wcStage), match_date: csvRows[i] });
    });
    knockoutSummary.push(`${dbStage}: ${dbRows.length}${wcStage ? ` → ${wcStage}` : ' (off-season, matchday_id NULL)'}`);
  }

  // ── Apply ──
  let written = 0;
  for (const u of updates) {
    const { error } = await supabase
      .from('matches')
      .update({ matchday_id: u.matchday_id, match_date: u.match_date })
      .eq('id', u.id);
    if (error) { console.error(`  ERROR updating ${u.id}:`, error.message); continue; }
    written++;
  }

  console.log('\n── Summary ──');
  console.log(`Group matches matched : ${groupMatched} / ${csvGroup.length}`);
  for (const s of knockoutSummary) console.log(`Knockout ${s}`);
  console.log(`Rows written          : ${written} / ${updates.length}`);
  if (unmatchedGroup.length) {
    console.warn(`\nUNMATCHED group rows (no DB row for this group + team pair):`);
    for (const u of unmatchedGroup) console.warn(`  ${u}`);
    console.warn('Likely a wrong DB code in NAME_TO_CODE for one of the teams above.');
    process.exitCode = 1; // surface a partial sync as failure
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
