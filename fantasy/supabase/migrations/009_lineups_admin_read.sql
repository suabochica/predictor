-- Allow admins to SELECT all lineups (required for Calculate Standings)
-- The existing "Users can manage own lineups" FOR ALL policy only lets
-- each user read their own team's rows — admins need to read every team's
-- lineup to score the matchday.

CREATE POLICY "Admins can read all lineups"
  ON lineups FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.is_admin = true
    )
  );
