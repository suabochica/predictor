-- Admin RLS policy: admins can view all predictions
CREATE POLICY "predictions_admin_select" ON predictions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.is_admin = true
    )
  );
