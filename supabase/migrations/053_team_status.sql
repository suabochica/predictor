-- 053_team_status.sql
-- Closed-door negotiations (elimination Phase B), part 1: mark fantasy teams
-- eliminated when their manager loses a knockout round. `teams` has no status
-- column today (knockout_matches.winner_id only records winners, losers are
-- implicit) — negotiations, transfer guards, and the Negociaciones page all
-- need an explicit, queryable "this team is out" flag.

ALTER TABLE teams ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'eliminated'));

-- SECURITY DEFINER so the admin client doesn't need a teams UPDATE RLS policy
-- just for this one bulk-flip operation (same pattern as set_country_eliminated, 052).
CREATE OR REPLACE FUNCTION set_teams_eliminated(p_team_ids integer[], p_eliminated boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN RAISE EXCEPTION 'not authorized'; END IF;
  UPDATE teams SET status = CASE WHEN p_eliminated THEN 'eliminated' ELSE 'active' END
  WHERE id = ANY(p_team_ids);
END $$;

GRANT EXECUTE ON FUNCTION set_teams_eliminated(integer[], boolean) TO authenticated;
