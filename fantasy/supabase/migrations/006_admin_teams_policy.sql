-- Allow admins to read, insert, update, and delete any team row.
-- Required so the Admin panel can:
--   (1) read all users' teams when listing participants
--   (2) insert a team row where user_id belongs to another user
-- The existing "Users can insert own team" policy only allows uid() = user_id,
-- which blocks admin inserts on behalf of other users.

DROP POLICY IF EXISTS "Admins can manage all teams" ON teams;

CREATE POLICY "Admins can manage all teams"
  ON teams FOR ALL
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
