-- Allow admins to INSERT/UPDATE/DELETE all lineups rows.
-- Required for:
--   • Calculate Standings stamp (copies null-matchday lineups to matchday-specific)
--   • Matchday activation stamp (same operation, triggered at activation time)

CREATE POLICY "Admins can write all lineups"
  ON lineups FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.is_admin = true
    )
  );
