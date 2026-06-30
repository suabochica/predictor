-- Upserts knockout-stage matches with REAL team codes for round_of_32
-- (from Wikipedia https://en.wikipedia.org/wiki/2026_FIFA_World_Cup_round_of_32).
-- round_of_16 through final remain TBD/TBD until prior rounds complete.
-- Uses ON CONFLICT (match_code) DO UPDATE: inserts if missing, updates teams if TBD.
-- Run in the Supabase SQL editor.

BEGIN;

INSERT INTO matches (match_code, team_a, team_b, match_date, group_name, status, stadium, stage, matchday_id) VALUES
('M73', 'RSA', 'CAN', '2026-06-28T15:00:00-04:00'::timestamptz, NULL, 'upcoming', 'SoFi Stadium, Inglewood', 'round_of_32', (SELECT id FROM matchdays WHERE wc_stage = 'Round of 32')),
('M74', 'GER', 'PAR', '2026-06-29T16:30:00-04:00'::timestamptz, NULL, 'upcoming', 'Gillette Stadium, Foxborough', 'round_of_32', (SELECT id FROM matchdays WHERE wc_stage = 'Round of 32')),
('M75', 'NED', 'MAR', '2026-06-29T21:00:00-04:00'::timestamptz, NULL, 'upcoming', 'Estadio BBVA, Guadalupe', 'round_of_32', (SELECT id FROM matchdays WHERE wc_stage = 'Round of 32')),
('M76', 'BRA', 'JPN', '2026-06-29T13:00:00-04:00'::timestamptz, NULL, 'upcoming', 'NRG Stadium, Houston', 'round_of_32', (SELECT id FROM matchdays WHERE wc_stage = 'Round of 32')),
('M77', 'FRA', 'SWE', '2026-06-30T17:00:00-04:00'::timestamptz, NULL, 'upcoming', 'MetLife Stadium, East Rutherford', 'round_of_32', (SELECT id FROM matchdays WHERE wc_stage = 'Round of 32')),
('M78', 'CIV', 'NOR', '2026-06-30T13:00:00-04:00'::timestamptz, NULL, 'upcoming', 'AT&T Stadium, Arlington', 'round_of_32', (SELECT id FROM matchdays WHERE wc_stage = 'Round of 32')),
('M79', 'MEX', 'ECU', '2026-06-30T21:00:00-04:00'::timestamptz, NULL, 'upcoming', 'Estadio Azteca, Mexico City', 'round_of_32', (SELECT id FROM matchdays WHERE wc_stage = 'Round of 32')),
('M80', 'ENG', 'COD', '2026-07-01T12:00:00-04:00'::timestamptz, NULL, 'upcoming', 'Mercedes-Benz Stadium, Atlanta', 'round_of_32', (SELECT id FROM matchdays WHERE wc_stage = 'Round of 32')),
('M81', 'USA', 'BIH', '2026-07-01T20:00:00-04:00'::timestamptz, NULL, 'upcoming', 'Levi''s Stadium, Santa Clara', 'round_of_32', (SELECT id FROM matchdays WHERE wc_stage = 'Round of 32')),
('M82', 'BEL', 'SEN', '2026-07-01T16:00:00-04:00'::timestamptz, NULL, 'upcoming', 'Lumen Field, Seattle', 'round_of_32', (SELECT id FROM matchdays WHERE wc_stage = 'Round of 32')),
('M83', 'POR', 'CRO', '2026-07-02T19:00:00-04:00'::timestamptz, NULL, 'upcoming', 'BMO Field, Toronto', 'round_of_32', (SELECT id FROM matchdays WHERE wc_stage = 'Round of 32')),
('M84', 'ESP', 'AUT', '2026-07-02T15:00:00-04:00'::timestamptz, NULL, 'upcoming', 'SoFi Stadium, Inglewood', 'round_of_32', (SELECT id FROM matchdays WHERE wc_stage = 'Round of 32')),
('M85', 'SUI', 'ALG', '2026-07-02T23:00:00-04:00'::timestamptz, NULL, 'upcoming', 'BC Place, Vancouver', 'round_of_32', (SELECT id FROM matchdays WHERE wc_stage = 'Round of 32')),
('M86', 'ARG', 'CPV', '2026-07-03T18:00:00-04:00'::timestamptz, NULL, 'upcoming', 'Hard Rock Stadium, Miami Gardens', 'round_of_32', (SELECT id FROM matchdays WHERE wc_stage = 'Round of 32')),
('M87', 'COL', 'GHA', '2026-07-03T21:30:00-04:00'::timestamptz, NULL, 'upcoming', 'Arrowhead Stadium, Kansas City', 'round_of_32', (SELECT id FROM matchdays WHERE wc_stage = 'Round of 32')),
('M88', 'AUS', 'EGY', '2026-07-03T14:00:00-04:00'::timestamptz, NULL, 'upcoming', 'AT&T Stadium, Arlington', 'round_of_32', (SELECT id FROM matchdays WHERE wc_stage = 'Round of 32'))
ON CONFLICT (match_code) DO UPDATE SET
  team_a = EXCLUDED.team_a,
  team_b = EXCLUDED.team_b;

INSERT INTO matches (match_code, team_a, team_b, match_date, group_name, status, stadium, stage, matchday_id) VALUES
('M89', 'TBD', 'TBD', '2026-07-04T17:00:00-04:00'::timestamptz, NULL, 'upcoming', 'Lincoln Financial Field, Philadelphia', 'round_of_16', (SELECT id FROM matchdays WHERE wc_stage = 'Round of 16')),
('M90', 'TBD', 'TBD', '2026-07-04T13:00:00-04:00'::timestamptz, NULL, 'upcoming', 'NRG Stadium, Houston', 'round_of_16', (SELECT id FROM matchdays WHERE wc_stage = 'Round of 16')),
('M91', 'TBD', 'TBD', '2026-07-05T16:00:00-04:00'::timestamptz, NULL, 'upcoming', 'MetLife Stadium, East Rutherford', 'round_of_16', (SELECT id FROM matchdays WHERE wc_stage = 'Round of 16')),
('M92', 'TBD', 'TBD', '2026-07-05T20:00:00-04:00'::timestamptz, NULL, 'upcoming', 'Estadio Azteca, Mexico City', 'round_of_16', (SELECT id FROM matchdays WHERE wc_stage = 'Round of 16')),
('M93', 'TBD', 'TBD', '2026-07-06T15:00:00-04:00'::timestamptz, NULL, 'upcoming', 'AT&T Stadium, Arlington', 'round_of_16', (SELECT id FROM matchdays WHERE wc_stage = 'Round of 16')),
('M94', 'TBD', 'TBD', '2026-07-06T20:00:00-04:00'::timestamptz, NULL, 'upcoming', 'Lumen Field, Seattle', 'round_of_16', (SELECT id FROM matchdays WHERE wc_stage = 'Round of 16')),
('M95', 'TBD', 'TBD', '2026-07-07T12:00:00-04:00'::timestamptz, NULL, 'upcoming', 'Mercedes-Benz Stadium, Atlanta', 'round_of_16', (SELECT id FROM matchdays WHERE wc_stage = 'Round of 16')),
('M96', 'TBD', 'TBD', '2026-07-07T16:00:00-04:00'::timestamptz, NULL, 'upcoming', 'BC Place, Vancouver', 'round_of_16', (SELECT id FROM matchdays WHERE wc_stage = 'Round of 16'))
ON CONFLICT (match_code) DO UPDATE SET
  team_a = EXCLUDED.team_a,
  team_b = EXCLUDED.team_b;

INSERT INTO matches (match_code, team_a, team_b, match_date, group_name, status, stadium, stage, matchday_id) VALUES
('M97', 'TBD', 'TBD', '2026-07-09T16:00:00-04:00'::timestamptz, NULL, 'upcoming', 'Gillette Stadium, Foxborough', 'quarterfinal', (SELECT id FROM matchdays WHERE wc_stage = 'Quarter-finals')),
('M98', 'TBD', 'TBD', '2026-07-10T15:00:00-04:00'::timestamptz, NULL, 'upcoming', 'SoFi Stadium, Inglewood', 'quarterfinal', (SELECT id FROM matchdays WHERE wc_stage = 'Quarter-finals')),
('M99', 'TBD', 'TBD', '2026-07-11T17:00:00-04:00'::timestamptz, NULL, 'upcoming', 'Hard Rock Stadium, Miami Gardens', 'quarterfinal', (SELECT id FROM matchdays WHERE wc_stage = 'Quarter-finals')),
('M100', 'TBD', 'TBD', '2026-07-11T21:00:00-04:00'::timestamptz, NULL, 'upcoming', 'Arrowhead Stadium, Kansas City', 'quarterfinal', (SELECT id FROM matchdays WHERE wc_stage = 'Quarter-finals'))
ON CONFLICT (match_code) DO UPDATE SET
  team_a = EXCLUDED.team_a,
  team_b = EXCLUDED.team_b;

INSERT INTO matches (match_code, team_a, team_b, match_date, group_name, status, stadium, stage, matchday_id) VALUES
('M101', 'TBD', 'TBD', '2026-07-14T15:00:00-04:00'::timestamptz, NULL, 'upcoming', 'AT&T Stadium, Arlington', 'semifinal', NULL),
('M102', 'TBD', 'TBD', '2026-07-15T15:00:00-04:00'::timestamptz, NULL, 'upcoming', 'Mercedes-Benz Stadium, Atlanta', 'semifinal', NULL)
ON CONFLICT (match_code) DO UPDATE SET
  team_a = EXCLUDED.team_a,
  team_b = EXCLUDED.team_b;

INSERT INTO matches (match_code, team_a, team_b, match_date, group_name, status, stadium, stage, matchday_id) VALUES
('M103', 'TBD', 'TBD', '2026-07-18T17:00:00-04:00'::timestamptz, NULL, 'upcoming', 'Hard Rock Stadium, Miami Gardens', 'third_place', NULL)
ON CONFLICT (match_code) DO UPDATE SET
  team_a = EXCLUDED.team_a,
  team_b = EXCLUDED.team_b;

INSERT INTO matches (match_code, team_a, team_b, match_date, group_name, status, stadium, stage, matchday_id) VALUES
('M104', 'TBD', 'TBD', '2026-07-19T15:00:00-04:00'::timestamptz, NULL, 'upcoming', 'MetLife Stadium, East Rutherford', 'final', NULL)
ON CONFLICT (match_code) DO UPDATE SET
  team_a = EXCLUDED.team_a,
  team_b = EXCLUDED.team_b;

COMMIT;
