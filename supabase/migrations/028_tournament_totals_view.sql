-- Aggregate tournament-total stats per player across all scored matchdays
CREATE OR REPLACE VIEW player_tournament_totals AS
SELECT
  player_id,
  COUNT(*) FILTER (WHERE minutes_played > 0)          AS gp,
  COALESCE(SUM(minutes_played), 0)::integer            AS minutes,
  COALESCE(SUM(goals), 0)::integer                     AS goals,
  COALESCE(SUM(assists), 0)::integer                   AS assists,
  COALESCE(SUM(total_points), 0)::integer              AS total_points,
  SUM(opta_points)                                     AS opta_points,
  COALESCE(SUM(shots_on_target), 0)::integer           AS shots_on_target,
  COALESCE(SUM(blocked_shots), 0)::integer             AS blocked_shots,
  COALESCE(SUM(tackles), 0)::integer                   AS tackles,
  COALESCE(SUM(interceptions), 0)::integer             AS interceptions,
  COALESCE(SUM(fouls_won), 0)::integer                 AS fouls_won,
  COALESCE(SUM(penalties_won), 0)::integer             AS penalties_won,
  COALESCE(SUM(saves), 0)::integer                     AS saves,
  COALESCE(SUM(penalty_saves), 0)::integer             AS penalty_saves,
  COUNT(*) FILTER (WHERE clean_sheet = true)::integer  AS clean_sheets
FROM player_stats
GROUP BY player_id;

GRANT SELECT ON player_tournament_totals TO authenticated;
