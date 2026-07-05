-- RPC to fetch all predictions (admin view).
-- Runs with SECURITY DEFINER to bypass RLS on predictions/users,
-- avoiding the recursive policy evaluation issue that causes
-- knockout predictions to be invisible in AdminTable.
-- Joins with matches so the client gets the canonical match_code directly.
CREATE OR REPLACE FUNCTION polla_get_all_predictions()
RETURNS TABLE (
  match_id uuid,
  match_code text,
  display_name text,
  predicted_score_a integer,
  predicted_score_b integer
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    p.match_id,
    m.match_code,
    u.display_name,
    p.predicted_score_a,
    p.predicted_score_b
  FROM predictions p
  JOIN users u ON p.user_id = u.id
  JOIN matches m ON m.id = p.match_id
  ORDER BY m.match_date, m.match_code, u.display_name;
$$;

GRANT EXECUTE ON FUNCTION polla_get_all_predictions() TO authenticated;
