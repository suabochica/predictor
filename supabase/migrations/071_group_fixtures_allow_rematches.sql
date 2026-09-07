-- Allow repeated rivals in the H2H league draw.
-- See plan /home/lucas/.claude/plans/we-need-to-fix-floating-bird.md

-- With 8 managers there are only 7 unique pairings per team, so a 9-matchday
-- league phase (UCL J1-J8 + the play-off round) must repeat rivals. Swap the
-- competition-wide unique pairing index for a per-matchday one: a pair may now
-- meet again in a later jornada, but still never twice inside the same one
-- (which a perfect matching can't produce anyway — cheap insurance against a
-- malformed insert). Index swap only; no data is rewritten.
DROP INDEX IF EXISTS group_fixtures_unique_pairing;

CREATE UNIQUE INDEX group_fixtures_unique_pairing_md ON group_fixtures
  (matchday_id, LEAST(team_a_id, team_b_id), GREATEST(team_a_id, team_b_id));
