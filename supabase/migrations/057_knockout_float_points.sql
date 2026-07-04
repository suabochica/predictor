-- 057_knockout_float_points.sql
-- knockout_matches point columns were INTEGER from 001, but fantasy points
-- have one decimal since 044 (fantasy_standings numeric(8,1)). "Calcular
-- ronda" writes matchday_points and captain points straight into these
-- columns, so any match where a value had a decimal failed with
-- `invalid input syntax for type integer` (3 of 4 quarter-finals on the
-- first round-1 run). Widen to the same numeric(8,1) as fantasy_standings.
-- Goals stay integer.

ALTER TABLE knockout_matches
  ALTER COLUMN team_a_points         TYPE numeric(8,1),
  ALTER COLUMN team_b_points         TYPE numeric(8,1),
  ALTER COLUMN team_a_captain_points TYPE numeric(8,1),
  ALTER COLUMN team_b_captain_points TYPE numeric(8,1);
