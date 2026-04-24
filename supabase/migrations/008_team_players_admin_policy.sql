-- 008_team_players_admin_policy.sql
-- Allow admin users to insert/update/delete any team_players row.
-- resolveRound() runs as the logged-in admin and needs to assign
-- won players to other users' teams.

CREATE POLICY "Admins can manage any team_players row"
  ON team_players FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  );
