-- Exclude admin users from the leaderboard

CREATE OR REPLACE FUNCTION polla_get_leaderboard()
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
  WHERE u.is_admin = false
  GROUP BY u.id, u.display_name
  ORDER BY total_points DESC;
$$;
