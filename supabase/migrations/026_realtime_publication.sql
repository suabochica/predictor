-- Realtime propagation fix.
-- Migration 022 added only `auction_bids` to the supabase_realtime publication.
-- The client subscribes to auction_state UPDATE (round start/end), teams UPDATE
-- (live budget) and team_players INSERT/DELETE (live squad), but those tables were
-- never published, so Postgres never delivered their change events — every client
-- (including the admin) had to manually refresh to see auction state changes.
-- Add the missing tables here. Idempotent: ALTER PUBLICATION ... ADD TABLE raises
-- duplicate_object if the table is already a member.

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE auction_state;
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE teams;
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE team_players;
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;

-- useTeam.js subscribes to team_players with a `team_id=eq.<id>` filter. Under the
-- default REPLICA IDENTITY a DELETE event (a transfer removing a player) carries only
-- the primary key in the old record, so the team_id filter cannot match and live
-- squad-removal would not fire. FULL includes the old row so filtered DELETEs work.
ALTER TABLE team_players REPLICA IDENTITY FULL;
