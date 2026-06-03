-- 031_normalize_fantasy_matchdays.sql
-- Normalize the fantasy matchdays to the 6-matchday model:
--   3 group round-robin matchdays + WC Round of 32 / Round of 16 / Quarter-finals.
-- The fantasy tournament now ends at the WC Quarter-finals (fantasy Final), so the
-- obsolete "WC Semi-finals" matchday is removed. WC semis / third place / final are
-- off-season and carry no fantasy matchday.
--
-- The matches table already contains all 104 fixtures; matchday_id is populated by
-- apps/polla/scripts/sync-schedule.mjs, which keys off these exact wc_stage labels:
--   'Group Stage MD1', 'Group Stage MD2', 'Group Stage MD3',
--   'Round of 32', 'Round of 16', 'Quarter-finals'.

DO $$
DECLARE
  obsolete_ids INTEGER[];
BEGIN
  SELECT array_agg(id) INTO obsolete_ids
  FROM matchdays
  WHERE wc_stage = 'Semi-finals';

  IF obsolete_ids IS NOT NULL THEN
    -- Detach nullable references.
    UPDATE matches          SET matchday_id = NULL WHERE matchday_id = ANY(obsolete_ids);
    UPDATE knockout_matches SET matchday_id = NULL WHERE matchday_id = ANY(obsolete_ids);
    UPDATE transfer_windows SET matchday_id = NULL WHERE matchday_id = ANY(obsolete_ids);
    UPDATE transfers        SET matchday_id = NULL WHERE matchday_id = ANY(obsolete_ids);

    -- Remove dependent child rows (no season data exists for this matchday yet).
    DELETE FROM lineups           WHERE matchday_id = ANY(obsolete_ids);
    DELETE FROM player_stats      WHERE matchday_id = ANY(obsolete_ids);
    DELETE FROM fantasy_standings WHERE matchday_id = ANY(obsolete_ids);
    -- match_metadata FKs matchdays(id) ON DELETE CASCADE — handled automatically.

    DELETE FROM matchdays WHERE id = ANY(obsolete_ids);
  END IF;
END $$;
