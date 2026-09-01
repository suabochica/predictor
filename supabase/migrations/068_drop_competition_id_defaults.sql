-- 068_drop_competition_id_defaults.sql
-- Phase 6: write-path tripwire. Drops `DEFAULT 1` from every `competition_id`
-- column added in 061, so any INSERT that omits it now fails NOT NULL instead
-- of silently landing in the World Cup archive.
--
-- Scoping audit done 2026-09-01 confirmed every live write path already sends
-- competition_id explicitly:
--   - apps/fantasy/src: all .insert()/.upsert() calls go through lib/db.js's
--     createDb(), which stamps competition_id unconditionally.
--   - SQL RPCs (063, 064, 065, 067): every INSERT already passes it.
--   - apps/polla/scripts/import-matches.mjs + sync-schedule.mjs: already
--     hardcode WC_COMPETITION_ID = 1 (commit 46a2fa4, predates this migration).
-- supabase/seed.sql's 3 unscoped inserts are fixed in the same commit as this
-- migration. supabase/manual/02_* and 05_* keep the gap deliberately — they
-- are one-off scripts already run once against the live DB, not a pipeline.
ALTER TABLE players             ALTER COLUMN competition_id DROP DEFAULT;
ALTER TABLE teams               ALTER COLUMN competition_id DROP DEFAULT;
ALTER TABLE matchdays           ALTER COLUMN competition_id DROP DEFAULT;
ALTER TABLE matches             ALTER COLUMN competition_id DROP DEFAULT;
ALTER TABLE auction_state       ALTER COLUMN competition_id DROP DEFAULT;
ALTER TABLE transfer_windows    ALTER COLUMN competition_id DROP DEFAULT;
ALTER TABLE knockout_matches    ALTER COLUMN competition_id DROP DEFAULT;
ALTER TABLE negotiation_windows ALTER COLUMN competition_id DROP DEFAULT;
ALTER TABLE proxy_targets       ALTER COLUMN competition_id DROP DEFAULT;
ALTER TABLE team_players        ALTER COLUMN competition_id DROP DEFAULT;
ALTER TABLE fantasy_standings   ALTER COLUMN competition_id DROP DEFAULT;
ALTER TABLE auction_bids        ALTER COLUMN competition_id DROP DEFAULT;
