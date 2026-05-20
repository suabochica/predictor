#!/usr/bin/env node

/**
 * Import FIFA World Cup 2026 match data from Wikipedia into Supabase.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=xxx pnpm import-matches
 *
 * SUPABASE_URL is read from apps/polla/.env (PUBLIC_SUPABASE_URL) if not set.
 * The service role key is required because RLS on the matches table
 * restricts INSERT/UPDATE to admin users only.
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

// ── Wikipedia group pages ──────────────────────────────────────────────
const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
const WIKI_BASE = 'https://en.wikipedia.org/w/index.php';

// ── Parsing helpers ────────────────────────────────────────────────────

/**
 * Fetch raw wikitext for a Wikipedia page.
 */
async function fetchWikitext(title) {
  const url = `${WIKI_BASE}?title=${encodeURIComponent(title)}&action=raw`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${title}: ${res.status}`);

  return res.text();
}

/**
 * Extract a named parameter value from a template string.
 * Handles nested templates and wiki link syntax.
 */
function extractParam(template, name) {
  const re = new RegExp(`\\|${name}\\s*=\\s*(.+?)\\s*(?=\\n\\||\\n\\})`, 's');
  const m = template.match(re);
  if (!m) return null;

  return m[1].trim();
}

/**
 * Parse date from {{Start date|2026|6|11}} format.
 */
function parseStartDate(str) {
  const m = str.match(/\{\{Start date\|(\d{4})\|(\d{1,2})\|(\d{1,2})\}\}/);
  if (!m) return null;

  return { year: parseInt(m[1]), month: parseInt(m[2]), day: parseInt(m[3]) };
}

/**
 * Normalize time string before parsing:
 * - Replace &nbsp; with space
 * - Replace unicode minus U+2212 (used in Wikipedia timezones) with ASCII -
 * - Extract UTC offset from wiki link format [[UTC−06:00|UTC−6]] → UTC-6
 */
function normalizeTime(str) {
  return str
    .replace(/&nbsp;/g, ' ')
    .replace(/−/g, '-')        // Unicode minus → ASCII hyphen
    .replace(/\[\[UTC[+-]\d{2}:\d{2}\|(UTC[+-]\d+)\]\]/g, '$1');
}

/**
 * Parse time like "1:00 p.m. UTC-6", "20:00 UTC-6", or wiki-link variants.
 * Returns { hour: 0-23, minute: 0-59, offset: string } or null.
 */
function parseTime(str) {
  if (!str) return null;
  const normalized = normalizeTime(str);

  // Try 12-hour format: "1:00 p.m. UTC-6"
  let m = normalized.match(/(\d{1,2}):(\d{2})\s*(a\.m\.|p\.m\.|am|pm)\s*(UTC[+-]\d+)/i);
  if (m) {
    let hour = parseInt(m[1]);
    const minute = parseInt(m[2]);
    const ampm = m[3].toLowerCase();
    const offset = m[4];
    if (ampm.startsWith('p') && hour !== 12) hour += 12;
    if (ampm.startsWith('a') && hour === 12) hour = 0;

    return { hour, minute, offset };
  }

  // Try 24-hour format: "20:00 UTC-6" or "20:00 (UTC-6)"
  m = normalized.match(/(\d{1,2}):(\d{2})\s*\(?\s*(UTC[+-]\d+)\s*\)?/);
  if (m) {
    return { hour: parseInt(m[1]), minute: parseInt(m[2]), offset: m[3] };
  }

  return null;
}

/**
 * Build a TIMESTAMPTZ string from date and time with UTC offset.
 * Converts to ISO 8601 with timezone.
 */
function buildTimestamp(date, time) {
  if (!date || !time) return null;
  const { year, month, day } = date;
  const { hour, minute, offset } = time;
  const sign = offset.includes('-') ? '-' : '+';
  const offsetNum = parseInt(offset.replace('UTC', ''));
  const offsetStr = `${sign}${String(Math.abs(offsetNum)).padStart(2, '0')}:00`;
  const pad = (n) => String(n).padStart(2, '0');

  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00${offsetStr}`;
}

