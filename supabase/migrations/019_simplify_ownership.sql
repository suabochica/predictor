-- All ownership is now exclusive — drop the free/locked distinction
ALTER TABLE team_players DROP COLUMN IF EXISTS is_locked;
ALTER TABLE team_players DROP COLUMN IF EXISTS slot_type;

-- Replace partial lock index with a true global uniqueness constraint
DROP INDEX IF EXISTS one_lock_per_player;
ALTER TABLE team_players ADD CONSTRAINT one_player_one_team UNIQUE (player_id);

-- Remove transfer_type (locked_swap / free_slot distinction is gone)
ALTER TABLE transfers DROP COLUMN IF EXISTS transfer_type;

-- Drop lock RPC functions (no longer needed)
DROP FUNCTION IF EXISTS lock_player(INT, INT, INT);
DROP FUNCTION IF EXISTS unlock_player(INT, INT);
