-- Assign polla matches to fantasy matchdays so player locks can be driven by real kickoff times.
-- Country-name contract: matches.team_a/team_b must exactly match players.country.
-- No new RLS needed — matches_select in 014_polla_rls.sql already grants authenticated SELECT.

ALTER TABLE matches ADD COLUMN IF NOT EXISTS matchday_id INTEGER REFERENCES matchdays(id);
CREATE INDEX IF NOT EXISTS idx_matches_matchday ON matches(matchday_id);
