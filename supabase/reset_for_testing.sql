-- ============================================================
-- FULL TEST RESET
-- Clears all game-state data. Preserves:
--   users, players, matchdays, transfer_windows
--
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
DELETE FROM teams;

-- Auction state is a singleton row — reset rather than delete
UPDATE auction_state
SET status             = 'pending',
    current_round      = 0,
    round_started_at   = NULL,
    last_bid_at        = NULL;

-- current_price ratchets up during the auction; revert to base price
UPDATE players SET current_price = price;

-- Reset transfer windows to their seed defaults (closed, no active window)
UPDATE transfer_windows SET is_active = false;

-- Restart sequences so IDs begin at 1 again
ALTER SEQUENCE teams_id_seq           RESTART WITH 1;
ALTER SEQUENCE team_players_id_seq    RESTART WITH 1;
ALTER SEQUENCE lineups_id_seq         RESTART WITH 1;
ALTER SEQUENCE auction_bids_id_seq    RESTART WITH 1;
ALTER SEQUENCE player_stats_id_seq    RESTART WITH 1;
ALTER SEQUENCE fantasy_standings_id_seq RESTART WITH 1;
ALTER SEQUENCE knockout_matches_id_seq  RESTART WITH 1;
ALTER SEQUENCE transfers_id_seq       RESTART WITH 1;
