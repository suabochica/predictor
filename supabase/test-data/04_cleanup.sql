-- ============================================================
-- Phase 4 Test Data — Step 4: Cleanup / Reset
-- ============================================================
-- Run sections of this whenever you want to wipe test data.
-- Each block is independent — run only what you need.
--
-- ⚠️  These are DELETE statements. They are permanent.
--     Your real users and their data are protected by the
--     WHERE clauses filtering on dummy emails / matchday ids.
-- ============================================================


-- ── A. Remove dummy teams & users ────────────────────────────
-- Removes teams first (FK dependency), then users.
-- Does NOT touch your real users or their teams.

DELETE FROM teams
WHERE user_id IN (
  SELECT id FROM users WHERE email LIKE 'dummy%@test.com'
);

DELETE FROM users
WHERE email LIKE 'dummy%@test.com';


-- ── B. Remove lineups for a specific matchday ─────────────────
-- Use this to re-run 02_test_lineups.sql cleanly.
-- Change matchday_id = 1 to target a different matchday.

-- DELETE FROM lineups WHERE matchday_id = 1;


-- ── C. Remove player stats for a specific matchday ───────────
-- Use this to re-upload a stats CSV from scratch.
-- Change matchday_id = 1 to target a different matchday.

-- DELETE FROM player_stats WHERE matchday_id = 1;


-- ── D. Remove fantasy standings for a specific matchday ──────
-- Use this before re-running Calculate Standings.
-- Change matchday_id = 1 to target a different matchday.

-- DELETE FROM fantasy_standings WHERE matchday_id = 1;


-- ── E. Delete a matchday entirely ────────────────────────────
-- Cascades to lineups, player_stats, and fantasy_standings
-- only if ON DELETE CASCADE is set — otherwise delete those
-- first (blocks C and D above), then run this.

-- DELETE FROM matchdays WHERE id = 1;


-- ── F. Full Phase 4 test reset (everything) ──────────────────
-- Wipes all Phase 4 test data in the correct order.
-- Uncomment and run as a block when you want a clean slate.

-- DELETE FROM fantasy_standings;
-- DELETE FROM player_stats;
-- DELETE FROM lineups WHERE matchday_id IN (SELECT id FROM matchdays);
-- DELETE FROM matchdays;
-- DELETE FROM teams WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'dummy%@test.com');
-- DELETE FROM users WHERE email LIKE 'dummy%@test.com';
