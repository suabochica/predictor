-- Knockout stage matches (teams TBD, dates known from FIFA schedule)
-- Match codes 73-104

INSERT INTO matches (match_code, team_a, team_b, match_date, stadium, stage, status) VALUES
-- Round of 32 (June 28 – July 3, 2026)
('M73', 'TBD', 'TBD', '2026-06-28T12:00:00-04:00', 'SoFi Stadium, Los Angeles', 'round_of_32', 'upcoming'),
('M74', 'TBD', 'TBD', '2026-06-28T15:00:00-04:00', 'SoFi Stadium, Los Angeles', 'round_of_32', 'upcoming'),
('M75', 'TBD', 'TBD', '2026-06-29T12:00:00-05:00', 'Arrowhead Stadium, Kansas City', 'round_of_32', 'upcoming'),
('M76', 'TBD', 'TBD', '2026-06-29T15:00:00-05:00', 'Arrowhead Stadium, Kansas City', 'round_of_32', 'upcoming'),
('M77', 'TBD', 'TBD', '2026-06-29T12:00:00-07:00', 'Levi''s Stadium, San Francisco Bay Area', 'round_of_32', 'upcoming'),
('M78', 'TBD', 'TBD', '2026-06-29T15:00:00-07:00', 'Levi''s Stadium, San Francisco Bay Area', 'round_of_32', 'upcoming'),
('M79', 'TBD', 'TBD', '2026-06-30T12:00:00-05:00', 'NRG Stadium, Houston', 'round_of_32', 'upcoming'),
('M80', 'TBD', 'TBD', '2026-06-30T15:00:00-05:00', 'NRG Stadium, Houston', 'round_of_32', 'upcoming'),
('M81', 'TBD', 'TBD', '2026-06-30T12:00:00-04:00', 'MetLife Stadium, New York/New Jersey', 'round_of_32', 'upcoming'),
('M82', 'TBD', 'TBD', '2026-06-30T15:00:00-04:00', 'MetLife Stadium, New York/New Jersey', 'round_of_32', 'upcoming'),
('M83', 'TBD', 'TBD', '2026-07-01T12:00:00-04:00', 'Gillette Stadium, Boston', 'round_of_32', 'upcoming'),
('M84', 'TBD', 'TBD', '2026-07-01T15:00:00-04:00', 'Gillette Stadium, Boston', 'round_of_32', 'upcoming'),
('M85', 'TBD', 'TBD', '2026-07-02T12:00:00-07:00', 'BC Place, Vancouver', 'round_of_32', 'upcoming'),
('M86', 'TBD', 'TBD', '2026-07-02T15:00:00-07:00', 'BC Place, Vancouver', 'round_of_32', 'upcoming'),
('M87', 'TBD', 'TBD', '2026-07-03T12:00:00-04:00', 'Mercedes-Benz Stadium, Atlanta', 'round_of_32', 'upcoming'),
('M88', 'TBD', 'TBD', '2026-07-03T15:00:00-04:00', 'Mercedes-Benz Stadium, Atlanta', 'round_of_32', 'upcoming'),

-- Round of 16 (July 4–7, 2026)
('M89', 'TBD', 'TBD', '2026-07-04T12:00:00-06:00', 'AT&T Stadium, Dallas', 'round_of_16', 'upcoming'),
('M90', 'TBD', 'TBD', '2026-07-04T15:00:00-06:00', 'AT&T Stadium, Dallas', 'round_of_16', 'upcoming'),
('M91', 'TBD', 'TBD', '2026-07-05T12:00:00-07:00', 'Lumen Field, Seattle', 'round_of_16', 'upcoming'),
('M92', 'TBD', 'TBD', '2026-07-05T15:00:00-07:00', 'Lumen Field, Seattle', 'round_of_16', 'upcoming'),
('M93', 'TBD', 'TBD', '2026-07-06T12:00:00-04:00', 'Hard Rock Stadium, Miami', 'round_of_16', 'upcoming'),
('M94', 'TBD', 'TBD', '2026-07-06T15:00:00-04:00', 'Hard Rock Stadium, Miami', 'round_of_16', 'upcoming'),
('M95', 'TBD', 'TBD', '2026-07-07T12:00:00-05:00', 'AT&T Stadium, Dallas', 'round_of_16', 'upcoming'),
('M96', 'TBD', 'TBD', '2026-07-07T15:00:00-05:00', 'AT&T Stadium, Dallas', 'round_of_16', 'upcoming'),

-- Quarterfinals (July 9–11, 2026)
('M97', 'TBD', 'TBD', '2026-07-09T12:00:00-04:00', 'MetLife Stadium, New York/New Jersey', 'quarterfinal', 'upcoming'),
('M98', 'TBD', 'TBD', '2026-07-09T15:00:00-04:00', 'MetLife Stadium, New York/New Jersey', 'quarterfinal', 'upcoming'),
('M99', 'TBD', 'TBD', '2026-07-10T12:00:00-04:00', 'Lincoln Financial Field, Philadelphia', 'quarterfinal', 'upcoming'),
('M100', 'TBD', 'TBD', '2026-07-11T12:00:00-04:00', 'Hard Rock Stadium, Miami', 'quarterfinal', 'upcoming'),

-- Semifinals (July 13–14, 2026)
('M101', 'TBD', 'TBD', '2026-07-13T12:00:00-05:00', 'AT&T Stadium, Dallas', 'semifinal', 'upcoming'),
('M102', 'TBD', 'TBD', '2026-07-14T12:00:00-04:00', 'Mercedes-Benz Stadium, Atlanta', 'semifinal', 'upcoming'),

-- Third place (July 18, 2026)
('M103', 'TBD', 'TBD', '2026-07-18T12:00:00-04:00', 'Lincoln Financial Field, Philadelphia', 'third_place', 'upcoming'),

-- Final (July 19, 2026)
('M104', 'TBD', 'TBD', '2026-07-19T12:00:00-04:00', 'MetLife Stadium, New York/New Jersey', 'final', 'upcoming')
ON CONFLICT (match_code) DO UPDATE SET
  stadium = EXCLUDED.stadium,
  stage = EXCLUDED.stage,
  match_date = EXCLUDED.match_date;
