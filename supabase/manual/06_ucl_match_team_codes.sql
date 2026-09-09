-- UCL fixture team keys: club NAMES -> club CODES.
--
-- The 144 "Fase liga" fixtures were imported (2026-09-01, see apps/fantasy/UCL_TODO.md)
-- with team_a/team_b = club names ("Man City"), byte-identical to players.country.
-- But every kickoff-lock check joins on players.country_code ("MCI"):
--   * apps/fantasy/src/hooks/useMatchdayLocks.js  (client: 🔒 badge, XI/captain/market guards)
--   * execute_transfer / save_lineup, migration 063  (server: the authoritative checks)
-- Names never match codes, lockTimeFor() returns NULL and the server EXISTS() is false,
-- so the whole lock system silently fails OPEN for UCL — no error, nothing ever locks.
-- The same mismatch also breaks Admin's "✓ Stats subidas" badge for UCL (it keys off
-- match_metadata names mapped to codes, then compares against matches.team_a).
--
-- Contract (WC already follows it): matches.team_a/team_b = players.country_code,
-- within the same competition. Supersedes the "must match players.country" note in
-- migration 023, which predates the June 2026 switch to country_code.
--
-- Run in the Supabase SQL editor. Effectively idempotent: once converted, no team_a
-- equals a club name any more, so a second run touches only LASK's 8 fixtures — the
-- one club whose name and code are the same string — and writes them the same value.
--
-- Verified against the live DB 2026-09-10 before applying: 144/144 fixtures had names
-- on both sides (LASK's 8 already matched by coincidence), the name -> code map is 1:1
-- across all 36 clubs, and no fixture team failed to resolve.

BEGIN;

-- Pre-check: the name -> code map must be 1:1, or the UPDATE below would fan out.
-- Expect 0 rows.
SELECT country, count(DISTINCT country_code) AS codes
  FROM players
 WHERE competition_id = (SELECT id FROM competitions WHERE slug = 'ucl-2026-27')
   AND country_code IS NOT NULL
 GROUP BY country
HAVING count(DISTINCT country_code) > 1;

UPDATE matches m SET team_a = map.country_code
  FROM (SELECT DISTINCT country, country_code FROM players
         WHERE competition_id = (SELECT id FROM competitions WHERE slug = 'ucl-2026-27')
           AND country_code IS NOT NULL) map
 WHERE m.competition_id = (SELECT id FROM competitions WHERE slug = 'ucl-2026-27')
   AND m.team_a = map.country;                                  -- expect UPDATE 144

UPDATE matches m SET team_b = map.country_code
  FROM (SELECT DISTINCT country, country_code FROM players
         WHERE competition_id = (SELECT id FROM competitions WHERE slug = 'ucl-2026-27')
           AND country_code IS NOT NULL) map
 WHERE m.competition_id = (SELECT id FROM competitions WHERE slug = 'ucl-2026-27')
   AND m.team_b = map.country;                                  -- expect UPDATE 144

-- Post-check: both sides of every UCL fixture must now be a code that some player
-- in this competition carries. Expect bad_a = 0, bad_b = 0, total = 144.
SELECT count(*) FILTER (WHERE NOT EXISTS (
         SELECT 1 FROM players p
          WHERE p.competition_id = m.competition_id AND p.country_code = m.team_a)) AS bad_a,
       count(*) FILTER (WHERE NOT EXISTS (
         SELECT 1 FROM players p
          WHERE p.competition_id = m.competition_id AND p.country_code = m.team_b)) AS bad_b,
       count(*) AS total
  FROM matches m
 WHERE m.competition_id = (SELECT id FROM competitions WHERE slug = 'ucl-2026-27');

COMMIT;   -- ROLLBACK instead if the pre-check returned rows, the UPDATEs were not
          -- 144/144, or bad_a/bad_b are non-zero.
