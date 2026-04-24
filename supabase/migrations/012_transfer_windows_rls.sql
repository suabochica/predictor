-- Transfer Windows: all authenticated users can read (needed to detect open windows)
ALTER TABLE transfer_windows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read transfer windows"
  ON transfer_windows FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin can manage transfer windows"
  ON transfer_windows FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.is_admin = true
    )
  );

-- Admin can read all transfers (needed for transfer activity view in admin panel)
CREATE POLICY "Admin can read all transfers"
  ON transfers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.is_admin = true
    )
  );
