-- Leaderboard RPC function — runs with SECURITY DEFINER so it can
-- aggregate across all predictions regardless of RLS on the predictions table.

CREATE OR REPLACE FUNCTION get_leaderboard()
RETURNS TABLE (
  user_id uuid,
  display_name text,
  total_points integer,
  predictions_count integer
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    u.id        AS user_id,
    u.display_name,
    (COALESCE(SUM(p.points_earned), 0))::integer AS total_points,
    (COUNT(p.id))::integer                       AS predictions_count
  FROM users u
  LEFT JOIN predictions p ON u.id = p.user_id
  GROUP BY u.id, u.display_name
  ORDER BY total_points DESC;
$$;

GRANT EXECUTE ON FUNCTION get_leaderboard() TO authenticated;
