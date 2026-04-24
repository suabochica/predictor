-- 007_standings_public_read.sql
-- Allow all authenticated users to read team names/display info.
-- Required for the Standings page to show all participants.
-- The existing "Users can view own team" policy still applies;
-- adding a broader permissive policy grants access to all teams.

CREATE POLICY "Authenticated users can view all teams"
  ON teams FOR SELECT
  TO authenticated
  USING (true);
