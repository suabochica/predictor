DROP VIEW IF EXISTS player_tournament_totals;
CREATE VIEW player_tournament_totals AS
SELECT
  player_id,
  COUNT(*) FILTER (WHERE minutes_played > 0) AS gp,
  COALESCE(SUM(minutes_played),0)::int        AS minutes,
  COALESCE(SUM(goals),0)::int                 AS goals,
  COALESCE(SUM(assists),0)::int               AS assists,
  COALESCE(SUM(total_points),0)::int          AS total_points,
  SUM(opta_points)                            AS opta_points,
  COALESCE(SUM(shots_on_target),0)::int       AS shots_on_target,
  COALESCE(SUM(shots_off_target),0)::int      AS shots_off_target,
  COALESCE(SUM(blocked_shots),0)::int         AS blocked_shots,
  COALESCE(SUM(tackles),0)::int               AS tackles,
  COALESCE(SUM(interceptions),0)::int         AS interceptions,
  COALESCE(SUM(passes),0)::numeric(8,1)       AS passes,
  COALESCE(SUM(crosses),0)::numeric(8,1)      AS crosses,
  COALESCE(SUM(fouls_won),0)::int             AS fouls_won,
  COALESCE(SUM(fouls_conceded),0)::int        AS fouls_conceded,
  COALESCE(SUM(offsides),0)::int              AS offsides,
  COALESCE(SUM(penalties_won),0)::int         AS penalties_won,
  COALESCE(SUM(saves),0)::int                 AS saves,
  COALESCE(SUM(penalty_saves),0)::int         AS penalty_saves,
  COALESCE(SUM(penalty_misses),0)::int        AS penalty_misses,
  COALESCE(SUM(goals_conceded),0)::int        AS goals_conceded,
  COALESCE(SUM(yellow_cards),0)::int          AS yellow_cards,
  COALESCE(SUM(red_cards),0)::int             AS red_cards,
  COALESCE(SUM(own_goals),0)::int             AS own_goals,
  COUNT(*) FILTER (WHERE clean_sheet = true)::int AS clean_sheets
FROM player_stats
GROUP BY player_id;
