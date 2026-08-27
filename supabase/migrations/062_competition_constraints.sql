-- 062_competition_constraints.sql
-- Re-scopes every uniqueness constraint that currently assumes a single tournament,
-- and recreates player_tournament_totals with competition_id.
--
-- WARNING (handled in the same commit): dropping teams_user_id_key flips PostgREST's
-- `users(…, teams(…))` embed from a to-one OBJECT to a to-many ARRAY. Admin.jsx's
-- participant list reads `u.teams.budget_remaining` and would render `£NaN`, and
-- `filter(u => u.teams)` would count every user as enrolled ([] is truthy).

-- One team per user PER COMPETITION.
ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_user_id_key;                    -- 001:37
ALTER TABLE teams ADD CONSTRAINT teams_user_competition_key UNIQUE (user_id, competition_id);

-- Match codes only have to be unique within a competition (UCL will reuse M01…).
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_match_code_key;             -- 013:5
ALTER TABLE matches ADD CONSTRAINT matches_competition_code_key UNIQUE (competition_id, match_code);

-- One open negotiation window per competition (was a functional index on a CONSTANT).
DROP INDEX IF EXISTS one_open_negotiation_window;                                 -- 054:30
CREATE UNIQUE INDEX one_open_negotiation_window
  ON negotiation_windows (competition_id) WHERE status = 'open';

-- Proxy-bid priorities are per user PER COMPETITION.
ALTER TABLE proxy_targets DROP CONSTRAINT IF EXISTS proxy_targets_user_id_priority_key;  -- 033:16
ALTER TABLE proxy_targets ADD CONSTRAINT proxy_targets_user_comp_priority_key
  UNIQUE (user_id, competition_id, priority) DEFERRABLE INITIALLY DEFERRED;

-- Tournament order is unique within a competition.
ALTER TABLE matchdays ADD CONSTRAINT matchdays_competition_sequence_key UNIQUE (competition_id, sequence);

-- team_players UNIQUE(player_id) (one_player_one_team, 019:7) intentionally stays:
-- player ids already partition by competition.

-- ── player_tournament_totals ──────────────────────────────────────────────────
-- Read unfiltered at usePlayerTotals.js:31, so it needs the scoping column.
-- DROP VIEW destroys the ACL — the re-GRANT below is mandatory.
DROP VIEW IF EXISTS player_tournament_totals;
CREATE VIEW player_tournament_totals AS
SELECT
  ps.player_id,
  p.competition_id,
  COUNT(*) FILTER (WHERE ps.minutes_played > 0) AS gp,
  COALESCE(SUM(ps.minutes_played),0)::int        AS minutes,
  COALESCE(SUM(ps.goals),0)::int                 AS goals,
  COALESCE(SUM(ps.assists),0)::int               AS assists,
  COALESCE(SUM(ps.total_points),0)::int          AS total_points,
  SUM(ps.opta_points)                            AS opta_points,
  COALESCE(SUM(ps.shots_on_target),0)::int       AS shots_on_target,
  COALESCE(SUM(ps.shots_off_target),0)::int      AS shots_off_target,
  COALESCE(SUM(ps.blocked_shots),0)::int         AS blocked_shots,
  COALESCE(SUM(ps.tackles),0)::int               AS tackles,
  COALESCE(SUM(ps.interceptions),0)::int         AS interceptions,
  COALESCE(SUM(ps.passes),0)::numeric(8,1)       AS passes,
  COALESCE(SUM(ps.crosses),0)::numeric(8,1)      AS crosses,
  COALESCE(SUM(ps.fouls_won),0)::int             AS fouls_won,
  COALESCE(SUM(ps.fouls_conceded),0)::int        AS fouls_conceded,
  COALESCE(SUM(ps.offsides),0)::int              AS offsides,
  COALESCE(SUM(ps.penalties_won),0)::int         AS penalties_won,
  COALESCE(SUM(ps.saves),0)::int                 AS saves,
  COALESCE(SUM(ps.penalty_saves),0)::int         AS penalty_saves,
  COALESCE(SUM(ps.penalty_misses),0)::int        AS penalty_misses,
  COALESCE(SUM(ps.goals_conceded),0)::int        AS goals_conceded,
  COALESCE(SUM(ps.yellow_cards),0)::int          AS yellow_cards,
  COALESCE(SUM(ps.red_cards),0)::int             AS red_cards,
  COALESCE(SUM(ps.own_goals),0)::int             AS own_goals,
  COUNT(*) FILTER (WHERE ps.clean_sheet = true)::int AS clean_sheets
FROM player_stats ps
JOIN players p ON p.id = ps.player_id
GROUP BY ps.player_id, p.competition_id;

GRANT SELECT ON player_tournament_totals TO authenticated;
