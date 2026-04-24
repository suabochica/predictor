-- ============================================================
-- Full reset — wipes all test/game data, keeps players table.
-- Run this in the Supabase SQL Editor to start from scratch.
--
-- Order respects FK constraints (children before parents).
-- After running: follow the fresh-start steps below.
-- ============================================================

-- 1. Scoring/results tables
DELETE FROM fantasy_standings;
DELETE FROM player_stats;

-- 2. Lineups (all, including null matchday pre-tournament saves)
DELETE FROM lineups;

-- 3. Matchdays
DELETE FROM matchdays;

-- 4. Knockout bracket
DELETE FROM knockout_matches;

-- 5. Squad assignments and transfer history
DELETE FROM transfers;
DELETE FROM team_players;

-- 5. Auction data
DELETE FROM auction_bids;
UPDATE auction_state SET
  status        = 'pending',
  current_round = 1,
  round_started_at = NULL;

-- 6. Teams and users (all non-admin users)
--    Safe: keeps your admin account; removes everyone else.
DELETE FROM teams;
DELETE FROM users WHERE is_admin = false;

-- ============================================================
-- Fresh-start steps (run in this order after this script):
--
-- 1. Run 00_seed_players.sql  (skip if players table still has data)
-- 2. Run 01_dummy_users_and_teams.sql  (creates 4 test users + teams)
-- 3. On /admin — create a matchday, set it active
-- 4. On /my-team — save your lineup (active matchday must exist first)
-- 5. On /admin — upload test_matchday1_stats.csv
-- 6. On /admin — click Calculate Standings
-- 7. Check /history for breakdown, /my-team for rolling lockout
-- ============================================================
