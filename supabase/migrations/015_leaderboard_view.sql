-- Leaderboard view aggregating user prediction points

CREATE OR REPLACE VIEW leaderboard AS
SELECT
  u.id        AS user_id,
  u.display_name,
  COALESCE(SUM(p.points_earned), 0) AS total_points,
  COUNT(p.id)                       AS predictions_count
FROM users u
LEFT JOIN predictions p ON u.id = p.user_id
GROUP BY u.id, u.display_name
ORDER BY total_points DESC;
