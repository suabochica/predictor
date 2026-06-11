-- 038: Any authenticated user can view all lineups.
-- Needed for the leaderboard "view rival lineup" popup. Existing policies
-- (own-team FOR ALL from 002, admin SELECT from 009) remain; policies are OR'd.
CREATE POLICY "Authenticated users can view all lineups"
  ON lineups FOR SELECT
  TO authenticated
  USING (true);
