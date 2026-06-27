-- 052_fix_set_country_eliminated.sql
-- Bugfix: migration 051 called is_admin() with no arguments, but the helper
-- (migration 036) is defined as is_admin(uid uuid). Postgres doesn't validate
-- plpgsql bodies at CREATE time, so 051 applied cleanly but every call to
-- set_country_eliminated raised `function is_admin() does not exist` at runtime
-- — the Admin toggle silently failed and no player was ever flagged eliminated.
CREATE OR REPLACE FUNCTION set_country_eliminated(p_country_code text, p_eliminated boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN RAISE EXCEPTION 'not authorized'; END IF;
  UPDATE players SET is_eliminated = p_eliminated WHERE country_code = p_country_code;
END $$;
