-- Enable RLS on auction_state (was missing from 002_rls_policies.sql)
ALTER TABLE auction_state ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read auction state
CREATE POLICY "Anyone can view auction state"
  ON auction_state FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can modify auction state
CREATE POLICY "Admins can manage auction state"
  ON auction_state FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.is_admin = true
    )
  );