/**
 * Extract FIFA country code from {{#invoke:flag|fb-rt|XXX}} or {{#invoke:flag|fb|XXX}}
 */
function extractTeamCode(teamTemplate) {
  const m = teamTemplate.match(/\{\{#invoke:flag\|fb-?r?t?\|(\w+)\}\}/);

  return m ? m[1] : null;
}

/**
 * Clean a wiki-linked stadium name like "[[Estadio Azteca]], [[Mexico City]]"
 * Returns "Estadio Azteca, Mexico City"
 */
function cleanStadium(str) {
  if (!str) return null;

  return str
    .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract match number from score link:
 * {{score link|2026 FIFA World Cup Group A#Mexico vs South Africa|Match 1}}
 */
function extractMatchNumber(scoreLink) {
  const m = scoreLink.match(/Match\s+(\d+)/);

  return m ? parseInt(m[1]) : null;
}

/**
 * Parse all football box templates from wikitext.
 */
function parseMatches(wikitext, groupName) {
  const matches = [];
  const regex = /\{\{#invoke:football box\|main([\s\S]*?)\n\}\}/g;
  let match;

  while ((match = regex.exec(wikitext)) !== null) {
    const template = match[1];

    const dateStr = extractParam(template, 'date');
    const timeStr = extractParam(template, 'time');
    const team1Str = extractParam(template, 'team1');
    const team2Str = extractParam(template, 'team2');
    const scoreStr = extractParam(template, 'score');
    const stadiumStr = extractParam(template, 'stadium');

    const dateObj = parseStartDate(dateStr);
    const timeObj = parseTime(timeStr);
    const teamA = extractTeamCode(team1Str);
    const teamB = extractTeamCode(team2Str);
    const matchNumber = extractMatchNumber(scoreStr);
    const stadium = cleanStadium(stadiumStr);
    const matchDate = buildTimestamp(dateObj, timeObj);

    if (!teamA || !teamB || !matchDate || !matchNumber) {
      console.warn(`  Skipping malformed match in group ${groupName}:`, {
        teamA, teamB, dateStr, timeStr, matchNumber
      });
      continue;
    }

    matches.push({
      match_code: `M${String(matchNumber).padStart(2, '0')}`,
      team_a: teamA,
      team_b: teamB,
      match_date: matchDate,
      group_name: groupName,
      stadium,
      stage: 'group',
      status: 'upcoming',
    });
  }

  return matches;
}

// ── Main import logic ──────────────────────────────────────────────────

async function importMatches() {
  console.log('FIFA World Cup 2026 Match Importer\n');
  console.log(`Supabase: ${supabaseUrl.replace(/\/\/.*@/, '//***@')}\n`);

  let allMatches = [];

  for (const group of GROUPS) {
    const title = `2026_FIFA_World_Cup_Group_${group}`;
    console.log(`Fetching ${title}...`);
    try {
      const wikitext = await fetchWikitext(title);
      const groupMatches = parseMatches(wikitext, group);
      console.log(`  Found ${groupMatches.length} matches`);
      if (groupMatches.length > 0) {
        console.log(`  Sample: ${groupMatches[0].match_code} ${groupMatches[0].team_a} vs ${groupMatches[0].team_b} @ ${groupMatches[0].match_date}`);
      }
      allMatches = allMatches.concat(groupMatches);
    } catch (err) {
      console.error(`  ERROR: ${err.message}`);
    }
  }

  console.log(`\nTotal matches parsed: ${allMatches.length}`);

  if (allMatches.length === 0) {
    console.error('No matches found. Aborting.');
    process.exit(1);
  }

  console.log('\nInserting matches into Supabase...');

  const { data, error } = await supabase
    .from('matches')
    .upsert(allMatches, {
      onConflict: 'match_code',
      ignoreDuplicates: false,
    })
    .select('match_code');

  if (error) {
    console.error(`ERROR inserting matches:`, error);
    process.exit(1);
  }

  console.log(`\nSuccessfully imported ${data.length} matches.`);
  console.log('Match codes:', data.map((m) => m.match_code).sort().join(', '));
}

importMatches().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
