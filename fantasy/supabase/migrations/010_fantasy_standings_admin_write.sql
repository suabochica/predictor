-- Allow admins to INSERT/UPDATE/DELETE fantasy_standings
-- (required for Calculate Standings to write results)

CREATE POLICY "Admins can manage fantasy standings"
  ON fantasy_standings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.is_admin = true
    )
  );
