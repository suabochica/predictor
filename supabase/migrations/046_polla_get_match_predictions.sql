-- RPC to fetch all predictions for a specific match.
-- Runs with SECURITY DEFINER to bypass the per-user RLS on predictions table.
-- Called from PredictionForm modal.

CREATE OR REPLACE FUNCTION polla_get_match_predictions(p_match_id uuid)
RETURNS TABLE (
  display_name text,
  predicted_score_a integer,
  predicted_score_b integer,
  points_earned integer
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    u.display_name,
    p.predicted_score_a,
    p.predicted_score_b,
    p.points_earned
  FROM predictions p
  JOIN users u ON p.user_id = u.id
  WHERE p.match_id = p_match_id
  ORDER BY u.display_name;
$$;

GRANT EXECUTE ON FUNCTION polla_get_match_predictions(uuid) TO authenticated;
