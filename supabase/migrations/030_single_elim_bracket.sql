-- Single-elimination bracket: remove relegation/losers, allow only 'championship'
ALTER TABLE knockout_matches
  DROP CONSTRAINT IF EXISTS knockout_matches_bracket_check;

DELETE FROM knockout_matches WHERE bracket IN ('relegation', 'losers');

ALTER TABLE knockout_matches
  ADD CONSTRAINT knockout_matches_bracket_check
  CHECK (bracket IN ('championship'));
