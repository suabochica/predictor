-- ============================================================
-- PLAYER RESET
-- Clears all player-dependent game state and the players table.
-- Run this before seeding new players (e.g. full WC 2026 squads).
--
-- Preserves: users, teams, matchdays, transfer_windows
-- Run from Supabase SQL Editor (service role / SQL tab).
-- ============================================================

-- Children before parents (FK order)
DELETE FROM transfers;
DELETE FROM fantasy_standings;
DELETE FROM knockout_matches;
DELETE FROM lineups;
DELETE FROM player_stats;
DELETE FROM auction_bids;
DELETE FROM team_players;
DELETE FROM players;

-- Reset auction to initial state
UPDATE auction_state
SET status           = 'pending',
    current_round    = 0,
    round_started_at = NULL,
    last_bid_at      = NULL;

-- Reset team budgets
UPDATE teams SET budget_remaining = 105.0;

-- Restart sequences
ALTER SEQUENCE players_id_seq             RESTART WITH 1;
ALTER SEQUENCE team_players_id_seq        RESTART WITH 1;
ALTER SEQUENCE lineups_id_seq             RESTART WITH 1;
ALTER SEQUENCE auction_bids_id_seq        RESTART WITH 1;
ALTER SEQUENCE player_stats_id_seq        RESTART WITH 1;
ALTER SEQUENCE fantasy_standings_id_seq   RESTART WITH 1;
ALTER SEQUENCE knockout_matches_id_seq    RESTART WITH 1;
ALTER SEQUENCE transfers_id_seq           RESTART WITH 1;
