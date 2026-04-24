-- Fix: replace the FOR ALL admin policy with explicit per-operation policies that include
-- WITH CHECK on INSERT and UPDATE. Without WITH CHECK, the USING clause does not gate
-- new-row validation, so non-admin writes were silently allowed.

DROP POLICY IF EXISTS "Admins can manage auction state" ON auction_state;

CREATE POLICY "Admins can insert auction state"
  ON auction_state FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.is_admin = true
    )
  );

CREATE POLICY "Admins can update auction state"
  ON auction_state FOR UPDATE
  TO authenticated
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

CREATE POLICY "Admins can delete auction state"
  ON auction_state FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.is_admin = true
    )
  );
